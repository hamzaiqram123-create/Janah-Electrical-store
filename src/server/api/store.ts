import { z } from "zod";
import { db, nextCounter, tx } from "../db";
import { bad, conflict, forbidden, notFound, pageParams, unauthorized, type Ctx, type Router } from "../http";
import { ensureCustomer, requireUser } from "../auth";
import { pick, type Lang } from "../../shared/constants";
import { addToCart, cartView, ensureCart, findCart, recoverCart, removeFromCart, setCoupon } from "../services/cart";
import { cardsByIds, categoryTree, getProduct, listBrands, listProducts, refreshRating, suggest, type ProductQuery } from "../services/catalog";
import { invoiceWithItems } from "../services/invoices";
import { kickNotifications, notifyAdmins } from "../services/notifications";
import { canAccessOrder, changeStatus, loadOrder, orderView, paymentMethods, placeOrder, requestReturn, trackingView } from "../services/orders";
import { getSettings } from "../services/settings";
import { listRegions, shippingOptions } from "../services/shipping";
import { config } from "../config";
import * as s from "./schemas";

export function parseProductQuery(q: URLSearchParams): ProductQuery {
  const num = (k: string) => (q.get(k) && Number.isFinite(Number(q.get(k))) ? Number(q.get(k)) : undefined);
  const flag = q.get("flag");
  return {
    q: q.get("q")?.slice(0, 100) || undefined,
    category: q.get("category") || undefined,
    brands: q.get("brand")?.split(",").filter(Boolean),
    min: num("min") !== undefined ? num("min")! * 100 : undefined,
    max: num("max") !== undefined ? num("max")! * 100 : undefined,
    inStock: q.get("in_stock") === "1",
    rating: num("rating"),
    flag: flag === "featured" || flag === "new" || flag === "best" || flag === "deals" ? flag : undefined,
    sort: q.get("sort") || undefined,
    page: num("page"), per: num("per"),
  };
}

export async function publicSettings(lang: Lang) {
  const st = await getSettings();
  return {
    store: {
      name: st.store[`name_${lang}`] || st.store.name_ar, name_ar: st.store.name_ar, tagline: st.store[`tagline_${lang}`], legal_name: st.store.legal_name,
      vat_number: st.store.vat_number, cr_number: st.store.cr_number, phone: st.store.phone, whatsapp: st.store.whatsapp, email: st.store.email,
      address: [st.store.building_no, st.store.street, st.store.district, lang === "ar" ? st.store.city_ar : st.store.city_en || st.store.city_ar, st.store.postal_code].filter(Boolean).join(lang === "en" ? ", " : "، "),
      working_hours: st.store[`working_hours_${lang}`],
      social: { instagram: st.store.instagram, x: st.store.x, tiktok: st.store.tiktok, snapchat: st.store.snapchat },
    },
    vat_rate_bp: st.tax.vat_rate_bp,
    guest_checkout: st.checkout.guest_checkout,
    online_payment: config.PAYMENT_PROVIDER !== "none",
    email_enabled: config.EMAIL_PROVIDER !== "log", // the storefront only says "we emailed you" when mail is really sent
  };
}

async function quote(c: Ctx, cityId?: number | null, methodId?: number | null, payment?: string | null) {
  const cart = await findCart(c);
  const base = await cartView(cart, c.lang, { customerId: c.user?.customer_id, email: c.user?.email });
  if (!cityId) return { cart: base, shipping_options: [], payment_methods: [] };
  const options = await shippingOptions(cityId, base.totals.items_subtotal, c.lang);
  const chosen = options.find((o) => o.id === methodId) ?? options[0];
  if (!chosen) return { cart: base, shipping_options: [], payment_methods: [] };
  const noFee = await cartView(cart, c.lang, { shippingFee: chosen.fee, customerId: c.user?.customer_id, email: c.user?.email });
  const methods = await paymentMethods(noFee.totals.total, chosen.cod_allowed);
  const pm = methods.find((m) => m.key === payment) ?? methods[0];
  const view = pm?.fee ? await cartView(cart, c.lang, { shippingFee: chosen.fee, codFee: pm.fee, customerId: c.user?.customer_id, email: c.user?.email }) : noFee;
  return { cart: view, shipping_options: options, shipping_method_id: chosen.id, payment_methods: methods, payment_method: pm?.key ?? null };
}

