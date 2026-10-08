import { config } from "../config";
import { db, nextCounter, tx, type Db, type Row } from "../db";
import { bad, conflict, forbidden, HttpError, notFound, type Ctx } from "../http";
import { errMeta, log } from "../logger";
import { randomToken } from "../security";
import { ensureCustomer, audit } from "../auth";
import { normalizePhone, ORDER_TRANSITIONS, pick, riyadhDate, sar, type Lang, type OrderStatus } from "../../shared/constants";
import { computeTotals, type CouponRule, type Totals } from "../../shared/pricing";
import { tr } from "../../shared/i18n";
import { cartRows, checkCoupon, findCart } from "./cart";
import { moveStock } from "./inventory";
import { issueCreditNote, issueInvoice } from "./invoices";
import { kickNotifications, notifyAdmins, notifyCustomer } from "./notifications";
import { onlineGateway } from "./payments/gateway";
import { getSettings } from "./settings";
import { getCity, shippingOptions, trackingNumber } from "./shipping";
import { invalidate } from "../cache";

const url = (path: string) => `${config.APP_URL.replace(/\/$/, "")}${path}`;
export const orderLink = (o: { number: string; access_key: string; locale: string }) => url(`/${o.locale}/order/${o.number}?key=${o.access_key}`);

// ───────────── payment methods ─────────────
export async function paymentMethods(total: number, codAllowedByShipping: boolean) {
  const s = (await getSettings()).checkout;
  const gw = onlineGateway();
  const out: { key: "cod" | "online"; fee: number; brands: string[] }[] = [];
  if (gw && total >= 100) out.push({ key: "online", fee: 0, brands: gw.methods });
  if (s.cod_enabled && codAllowedByShipping && total <= s.cod_max_total) out.push({ key: "cod", fee: s.cod_fee, brands: [] });
  return out;
}

// ───────────── order creation ─────────────
interface CoreInput {
  channel: "web" | "pos";
  customerId: number; userId: number | null;
  name: string; email: string | null; phone: string;
  address: Row;
  rows: Row[];                       // product rows with `quantity`
  coupon: { row: Row; rule: CouponRule } | null;
  shipping: { id: number | null; name: string | null; fee: number; from: string | null; to: string | null };
  codFee: number;
  paymentMethod: string;
  locale: Lang; notes: string | null; cartId: number | null; actorUserId: number | null;
}

async function createOrderCore(t: Db, input: CoreInput): Promise<{ order: Row; totals: Totals }> {
  const settings = await getSettings();
  const totals = computeTotals({
    lines: input.rows.map((r) => ({ key: r.product_id, unitPrice: r.effective_price, quantity: r.quantity, vatBp: r.vat_rate_bp })),
    coupon: input.coupon?.rule, shippingFee: input.shipping.fee, codFee: input.codFee,
    pricesIncludeVat: settings.tax.prices_include_vat, shippingVatBp: settings.tax.vat_rate_bp,
  });
  const year = riyadhDate().year;
  const seq = await nextCounter(t, `order:${year}`);
  const number = `${settings.numbering.order_prefix}-${year}-${String(seq).padStart(6, "0")}`;
  const order = await t.insert("orders", {
    number, access_key: randomToken(18), channel: input.channel, customer_id: input.customerId, user_id: input.userId,
    status: "pending", payment_status: "unpaid", payment_method: input.paymentMethod, locale: input.locale,
    prices_include_vat: settings.tax.prices_include_vat,
    items_subtotal: totals.itemsSubtotal, discount_total: totals.discountTotal, shipping_fee: totals.shippingFee, cod_fee: totals.codFee,
    total_excl_vat: totals.totalExclVat, vat_total: totals.vatTotal, total: totals.total,
    coupon_code: input.coupon?.row.code ?? null,
    customer_name: input.name, customer_email: input.email, customer_phone: input.phone, address: input.address,
    shipping_method_id: input.shipping.id, shipping_method_name: input.shipping.name, delivery_from: input.shipping.from, delivery_to: input.shipping.to,
    notes: input.notes, cart_id: input.cartId,
  });

  // lock inventory rows in a stable order to avoid deadlocks between concurrent checkouts
  const byId = [...input.rows].sort((a, b) => a.product_id - b.product_id);
  for (const r of byId) {
    const line = totals.lines.find((l) => l.key === r.product_id)!;
    const move = await moveStock(t, { productId: r.product_id, type: "sale", delta: -r.quantity, referenceType: "order", referenceId: number, userId: input.actorUserId, unitCost: r.purchase_price });
    await t.insert("order_items", {
      order_id: order.id, product_id: r.product_id, sku: r.sku, barcode: r.barcode ?? null, name_ar: r.name_ar, name_en: r.name_en, name_ur: r.name_ur, image_url: r.image ?? null,
      quantity: r.quantity, original_unit_price: Math.max(r.price, line.unitGross), unit_price: line.unitGross, unit_cost: r.purchase_price ?? 0, vat_rate_bp: r.vat_rate_bp,
      line_total: line.lineTotal, discount_alloc: line.discountAlloc, net_amount: line.netAmount, vat_amount: line.vatAmount,
    });
    await t.exec(`UPDATE products SET sold_count = sold_count + $2 WHERE id = $1`, [r.product_id, r.quantity]);
    if (move.balance <= move.min_stock && move.balance + r.quantity > move.min_stock) {
      await notifyAdmins(t, "low_inventory", { product: r.name_ar, sku: r.sku, qty: move.balance }, url(`/admin/inventory?low=1`));
    }
  }
  if (input.coupon) {
    await t.exec(`UPDATE coupons SET used_count = used_count + 1 WHERE id = $1`, [input.coupon.row.id]);
    await t.insert("coupon_redemptions", { coupon_id: input.coupon.row.id, order_id: order.id, customer_id: input.customerId, amount: totals.discountTotal });
  }
  await t.insert("order_status_history", { order_id: order.id, status: "pending", user_id: input.actorUserId });
  return { order, totals };
}

