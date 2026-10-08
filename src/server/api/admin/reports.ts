import { db } from "../../db";
import { exportResponse, isExport, type Ctx, type Router } from "../../http";
import { sar } from "../../../shared/constants";

const TZ = "Asia/Riyadh";
const LOCAL = (col: string) => `(${col} AT TIME ZONE '${TZ}')`;
/** Orders that count as sales: everything that was not cancelled or left unpaid at the gateway. */
const SALE = `o.status <> 'cancelled' AND o.payment_status <> 'failed'`;

function range(c: Ctx): { from: string; to: string } {
  const ok = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const today = new Date(Date.now() + 3 * 3600_000);
  const to = ok(c.query.get("to")) ?? today.toISOString().slice(0, 10);
  const from = ok(c.query.get("from")) ?? new Date(today.getTime() - 29 * 86400_000).toISOString().slice(0, 10);
  return { from, to };
}
const inRange = `${LOCAL("o.created_at")}::date BETWEEN $1::date AND $2::date`;

export function registerReportsApi(r: Router) {
  r.get("/api/admin/dashboard", async (c) => {
    const [kpi, series, top, recent, statuses, low, conv, unread] = await Promise.all([
      db.one(`
        WITH s AS (SELECT o.*, ${LOCAL("o.created_at")}::date AS d FROM orders o WHERE ${SALE}),
             ref AS (SELECT COALESCE(sum(refunded_amount), 0)::float8 AS v FROM payments),
             today AS (SELECT (now() AT TIME ZONE '${TZ}')::date AS d)
        SELECT (SELECT COALESCE(sum(total), 0)::float8 FROM s) AS total_sales, (SELECT v FROM ref) AS total_refunds,
               (SELECT COALESCE(sum(total), 0)::float8 FROM s, today WHERE s.d = today.d) AS today_sales,
               (SELECT count(*)::int FROM s, today WHERE s.d = today.d) AS today_orders,
               (SELECT COALESCE(sum(total), 0)::float8 FROM s, today WHERE date_trunc('month', s.d) = date_trunc('month', today.d)) AS month_sales,
               (SELECT count(*)::int FROM s, today WHERE date_trunc('month', s.d) = date_trunc('month', today.d)) AS month_orders,
               (SELECT COALESCE(sum(total), 0)::float8 FROM s, today WHERE date_trunc('month', s.d) = date_trunc('month', today.d - interval '1 month')) AS prev_month_sales,
               (SELECT count(*)::int FROM s) AS total_orders,
               (SELECT count(*)::int FROM orders WHERE status IN ('pending', 'confirmed', 'processing', 'ready_for_shipment')) AS open_orders,
               (SELECT count(*)::int FROM customers) AS customers,
               (SELECT count(*)::int FROM customers, today WHERE date_trunc('month', ${LOCAL("created_at")}) = date_trunc('month', today.d)) AS new_customers,
               (SELECT count(*)::int FROM products WHERE status = 'active') AS products,
               (SELECT count(*)::int FROM returns WHERE status = 'requested') AS pending_returns,
               (SELECT count(*)::int FROM reviews WHERE status = 'pending') AS pending_reviews,
               (SELECT count(*)::int FROM support_tickets WHERE status = 'open') AS open_tickets`),
      db.q(`
        SELECT to_char(d.day, 'YYYY-MM-DD') AS day, COALESCE(sum(o.total), 0)::float8 AS total, count(o.id)::int AS orders
          FROM generate_series((now() AT TIME ZONE '${TZ}')::date - 29, (now() AT TIME ZONE '${TZ}')::date, interval '1 day') AS d(day)
          LEFT JOIN orders o ON ${LOCAL("o.created_at")}::date = d.day::date AND ${SALE}
         GROUP BY d.day ORDER BY d.day`),
      db.q(`
        SELECT oi.product_id, oi.sku, max(oi.name_ar) AS name_ar, max(oi.name_en) AS name_en, sum(oi.quantity)::int AS units, sum(oi.line_total - oi.discount_alloc)::float8 AS revenue
          FROM order_items oi JOIN orders o ON o.id = oi.order_id
         WHERE ${SALE} AND o.created_at > now() - interval '30 days' GROUP BY oi.product_id, oi.sku ORDER BY units DESC LIMIT 6`),
      db.q(`SELECT id, number, customer_name, total, status, payment_status, channel, created_at FROM orders ORDER BY id DESC LIMIT 8`),
      db.q(`SELECT status, count(*)::int AS n FROM orders GROUP BY status`),
      db.q(`SELECT p.id, p.sku, p.name_ar, p.name_en, i.quantity, i.min_stock FROM inventory i JOIN products p ON p.id = i.product_id WHERE p.status = 'active' AND i.quantity <= i.min_stock ORDER BY i.quantity, p.id LIMIT 8`),
      db.one(`
        SELECT count(*) FILTER (WHERE status = 'converted')::int AS converted, count(*)::int AS carts
          FROM carts c WHERE c.created_at > now() - interval '30 days' AND (c.status = 'converted' OR EXISTS (SELECT 1 FROM cart_items WHERE cart_id = c.id))`),
      db.one(`SELECT count(*)::int AS n FROM notifications WHERE channel = 'admin' AND read_at IS NULL`),
    ]);
    const lowCount = (await db.one<{ n: number }>(`SELECT count(*)::int AS n FROM inventory i JOIN products p ON p.id = i.product_id WHERE p.status = 'active' AND i.quantity <= i.min_stock`))!.n;
    // Sales figures, customer names and order lists are only for roles that may see orders or reports
    // (a stock keeper's dashboard shows stock, not revenue).
    if (!c.can("orders.view") && !c.can("reports.view")) {
      return {
        sales_visible: false,
        kpi: { products: kpi!.products, low_stock: lowCount }, series: [], top_products: [], recent_orders: [], status_counts: {},
        low_stock: c.can("inventory.view") ? low : [], unread_notifications: unread!.n,
      };
    }
    return {
      sales_visible: true,
      kpi: { ...kpi, low_stock: lowCount, avg_order: kpi!.month_orders ? Math.round(kpi!.month_sales / kpi!.month_orders) : 0, conversion_rate: conv!.carts ? conv!.converted / conv!.carts : 0, carts_30d: conv!.carts, converted_30d: conv!.converted },
      series, top_products: top, recent_orders: recent, status_counts: Object.fromEntries(statuses.map((s) => [s.status, s.n])), low_stock: low, unread_notifications: unread!.n,
    };
  }, { auth: "admin", perm: "dashboard.view" });

  r.get("/api/admin/reports/sales", async (c) => {
    const { from, to } = range(c);
    const group = c.query.get("group") === "month" ? "month" : "day";
    const fmt = group === "month" ? "YYYY-MM" : "YYYY-MM-DD";
    const rows = await db.q(`
      SELECT to_char(date_trunc('${group}', ${LOCAL("o.created_at")}), '${fmt}') AS period, count(*)::int AS orders,
             COALESCE(sum((SELECT sum(quantity) FROM order_items WHERE order_id = o.id)), 0)::int AS units,
             sum(o.items_subtotal)::float8 AS items, sum(o.discount_total)::float8 AS discounts, sum(o.shipping_fee + o.cod_fee)::float8 AS shipping,
             sum(o.total_excl_vat)::float8 AS net, sum(o.vat_total)::float8 AS vat, sum(o.total)::float8 AS total,
             COALESCE(sum((SELECT sum(refunded_amount) FROM payments WHERE order_id = o.id)), 0)::float8 AS refunds
        FROM orders o WHERE ${SALE} AND ${inRange} GROUP BY 1 ORDER BY 1`, [from, to]);
    const byMethod = await db.q(`SELECT o.payment_method, o.channel, count(*)::int AS orders, sum(o.total)::float8 AS total FROM orders o WHERE ${SALE} AND ${inRange} GROUP BY 1, 2 ORDER BY total DESC`, [from, to]);
    const byCity = await db.q(`SELECT COALESCE(o.address->>'city', '—') AS city, count(*)::int AS orders, sum(o.total)::float8 AS total FROM orders o WHERE ${SALE} AND ${inRange} AND o.channel = 'web' GROUP BY 1 ORDER BY total DESC LIMIT 15`, [from, to]);
    if (isExport(c)) {
      return exportResponse(c, `sales-${from}_${to}.csv`, [["Period", "Orders", "Units", "Items incl. VAT (SAR)", "Discounts (SAR)", "Shipping (SAR)", "Net excl. VAT (SAR)", "VAT (SAR)", "Total (SAR)", "Refunds (SAR)"],
        ...rows.map((x) => [x.period, x.orders, x.units, sar(x.items), sar(x.discounts), sar(x.shipping), sar(x.net), sar(x.vat), sar(x.total), sar(x.refunds)])]);
    }
    const sum = (k: string) => rows.reduce((s, x) => s + Number(x[k]), 0);
    return { from, to, group, rows, by_method: byMethod, by_city: byCity, totals: { orders: sum("orders"), units: sum("units"), net: sum("net"), vat: sum("vat"), total: sum("total"), discounts: sum("discounts"), shipping: sum("shipping"), refunds: sum("refunds") } };
  }, { auth: "admin", perm: "reports.view" });

  r.get("/api/admin/reports/products", async (c) => {
    const { from, to } = range(c);
    const rows = await db.q(`
      SELECT oi.sku, max(oi.name_ar) AS name_ar, max(oi.name_en) AS name_en, sum(oi.quantity)::int AS units,
             sum(oi.net_amount)::float8 AS revenue, sum(oi.unit_cost::bigint * oi.quantity)::float8 AS cost,
             (sum(oi.net_amount) - sum(oi.unit_cost::bigint * oi.quantity))::float8 AS profit
        FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE ${SALE} AND ${inRange}
       GROUP BY oi.sku ORDER BY units DESC, revenue DESC LIMIT 500`, [from, to]);
    if (isExport(c)) {
      return exportResponse(c, `best-sellers-${from}_${to}.csv`, [["SKU", "Name (AR)", "Name (EN)", "Units", "Revenue excl. VAT (SAR)", "Cost (SAR)", "Gross profit (SAR)"],
        ...rows.map((x) => [x.sku, x.name_ar, x.name_en, x.units, sar(x.revenue), sar(x.cost), sar(x.profit)])]);
    }
    return { from, to, rows };
  }, { auth: "admin", perm: "reports.view" });

  r.get("/api/admin/reports/profit", async (c) => {
    const { from, to } = range(c);
    const rows = await db.q(`
      SELECT to_char(${LOCAL("o.created_at")}::date, 'YYYY-MM-DD') AS period, sum(oi.net_amount)::float8 AS revenue,
             sum(oi.unit_cost::bigint * oi.quantity)::float8 AS cost, (sum(oi.net_amount) - sum(oi.unit_cost::bigint * oi.quantity))::float8 AS profit
        FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE ${SALE} AND ${inRange} GROUP BY 1 ORDER BY 1`, [from, to]);
    if (isExport(c)) {
      return exportResponse(c, `profit-${from}_${to}.csv`, [["Date", "Revenue excl. VAT (SAR)", "Cost of goods (SAR)", "Gross profit (SAR)", "Margin %"],
        ...rows.map((x) => [x.period, sar(x.revenue), sar(x.cost), sar(x.profit), x.revenue ? ((x.profit / x.revenue) * 100).toFixed(1) : "0"])]);
    }
    const revenue = rows.reduce((s, x) => s + x.revenue, 0), cost = rows.reduce((s, x) => s + x.cost, 0);
    return { from, to, rows, totals: { revenue, cost, profit: revenue - cost, margin: revenue ? (revenue - cost) / revenue : 0 } };
  }, { auth: "admin", perm: "reports.view" });

  r.get("/api/admin/reports/customers", async (c) => {
    const { from, to } = range(c);
    const rows = await db.q(`
      SELECT cu.id, cu.name, cu.email, cu.phone, cu.is_guest, count(o.id)::int AS orders, sum(o.total)::float8 AS total, max(o.created_at) AS last_order
        FROM orders o JOIN customers cu ON cu.id = o.customer_id WHERE ${SALE} AND ${inRange}
       GROUP BY cu.id ORDER BY total DESC LIMIT 500`, [from, to]);
    if (isExport(c)) {
      return exportResponse(c, `customers-${from}_${to}.csv`, [["Customer", "Email", "Phone", "Guest", "Orders", "Total (SAR)", "Last order"],
        ...rows.map((x) => [x.name, x.email, x.phone, x.is_guest ? "yes" : "no", x.orders, sar(x.total), new Date(x.last_order).toISOString()])]);
    }
    return { from, to, rows };
  }, { auth: "admin", perm: "reports.view" });

  r.get("/api/admin/reports/vat", async (c) => {
    const rows = await db.q(`
      SELECT to_char(period, 'YYYY-MM') AS period, vat_rate_bp,
             COALESCE(sum(taxable_amount) FILTER (WHERE type = 'sale'), 0)::float8 AS sales_taxable, COALESCE(sum(vat_amount) FILTER (WHERE type = 'sale'), 0)::float8 AS sales_vat,
             COALESCE(sum(taxable_amount) FILTER (WHERE type = 'refund'), 0)::float8 AS refunds_taxable, COALESCE(sum(vat_amount) FILTER (WHERE type = 'refund'), 0)::float8 AS refunds_vat,
             sum(taxable_amount)::float8 AS net_taxable, sum(vat_amount)::float8 AS net_vat
        FROM tax_records GROUP BY period, vat_rate_bp ORDER BY period DESC, vat_rate_bp DESC LIMIT 120`);
    if (isExport(c)) {
      return exportResponse(c, "vat-report.csv", [["Tax month", "VAT rate %", "Sales excl. VAT (SAR)", "Output VAT (SAR)", "Credit notes excl. VAT (SAR)", "Credit notes VAT (SAR)", "Net taxable (SAR)", "Net VAT due (SAR)"],
        ...rows.map((x) => [x.period, (x.vat_rate_bp / 100).toFixed(2), sar(x.sales_taxable), sar(x.sales_vat), sar(x.refunds_taxable), sar(x.refunds_vat), sar(x.net_taxable), sar(x.net_vat)])]);
    }
    return { rows };
  }, { auth: "admin", perm: "reports.view" });
}
