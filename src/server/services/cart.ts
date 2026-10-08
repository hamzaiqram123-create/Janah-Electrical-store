import { isProd } from "../config";
import { db, type Db, type Row } from "../db";
import { bad, conflict, cookie, notFound, type Ctx } from "../http";
import { randomToken } from "../security";
import { pick, type Lang } from "../../shared/constants";
import { addVat, computeTotals, type CouponRule, type PriceLine } from "../../shared/pricing";
import { getSettings } from "./settings";

const CART_COOKIE = "cart";
const CART_DAYS = 60;

export async function findCart(c: Ctx, t: Db = db): Promise<Row | undefined> {
  if (c.user) {
    const row = await t.one(`SELECT * FROM carts WHERE user_id = $1 AND status = 'active' ORDER BY updated_at DESC LIMIT 1`, [c.user.id]);
    if (row) return row;
  }
  const token = c.cookies[CART_COOKIE];
  if (!token) return undefined;
  const row = await t.one(`SELECT * FROM carts WHERE token = $1 AND status = 'active'`, [token]);
  if (row && row.user_id && row.user_id !== c.user?.id) return undefined; // never expose another account's cart
  return row;
}

export async function ensureCart(c: Ctx): Promise<Row> {
  const existing = await findCart(c);
  if (existing) return existing;
  const token = randomToken(24);
  const row = await db.insert("carts", { token, user_id: c.user?.id ?? null, email: c.user?.email ?? null, locale: c.lang });
  c.setCookies.push(cookie(CART_COOKIE, token, { maxAge: CART_DAYS * 86400, secure: isProd }));
  c.cookies[CART_COOKIE] = token; // so the rest of this request (the cart returned to the client) sees the new cart
  return row;
}

/** After login/registration: fold the anonymous cart into the account's cart. */
export async function mergeCartOnLogin(c: Ctx, userId: number) {
  const token = c.cookies[CART_COOKIE];
  const guest = token ? await db.one(`SELECT * FROM carts WHERE token = $1 AND status = 'active' AND user_id IS NULL`, [token]) : undefined;
  const mine = await db.one(`SELECT * FROM carts WHERE user_id = $1 AND status = 'active' ORDER BY updated_at DESC LIMIT 1`, [userId]);
  if (guest && mine) {
    await db.exec(
      `INSERT INTO cart_items (cart_id, product_id, quantity)
       SELECT $1, product_id, quantity FROM cart_items WHERE cart_id = $2
       ON CONFLICT (cart_id, product_id) DO UPDATE SET quantity = GREATEST(cart_items.quantity, EXCLUDED.quantity)`, [mine.id, guest.id]);
    await db.exec(`UPDATE carts SET updated_at = now(), coupon_code = COALESCE(coupon_code, $2) WHERE id = $1`, [mine.id, guest.coupon_code]);
    await db.exec(`DELETE FROM carts WHERE id = $1`, [guest.id]);
    c.setCookies.push(cookie(CART_COOKIE, mine.token, { maxAge: CART_DAYS * 86400, secure: isProd }));
  } else if (guest) {
    await db.exec(`UPDATE carts SET user_id = $2, updated_at = now() WHERE id = $1`, [guest.id, userId]);
  } else if (mine) {
    c.setCookies.push(cookie(CART_COOKIE, mine.token, { maxAge: CART_DAYS * 86400, secure: isProd }));
  }
}

export interface CouponCheck { coupon: Row | null; rule: CouponRule | null; error: string | null }