export interface PlaceOrderInput {
  customer: { name: string; email: string; phone: string; company_name?: string | null; vat_number?: string | null };
  address_id?: number | null;
  address?: { city_id: number; district: string; street: string; building_no?: string | null; postal_code?: string | null; short_address?: string | null; notes?: string | null } | null;
  save_address?: boolean;
  shipping_method_id: number;
  payment_method: "cod" | "online";
  notes?: string | null;
}

export async function placeOrder(c: Ctx, input: PlaceOrderInput) {
  const settings = await getSettings();
  if (!c.user && !settings.checkout.guest_checkout) throw new HttpError(401, "login_required");
  const cart = await findCart(c);
  if (!cart) throw bad("cart_empty");
  const lang = c.lang;

  // resolve address
  let addr = input.address ?? null;
  if (input.address_id) {
    if (!c.user?.customer_id) throw forbidden();
    const a = await db.one(`SELECT * FROM addresses WHERE id = $1 AND customer_id = $2`, [input.address_id, c.user.customer_id]);
    if (!a) throw notFound("address_not_found");
    addr = { city_id: a.city_id, district: a.district, street: a.street, building_no: a.building_no, postal_code: a.postal_code, short_address: a.short_address, notes: a.notes };
  }
  if (!addr) throw bad("address_required");
  const city = await getCity(addr.city_id);
  if (!city) throw bad("city_not_served");

  const result = await tx(async (t) => {
    const rows = await cartRows(cart.id, t, true);
    if (!rows.length) throw bad("cart_empty");
    const problem = rows.find((r) => r.status !== "active" || r.stock < r.quantity);
    if (problem) throw conflict("cart_changed", { product_id: problem.product_id, available: Math.max(0, problem.stock) });
    for (const r of rows) r.quantity = Math.min(r.quantity, settings.checkout.max_qty_per_item);

    const customerId = c.user
      ? await ensureCustomer(c.user, t)
      : (await t.one<{ id: number }>(`SELECT id FROM customers WHERE is_guest AND user_id IS NULL AND lower(email) = lower($1) ORDER BY id LIMIT 1`, [input.customer.email]))?.id
        ?? (await t.insert("customers", { name: input.customer.name, email: input.customer.email, phone: input.customer.phone, is_guest: true })).id;
    await t.exec(
      `UPDATE customers SET name = $2, phone = $3, company_name = COALESCE($4, company_name), vat_number = COALESCE($5, vat_number), updated_at = now() WHERE id = $1`,
      [customerId, input.customer.name, input.customer.phone, input.customer.company_name || null, input.customer.vat_number || null]);

    const subtotal = rows.reduce((s, r) => s + r.effective_price * r.quantity, 0);
    const check = await checkCoupon(cart.coupon_code, subtotal, { customerId, email: input.customer.email }, t);
    if (cart.coupon_code && check.error) throw bad(check.error);
    if (check.coupon && check.rule) {
      // lock the coupon so the usage limit holds under concurrency
      const locked = await t.one(`SELECT used_count, usage_limit FROM coupons WHERE id = $1 FOR UPDATE`, [check.coupon.id]);
      if (locked!.usage_limit != null && locked!.used_count >= locked!.usage_limit) throw bad("coupon_used_up");
    }

    const options = await shippingOptions(city.id, subtotal, lang);
    const ship = options.find((o) => o.id === input.shipping_method_id);
    if (!ship) throw bad("shipping_method_unavailable");
    const preview = computeTotals({ lines: rows.map((r) => ({ key: r.product_id, unitPrice: r.effective_price, quantity: r.quantity, vatBp: r.vat_rate_bp })), coupon: check.rule, shippingFee: ship.fee, pricesIncludeVat: settings.tax.prices_include_vat });
    const methods = await paymentMethods(preview.total, ship.cod_allowed);
    const pm = methods.find((m) => m.key === input.payment_method);
    if (!pm) throw bad("payment_method_unavailable");

    const address = {
      recipient_name: input.customer.name, phone: input.customer.phone,
      city_id: city.id, city: city.name_ar, city_en: city.name_en, city_ur: city.name_ur, region: city.region_ar, region_en: city.region_en, region_ur: city.region_ur,
      district: addr!.district, street: addr!.street, building_no: addr!.building_no ?? "", postal_code: addr!.postal_code ?? "", short_address: addr!.short_address ?? "", notes: addr!.notes ?? "",
    };
    if (c.user && input.save_address && !input.address_id) {
      const has = await t.one(`SELECT 1 AS ok FROM addresses WHERE customer_id = $1 LIMIT 1`, [customerId]);
      await t.insert("addresses", { customer_id: customerId, recipient_name: input.customer.name, phone: input.customer.phone, city_id: city.id, district: addr!.district, street: addr!.street, building_no: addr!.building_no ?? null, postal_code: addr!.postal_code ?? null, short_address: addr!.short_address ?? null, notes: addr!.notes ?? null, is_default: !has });
    }

    const { order, totals } = await createOrderCore(t, {
      channel: "web", customerId, userId: c.user?.id ?? null, name: input.customer.name, email: input.customer.email, phone: input.customer.phone, address, rows,
      coupon: check.coupon && check.rule ? { row: check.coupon, rule: check.rule } : null,
      shipping: { id: ship.id, name: ship.name, fee: ship.fee, from: ship.delivery_from, to: ship.delivery_to },
      codFee: pm.key === "cod" ? pm.fee : 0, paymentMethod: pm.key, locale: lang, notes: input.notes?.slice(0, 500) || null, cartId: cart.id, actorUserId: c.user?.id ?? null,
    });
    await t.exec(`UPDATE carts SET status = 'converted', updated_at = now() WHERE id = $1`, [cart.id]);
    await t.insert("payments", { order_id: order.id, provider: pm.key === "cod" ? "cod" : onlineGateway()!.id, method: pm.key === "cod" ? "cash" : null, status: "pending", amount: totals.total });
    await t.exec(`UPDATE orders SET payment_status = 'pending' WHERE id = $1`, [order.id]);

    if (pm.key === "cod") {
      if (settings.checkout.auto_confirm_cod) {
        await t.exec(`UPDATE orders SET status = 'confirmed', updated_at = now() WHERE id = $1`, [order.id]);
        await t.insert("order_status_history", { order_id: order.id, status: "confirmed" });
        await issueInvoice(t, order.id);
      }
      await notifyCustomer(t, "order_confirmation", { lang, email: order.customer_email, phone: order.customer_phone, userId: order.user_id }, { name: order.customer_name, order: order.number, total: sar(order.total) }, { link: orderLink(order) });
      await notifyAdmins(t, "new_order", { order: order.number, total: sar(order.total), name: order.customer_name }, url(`/admin/orders/${order.id}`));
    }
    return order;
  });

  let redirectUrl: string | null = null;
  if (input.payment_method === "online") {
    const gw = onlineGateway()!;
    try {
      const session = await gw.createCheckout({
        orderNumber: result.number, amount: result.total, description: `${settings.store.name_en} — ${result.number}`,
        successUrl: url(`/pay/return?order=${result.number}&key=${result.access_key}`),
        backUrl: orderLink(result), callbackUrl: url(`/api/webhooks/${gw.id}`),
        expiresAt: new Date(Date.now() + settings.checkout.unpaid_order_ttl_minutes * 60_000),
      });
      await db.exec(`UPDATE payments SET gateway_id = $2, gateway_url = $3, raw = $4::jsonb, updated_at = now() WHERE order_id = $1`, [result.id, session.gatewayId, session.url, session.raw]);
      redirectUrl = session.url;
    } catch (e) {
      log.error("payment session creation failed", { order: result.number, ...errMeta(e) });
      // Nothing was charged: release the stock quietly and give the customer their cart back so they can retry or pay on delivery.
      await changeStatus(result.id, "cancelled", { note: "payment gateway unavailable", system: true, silent: true });
      await db.exec(`UPDATE payments SET status = 'failed', updated_at = now() WHERE order_id = $1 AND status = 'pending'`, [result.id]);
      await db.exec(`UPDATE orders SET payment_status = 'failed' WHERE id = $1`, [result.id]);
      await db.exec(`UPDATE carts SET status = 'active', updated_at = now() WHERE id = $1`, [cart.id]);
      throw new HttpError(502, "payment_unavailable");
    }
  }
  kickNotifications();
  invalidate("shell:home");
  return { number: result.number as string, access_key: result.access_key as string, redirect_url: redirectUrl };
}

