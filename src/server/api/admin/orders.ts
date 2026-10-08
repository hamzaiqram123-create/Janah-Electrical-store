import { z } from "zod";
import { db, tx } from "../../db";
import { bad, conflict, exportResponse, isExport, notFound, pageParams, type Router } from "../../http";
import { audit } from "../../auth";
import { ORDER_STATUSES, sar } from "../../../shared/constants";
import { invoiceWithItems, issueInvoice } from "../../services/invoices";
import { kickNotifications, notifyCustomer } from "../../services/notifications";
import { changeStatus, createPosSale, loadOrder, markPaid, refundOrder, returnValue, syncPayment } from "../../services/orders";
import { submitToZatca, zatcaReady } from "../../services/zatca";
import { refreshRating } from "../../services/catalog";
import { config } from "../../config";
import type { Lang } from "../../../shared/constants";

const dateRange = (q: URLSearchParams) => {
  const from = q.get("from"), to = q.get("to");
  const ok = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  return { from: ok(from), to: ok(to) };
};

export function registerOrdersAdminApi(r: Router) {
  r.get("/api/admin/orders", async (c) => {
    const { page, per, offset } = pageParams(c.query, 25, 200);
    const { from, to } = dateRange(c.query);
    const params: unknown[] = [];
    const add = (v: unknown) => { params.push(v); return `$${params.length}`; };
    const where = ["TRUE"];
    const q = c.query.get("q")?.trim();
    if (q) { const p = add(`%${q.replace(/[\\%_]/g, (m) => "\\" + m)}%`); where.push(`(o.number ILIKE ${p} OR o.customer_name ILIKE ${p} OR o.customer_phone ILIKE ${p} OR o.customer_email ILIKE ${p})`); }
    for (const f of ["status", "payment_status", "channel", "payment_method"]) if (c.query.get(f)) where.push(`o.${f} = ${add(c.query.get(f))}`);
    if (c.query.get("customer_id")) where.push(`o.customer_id = ${add(Number(c.query.get("customer_id")) || 0)}`);
    if (from) where.push(`o.created_at >= ${add(from)}::date`);
    if (to) where.push(`o.created_at < ${add(to)}::date + 1`);
    const w = where.join(" AND ");
    const csv = isExport(c);
    const rows = await db.q(
      `SELECT o.id, o.number, o.channel, o.status, o.payment_status, o.payment_method, o.total, o.vat_total, o.total_excl_vat, o.discount_total, o.shipping_fee, o.customer_name, o.customer_phone, o.customer_email, o.created_at,
              o.address->>'city' AS city, (SELECT COALESCE(sum(quantity), 0)::int FROM order_items WHERE order_id = o.id) AS units
         FROM orders o WHERE ${w} ORDER BY o.id DESC LIMIT ${csv ? 20000 : per} OFFSET ${csv ? 0 : offset}`, params);
    if (csv) {
      return exportResponse(c, "orders.csv", [["Order", "Date", "Channel", "Status", "Payment", "Method", "Customer", "Phone", "Email", "City", "Units", "Excl. VAT (SAR)", "VAT (SAR)", "Discount (SAR)", "Shipping (SAR)", "Total (SAR)"],
        ...rows.map((o) => [o.number, new Date(o.created_at).toISOString(), o.channel, o.status, o.payment_status, o.payment_method, o.customer_name, o.customer_phone, o.customer_email, o.city, o.units, sar(o.total_excl_vat), sar(o.vat_total), sar(o.discount_total), sar(o.shipping_fee), sar(o.total)])]);
    }
    const total = (await db.one<{ n: number }>(`SELECT count(*)::int AS n FROM orders o WHERE ${w}`, params))!.n;
    const counts = await db.q(`SELECT status, count(*)::int AS n FROM orders GROUP BY status`);
    return { rows, total, page, pages: Math.ceil(total / per), counts: Object.fromEntries(counts.map((x) => [x.status, x.n])) };
  }, { auth: "admin", perm: "orders.view" });

  r.get("/api/admin/orders/:id", async (c) => {
    const id = Number(c.params.id) || 0;
    const order = await loadOrder({ id });
    if (!order) throw notFound("order_not_found");
    const [items, history, payments, shipments, invoices, returns, customer] = await Promise.all([
      db.q(`SELECT oi.*, COALESCE(i.quantity, 0) AS stock_now FROM order_items oi LEFT JOIN inventory i ON i.product_id = oi.product_id WHERE oi.order_id = $1 ORDER BY oi.id`, [id]),
      db.q(`SELECT h.*, u.name AS user_name FROM order_status_history h LEFT JOIN users u ON u.id = h.user_id WHERE h.order_id = $1 ORDER BY h.created_at, h.id`, [id]),
      db.q(`SELECT id, provider, method, status, amount, refunded_amount, gateway_id, gateway_payment_id, paid_at, created_at FROM payments WHERE order_id = $1 ORDER BY id`, [id]),
      db.q(`SELECT * FROM shipments WHERE order_id = $1 ORDER BY id`, [id]),
      db.q(`SELECT id, number, kind, type, total, vat_amount, issued_at, zatca_status FROM invoices WHERE order_id = $1 ORDER BY id`, [id]),
      db.q(`SELECT * FROM returns WHERE order_id = $1 ORDER BY id DESC`, [id]),
      db.one(`SELECT c.*, (SELECT count(*)::int FROM orders WHERE customer_id = c.id) AS order_count FROM customers c WHERE c.id = $1`, [order.customer_id]),
    ]);
    return { order, items, history, payments, shipments, invoices, returns, customer };
  }, { auth: "admin", perm: "orders.view" });

  r.post("/api/admin/orders/:id/status", async (c) => {
    const id = Number(c.params.id) || 0;
    const body = await c.body(z.object({
      status: z.enum(ORDER_STATUSES), note: z.string().trim().max(500).nullish(),
      tracking_number: z.string().trim().max(60).regex(/^[A-Za-z0-9\-]*$/, "invalid_tracking").nullish(), carrier: z.string().trim().max(60).nullish(),
      tracking_url: z.string().trim().max(300).regex(/^(https:\/\/.+)?$/, "invalid_url").nullish(), restock: z.boolean().optional(),
    }));
    try {
      const order = await changeStatus(id, body.status, { note: body.note, userId: c.user!.id, trackingNumber: body.tracking_number, carrier: body.carrier || null, trackingUrl: body.tracking_url || null, restock: body.restock });
      await audit(c, "order.status", "order", id, { number: order.number, status: body.status });
      return { order };
    } catch (e: any) {
      if (e?.errno === "23505") throw conflict("tracking_taken");
      throw e;
    }
  }, { auth: "admin", perm: "orders.manage" });

  r.post("/api/admin/orders/:id/refund", async (c) => {
    const id = Number(c.params.id) || 0;
    const body = await c.body(z.object({ amount: z.number().int().positive().nullish(), reason: z.string().trim().min(3).max(300) }));
    const out = await refundOrder(id, body.amount ?? null, body.reason, c.user!.id);
    await audit(c, "order.refund", "order", id, { amount: out.refunded, credit_note: out.credit_note });
    return out;
  }, { auth: "admin", perm: "payments.refund" });

  /** Record a payment received outside the gateway (bank transfer, cash collected by courier). */
  r.post("/api/admin/orders/:id/mark-paid", async (c) => {
    const id = Number(c.params.id) || 0;
    const body = await c.body(z.object({ method: z.enum(["cash", "transfer", "card"]).default("cash"), note: z.string().trim().max(300).nullish() }));
    const order = await loadOrder({ id });
    if (!order) throw notFound("order_not_found");
    if (order.payment_status === "paid") throw conflict("already_paid");
    if (order.status === "cancelled") throw conflict("order_cancelled");
    await tx(async (t) => {
      const pending = await t.one(`SELECT id FROM payments WHERE order_id = $1 AND status = 'pending' LIMIT 1`, [id]);
      if (!pending) await t.insert("payments", { order_id: id, provider: "cod", method: body.method, status: "pending", amount: order.total });
      await markPaid(t, id, { method: body.method });
      await audit(c, "order.mark_paid", "order", id, { method: body.method, note: body.note ?? null }, t);
    });
    kickNotifications();
    return { order: await loadOrder({ id }) };
  }, { auth: "admin", perm: "payments.refund" });

  /** Issue the tax invoice for an order that does not have one yet (e.g. a COD order awaiting manual confirmation). */
  r.post("/api/admin/orders/:id/invoice", async (c) => {
    const id = Number(c.params.id) || 0;
    const order = await loadOrder({ id });
    if (!order) throw notFound("order_not_found");
    if (order.status === "cancelled") throw conflict("order_cancelled");
    const inv = await tx((t) => issueInvoice(t, id));
    await audit(c, "invoice.issue", "invoice", inv.id, { number: inv.number, order: order.number });
    return { invoice: { id: inv.id, number: inv.number } };
  }, { auth: "admin", perm: "orders.manage" });

  r.post("/api/admin/orders/:id/sync-payment", async (c) => {
    const pay = await db.one(`SELECT id FROM payments WHERE order_id = $1 ORDER BY id DESC LIMIT 1`, [Number(c.params.id) || 0]);
    if (!pay) throw notFound();
    return { state: await syncPayment(pay.id) };
  }, { auth: "admin", perm: "payments.view" });

  r.post("/api/admin/pos/sale", async (c) => {
    const body = await c.body(z.object({
      items: z.array(z.object({ product_id: z.number().int().positive(), quantity: z.number().int().min(1).max(100000) })).min(1).max(200),
      customer_name: z.string().trim().max(120).nullish(), customer_phone: z.string().trim().max(30).nullish(),
      vat_number: z.string().trim().regex(/^(3\d{13}3)?$/, "invalid_vat_number").nullish(),
      payment_method: z.enum(["cash", "card"]), coupon_code: z.string().trim().max(40).nullish(),
    }));
    return createPosSale(c, body);
  }, { auth: "admin", perm: "pos.use" });

  // ── payments
  r.get("/api/admin/payments", async (c) => {
    const { page, per, offset } = pageParams(c.query, 30, 200);
    const status = c.query.get("status") || null, provider = c.query.get("provider") || null;
    const rows = await db.q(
      `SELECT p.id, p.provider, p.method, p.status, p.amount, p.refunded_amount, p.gateway_id, p.paid_at, p.created_at, o.id AS order_id, o.number AS order_number, o.customer_name
         FROM payments p JOIN orders o ON o.id = p.order_id WHERE ($1::text IS NULL OR p.status = $1) AND ($2::text IS NULL OR p.provider = $2) ORDER BY p.id DESC LIMIT ${per} OFFSET ${offset}`, [status, provider]);
    const total = (await db.one<{ n: number }>(`SELECT count(*)::int AS n FROM payments p WHERE ($1::text IS NULL OR p.status = $1) AND ($2::text IS NULL OR p.provider = $2)`, [status, provider]))!.n;
    return { rows, total, page, pages: Math.ceil(total / per), gateway: config.PAYMENT_PROVIDER };
  }, { auth: "admin", perm: "payments.view" });

  // ── returns
  r.get("/api/admin/returns", async (c) => {
    const { page, per, offset } = pageParams(c.query, 30, 200);
    const status = c.query.get("status") || null;
    const rows = await db.q(
      `SELECT r.*, o.number AS order_number, o.customer_name, o.customer_phone, o.total AS order_total, o.status AS order_status, o.payment_status
         FROM returns r JOIN orders o ON o.id = r.order_id WHERE ($1::text IS NULL OR r.status = $1) ORDER BY r.id DESC LIMIT ${per} OFFSET ${offset}`, [status]);
    const total = (await db.one<{ n: number }>(`SELECT count(*)::int AS n FROM returns r WHERE ($1::text IS NULL OR r.status = $1)`, [status]))!.n;
    for (const r of rows) Object.assign(r, await returnValue(r.order_id, r.items ?? []));
    return { rows, total, page, pages: Math.ceil(total / per) };
  }, { auth: "admin", perm: "returns.manage" });

  r.post("/api/admin/returns/:id/action", async (c) => {
    const id = Number(c.params.id) || 0;
    const body = await c.body(z.object({ action: z.enum(["approve", "reject", "receive", "refund"]), note: z.string().trim().max(500).nullish(), restock: z.boolean().default(true), refund_amount: z.number().int().positive().nullish() }));
    const ret = await db.one(`SELECT * FROM returns WHERE id = $1`, [id]);
    if (!ret) throw notFound();
    const flow: Record<string, string[]> = { approve: ["requested"], reject: ["requested", "approved"], receive: ["approved"], refund: ["received"] };
    if (!flow[body.action]!.includes(ret.status)) throw conflict("invalid_status_transition", { from: ret.status });
    if (body.action === "approve" || body.action === "reject") {
      await db.exec(`UPDATE returns SET status = $2, admin_note = $3, updated_at = now() WHERE id = $1`, [id, body.action === "approve" ? "approved" : "rejected", body.note ?? null]);
    } else if (body.action === "receive") {
      await changeStatus(ret.order_id, "returned", { note: `return ${ret.number}`, userId: c.user!.id, restock: body.restock, returnedItems: ret.items ?? [] });
      await db.exec(`UPDATE returns SET status = 'received', restock = $2, admin_note = COALESCE($3, admin_note), updated_at = now() WHERE id = $1`, [id, body.restock, body.note ?? null]);
    } else {
      const pay = await db.one(`SELECT amount - refunded_amount AS remaining FROM payments WHERE order_id = $1 AND status IN ('paid', 'partially_refunded') ORDER BY id DESC LIMIT 1`, [ret.order_id]);
      const suggested = Math.min((await returnValue(ret.order_id, ret.items ?? [])).suggested, pay?.remaining ?? 0);
      const out = await refundOrder(ret.order_id, body.refund_amount ?? (suggested || null), `return ${ret.number}`, c.user!.id);
      await db.exec(`UPDATE returns SET status = 'refunded', refund_amount = $2, updated_at = now() WHERE id = $1`, [id, out.refunded]);
    }
    await audit(c, `return.${body.action}`, "return", id, { number: ret.number });
    return { return: await db.one(`SELECT * FROM returns WHERE id = $1`, [id]) };
  }, { auth: "admin", perm: "returns.manage" });

  // ── invoices
  r.get("/api/admin/invoices", async (c) => {
    const { page, per, offset } = pageParams(c.query, 30, 200);
    const { from, to } = dateRange(c.query);
    const kind = c.query.get("kind") || null, q = c.query.get("q")?.trim() || null;
    const csv = isExport(c);
    const where = `($1::text IS NULL OR i.kind = $1) AND ($2::date IS NULL OR i.issued_at >= $2::date) AND ($3::date IS NULL OR i.issued_at < $3::date + 1) AND ($4::text IS NULL OR i.number ILIKE '%' || $4 || '%' OR o.number ILIKE '%' || $4 || '%')`;
    const rows = await db.q(
      `SELECT i.id, i.number, i.kind, i.type, i.issued_at, i.taxable_amount, i.vat_amount, i.total, i.zatca_status, i.buyer->>'name' AS buyer_name, i.buyer->>'vat_number' AS buyer_vat, o.number AS order_number, o.id AS order_id
         FROM invoices i LEFT JOIN orders o ON o.id = i.order_id WHERE ${where} ORDER BY i.id DESC LIMIT ${csv ? 50000 : per} OFFSET ${csv ? 0 : offset}`, [kind, from, to, q]);
    if (csv) {
      return exportResponse(c, "invoices.csv", [["Invoice", "Kind", "Type", "Issued at", "Order", "Buyer", "Buyer VAT", "Taxable (SAR)", "VAT (SAR)", "Total (SAR)", "ZATCA status"],
        ...rows.map((i) => { const s = i.kind === "credit_note" ? -1 : 1; return [i.number, i.kind, i.type, new Date(i.issued_at).toISOString(), i.order_number, i.buyer_name, i.buyer_vat, sar(s * i.taxable_amount), sar(s * i.vat_amount), sar(s * i.total), i.zatca_status]; })]);
    }
    const total = (await db.one<{ n: number }>(`SELECT count(*)::int AS n FROM invoices i LEFT JOIN orders o ON o.id = i.order_id WHERE ${where}`, [kind, from, to, q]))!.n;
    return { rows, total, page, pages: Math.ceil(total / per), zatca: { env: config.ZATCA_ENV, ...zatcaReady() } };
  }, { auth: "admin", perm: "invoices.view" });

  r.get("/api/admin/invoices/:id/xml", async (c) => {
    const inv = await invoiceWithItems({ id: Number(c.params.id) || 0 });
    if (!inv) throw notFound();
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${inv.xml}`, { headers: { "content-type": "application/xml; charset=utf-8", "content-disposition": `attachment; filename="${inv.number}.xml"` } });
  }, { auth: "admin", perm: "invoices.view" });

  r.post("/api/admin/invoices/:id/submit", async (c) => {
    const inv = await invoiceWithItems({ id: Number(c.params.id) || 0 });
    if (!inv) throw notFound();
    const state = zatcaReady();
    if (!state.ready) throw conflict("zatca_not_configured", { reason: state.reason });
    const res = await submitToZatca(inv as any);
    await db.exec(`UPDATE invoices SET zatca_status = $2, zatca_response = $3::jsonb, zatca_submitted_at = now() WHERE id = $1`, [inv.id, res.status, res.response]);
    await audit(c, "invoice.zatca_submit", "invoice", inv.id, { status: res.status });
    return { status: res.status, response: res.response };
  }, { auth: "admin", perm: "settings.manage" });

  // ── reviews
  r.get("/api/admin/reviews", async (c) => {
    const { page, per, offset } = pageParams(c.query, 30, 200);
    const status = c.query.get("status") || null;
    const rows = await db.q(
      `SELECT r.*, p.name_ar AS product_name, p.slug AS product_slug, cu.name AS customer_name FROM reviews r JOIN products p ON p.id = r.product_id JOIN customers cu ON cu.id = r.customer_id
        WHERE ($1::text IS NULL OR r.status = $1) ORDER BY r.id DESC LIMIT ${per} OFFSET ${offset}`, [status]);
    const total = (await db.one<{ n: number }>(`SELECT count(*)::int AS n FROM reviews r WHERE ($1::text IS NULL OR r.status = $1)`, [status]))!.n;
    return { rows, total, page, pages: Math.ceil(total / per) };
  }, { auth: "admin", perm: "reviews.manage" });
  r.post("/api/admin/reviews/:id/status", async (c) => {
    const body = await c.body(z.object({ status: z.enum(["approved", "rejected", "pending"]) }));
    const row = await db.one(`UPDATE reviews SET status = $2 WHERE id = $1 RETURNING product_id`, [Number(c.params.id) || 0, body.status]);
    if (!row) throw notFound();
    await refreshRating(row.product_id);
    await audit(c, `review.${body.status}`, "review", c.params.id);
    return { ok: true };
  }, { auth: "admin", perm: "reviews.manage" });
  r.delete("/api/admin/reviews/:id", async (c) => {
    const row = await db.one(`DELETE FROM reviews WHERE id = $1 RETURNING product_id`, [Number(c.params.id) || 0]);
    if (!row) throw notFound();
    await refreshRating(row.product_id);
    await audit(c, "review.delete", "review", c.params.id);
    return { ok: true };
  }, { auth: "admin", perm: "reviews.manage" });

  // ── support tickets
  r.get("/api/admin/tickets", async (c) => {
    const { page, per, offset } = pageParams(c.query, 30, 200);
    const status = c.query.get("status") || null;
    const rows = await db.q(`SELECT t.*, (SELECT count(*)::int FROM ticket_messages WHERE ticket_id = t.id) AS messages FROM support_tickets t WHERE ($1::text IS NULL OR t.status = $1) ORDER BY t.updated_at DESC LIMIT ${per} OFFSET ${offset}`, [status]);
    const total = (await db.one<{ n: number }>(`SELECT count(*)::int AS n FROM support_tickets t WHERE ($1::text IS NULL OR t.status = $1)`, [status]))!.n;
    return { rows, total, page, pages: Math.ceil(total / per) };
  }, { auth: "admin", perm: "tickets.manage" });
  r.get("/api/admin/tickets/:id", async (c) => {
    const ticket = await db.one(`SELECT * FROM support_tickets WHERE id = $1`, [Number(c.params.id) || 0]);
    if (!ticket) throw notFound();
    const messages = await db.q(`SELECT m.*, u.name AS user_name FROM ticket_messages m LEFT JOIN users u ON u.id = m.user_id WHERE m.ticket_id = $1 ORDER BY m.created_at, m.id`, [ticket.id]);
    return { ticket, messages };
  }, { auth: "admin", perm: "tickets.manage" });
  r.post("/api/admin/tickets/:id/reply", async (c) => {
    const body = await c.body(z.object({ message: z.string().trim().min(2).max(4000), status: z.enum(["open", "pending", "resolved", "closed"]).default("pending") }));
    const ticket = await db.one(`SELECT * FROM support_tickets WHERE id = $1`, [Number(c.params.id) || 0]);
    if (!ticket) throw notFound();
    await tx(async (t) => {
      await t.insert("ticket_messages", { ticket_id: ticket.id, author: "staff", user_id: c.user!.id, body: body.message });
      await t.exec(`UPDATE support_tickets SET status = $2, updated_at = now() WHERE id = $1`, [ticket.id, body.status]);
      const u = await t.one(`SELECT locale FROM users WHERE lower(email) = lower($1)`, [ticket.email]);
      await notifyCustomer(t, "ticket_reply", { lang: (u?.locale ?? "ar") as Lang, email: ticket.email }, { name: ticket.name, ticket: ticket.number, message: body.message }, { smsToo: false });
    });
    kickNotifications();
    return { ok: true };
  }, { auth: "admin", perm: "tickets.manage" });
  r.post("/api/admin/tickets/:id/status", async (c) => {
    const body = await c.body(z.object({ status: z.enum(["open", "pending", "resolved", "closed"]) }));
    const n = await db.exec(`UPDATE support_tickets SET status = $2, updated_at = now() WHERE id = $1`, [Number(c.params.id) || 0, body.status]);
    if (!n) throw bad("not_found");
    return { ok: true };
  }, { auth: "admin", perm: "tickets.manage" });
}