export async function checkCoupon(code: string | null | undefined, itemsSubtotal: number, who: { customerId?: number | null; email?: string | null }, t: Db = db): Promise<CouponCheck> {
  if (!code) return { coupon: null, rule: null, error: null };
  const cp = await t.one(`SELECT * FROM coupons WHERE upper(code) = upper($1)`, [code.trim()]);
  const fail = (error: string): CouponCheck => ({ coupon: cp ?? null, rule: null, error });
  if (!cp || !cp.active) return fail("coupon_invalid");
  const now = Date.now();
  if (cp.starts_at && new Date(cp.starts_at).getTime() > now) return fail("coupon_not_started");
  if (cp.ends_at && new Date(cp.ends_at).getTime() <= now) return fail("coupon_expired");
  if (cp.usage_limit != null && cp.used_count >= cp.usage_limit) return fail("coupon_used_up");
  if (itemsSubtotal < cp.min_subtotal) return fail("coupon_min_subtotal");
  if (cp.per_customer_limit != null && (who.customerId || who.email)) {
    const used = await t.one<{ n: number }>(
      `SELECT count(*)::int AS n FROM coupon_redemptions r JOIN orders o ON o.id = r.order_id
        WHERE r.coupon_id = $1 AND o.status <> 'cancelled' AND (r.customer_id = $2 OR lower(o.customer_email) = lower($3))`,
      [cp.id, who.customerId ?? 0, who.email ?? ""]);
    if ((used?.n ?? 0) >= cp.per_customer_limit) return fail("coupon_already_used");
  }
  return { coupon: cp, rule: { type: cp.type, value: cp.value, max_discount: cp.max_discount }, error: null };
}

export interface CartLine {
  item_id: number; product_id: number; slug: string; sku: string; name: string; brand: string | null; image: string | null; glyph: string | null;
  unit_price: number; list_price: number; quantity: number; available: number; line_total: number; vat_rate_bp: number;
  issue: "out_of_stock" | "unavailable" | "qty_reduced" | null;
}

export async function cartRows(cartId: number, t: Db = db, lock = false): Promise<Row[]> {
  return t.q(
    `SELECT ci.id AS item_id, ci.quantity, p.id AS product_id, p.slug, p.sku, p.barcode, p.status, p.name_ar, p.name_en, p.name_ur,
            p.price, p.effective_price, p.purchase_price, p.vat_rate_bp, b.name_ar AS brand_ar, b.name_en AS brand_en, b.name_ur AS brand_ur,
            (SELECT COALESCE(pi.thumb_url, pi.url) FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort, pi.id LIMIT 1) AS image,
            (SELECT c.icon FROM categories c WHERE c.id = p.category_id) AS glyph,
            COALESCE(i.quantity, 0) AS stock
       FROM cart_items ci JOIN products p ON p.id = ci.product_id
       LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN inventory i ON i.product_id = p.id
      WHERE ci.cart_id = $1 ORDER BY ci.id ${lock ? "FOR UPDATE OF ci" : ""}`, [cartId]);
}

/** Priced, stock-validated view of a cart. Quantities above the available stock are reduced and flagged. */
export async function cartView(cart: Row | undefined, lang: Lang, opts: { shippingFee?: number; codFee?: number; customerId?: number | null; email?: string | null } = {}) {
  const settings = await getSettings();
  const incl = settings.tax.prices_include_vat;
  const empty = { id: null as number | null, items: [] as CartLine[], count: 0, coupon: null as null | { code: string; valid: boolean; error: string | null; type?: string }, has_issues: false,
    totals: { items_subtotal: 0, discount_total: 0, shipping_fee: opts.shippingFee ?? null, cod_fee: 0, vat_total: 0, total_excl_vat: 0, total: 0, free_shipping_applied: false } };
  if (!cart) return empty;
  const rows = await cartRows(cart.id);
  const items: CartLine[] = [];
  for (const r of rows) {
    let qty = r.quantity as number;
    let issue: CartLine["issue"] = null;
    if (r.status !== "active") issue = "unavailable";
    else if (r.stock <= 0) issue = "out_of_stock";
    else if (qty > r.stock) {
      qty = r.stock; issue = "qty_reduced";
      await db.exec(`UPDATE cart_items SET quantity = $2 WHERE id = $1`, [r.item_id, qty]);
    }
    const unit = incl ? r.effective_price : addVat(r.effective_price, r.vat_rate_bp);
    items.push({
      item_id: r.item_id, product_id: r.product_id, slug: r.slug, sku: r.sku, name: pick(r, "name", lang), brand: r.brand_ar ? pick(r, "brand", lang) : null, image: r.image, glyph: r.glyph ?? null,
      unit_price: unit, list_price: incl ? r.price : addVat(r.price, r.vat_rate_bp), quantity: qty, available: Math.max(0, r.stock), line_total: unit * qty, vat_rate_bp: r.vat_rate_bp, issue,
    });
  }
  const buyable = items.filter((i) => i.issue !== "out_of_stock" && i.issue !== "unavailable");
  const lines: PriceLine[] = buyable.map((i) => ({ key: i.product_id, unitPrice: i.unit_price, quantity: i.quantity, vatBp: i.vat_rate_bp }));
  const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const check = await checkCoupon(cart.coupon_code, subtotal, { customerId: opts.customerId, email: opts.email ?? cart.email });
  const totals = computeTotals({ lines, coupon: check.rule, shippingFee: opts.shippingFee ?? 0, codFee: opts.codFee ?? 0, pricesIncludeVat: true, shippingVatBp: settings.tax.vat_rate_bp });
  return {
    id: cart.id as number,
    items,
    count: buyable.reduce((s, i) => s + i.quantity, 0),
    coupon: cart.coupon_code ? { code: cart.coupon_code as string, valid: !check.error, error: check.error, type: check.coupon?.type } : null,
    has_issues: items.some((i) => i.issue === "out_of_stock" || i.issue === "unavailable"),
    totals: {
      items_subtotal: totals.itemsSubtotal, discount_total: totals.discountTotal, shipping_fee: opts.shippingFee === undefined ? null : totals.shippingFee,
      cod_fee: totals.codFee, vat_total: totals.vatTotal, total_excl_vat: totals.totalExclVat, total: totals.total, free_shipping_applied: totals.freeShippingApplied,
    },
  };
}