export function registerStoreApi(r: Router) {
  // ── catalogue
  r.get("/api/categories", async (c) => ({ categories: await categoryTree(c.lang) }));
  r.get("/api/brands", async (c) => ({ brands: await listBrands(c.lang) }));
  r.get("/api/regions", async (c) => ({ regions: await listRegions(c.lang) }));
  r.get("/api/settings", async (c) => publicSettings(c.lang));
  r.get("/api/products", async (c) => listProducts(parseProductQuery(c.query), c.lang), { rate: "search" });
  r.get("/api/products/by-ids", async (c) => {
    const ids = (c.query.get("ids") ?? "").split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 24);
    return { items: await cardsByIds(ids, c.lang) };
  });
  r.get("/api/search/suggest", async (c) => suggest(c.query.get("q") ?? "", c.lang), { rate: "search" });
  r.get("/api/products/:slug", async (c) => {
    const p = await getProduct(c.params.slug!, c.lang);
    if (!p) throw notFound("product_not_found");
    return { product: p };
  });

  r.post("/api/products/:id/reviews", async (c) => {
    const u = requireUser(c);
    const productId = s.id.parse(c.params.id);
    const body = await c.body(z.object({ rating: z.number().int().min(1).max(5), title: s.text(120).default(""), body: s.text(2000).default("") }));
    const settings = await getSettings();
    const customerId = await ensureCustomer(u);
    const product = await db.one(`SELECT id FROM products WHERE id = $1 AND status = 'active'`, [productId]);
    if (!product) throw notFound("product_not_found");
    const bought = await db.one(
      `SELECT 1 AS ok FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE oi.product_id = $1 AND o.customer_id = $2 AND o.status = 'delivered' LIMIT 1`, [productId, customerId]);
    if (settings.reviews.verified_only && !bought) throw forbidden("review_requires_purchase");
    const status = settings.reviews.auto_approve ? "approved" : "pending";
    await db.exec(
      `INSERT INTO reviews (product_id, customer_id, rating, title, body, status, verified_purchase) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (product_id, customer_id) DO UPDATE SET rating = EXCLUDED.rating, title = EXCLUDED.title, body = EXCLUDED.body, status = EXCLUDED.status, created_at = now()`,
      [productId, customerId, body.rating, body.title, body.body, status, !!bought]);
    await refreshRating(productId);
    return { status };
  }, { auth: "user", rate: "write" });

  // ── cart
  const view = async (c: Ctx) => ({ cart: await cartView(await findCart(c), c.lang, { customerId: c.user?.customer_id, email: c.user?.email }) });
  r.get("/api/cart", view);
  r.post("/api/cart/items", async (c) => {
    const body = await c.body(z.object({ product_id: s.id, quantity: z.number().int().min(1).max(10000).default(1) }));
    await addToCart(c, body.product_id, body.quantity, "add");
    return view(c);
  }, { rate: "write" });
  r.patch("/api/cart/items/:productId", async (c) => {
    const body = await c.body(z.object({ quantity: z.number().int().min(0).max(10000) }));
    const pid = s.id.parse(c.params.productId);
    if (body.quantity === 0) await removeFromCart(c, pid); else await addToCart(c, pid, body.quantity, "set");
    return view(c);
  }, { rate: "write" });
  r.delete("/api/cart/items/:productId", async (c) => {
    await removeFromCart(c, s.id.parse(c.params.productId));
    return view(c);
  });
  r.post("/api/cart/coupon", async (c) => {
    const body = await c.body(z.object({ code: z.string().trim().min(2).max(40) }));
    await setCoupon(c, body.code);
    return view(c);
  }, { rate: "write" });
  r.delete("/api/cart/coupon", async (c) => { await setCoupon(c, null); return view(c); });
  r.post("/api/cart/recover", async (c) => {
    const body = await c.body(z.object({ token: z.string().min(10).max(100) }));
    if (!(await recoverCart(c, body.token))) throw notFound("cart_not_found");
    return { ok: true };
  }, { rate: "write" });

  // ── checkout
  r.post("/api/checkout/quote", async (c) => {
    const body = await c.body(z.object({ city_id: s.id.nullish(), shipping_method_id: s.id.nullish(), payment_method: z.string().max(20).nullish(), email: s.email.nullish() }));
    if (body.email) { // remembered for abandoned-cart recovery
      const cart = await findCart(c);
      if (cart) await db.exec(`UPDATE carts SET email = $2, locale = $3 WHERE id = $1`, [cart.id, body.email, c.lang]);
    }
    return quote(c, body.city_id, body.shipping_method_id, body.payment_method);
  }, { rate: "write" });

  r.post("/api/checkout/place", async (c) => {
    const body = await c.body(z.object({
      customer: z.object({ name: s.name, email: s.email, phone: s.phone, company_name: s.optText(160), vat_number: s.vatNumber }),
      address_id: s.id.nullish(),
      address: s.address.nullish(),
      save_address: z.boolean().optional(),
      shipping_method_id: s.id,
      payment_method: z.enum(["cod", "online"]),
      notes: s.optText(500),
      accept_terms: z.literal(true, { errorMap: () => ({ message: "terms_required" }) }),
    }));
    return placeOrder(c, body);
  }, { rate: "write" });

  // ── orders (owner, access key or staff)
  const ownOrder = async (c: Ctx) => {
    const order = await loadOrder({ number: c.params.number });
    if (!order || !canAccessOrder(c, order, c.query.get("key"))) throw notFound("order_not_found");
    return order;
  };
  r.get("/api/orders/:number", async (c) => ({ order: await orderView(await ownOrder(c), c.lang) }));
  r.post("/api/orders/:number/cancel", async (c) => {
    const order = await ownOrder(c);
    const body = await c.body(z.object({ reason: s.optText(300) }));
    if (order.channel !== "web" || (order.status !== "pending" && order.status !== "confirmed")) throw conflict("cancel_not_allowed");
    const updated = await changeStatus(order.id, "cancelled", { note: body.reason ?? "cancelled by customer", userId: c.user?.id ?? null });
    return { order: await orderView(updated, c.lang) };
  }, { rate: "write" });
  r.post("/api/orders/:number/return", async (c) => {
    const order = await ownOrder(c);
    const body = await c.body(z.object({ reason: z.string().trim().min(5).max(1000), items: z.array(z.object({ order_item_id: s.id, quantity: z.number().int().min(1) })).min(1).max(100) }));
    const ret = await requestReturn(order, body.reason, body.items);
    return { return: { number: ret.number, status: ret.status } };
  }, { rate: "write" });
  r.post("/api/orders/:number/reorder", async (c) => {
    const order = await ownOrder(c);
    const items = await db.q(`SELECT product_id, quantity FROM order_items WHERE order_id = $1 AND product_id IS NOT NULL`, [order.id]);
    const skipped: number[] = [];
    for (const it of items) {
      try { await addToCart(c, it.product_id, it.quantity, "add"); }
      catch { try { await addToCart(c, it.product_id, 1, "add"); } catch { skipped.push(it.product_id); } }
    }
    return { ...(await view(c)), skipped };
  }, { rate: "write" });

  r.get("/api/track", async (c) => {
    const tracking = c.query.get("tracking")?.trim();
    const number = c.query.get("number")?.trim().toUpperCase();
    const contact = c.query.get("contact")?.trim().toLowerCase() ?? "";
    let order;
    if (tracking) order = await db.one(`SELECT o.* FROM orders o JOIN shipments s ON s.order_id = o.id WHERE s.tracking_number = $1`, [tracking]);
    else if (number && contact.length >= 4) {
      const o = await loadOrder({ number });
      const digits = contact.replace(/\D/g, "");
      if (o && ((o.customer_email ?? "").toLowerCase() === contact || (digits.length >= 4 && String(o.customer_phone).replace(/\D/g, "").endsWith(digits.slice(-9))))) order = o;
    }
    if (!order) throw notFound("order_not_found");
    return { tracking: await trackingView(order) };
  }, { rate: "auth" });

  r.get("/api/invoices/:number", async (c) => {
    const inv = await invoiceWithItems({ number: c.params.number });
    if (!inv) throw notFound();
    const order = inv.order_id ? await loadOrder({ id: inv.order_id }) : undefined;
    const staff = c.can("invoices.view");
    if (!staff && (!order || !canAccessOrder(c, order, c.query.get("key")))) throw notFound();
    const { xml: _xml, access_key: _k, zatca_response: _z, ...safe } = inv;
    return { invoice: staff ? { ...safe, zatca_response: inv.zatca_response } : safe };
  });

  // ── account
  r.get("/api/account/orders", async (c) => {
    const u = requireUser(c);
    const { page, per, offset } = pageParams(c.query, 10, 50);
    const rows = await db.q(
      `SELECT o.number, o.status, o.payment_status, o.total, o.created_at, o.access_key,
              (SELECT count(*)::int FROM order_items WHERE order_id = o.id) AS item_count,
              (SELECT image_url FROM order_items WHERE order_id = o.id ORDER BY id LIMIT 1) AS image
         FROM orders o WHERE o.user_id = $1 ORDER BY o.created_at DESC LIMIT $2 OFFSET $3`, [u.id, per, offset]);
    const total = (await db.one<{ n: number }>(`SELECT count(*)::int AS n FROM orders WHERE user_id = $1`, [u.id]))!.n;
    return { orders: rows, total, page, pages: Math.ceil(total / per) };
  }, { auth: "user" });

  r.get("/api/account/addresses", async (c) => {
    const u = requireUser(c);
    if (!u.customer_id) return { addresses: [] };
    const rows = await db.q(
      `SELECT a.*, ci.name_ar AS city_ar, ci.name_en AS city_en, ci.name_ur AS city_ur FROM addresses a JOIN cities ci ON ci.id = a.city_id WHERE a.customer_id = $1 ORDER BY a.is_default DESC, a.id`, [u.customer_id]);
    return { addresses: rows.map((a) => ({ ...a, city: pick(a, "city", c.lang) })) };
  }, { auth: "user" });
  const addrBody = s.address.extend({ label: s.optText(40), recipient_name: s.name, phone: s.phone, is_default: z.boolean().optional() });
  r.post("/api/account/addresses", async (c) => {
    const u = requireUser(c);
    const body = await c.body(addrBody);
    const cid = await ensureCustomer(u);
    const count = (await db.one<{ n: number }>(`SELECT count(*)::int AS n FROM addresses WHERE customer_id = $1`, [cid]))!.n;
    if (count >= 20) throw conflict("address_limit");
    const row = await tx(async (t) => {
      const makeDefault = body.is_default || count === 0;
      if (makeDefault) await t.exec(`UPDATE addresses SET is_default = false WHERE customer_id = $1`, [cid]);
      return t.insert("addresses", { ...body, customer_id: cid, is_default: makeDefault });
    });
    return { address: row };
  }, { auth: "user", rate: "write" });
  r.put("/api/account/addresses/:id", async (c) => {
    const u = requireUser(c);
    const body = await c.body(addrBody);
    const cid = await ensureCustomer(u);
    const aid = s.id.parse(c.params.id);
    const own = await db.one(`SELECT id FROM addresses WHERE id = $1 AND customer_id = $2`, [aid, cid]);
    if (!own) throw notFound("address_not_found");
    const row = await tx(async (t) => {
      if (body.is_default) await t.exec(`UPDATE addresses SET is_default = false WHERE customer_id = $1`, [cid]);
      return t.update("addresses", aid, { ...body, is_default: body.is_default ?? undefined });
    });
    return { address: row };
  }, { auth: "user", rate: "write" });
  r.delete("/api/account/addresses/:id", async (c) => {
    const u = requireUser(c);
    await db.exec(`DELETE FROM addresses WHERE id = $1 AND customer_id = $2`, [s.id.parse(c.params.id), u.customer_id ?? 0]);
    return { ok: true };
  }, { auth: "user" });

  r.get("/api/account/wishlist", async (c) => {
    const u = requireUser(c);
    const ids = (await db.q<{ product_id: number }>(`SELECT product_id FROM wishlists WHERE customer_id = $1 ORDER BY created_at DESC`, [u.customer_id ?? 0])).map((x) => x.product_id);
    return { ids, items: await cardsByIds(ids, c.lang) };
  }, { auth: "user" });
  r.post("/api/account/wishlist", async (c) => {
    const u = requireUser(c);
    const body = await c.body(z.object({ product_id: s.id }));
    const cid = await ensureCustomer(u);
    const p = await db.one(`SELECT id FROM products WHERE id = $1 AND status = 'active'`, [body.product_id]);
    if (!p) throw notFound("product_not_found");
    await db.exec(`INSERT INTO wishlists (customer_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [cid, body.product_id]);
    return { ok: true };
  }, { auth: "user", rate: "write" });
  r.delete("/api/account/wishlist/:productId", async (c) => {
    const u = requireUser(c);
    await db.exec(`DELETE FROM wishlists WHERE customer_id = $1 AND product_id = $2`, [u.customer_id ?? 0, s.id.parse(c.params.productId)]);
    return { ok: true };
  }, { auth: "user" });

  // ── support
  const createTicket = async (c: Ctx, data: { name: string; email: string; phone?: string | null; subject: string; message: string; order_number?: string | null; source: string }) => {
    const out = await tx(async (t) => {
      const seq = await nextCounter(t, "ticket");
      const ticket = await t.insert("support_tickets", {
        number: `TK-${String(seq).padStart(6, "0")}`, customer_id: c.user?.customer_id ?? null, name: data.name, email: data.email, phone: data.phone ?? null,
        subject: data.subject, order_number: data.order_number ?? null, source: data.source,
      });
      await t.insert("ticket_messages", { ticket_id: ticket.id, author: "customer", user_id: c.user?.id ?? null, body: data.message });
      await notifyAdmins(t, "new_ticket", { ticket: ticket.number, name: data.name, subject: data.subject }, `${config.APP_URL}/admin/tickets`);
      return ticket;
    });
    kickNotifications();
    return out;
  };
  r.post("/api/contact", async (c) => {
    const body = await c.body(z.object({ name: s.name, email: s.email, phone: s.phone.optional().or(z.literal("").transform(() => undefined)), subject: s.text(160).min(3), message: s.text(4000).min(10), order_number: s.optText(40), website: z.string().max(0).optional() }));
    const t = await createTicket(c, { ...body, source: "contact_form" });
    return { ticket: t.number };
  }, { rate: "auth" });
  r.get("/api/account/tickets", async (c) => {
    const u = requireUser(c);
    const rows = await db.q(`SELECT number, subject, status, created_at, updated_at FROM support_tickets WHERE customer_id = $1 OR lower(email) = lower($2) ORDER BY updated_at DESC LIMIT 50`, [u.customer_id ?? 0, u.email]);
    return { tickets: rows };
  }, { auth: "user" });
  r.get("/api/account/tickets/:number", async (c) => {
    const u = requireUser(c);
    const tk = await db.one(`SELECT * FROM support_tickets WHERE number = $1 AND (customer_id = $2 OR lower(email) = lower($3))`, [c.params.number, u.customer_id ?? 0, u.email]);
    if (!tk) throw notFound();
    const messages = await db.q(`SELECT author, body, created_at FROM ticket_messages WHERE ticket_id = $1 ORDER BY created_at, id`, [tk.id]);
    return { ticket: { number: tk.number, subject: tk.subject, status: tk.status, created_at: tk.created_at, order_number: tk.order_number }, messages };
  }, { auth: "user" });
  r.post("/api/account/tickets", async (c) => {
    const u = requireUser(c);
    const body = await c.body(z.object({ subject: s.text(160).min(3), message: s.text(4000).min(10), order_number: s.optText(40) }));
    await ensureCustomer(u);
    const t = await createTicket(c, { name: u.name || u.email, email: u.email, phone: u.phone, ...body, source: "account" });
    return { ticket: t.number };
  }, { auth: "user", rate: "write" });
  r.post("/api/account/tickets/:number/messages", async (c) => {
    const u = requireUser(c);
    const body = await c.body(z.object({ message: s.text(4000).min(2) }));
    const tk = await db.one(`SELECT id, status FROM support_tickets WHERE number = $1 AND (customer_id = $2 OR lower(email) = lower($3))`, [c.params.number, u.customer_id ?? 0, u.email]);
    if (!tk) throw notFound();
    if (tk.status === "closed") throw conflict("ticket_closed");
    await db.insert("ticket_messages", { ticket_id: tk.id, author: "customer", user_id: u.id, body: body.message });
    await db.exec(`UPDATE support_tickets SET status = 'open', updated_at = now() WHERE id = $1`, [tk.id]);
    return { ok: true };
  }, { auth: "user", rate: "write" });

  r.get("/api/faqs", async (c) => {
    const rows = await db.q(`SELECT * FROM faqs WHERE active ORDER BY sort, id`);
    return { faqs: rows.map((f) => ({ id: f.id, question: pick(f, "question", c.lang), answer: pick(f, "answer", c.lang) })) };
  });
  r.get("/api/pages/:slug", async (c) => {
    const p = await db.one(`SELECT * FROM pages WHERE slug = $1`, [c.params.slug]);
    if (!p) throw notFound();
    return { page: { slug: p.slug, title: pick(p, "title", c.lang), body: pick(p, "body", c.lang), updated_at: p.updated_at } };
  });
}