// ───────────── payment state ─────────────
/** Marks an order paid (idempotent). Confirms pending orders and issues the tax invoice. */
export async function markPaid(t: Db, orderId: number, info: { method?: string | null; gatewayPaymentId?: string | null; raw?: Record<string, unknown> | null }) {
  const order = await t.one(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
  if (!order || order.payment_status === "paid" || order.payment_status === "refunded" || order.payment_status === "partially_refunded") return order;
  await t.exec(
    `UPDATE payments SET status = 'paid', paid_at = now(), updated_at = now(), method = COALESCE($2, method), gateway_payment_id = COALESCE($3, gateway_payment_id), raw = COALESCE($4::jsonb, raw)
      WHERE order_id = $1 AND status = 'pending'`, [orderId, info.method ?? null, info.gatewayPaymentId ?? null, info.raw ?? null]);
  await t.exec(`UPDATE orders SET payment_status = 'paid', paid_at = now(), updated_at = now() WHERE id = $1`, [orderId]);
  if (order.status === "pending") {
    await t.exec(`UPDATE orders SET status = 'confirmed' WHERE id = $1`, [orderId]);
    await t.insert("order_status_history", { order_id: orderId, status: "confirmed", note: "payment received" });
  }
  await issueInvoice(t, orderId);
  if (order.payment_method !== "cod" && order.channel === "web") {
    const target = { lang: order.locale as Lang, email: order.customer_email, phone: order.customer_phone, userId: order.user_id };
    await notifyCustomer(t, "payment_confirmation", target, { name: order.customer_name, order: order.number, total: sar(order.total) }, { link: orderLink(order) });
    await notifyAdmins(t, "new_order", { order: order.number, total: sar(order.total), name: order.customer_name }, url(`/admin/orders/${order.id}`));
  }
  return order;
}

/** Reconciles a pending online payment with the gateway. Safe to call repeatedly (return URL, webhook, scheduler). */
export async function syncPayment(paymentId: number): Promise<"paid" | "pending" | "failed"> {
  const pay = await db.one(`SELECT p.*, o.status AS order_status, o.total AS order_total FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.id = $1`, [paymentId]);
  if (!pay) return "failed";
  if (pay.status === "paid" || pay.status === "refunded" || pay.status === "partially_refunded") return "paid";
  if (pay.status !== "pending" || !pay.gateway_id) return "failed";
  const gw = onlineGateway();
  if (!gw || gw.id !== pay.provider) return "pending";
  const state = await gw.fetchState(pay.gateway_id);
  if (state.status === "paid") {
    if (state.amount !== pay.amount || state.currency !== "SAR") {
      log.error("payment amount mismatch", { payment: pay.id, expected: pay.amount, got: state.amount });
      await audit(null, "payment.mismatch", "payment", pay.id, { expected: pay.amount, got: state.amount });
      return "pending";
    }
    if (pay.order_status === "cancelled") {
      // paid after the order had been cancelled (e.g. expired): record it so staff can refund
      await db.exec(`UPDATE payments SET status = 'paid', paid_at = now(), gateway_payment_id = $2, method = $3, raw = $4::jsonb WHERE id = $1`, [pay.id, state.paymentId, state.method, state.raw]);
      await db.exec(`UPDATE orders SET payment_status = 'paid', paid_at = now() WHERE id = $1`, [pay.order_id]);
      await audit(null, "payment.paid_after_cancel", "order", pay.order_id, {});
      return "paid";
    }
    await tx((t) => markPaid(t, pay.order_id, { method: state.method, gatewayPaymentId: state.paymentId, raw: state.raw }));
    kickNotifications();
    return "paid";
  }
  if (state.status === "failed" || state.status === "expired") {
    await db.exec(`UPDATE payments SET status = 'failed', raw = $2::jsonb, updated_at = now() WHERE id = $1 AND status = 'pending'`, [pay.id, state.raw]);
    await db.exec(`UPDATE orders SET payment_status = 'failed' WHERE id = $1 AND payment_status = 'pending'`, [pay.order_id]);
    if (pay.order_status === "pending") await changeStatus(pay.order_id, "cancelled", { note: `payment ${state.status}`, system: true });
    return "failed";
  }
  return "pending";
}

/** Scheduler: reconcile pending online payments and cancel orders left unpaid past the TTL (stock is returned). */
export async function expireUnpaidOrders() {
  const ttl = (await getSettings()).checkout.unpaid_order_ttl_minutes;
  const rows = await db.q(
    `SELECT p.id AS payment_id, o.id AS order_id, o.created_at < now() - ($1 || ' minutes')::interval AS expired
       FROM payments p JOIN orders o ON o.id = p.order_id
      WHERE p.status = 'pending' AND p.provider NOT IN ('cod', 'pos') AND o.status = 'pending' AND o.created_at < now() - interval '2 minutes'
      ORDER BY o.id LIMIT 50`, [String(ttl)]);
  for (const r of rows) {
    try {
      const st = await syncPayment(r.payment_id);
      if (st === "pending" && r.expired) {
        await db.exec(`UPDATE payments SET status = 'cancelled', updated_at = now() WHERE id = $1 AND status = 'pending'`, [r.payment_id]);
        await changeStatus(r.order_id, "cancelled", { note: "payment not completed in time", system: true });
      }
    } catch (e) {
      log.warn("unpaid order reconciliation failed", { order_id: r.order_id, ...errMeta(e) });
    }
  }
}

// ───────────── status workflow ─────────────
export interface StatusOpts { note?: string | null; userId?: number | null; system?: boolean; trackingNumber?: string | null; carrier?: string | null; trackingUrl?: string | null; restock?: boolean; internal?: boolean; silent?: boolean; returnedItems?: { order_item_id: number; quantity: number }[] }

export async function changeStatus(orderId: number, to: OrderStatus, opts: StatusOpts = {}): Promise<Row> {
  const updated = await tx(async (t) => {
    const order = await t.one(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
    if (!order) throw notFound("order_not_found");
    const from = order.status as OrderStatus;
    if (from === to) return order;
    if (!ORDER_TRANSITIONS[from].includes(to)) throw conflict("invalid_status_transition", { from, to });
    if (to === "refunded" && !opts.internal) throw conflict("use_refund_action");
    const items = await t.q(`SELECT * FROM order_items WHERE order_id = $1 ORDER BY product_id`, [orderId]);
    const target = { lang: order.locale as Lang, email: order.customer_email, phone: order.customer_phone, userId: order.user_id };
    const vars = { name: order.customer_name, order: order.number, total: sar(order.total) };
    const link = orderLink(order);
    const set: Row = { status: to, updated_at: new Date() };

    if (to === "confirmed") await issueInvoice(t, orderId);

    if (to === "cancelled" || to === "returned") {
      if (to === "cancelled" || opts.restock !== false) {
        for (const it of items) {
          if (!it.product_id) continue;
          // a return puts back only the units the customer actually sent back
          const qty = to === "returned" && opts.returnedItems
            ? Math.min(it.quantity, opts.returnedItems.filter((r) => r.order_item_id === it.id).reduce((n, r) => n + r.quantity, 0))
            : it.quantity;
          if (qty <= 0) continue;
          await moveStock(t, { productId: it.product_id, type: to === "cancelled" ? "cancellation" : "return", delta: qty, referenceType: "order", referenceId: order.number, userId: opts.userId ?? null });
          await t.exec(`UPDATE products SET sold_count = GREATEST(sold_count - $2, 0) WHERE id = $1`, [it.product_id, qty]);
        }
      }
      if (to === "cancelled") {
        set.cancel_reason = opts.note ?? null;
        await t.exec(`UPDATE payments SET status = 'cancelled', updated_at = now() WHERE order_id = $1 AND status = 'pending' AND provider = 'cod'`, [orderId]);
        if (order.payment_status === "pending" && order.payment_method === "cod") set.payment_status = "unpaid";
        if (order.coupon_code) {
          await t.exec(`UPDATE coupons SET used_count = GREATEST(used_count - 1, 0) WHERE upper(code) = upper($1)`, [order.coupon_code]);
          await t.exec(`DELETE FROM coupon_redemptions WHERE order_id = $1`, [orderId]);
        }
        // an invoice was already issued for an order that will never be fulfilled or paid → reverse it
        const inv = await t.one(`SELECT total FROM invoices WHERE order_id = $1 AND kind = 'invoice'`, [orderId]);
        if (inv && order.payment_status !== "paid") await issueCreditNote(t, orderId, inv.total, opts.note || "Order cancelled");
      }
      if (to === "returned") await t.exec(`UPDATE shipments SET status = 'returned', updated_at = now() WHERE order_id = $1`, [orderId]);
    }

    if (to === "shipped") {
      const existing = await t.one(`SELECT * FROM shipments WHERE order_id = $1 ORDER BY id DESC LIMIT 1`, [orderId]);
      const tn = opts.trackingNumber?.trim() || existing?.tracking_number || trackingNumber();
      if (existing) await t.exec(`UPDATE shipments SET status = 'shipped', shipped_at = now(), tracking_number = $2, carrier = COALESCE($3, carrier), tracking_url = COALESCE($4, tracking_url), updated_at = now() WHERE id = $1`, [existing.id, tn, opts.carrier ?? null, opts.trackingUrl ?? null]);
      else await t.insert("shipments", { order_id: orderId, tracking_number: tn, carrier: opts.carrier ?? null, tracking_url: opts.trackingUrl ?? null, status: "shipped", shipped_at: new Date() });
      await notifyCustomer(t, "order_shipped", target, { ...vars, tracking: tn, carrier: opts.carrier ?? "" }, { link });
    }
    if (to === "out_for_delivery") await t.exec(`UPDATE shipments SET status = 'out_for_delivery', updated_at = now() WHERE order_id = $1`, [orderId]);
    if (to === "delivered") {
      set.delivered_at = new Date();
      await t.exec(`UPDATE shipments SET status = 'delivered', delivered_at = now(), updated_at = now() WHERE order_id = $1`, [orderId]);
      if (order.payment_method === "cod" && order.payment_status !== "paid") {
        await t.exec(`UPDATE payments SET status = 'paid', paid_at = now(), updated_at = now() WHERE order_id = $1 AND provider = 'cod' AND status = 'pending'`, [orderId]);
        set.payment_status = "paid"; set.paid_at = new Date();
        await issueInvoice(t, orderId);
      }
      await notifyCustomer(t, "order_delivered", target, vars, { link });
    }
    if (to === "cancelled" && !opts.silent) await notifyCustomer(t, "order_cancelled", target, { ...vars, reason: opts.note ?? "" }, { link });
    if (["confirmed", "processing", "ready_for_shipment", "out_for_delivery", "returned"].includes(to) && !(to === "confirmed" && opts.system)) {
      await notifyCustomer(t, "order_status", target, { ...vars, status: tr(order.locale as Lang, `status.${to}`) }, { link, smsToo: to === "out_for_delivery" });
    }

    await t.insert("order_status_history", { order_id: orderId, status: to, note: opts.note ?? null, user_id: opts.userId ?? null });
    return (await t.update("orders", orderId, set))!;
  });
  kickNotifications();
  invalidate("shell:home");
  return updated;
}

/** Refunds a paid order fully or partially: gateway refund (online payments), credit note and tax record. */
export async function refundOrder(orderId: number, amount: number | null, reason: string, userId: number | null) {
  const order = await db.one(`SELECT * FROM orders WHERE id = $1`, [orderId]);
  if (!order) throw notFound("order_not_found");
  const pay = await db.one(`SELECT * FROM payments WHERE order_id = $1 AND status IN ('paid', 'partially_refunded') ORDER BY id DESC LIMIT 1`, [orderId]);
  if (!pay) throw conflict("order_not_paid");
  const remaining = pay.amount - pay.refunded_amount;
  const amt = amount ?? remaining;
  if (!Number.isInteger(amt) || amt <= 0 || amt > remaining) throw bad("invalid_refund_amount", { remaining });

  let gatewayRaw: Record<string, unknown> | null = null;
  if (pay.provider !== "cod" && pay.provider !== "pos") {
    const gw = onlineGateway();
    if (!gw || gw.id !== pay.provider || !pay.gateway_payment_id) throw new HttpError(502, "payment_unavailable");
    try { gatewayRaw = (await gw.refund(pay.gateway_payment_id, amt)).raw; }
    catch (e) { log.error("gateway refund failed", { order: order.number, ...errMeta(e) }); throw new HttpError(502, "refund_failed"); }
  }
  const out = await tx(async (t) => {
    const full = amt === remaining;
    await t.exec(`UPDATE payments SET refunded_amount = refunded_amount + $2, status = $3, updated_at = now(), raw = COALESCE(raw, '{}'::jsonb) || $4::jsonb WHERE id = $1`,
      [pay.id, amt, full ? "refunded" : "partially_refunded", gatewayRaw ? { last_refund: gatewayRaw } : {}]);
    const set: Row = { payment_status: full ? "refunded" : "partially_refunded", updated_at: new Date() };
    const cn = await issueCreditNote(t, orderId, amt, reason);
    const cur = await t.one(`SELECT status FROM orders WHERE id = $1 FOR UPDATE`, [orderId]);
    if (full && (cur!.status === "cancelled" || cur!.status === "returned")) {
      set.status = "refunded";
      await t.insert("order_status_history", { order_id: orderId, status: "refunded", note: reason, user_id: userId });
    }
    const o = (await t.update("orders", orderId, set))!;
    await notifyCustomer(t, "order_refunded", { lang: o.locale as Lang, email: o.customer_email, phone: o.customer_phone, userId: o.user_id }, { name: o.customer_name, order: o.number, total: sar(amt) }, { link: orderLink(o) });
    return { order: o, credit_note: cn?.number ?? null, refunded: amt };
  });
  kickNotifications();
  return out;
}

/**
 * Value of a return request: what the customer paid for the returned units (after coupon share, VAT included).
 * `suggested` is the default refund: the whole order when every unit comes back, otherwise the returned units only.
 */
export async function returnValue(orderId: number, returned: { order_item_id: number; quantity: number }[], t: Db = db) {
  const order = await t.one(`SELECT total FROM orders WHERE id = $1`, [orderId]);
  const items = await t.q(`SELECT id, quantity, line_total, discount_alloc FROM order_items WHERE order_id = $1`, [orderId]);
  let value = 0, units = 0;
  for (const it of items) {
    const qty = Math.min(it.quantity, returned.filter((r) => r.order_item_id === it.id).reduce((n, r) => n + r.quantity, 0));
    units += qty;
    value += Math.round(((it.line_total - it.discount_alloc) * qty) / it.quantity);
  }
  const all = units === items.reduce((n, it) => n + it.quantity, 0);
  return { items_value: value, full: all, suggested: all ? (order?.total as number) ?? value : value };
}

// ───────────── point of sale (admin, barcode driven) ─────────────
export async function createPosSale(c: Ctx, input: { items: { product_id: number; quantity: number }[]; customer_name?: string | null; customer_phone?: string | null; vat_number?: string | null; payment_method: "cash" | "card"; coupon_code?: string | null }) {
  const out = await tx(async (t) => {
    const ids = [...new Set(input.items.map((i) => i.product_id))];
    const products = await t.q(
      `SELECT p.id AS product_id, p.sku, p.barcode, p.status, p.name_ar, p.name_en, p.name_ur, p.price, p.effective_price, p.purchase_price, p.vat_rate_bp,
              (SELECT COALESCE(pi.thumb_url, pi.url) FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort, pi.id LIMIT 1) AS image
         FROM products p WHERE p.id = ANY($1::int[])`, [`{${ids.join(",")}}`]);
    const rows = ids.map((id) => {
      const p = products.find((x) => x.product_id === id);
      if (!p || p.status === "archived") throw notFound("product_not_found");
      return { ...p, quantity: input.items.filter((i) => i.product_id === id).reduce((s, i) => s + i.quantity, 0) };
    });
    const name = input.customer_name?.trim() || "عميل نقدي";
    // Saudi numbers are stored in one format (+9665XXXXXXXX), so a counter sale finds the same customer the website created.
    const phone = normalizePhone(input.customer_phone ?? "") || input.customer_phone?.trim() || "-";
    const anonymous = !input.customer_phone && !input.customer_name?.trim() && !input.vat_number;
    const customer: Row = (input.customer_phone ? await t.one(`SELECT id FROM customers WHERE phone = $1 ORDER BY id LIMIT 1`, [phone]) : undefined)
      // unnamed cash sales share one walk-in record instead of adding a customer row per sale
      ?? (anonymous ? await t.one(`SELECT id FROM customers WHERE is_guest AND user_id IS NULL AND phone IS NULL AND email IS NULL AND vat_number IS NULL AND name = $1 ORDER BY id LIMIT 1`, [name]) : undefined)
      ?? await t.insert("customers", { name, phone: input.customer_phone ? phone : null, is_guest: true, vat_number: input.vat_number || null });
    if (input.vat_number) await t.exec(`UPDATE customers SET vat_number = $2 WHERE id = $1`, [customer.id, input.vat_number]);
    const subtotal = rows.reduce((s, r) => s + r.effective_price * r.quantity, 0);
    const check = await checkCoupon(input.coupon_code, subtotal, { customerId: customer.id }, t);
    if (input.coupon_code && check.error) throw bad(check.error);
    const { order, totals } = await createOrderCore(t, {
      channel: "pos", customerId: customer.id, userId: null, name, email: null, phone, address: {}, rows,
      coupon: check.coupon && check.rule ? { row: check.coupon, rule: check.rule } : null,
      shipping: { id: null, name: null, fee: 0, from: null, to: null }, codFee: 0,
      paymentMethod: input.payment_method, locale: "ar", notes: null, cartId: null, actorUserId: c.user!.id,
    });
    await t.insert("payments", { order_id: order.id, provider: "pos", method: input.payment_method, status: "paid", amount: totals.total, paid_at: new Date() });
    await t.exec(`UPDATE orders SET status = 'delivered', payment_status = 'paid', paid_at = now(), delivered_at = now() WHERE id = $1`, [order.id]);
    await t.insert("order_status_history", { order_id: order.id, status: "delivered", note: "in-store sale", user_id: c.user!.id });
    const invoice = await issueInvoice(t, order.id);
    await audit(c, "pos.sale", "order", order.id, { number: order.number, total: totals.total }, t);
    return { id: order.id as number, number: order.number as string, total: totals.total, invoice_number: invoice.number as string };
  });
  kickNotifications();
  invalidate("shell:home");
  return out;
}

// ───────────── read models ─────────────
export async function loadOrder(where: { id?: number; number?: string }): Promise<Row | undefined> {
  return where.id ? db.one(`SELECT * FROM orders WHERE id = $1`, [where.id]) : db.one(`SELECT * FROM orders WHERE number = $1`, [where.number]);
}

export function canAccessOrder(c: Ctx, order: Row, key?: string | null): boolean {
  if (key && key.length > 10 && key === order.access_key) return true;
  if (c.user && order.user_id === c.user.id) return true;
  return !!c.user && c.user.kind === "admin" && (c.user.permissions.includes("*") || c.user.permissions.includes("orders.view"));
}

const RETURN_WINDOW_DAYS = 7;

export async function orderView(order: Row, lang: Lang) {
  const [items, history, shipment, payment, invoices, returns] = await Promise.all([
    db.q(`SELECT oi.*, p.slug, c.icon AS glyph FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id LEFT JOIN categories c ON c.id = p.category_id WHERE oi.order_id = $1 ORDER BY oi.id`, [order.id]),
    db.q(`SELECT status, note, created_at FROM order_status_history WHERE order_id = $1 ORDER BY created_at, id`, [order.id]),
    db.one(`SELECT carrier, tracking_number, tracking_url, status, shipped_at, delivered_at FROM shipments WHERE order_id = $1 ORDER BY id DESC LIMIT 1`, [order.id]),
    db.one(`SELECT provider, method, status, amount, refunded_amount, gateway_url FROM payments WHERE order_id = $1 ORDER BY id DESC LIMIT 1`, [order.id]),
    db.q(`SELECT number, kind, total, issued_at FROM invoices WHERE order_id = $1 ORDER BY id`, [order.id]),
    db.q(`SELECT number, status, reason, refund_amount, created_at FROM returns WHERE order_id = $1 ORDER BY id DESC`, [order.id]),
  ]);
  const a = order.address ?? {};
  const delivered = order.delivered_at ? new Date(order.delivered_at).getTime() : 0;
  return {
    number: order.number, access_key: order.access_key, status: order.status as OrderStatus, payment_status: order.payment_status, payment_method: order.payment_method, channel: order.channel,
    created_at: order.created_at, delivery_from: order.delivery_from, delivery_to: order.delivery_to, delivered_at: order.delivered_at,
    customer: { name: order.customer_name, email: order.customer_email, phone: order.customer_phone },
    address: { ...a, city: lang === "ar" ? a.city : a[`city_${lang}`] ?? a.city, region: lang === "ar" ? a.region : a[`region_${lang}`] ?? a.region },
    shipping_method: order.shipping_method_name, notes: order.notes, coupon_code: order.coupon_code, cancel_reason: order.cancel_reason,
    items: items.map((it) => ({ id: it.id, product_id: it.product_id, slug: it.slug, sku: it.sku, name: pick(it, "name", lang), image: it.image_url, glyph: it.glyph ?? null, quantity: it.quantity, unit_price: it.unit_price, original_unit_price: it.original_unit_price, line_total: it.line_total })),
    totals: { items_subtotal: order.items_subtotal, discount_total: order.discount_total, shipping_fee: order.shipping_fee, cod_fee: order.cod_fee, vat_total: order.vat_total, total_excl_vat: order.total_excl_vat, total: order.total },
    history, shipment: shipment ?? null,
    payment: payment ? { provider: payment.provider, method: payment.method, status: payment.status, amount: payment.amount, refunded_amount: payment.refunded_amount, pay_url: payment.status === "pending" && order.status === "pending" ? payment.gateway_url : null } : null,
    invoices, returns,
    can_cancel: order.channel === "web" && (order.status === "pending" || order.status === "confirmed"),
    can_return: order.status === "delivered" && Date.now() - delivered < RETURN_WINDOW_DAYS * 86400_000 && !returns.some((r) => r.status === "requested" || r.status === "approved"),
  };
}

/** Public tracking view: status and shipment only, no personal data. */
export async function trackingView(order: Row) {
  const [history, shipment] = await Promise.all([
    db.q(`SELECT status, created_at FROM order_status_history WHERE order_id = $1 ORDER BY created_at, id`, [order.id]),
    db.one(`SELECT carrier, tracking_number, tracking_url, status, shipped_at, delivered_at FROM shipments WHERE order_id = $1 ORDER BY id DESC LIMIT 1`, [order.id]),
  ]);
  return { number: order.number, status: order.status, created_at: order.created_at, delivery_from: order.delivery_from, delivery_to: order.delivery_to, shipping_method: order.shipping_method_name, history, shipment: shipment ?? null, city: order.address?.city ?? null };
}

export async function requestReturn(order: Row, reason: string, items: { order_item_id: number; quantity: number }[]) {
  const view = await orderView(order, "ar");
  if (!view.can_return) throw conflict("return_not_allowed");
  const valid = items.filter((i) => view.items.some((it) => it.id === i.order_item_id && i.quantity > 0 && i.quantity <= it.quantity));
  if (!valid.length) throw bad("return_items_required");
  const out = await tx(async (t) => {
    const seq = await nextCounter(t, "return");
    const ret = await t.insert("returns", { number: `RT-${String(seq).padStart(6, "0")}`, order_id: order.id, reason: reason.slice(0, 1000), items: valid });
    await notifyAdmins(t, "return_requested", { order: order.number, name: order.customer_name }, url(`/admin/returns`));
    return ret;
  });
  kickNotifications();
  return out;
}