export async function addToCart(c: Ctx, productId: number, quantity: number, mode: "add" | "set" = "add") {
  const settings = await getSettings();
  const p = await db.one(`SELECT p.id, p.status, COALESCE(i.quantity, 0) AS stock FROM products p LEFT JOIN inventory i ON i.product_id = p.id WHERE p.id = $1`, [productId]);
  if (!p || p.status !== "active") throw notFound("product_not_found");
  if (!Number.isInteger(quantity) || quantity < 1) throw bad("invalid_quantity");
  const cart = await ensureCart(c);
  const cur = await db.one<{ quantity: number }>(`SELECT quantity FROM cart_items WHERE cart_id = $1 AND product_id = $2`, [cart.id, productId]);
  const wanted = mode === "add" ? (cur?.quantity ?? 0) + quantity : quantity;
  const max = Math.min(p.stock, settings.checkout.max_qty_per_item);
  if (p.stock <= 0) throw conflict("out_of_stock", { available: 0 });
  if (wanted > max) throw conflict("insufficient_stock", { available: max, in_cart: cur?.quantity ?? 0 });
  await db.exec(
    `INSERT INTO cart_items (cart_id, product_id, quantity) VALUES ($1, $2, $3)
     ON CONFLICT (cart_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity`, [cart.id, productId, wanted]);
  await db.exec(`UPDATE carts SET updated_at = now(), recovery_sent_at = NULL WHERE id = $1`, [cart.id]);
  return cart;
}

export async function removeFromCart(c: Ctx, productId: number) {
  const cart = await findCart(c);
  if (!cart) return;
  await db.exec(`DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2`, [cart.id, productId]);
  await db.exec(`UPDATE carts SET updated_at = now() WHERE id = $1`, [cart.id]);
}

export async function setCoupon(c: Ctx, code: string | null) {
  const cart = await ensureCart(c);
  if (code) {
    const rows = await cartRows(cart.id);
    const subtotal = rows.filter((r) => r.status === "active" && r.stock > 0).reduce((s, r) => s + r.effective_price * Math.min(r.quantity, r.stock), 0);
    const check = await checkCoupon(code, subtotal, { customerId: c.user?.customer_id, email: c.user?.email ?? cart.email });
    if (check.error) throw bad(check.error, check.coupon ? { min_subtotal: check.coupon.min_subtotal } : undefined);
  }
  await db.exec(`UPDATE carts SET coupon_code = $2, updated_at = now() WHERE id = $1`, [cart.id, code ? code.trim().toUpperCase() : null]);
}

/** Restore a cart from a recovery link token (sets the cart cookie). */
export async function recoverCart(c: Ctx, token: string): Promise<boolean> {
  const cart = await db.one(`SELECT id, user_id FROM carts WHERE token = $1 AND status = 'active'`, [token]);
  if (!cart || (cart.user_id && cart.user_id !== c.user?.id)) return false;
  c.setCookies.push(cookie(CART_COOKIE, token, { maxAge: CART_DAYS * 86400, secure: isProd }));
  return true;
}
