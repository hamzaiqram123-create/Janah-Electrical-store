/**
 * End-to-end check of the main store and back-office flows against a RUNNING server and its database.
 *
 *   E2E_URL=http://localhost:3000 bun scripts/e2e.ts
 *
 * Requirements: a seeded database (bun run seed, with the sample catalogue), the admin from SEED_ADMIN_EMAIL /
 * SEED_ADMIN_PASSWORD (or E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD), and the server started with TRUST_PROXY=true so each
 * simulated visitor gets its own rate-limit bucket. It creates real orders, customers and stock movements:
 * run it against a development or staging database, never production.
 */
import { SQL } from "bun";

const BASE = (process.env.E2E_URL ?? "http://localhost:3000").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? process.env.SEED_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD ?? "";
const sql = new SQL(process.env.DATABASE_URL!);
const run = Date.now().toString(36);

let passed = 0;
const failures: string[] = [];
let section = "";
function check(name: string, ok: unknown, detail?: unknown) {
  if (ok) { passed++; return; }
  const line = `[${section}] ${name}${detail !== undefined ? ` → ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`;
  failures.push(line);
  console.log("  FAIL " + line);
}
function eq(name: string, actual: unknown, expected: unknown) { check(name, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
async function group(name: string, fn: () => Promise<void>) {
  section = name;
  const before = failures.length;
  try { await fn(); } catch (e: any) { check("threw", false, e?.stack ?? String(e)); }
  console.log(`${failures.length === before ? "ok  " : "FAIL"} ${name}`);
}

let ipSeq = 10;
class Client {
  cookies = new Map<string, string>();
  ip = `10.9.${Math.floor(Math.random() * 250)}.${ipSeq++}`;
  constructor(public lang = "ar") {}
  async raw(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    const h: Record<string, string> = { "x-forwarded-for": this.ip, "accept-language": this.lang, "x-lang": this.lang, ...headers };
    if (this.cookies.size) h.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    if (method !== "GET" && this.cookies.get("csrf") && !("x-csrf-token" in headers)) h["x-csrf-token"] = this.cookies.get("csrf")!;
    let payload: BodyInit | undefined;
    if (body instanceof FormData) payload = body;
    else if (typeof body === "string") { payload = body; h["content-type"] = "application/json"; }
    else if (body !== undefined) { payload = JSON.stringify(body); h["content-type"] = "application/json"; }
    const res = await fetch(BASE + path, { method, headers: h, body: payload, redirect: "manual" });
    for (const sc of res.headers.getSetCookie()) {
      const [pair] = sc.split(";");
      const i = pair!.indexOf("=");
      const k = pair!.slice(0, i), v = pair!.slice(i + 1);
      if (v === "" || /max-age=0/i.test(sc)) this.cookies.delete(k); else this.cookies.set(k, v);
    }
    return res;
  }
  async call(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<{ status: number; data: any }> {
    const res = await this.raw(method, path, body, headers);
    const text = await res.text();
    let data: any = text;
    try { data = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, data };
  }
  get(p: string) { return this.call("GET", p); }
  post(p: string, b: unknown = {}) { return this.call("POST", p, b); }
  put(p: string, b: unknown = {}) { return this.call("PUT", p, b); }
  patch(p: string, b: unknown = {}) { return this.call("PATCH", p, b); }
  del(p: string) { return this.call("DELETE", p); }
  /** First GET sets the csrf cookie, as loading any page does for a browser. */
  async open() { await this.get("/api/auth/me"); return this; }
}

const stockOf = async (id: number) => Number((await sql`SELECT quantity FROM inventory WHERE product_id = ${id}`)[0]?.quantity ?? 0);
const address = (cityId: number) => ({ city_id: cityId, district: "العليا", street: "طريق الملك فهد", building_no: "7421", postal_code: "12211", short_address: "RRRD2929", notes: null });

async function main() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error("Set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (or E2E_ADMIN_*) to an existing administrator.");
  const guest = await new Client("ar").open();
  const admin = await new Client("ar").open();
  const customer = await new Client("en").open();
  const email = `e2e-${run}@example.com`;
  const cPassword = "Customer123";

  const products = (await guest.get("/api/products?per=40&in_stock=1&sort=price_asc")).data.items as any[];
  const regions = (await guest.get("/api/regions")).data.regions as any[];
  const riyadh = regions.flatMap((r) => r.cities).find((c: any) => /riyadh|الرياض/i.test(c.name)) ?? regions[0].cities[0];
  const [pA, pB, pC] = [products[5], products[12], products[20]];
  let guestOrder: any, guestKey = "", custOrder: any, invoiceNumber = "";

  await group("public pages and SEO", async () => {
    for (const p of ["/", "/ar", "/en", "/ur", "/ar/products", `/ar/p/${pA.slug}`, "/en/cart", "/ur/faq", "/ar/contact", "/ar/page/privacy", "/ar/page/terms", "/ar/page/returns", "/en/categories", "/en/brands", "/ar/track", "/admin"]) {
      const res = await guest.raw("GET", p);
      check(`GET ${p}`, res.status === 200 || (p === "/" && res.status >= 300 && res.status < 400), res.status);
      await res.arrayBuffer();
    }
    const html = await (await guest.raw("GET", `/ar/p/${pA.slug}`)).text();
    check("rtl + lang attributes", /<html[^>]+lang="ar"[^>]+dir="rtl"/.test(html) || /<html[^>]+dir="rtl"[^>]+lang="ar"/.test(html));
    check("canonical link", /<link rel="canonical" href="[^"]+\/ar\/p\//.test(html));
    check("hreflang alternates", (html.match(/hreflang="/g) ?? []).length >= 3);
    check("open graph tags", /property="og:title"/.test(html) && /property="og:image"|property="og:type"/.test(html));
    const ld = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]!));
    const types = ld.flatMap((x) => (Array.isArray(x) ? x : x["@graph"] ?? [x])).map((x: any) => x["@type"]);
    check("Product schema", types.includes("Product"), types);
    check("BreadcrumbList schema", types.includes("BreadcrumbList"), types);
    const home = await (await guest.raw("GET", "/ar")).text();
    check("Organization schema", /"@type":"(Organization|Store|ElectronicsStore|LocalBusiness|HardwareStore)"/.test(home));
    const en = await (await guest.raw("GET", "/en")).text();
    check("english is ltr", /<html[^>]+dir="ltr"/.test(en));
    const ur = await (await guest.raw("GET", "/ur")).text();
    check("urdu is rtl", /<html[^>]+dir="rtl"/.test(ur));
    const robots = await (await guest.raw("GET", "/robots.txt")).text();
    check("robots.txt", /Sitemap:/i.test(robots) && /Disallow: \/admin/i.test(robots));
    const sm = await (await guest.raw("GET", "/sitemap.xml")).text();
    check("sitemap lists products", sm.includes(`/ar/p/${pA.slug}`) && sm.includes("<urlset"));
    const nf = await guest.raw("GET", "/ar/p/no-such-product-here");
    eq("unknown product is 404", nf.status, 404);
    await nf.arrayBuffer();
    const h = await guest.raw("GET", "/ar");
    check("CSP header", (h.headers.get("content-security-policy") ?? "").includes("script-src"));
    eq("nosniff header", h.headers.get("x-content-type-options"), "nosniff");
    await h.arrayBuffer();
  });

  await group("search", async () => {
    const s = async (q: string, lang = "ar") => (await new Client(lang).get(`/api/products?q=${encodeURIComponent(q)}`)).data;
    check("arabic keyword", (await s("مفتاح")).total > 0);
    check("english keyword", (await s("socket", "en")).total > 0);
    check("urdu keyword", (await s("بلب", "ur")).total > 0);
    const bySku = await s(pA.sku);
    eq("sku finds the product first", bySku.items?.[0]?.id, pA.id);
    const full = (await guest.get(`/api/products/${pA.slug}`)).data.product;
    if (full.barcode) eq("barcode finds the product", (await s(full.barcode)).items?.[0]?.id, pA.id);
    const sug = (await guest.get(`/api/search/suggest?q=${encodeURIComponent("led")}`)).data;
    check("autocomplete returns products", sug.products.length > 0, sug);
    const inj = await guest.get(`/api/products?q=${encodeURIComponent("'; DROP TABLE products; --")}`);
    eq("sql metacharacters are harmless", inj.status, 200);
    const sorted = (await guest.get("/api/products?sort=price_desc&per=5")).data.items;
    check("sort by price desc", sorted.every((p: any, i: number) => i === 0 || sorted[i - 1].price >= p.price), sorted.map((p: any) => p.price));
    const ranged = (await guest.get("/api/products?min=50&max=100&per=40")).data.items;
    check("price range filter", ranged.length > 0 && ranged.every((p: any) => p.price >= 5000 && p.price <= 10000));
  });

  await group("validation and error handling", async () => {
    const bad = await guest.post("/api/auth/register", { name: "x", email: "not-an-email", phone: "123", password: "short" });
    eq("invalid registration is 422", bad.status, 422);
    check("field errors returned", bad.data?.error?.details?.fields?.email && bad.data.error.details.fields.password && bad.data.error.details.fields.phone, bad.data);
    check("error message is localised (arabic)", /[؀-ۿ]/.test(bad.data?.error?.message ?? ""), bad.data?.error);
    const noCsrf = await guest.call("POST", "/api/cart/items", { product_id: pA.id, quantity: 1 }, { "x-csrf-token": "" });
    eq("missing CSRF token is 403", noCsrf.status, 403);
    const crossOrigin = await guest.call("POST", "/api/cart/items", { product_id: pA.id, quantity: 1 }, { origin: "https://evil.example" });
    eq("cross-origin write is 403", crossOrigin.status, 403);
    eq("malformed JSON is 400", (await guest.call("POST", "/api/cart/items", "{not json")).status, 400);
    eq("unknown API route is 404", (await guest.get("/api/nope")).status, 404);
    eq("admin API without session is 401", (await guest.get("/api/admin/orders")).status, 401);
    eq("account API without session is 401", (await guest.get("/api/account/orders")).status, 401);
    const stock = await stockOf(pA.id);
    const over = await guest.post("/api/cart/items", { product_id: pA.id, quantity: stock + 5 });
    eq("adding more than stock is 409", over.status, 409);
    eq("quantity 0 rejected", (await guest.post("/api/cart/items", { product_id: pA.id, quantity: 0 })).status, 422);
    eq("unknown product rejected", (await guest.post("/api/cart/items", { product_id: 99999999, quantity: 1 })).status, 404);
  });

  await group("admin login", async () => {
    const wrong = await new Client();
    await wrong.open();
    eq("wrong password is 401", (await wrong.post("/api/auth/login", { email: ADMIN_EMAIL, password: "wrong-password-1" })).status, 401);
    const ok = await admin.post("/api/auth/login", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    eq("admin login", ok.status, 200);
    eq("admin kind", ok.data?.user?.kind, "admin");
    check("session cookie is set", admin.cookies.has("sid"));
    eq("dashboard loads", (await admin.get("/api/admin/dashboard")).status, 200);
  });

  await group("coupon set-up (admin)", async () => {
    const c = await admin.post("/api/admin/coupons", { code: `E2E${run}`.toUpperCase(), description: "e2e", type: "percent", value: 1000, min_subtotal: 0, active: true });
    check("coupon created", c.status === 200 || c.status === 201, c.data);
    const dup = await admin.post("/api/admin/coupons", { code: `E2E${run}`.toUpperCase(), type: "percent", value: 1000 });
    eq("duplicate coupon code is 409", dup.status, 409);
    eq("percent above 100 rejected", (await admin.post("/api/admin/coupons", { code: `BAD${run}`.toUpperCase(), type: "percent", value: 20000 })).status, 422);
  });

  await group("guest cart, coupon and COD checkout", async () => {
    const before = { a: await stockOf(pA.id), b: await stockOf(pB.id) };
    let r = await guest.post("/api/cart/items", { product_id: pA.id, quantity: 2 });
    eq("add to cart", r.status, 200);
    r = await guest.post("/api/cart/items", { product_id: pB.id, quantity: 1 });
    eq("cart has 2 lines", r.data.cart.items.length, 2);
    r = await guest.patch(`/api/cart/items/${pB.id}`, { quantity: 3 });
    eq("quantity updated", r.data.cart.items.find((l: any) => l.product_id === pB.id)?.quantity, 3);
    const subtotal = 2 * pA.price + 3 * pB.price;
    eq("items subtotal", r.data.cart.totals.items_subtotal, subtotal);
    eq("invalid coupon is rejected", (await guest.post("/api/cart/coupon", { code: "NOPE-NOPE" })).status >= 400, true);
    r = await guest.post("/api/cart/coupon", { code: `e2e${run}` });
    eq("coupon applied", r.status, 200);
    eq("10% discount", r.data.cart.totals.discount_total, Math.round(subtotal * 0.1));
    const fresh = await new Client("ar").open();
    fresh.cookies.set("cart", guest.cookies.get("cart") ?? "");
    eq("cart persists by cookie", (await fresh.get("/api/cart")).data.cart.items.length, 2);

    const q = await guest.post("/api/checkout/quote", { city_id: riyadh.id, email: `guest-${run}@example.com` });
    eq("quote", q.status, 200);
    check("shipping options offered", q.data.shipping_options.length > 0, q.data);
    const methods = q.data.payment_methods.map((m: any) => m.key);
    check("COD offered", methods.includes("cod"), methods);
    const settings = (await guest.get("/api/settings")).data;
    eq("online payment offered only when a gateway is configured", methods.includes("online"), settings.online_payment);
    const ship = q.data.shipping_options[0];
    const t = (await guest.post("/api/checkout/quote", { city_id: riyadh.id, shipping_method_id: ship.id, payment_method: "cod" })).data.cart.totals;
    eq("total = items − discount + shipping + cod fee", t.total, subtotal - t.discount_total + t.shipping_fee + (t.cod_fee ?? 0));
    const vatExpected = t.total - Math.round(t.total / 1.15);
    check("VAT is 15/115 of the VAT-inclusive total (±2 halalas rounding)", Math.abs(t.vat_total - vatExpected) <= 2, { vat: t.vat_total, expected: vatExpected });
    eq("excl. VAT + VAT = total", t.total_excl_vat + t.vat_total, t.total);

    const base = { customer: { name: "ضيف تجريبي", email: `guest-${run}@example.com`, phone: "0551234567" }, address: address(riyadh.id), shipping_method_id: ship.id, payment_method: "cod", notes: "اتصل قبل التوصيل", accept_terms: true };
    eq("terms must be accepted", (await guest.post("/api/checkout/place", { ...base, accept_terms: false })).status, 422);
    const badPhone = await guest.post("/api/checkout/place", { ...base, customer: { ...base.customer, phone: "12" } });
    check("invalid phone rejected with field error", badPhone.status === 422 && badPhone.data.error?.details?.fields?.["customer.phone"], badPhone.data);
    check("missing address rejected", (await guest.post("/api/checkout/place", { ...base, address: undefined })).status >= 400);
    if (!settings.online_payment) check("online payment refused without a gateway", (await guest.post("/api/checkout/place", { ...base, payment_method: "online" })).status >= 400);

    const placed = await guest.post("/api/checkout/place", base);
    eq("order placed", placed.status, 200);
    guestKey = placed.data.access_key ?? "";
    check("order number issued", /^[A-Z0-9]+-\d{4}-\d+$/.test(placed.data.number ?? ""), placed.data);
    guestOrder = (await admin.get(`/api/admin/orders?q=${placed.data.number}`)).data.rows[0];
    eq("order total matches the quote", guestOrder.total, t.total);
    eq("no redirect for COD", placed.data.redirect_url ?? null, null);
    eq("stock reduced (A)", await stockOf(pA.id), before.a - 2);
    eq("stock reduced (B)", await stockOf(pB.id), before.b - 3);
    eq("cart emptied", (await guest.get("/api/cart")).data.cart.items.length, 0);
    const tx = await sql`SELECT type, quantity FROM inventory_transactions WHERE reference_type = 'order' AND reference_id = ${guestOrder.number} ORDER BY id`;
    eq("inventory transactions recorded", tx.length, 2);
    const stranger = await new Client().open();
    eq("order hidden without key", (await stranger.get(`/api/orders/${guestOrder.number}`)).status, 404);
    eq("order hidden with wrong key", (await stranger.get(`/api/orders/${guestOrder.number}?key=wrongwrongwrong`)).status, 404);
    const seen = await stranger.get(`/api/orders/${guestOrder.number}?key=${guestKey}`);
    eq("order visible with key", seen.status, 200);
    eq("COD order is confirmed automatically (checkout setting)", seen.data.order.status, "confirmed");
    eq("coupon recorded on order", seen.data.order.coupon_code, `E2E${run}`.toUpperCase());
    const page = await stranger.raw("GET", `/ar/order/${guestOrder.number}?key=${guestKey}&placed=1`);
    eq("confirmation page renders", page.status, 200);
    check("confirmation page shows the number", (await page.text()).includes(guestOrder.number));
    const track = await stranger.get(`/api/track?number=${guestOrder.number}&contact=0551234567`);
    eq("track by number + phone", track.status, 200);
    eq("track with wrong contact is 404", (await stranger.get(`/api/track?number=${guestOrder.number}&contact=0500000000`)).status, 404);
    const mails = await sql`SELECT event, channel, status FROM notifications WHERE recipient = ${`guest-${run}@example.com`}`;
    check("order confirmation notification queued", mails.some((m: any) => /order/.test(m.event)), mails);
  });

  await group("customer registration, profile, addresses, wishlist", async () => {
    const r = await customer.post("/api/auth/register", { name: "E2E Customer", email, phone: "+966 50 111 2233", password: cPassword });
    eq("register", r.status, 200);
    eq("phone normalised", r.data.user.phone, "+966501112233");
    const dupC = await new Client().open();
    eq("duplicate email is 409", (await dupC.post("/api/auth/register", { name: "Dup", email, phone: "0501112233", password: cPassword })).status, 409);
    eq("me", (await customer.get("/api/auth/me")).data.user.email, email);
    eq("profile update", (await customer.patch("/api/account/profile", { name: "E2E Customer Updated", phone: "0501112233", locale: "en" })).status, 200);
    const a1 = await customer.post("/api/account/addresses", { ...address(riyadh.id), label: "Home", recipient_name: "E2E Customer", phone: "0501112233", is_default: true });
    check("address saved", a1.status === 200 || a1.status === 201, a1.data);
    const a2 = await customer.post("/api/account/addresses", { ...address(riyadh.id), district: "الملز", label: "Shop", recipient_name: "E2E Customer", phone: "0501112233" });
    check("second address saved", a2.status === 200 || a2.status === 201, a2.data);
    const list = (await customer.get("/api/account/addresses")).data.addresses;
    eq("two addresses", list.length, 2);
    const other = await new Client().open();
    await other.post("/api/auth/register", { name: "Other User", email: `other-${run}@example.com`, phone: "0502223344", password: cPassword });
    await other.del(`/api/account/addresses/${list[0].id}`);
    eq("another customer cannot delete my address", (await customer.get("/api/account/addresses")).data.addresses.length, 2);
    eq("another customer cannot edit my address", (await other.put(`/api/account/addresses/${list[0].id}`, { ...address(riyadh.id), recipient_name: "Intruder", phone: "0502223344" })).status, 404);
    eq("another customer has an empty order list", (await other.get("/api/account/orders")).data.orders.length, 0);
    eq("wishlist add", (await customer.post("/api/account/wishlist", { product_id: pC.id })).status, 200);
    const wl = (await customer.get("/api/account/wishlist")).data;
    eq("wishlist has the product", wl.items?.[0]?.id, pC.id);
    eq("wishlist remove", (await customer.del(`/api/account/wishlist/${pC.id}`)).status, 200);
    await admin.put("/api/admin/settings/reviews", { verified_only: true });
    eq("with 'verified buyers only' on, a review needs a delivered purchase", (await customer.post(`/api/products/${pC.id}/reviews`, { rating: 5, title: "x", body: "y" })).status, 403);
    eq("customers cannot open the admin API", (await customer.get("/api/admin/orders")).status, 403);
  });

  await group("password reset", async () => {
    const anon = await new Client("en").open();
    eq("forgot password (known email)", (await anon.post("/api/auth/forgot-password", { email })).status, 200);
    eq("forgot password (unknown email) looks the same", (await anon.post("/api/auth/forgot-password", { email: `nobody-${run}@example.com` })).status, 200);
    const row = (await sql`SELECT body, payload::text AS payload FROM notifications WHERE recipient = ${email} AND event = 'password_reset' ORDER BY id DESC LIMIT 1`)[0];
    const token = /token=([A-Za-z0-9_\-]+)/.exec(`${row?.body ?? ""} ${row?.payload ?? ""}`)?.[1];
    check("reset link sent", !!token, row);
    eq("bad token rejected", (await anon.post("/api/auth/reset-password", { token: "x".repeat(40), password: "NewPass1234" })).status >= 400, true);
    eq("reset with token", (await anon.post("/api/auth/reset-password", { token, password: "NewPass1234" })).status, 200);
    eq("token is single-use", (await anon.post("/api/auth/reset-password", { token, password: "Another1234" })).status >= 400, true);
    eq("old session was revoked", (await customer.get("/api/auth/me")).data.user, null);
    eq("old password no longer works", (await customer.post("/api/auth/login", { email, password: cPassword })).status, 401);
    eq("new password works", (await customer.post("/api/auth/login", { email, password: "NewPass1234" })).status, 200);
  });

  await group("logged-in checkout with saved address", async () => {
    const before = await stockOf(pC.id);
    await customer.post("/api/cart/items", { product_id: pC.id, quantity: 2 });
    const addr = (await customer.get("/api/account/addresses")).data.addresses[0];
    const q = (await customer.post("/api/checkout/quote", { city_id: addr.city_id })).data;
    const placed = await customer.post("/api/checkout/place", { customer: { name: "E2E Customer", email, phone: "0501112233", company_name: "E2E Trading Est.", vat_number: "310123456700003" }, address_id: addr.id, shipping_method_id: q.shipping_options[0].id, payment_method: "cod", accept_terms: true });
    eq("order placed", placed.status, 200);
    custOrder = (await admin.get(`/api/admin/orders?q=${placed.data.number}`)).data.rows[0];
    eq("stock reduced", await stockOf(pC.id), before - 2);
    const mine = (await customer.get("/api/account/orders")).data;
    check("order is in my history", mine.orders.some((o: any) => o.number === custOrder.number), mine);
    eq("order detail without key (owner)", (await customer.get(`/api/orders/${custOrder.number}`)).status, 200);
    const other = await new Client().open();
    await other.post("/api/auth/login", { email: `other-${run}@example.com`, password: cPassword });
    eq("another customer cannot see it", (await other.get(`/api/orders/${custOrder.number}`)).status, 404);
  });

  await group("order fulfilment, invoice and ZATCA data (admin)", async () => {
    const found = (await admin.get(`/api/admin/orders?q=${custOrder.number}`)).data.rows;
    eq("order appears in admin search", found?.[0]?.number, custOrder.number);
    const id = custOrder.id;
    eq("illegal jump pending → delivered is 409", (await admin.post(`/api/admin/orders/${id}/status`, { status: "delivered" })).status, 409);
    eq("confirm", (await admin.post(`/api/admin/orders/${id}/status`, { status: "confirmed" })).status, 200);
    let d = (await admin.get(`/api/admin/orders/${id}`)).data;
    if (!d.invoices.length) eq("issue invoice", (await admin.post(`/api/admin/orders/${id}/invoice`)).status, 200);
    d = (await admin.get(`/api/admin/orders/${id}`)).data;
    eq("exactly one tax invoice", d.invoices.filter((i: any) => i.kind === "invoice").length, 1);
    eq("issuing twice does not duplicate", (await admin.post(`/api/admin/orders/${id}/invoice`)).status < 500 && (await admin.get(`/api/admin/orders/${id}`)).data.invoices.filter((i: any) => i.kind === "invoice").length, 1);
    invoiceNumber = d.invoices[0].number;
    const inv = (await customer.get(`/api/invoices/${invoiceNumber}`)).data.invoice;
    eq("invoice total = order total", inv.total, custOrder.total);
    eq("invoice taxable + VAT = total", inv.taxable_amount + inv.vat_amount, inv.total);
    eq("B2B buyer VAT number makes it a standard invoice", inv.type, "standard");
    check("invoice has UUID, counter and hash", /^[0-9a-f-]{36}$/.test(inv.uuid) && inv.icv > 0 && inv.hash?.length > 20, { uuid: inv.uuid, icv: inv.icv, hash: inv.hash });
    // Decode the ZATCA phase-1 TLV QR payload and compare it with the invoice.
    const tlv = Buffer.from(inv.qr_base64, "base64");
    const tags: Record<number, string> = {};
    for (let i = 0; i < tlv.length;) { const tag = tlv[i]!, len = tlv[i + 1]!; tags[tag] = tlv.subarray(i + 2, i + 2 + len).toString("utf8"); i += 2 + len; }
    eq("QR tag 4 (total)", tags[4], (inv.total / 100).toFixed(2));
    eq("QR tag 5 (VAT)", tags[5], (inv.vat_amount / 100).toFixed(2));
    check("QR tag 1 (seller) and 3 (timestamp)", !!tags[1] && /^\d{4}-\d{2}-\d{2}T/.test(tags[3] ?? ""), tags);
    const xml = await (await admin.raw("GET", `/api/admin/invoices/${d.invoices[0].id}/xml`)).text();
    check("UBL XML produced", xml.includes("<Invoice") && xml.includes(invoiceNumber) && xml.includes("TaxTotal"), xml.slice(0, 200));
    const page = await customer.raw("GET", `/en/invoice/${invoiceNumber}`);
    eq("invoice page renders", page.status, 200);
    const html = await page.text();
    check("invoice page is bilingual and has the QR", html.includes("فاتورة ضريبية") && html.includes("Tax invoice") && html.includes("<svg"), html.length);
    const anon = await new Client().open();
    eq("invoice hidden from strangers", (await anon.get(`/api/invoices/${invoiceNumber}`)).status, 404);

    for (const st of ["processing", "ready_for_shipment"]) eq(st, (await admin.post(`/api/admin/orders/${id}/status`, { status: st })).status, 200);
    eq("ship with tracking", (await admin.post(`/api/admin/orders/${id}/status`, { status: "shipped", tracking_number: `TRK${run}`.toUpperCase(), carrier: "SMSA", tracking_url: "https://example.com/track" })).status, 200);
    eq("javascript: tracking URL rejected", (await admin.post(`/api/admin/orders/${id}/status`, { status: "out_for_delivery", tracking_url: "javascript:alert(1)" })).status, 422);
    const tr = await new Client().get(`/api/track?tracking=TRK${run}`.toUpperCase().replace("/API/TRACK?TRACKING=", "/api/track?tracking="));
    eq("public tracking by tracking number", tr.status, 200);
    eq("tracking shows shipped", tr.data.tracking?.status, "shipped");
    eq("out for delivery", (await admin.post(`/api/admin/orders/${id}/status`, { status: "out_for_delivery" })).status, 200);
    eq("delivered", (await admin.post(`/api/admin/orders/${id}/status`, { status: "delivered" })).status, 200);
    d = (await admin.get(`/api/admin/orders/${id}`)).data;
    eq("COD order is paid on delivery", d.order.payment_status, "paid");
    eq("status history has every step", d.history.length >= 7, true);
    eq("customer can no longer cancel", (await customer.post(`/api/orders/${custOrder.number}/cancel`, {})).status, 409);
  });

  await group("review, return, refund and credit note", async () => {
    const ratedBefore = (await customer.get(`/api/products/${pC.slug}`)).data.product.rating_count;
    const rv = await customer.post(`/api/products/${pC.id}/reviews`, { rating: 4, title: "Good", body: "Works as described <script>alert(1)</script>" });
    eq("review accepted after delivery", rv.status, 200);
    const pending = (await admin.get("/api/admin/reviews?status=pending")).data.rows;
    const mine = pending.find((r: any) => r.product_id === pC.id);
    if (rv.data.status === "pending") {
      check("review waits for moderation", !!mine);
      eq("approve review", (await admin.post(`/api/admin/reviews/${mine.id}/status`, { status: "approved" })).status, 200);
    }
    const prod = await customer.raw("GET", `/en/p/${pC.slug}`);
    const html = await prod.text();
    check("approved review is shown, script tag escaped", html.includes("Works as described") && !html.includes("<script>alert(1)</script>"));
    const pv = (await customer.get(`/api/products/${pC.slug}`)).data.product;
    eq("rating aggregated", pv.rating_count, ratedBefore + 1);

    const order = (await customer.get(`/api/orders/${custOrder.number}`)).data.order;
    const item = order.items[0];
    eq("return of more than bought rejected", (await customer.post(`/api/orders/${custOrder.number}/return`, { reason: "Wrong size ordered", items: [{ order_item_id: item.id, quantity: 99 }] })).status >= 400, true);
    const ret = await customer.post(`/api/orders/${custOrder.number}/return`, { reason: "Wrong size ordered", items: [{ order_item_id: item.id, quantity: 2 }] });
    eq("return requested", ret.status, 200);
    const rrow = (await admin.get("/api/admin/returns?status=requested")).data.rows.find((r: any) => r.order_number === custOrder.number);
    check("return appears for admin", !!rrow);
    const before = await stockOf(pC.id);
    eq("cannot refund before receiving", (await admin.post(`/api/admin/returns/${rrow.id}/action`, { action: "refund" })).status, 409);
    eq("approve return", (await admin.post(`/api/admin/returns/${rrow.id}/action`, { action: "approve" })).status, 200);
    eq("receive return (restock)", (await admin.post(`/api/admin/returns/${rrow.id}/action`, { action: "receive", restock: true })).status, 200);
    eq("stock restored", await stockOf(pC.id), before + 2);
    const refund = await admin.post(`/api/admin/returns/${rrow.id}/action`, { action: "refund" });
    eq("refund", refund.status, 200);
    const d = (await admin.get(`/api/admin/orders/${custOrder.id}`)).data;
    eq("order refunded", d.order.status, "refunded");
    eq("payment status refunded", d.order.payment_status, "refunded");
    const cn = d.invoices.find((i: any) => i.kind === "credit_note");
    check("credit note issued", !!cn, d.invoices);
    eq("credit note total", cn?.total, custOrder.total);
    eq("cannot refund twice", (await admin.post(`/api/admin/orders/${custOrder.id}/refund`, { reason: "again" })).status, 409);
    await admin.put("/api/admin/settings/reviews", { verified_only: false });
  });

  await group("cancellation restores stock", async () => {
    const before = await stockOf(pA.id);
    const c = await new Client().open();
    eq("guest cancels own order with key", (await c.post(`/api/orders/${guestOrder.number}/cancel?key=${guestKey}`, { reason: "changed my mind" })).status, 200);
    eq("stock restored", await stockOf(pA.id), before + 2);
    eq("cancel twice is 409", (await c.post(`/api/orders/${guestOrder.number}/cancel?key=${guestKey}`, {})).status, 409);
    eq("cancelled order cannot be confirmed", (await admin.post(`/api/admin/orders/${guestOrder.id}/status`, { status: "confirmed" })).status, 409);
    const re = await c.post(`/api/orders/${guestOrder.number}/reorder?key=${guestKey}`);
    eq("reorder refills the cart", re.data.cart?.items?.length, 2);
  });

  await group("partial return restocks and refunds only the returned units", async () => {
    const c = await new Client("en").open();
    await c.post("/api/cart/items", { product_id: pA.id, quantity: 3 });
    await c.post("/api/cart/items", { product_id: pB.id, quantity: 1 });
    const q = (await c.post("/api/checkout/quote", { city_id: riyadh.id })).data;
    const placed = (await c.post("/api/checkout/place", { customer: { name: "Partial Return", email: `partial-${run}@example.com`, phone: "0558889900" }, address: address(riyadh.id), shipping_method_id: q.shipping_options[0].id, payment_method: "cod", accept_terms: true })).data;
    const o = (await admin.get(`/api/admin/orders?q=${placed.number}`)).data.rows[0];
    for (const st of ["processing", "ready_for_shipment", "shipped", "delivered"]) await admin.post(`/api/admin/orders/${o.id}/status`, { status: st });
    const view = (await c.get(`/api/orders/${placed.number}?key=${placed.access_key}`)).data.order;
    eq("delivered", view.status, "delivered");
    const line = view.items.find((i: any) => i.quantity === 3);
    eq("return 1 of 3 requested", (await c.post(`/api/orders/${placed.number}/return?key=${placed.access_key}`, { reason: "One unit arrived damaged", items: [{ order_item_id: line.id, quantity: 1 }] })).status, 200);
    const row = (await admin.get("/api/admin/returns?status=requested")).data.rows.find((r: any) => r.order_number === placed.number);
    eq("suggested refund is the value of one unit", row.suggested, pA.price);
    const a0 = await stockOf(pA.id), b0 = await stockOf(pB.id);
    await admin.post(`/api/admin/returns/${row.id}/action`, { action: "approve" });
    await admin.post(`/api/admin/returns/${row.id}/action`, { action: "receive", restock: true });
    eq("only the returned unit is restocked", await stockOf(pA.id), a0 + 1);
    eq("the other product is untouched", await stockOf(pB.id), b0);
    const refund = await admin.post(`/api/admin/returns/${row.id}/action`, { action: "refund" });
    eq("refund", refund.status, 200);
    eq("refunded amount", refund.data.return.refund_amount, pA.price);
    const d = (await admin.get(`/api/admin/orders/${o.id}`)).data;
    eq("payment is partially refunded", d.order.payment_status, "partially_refunded");
    eq("credit note for the partial amount", d.invoices.find((i: any) => i.kind === "credit_note")?.total, pA.price);
    eq("refund above the remaining balance is rejected", (await admin.post(`/api/admin/orders/${o.id}/refund`, { amount: o.total, reason: "too much" })).status, 400);
  });

  await group("concurrent checkout cannot oversell", async () => {
    const created = await admin.post("/api/admin/products", { sku: `E2E-LAST-${run}`, name_ar: `منتج اختبار ${run}`, name_en: `E2E last unit ${run}`, price: 2500, initial_stock: 1, min_stock: 0, status: "active" });
    check("product created", created.status === 200 || created.status === 201, created.data);
    const pid = created.data.row?.id;
    const place = async () => {
      const c = await new Client().open();
      const add = await c.post("/api/cart/items", { product_id: pid, quantity: 1 });
      if (add.status !== 200) return add.status;
      const q = (await c.post("/api/checkout/quote", { city_id: riyadh.id })).data;
      return (await c.post("/api/checkout/place", { customer: { name: "Racer", email: `race-${Math.random().toString(36).slice(2)}@example.com`, phone: "0553334455" }, address: address(riyadh.id), shipping_method_id: q.shipping_options[0].id, payment_method: "cod", accept_terms: true })).status;
    };
    const results = await Promise.all([place(), place(), place(), place()]);
    eq("exactly one of four simultaneous buyers succeeds", results.filter((s) => s === 200).length, 1);
    eq("stock is zero, not negative", await stockOf(pid), 0);
    eq("out-of-stock product cannot be added", (await guest.post("/api/cart/items", { product_id: pid, quantity: 1 })).status, 409);
  });

  await group("inventory management", async () => {
    const before = await stockOf(pB.id);
    eq("stock in", (await admin.post("/api/admin/inventory/move", { product_id: pB.id, type: "stock_in", quantity: 10, unit_cost: 1234, note: "e2e delivery" })).data.balance, before + 10);
    eq("stock out", (await admin.post("/api/admin/inventory/move", { product_id: pB.id, type: "stock_out", quantity: 4, note: "damaged" })).data.balance, before + 6);
    eq("stock out beyond balance is 409", (await admin.post("/api/admin/inventory/move", { product_id: pB.id, type: "stock_out", quantity: 10_000_000 })).status, 409);
    eq("adjustment sets the count", (await admin.post("/api/admin/inventory/move", { product_id: pB.id, type: "adjustment", quantity: before, note: "stock take" })).data.balance, before);
    const hist = (await admin.get(`/api/admin/inventory/transactions?product_id=${pB.id}`)).data.rows;
    check("history lists the three movements", hist.length >= 3 && hist.slice(0, 3).map((h: any) => h.type).join() === "adjustment,stock_out,stock_in", hist.slice(0, 3));
    eq("negative quantity rejected", (await admin.post("/api/admin/inventory/move", { product_id: pB.id, type: "stock_in", quantity: -5 })).status, 422);
    const full = (await guest.get(`/api/products/${pB.slug}`)).data.product;
    const look = (await admin.get(`/api/admin/products/lookup?code=${encodeURIComponent(full.barcode ?? full.sku)}`)).data;
    eq("barcode lookup", look.product?.id, pB.id);
    const low = await admin.get("/api/admin/inventory/low");
    eq("low stock report", low.status, 200);
  });

  await group("point of sale (barcode sale)", async () => {
    const before = await stockOf(pB.id);
    const sale = await admin.post("/api/admin/pos/sale", { items: [{ product_id: pB.id, quantity: 2 }], payment_method: "cash", customer_name: "عميل المحل", customer_phone: "0554445566" });
    eq("sale recorded", sale.status, 200);
    eq("stock reduced", await stockOf(pB.id), before - 2);
    const o = sale.data;
    eq("POS total", o?.total, 2 * pB.price);
    check("simplified invoice issued immediately", !!o.invoice_number, sale.data);
    const d = (await admin.get(`/api/admin/orders/${o.id}`)).data;
    eq("POS order is paid and delivered", `${d.order.payment_status}/${d.order.status}`, "paid/delivered");
const custRow = await sql`SELECT phone FROM customers WHERE id = ${d.order.customer_id}`;
    eq("POS customer phone stored in the standard format", custRow[0]?.phone, "+966554445566");
    const walk1 = await admin.post("/api/admin/pos/sale", { items: [{ product_id: pA.id, quantity: 1 }], payment_method: "card" });
    const walk2 = await admin.post("/api/admin/pos/sale", { items: [{ product_id: pA.id, quantity: 1 }], payment_method: "cash" });
    const cids = await sql`SELECT customer_id FROM orders WHERE id IN (${walk1.data.id}, ${walk2.data.id})`;
    eq("anonymous counter sales share one walk-in customer", cids[0].customer_id, cids[1].customer_id);
        eq("POS oversell is 409", (await admin.post("/api/admin/pos/sale", { items: [{ product_id: pB.id, quantity: 9_000 }], payment_method: "cash" })).status, 409);
  });

  await group("product management and uploads", async () => {
    const body = { sku: `E2E-P-${run}`, barcode: `99${Date.now()}`.slice(0, 13), name_ar: "قاطع تجريبي", name_en: "Test breaker", name_ur: "ٹیسٹ بریکر", price: 4600, discount_price: 4025, purchase_price: 2500, initial_stock: 7, min_stock: 2, warranty_months: 12, specs: [{ label_ar: "التيار", label_en: "Current", label_ur: "", value: "20A" }], is_new: true, status: "active" };
    const c = await admin.post("/api/admin/products", body);
    check("create", c.status === 200 || c.status === 201, c.data);
    const id = c.data.row?.id;
    eq("initial stock", await stockOf(id), 7);
    eq("duplicate SKU is 409", (await admin.post("/api/admin/products", body)).status, 409);
    const badPrice = await admin.post("/api/admin/products", { ...body, sku: `E2E-X-${run}`, barcode: null, discount_price: 9999 });
    check("discount above price rejected", badPrice.status === 422 && badPrice.data.error?.details?.fields?.discount_price, badPrice.data);
    const gotRes = (await admin.get(`/api/admin/products/${id}`)).data;
    const got = gotRes.product ?? gotRes.row;
    eq("update", (await admin.put(`/api/admin/products/${id}`, { ...body, name_en: "Test breaker 20A", price: 5000, discount_price: null, initial_stock: undefined })).status, 200);
    const pub = (await new Client("en").get(`/api/products/${got.slug}`)).data.product;
    eq("storefront shows the new name", pub.name, "Test breaker 20A");
    eq("storefront shows the new price", pub.price, 5000);
    eq("update did not touch stock", await stockOf(id), 7);
    // 1×1 PNG
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const f1 = new FormData(); f1.append("files", new File([png], "photo.png", { type: "image/png" }));
    const up = await admin.call("POST", `/api/admin/products/${id}/images`, f1);
    eq("image upload", up.status, 200);
    const url = up.data.images?.[0]?.url;
    const img = await guest.raw("GET", url ?? "/nope");
    eq("uploaded image is served", img.status, 200);
    check("served with an image content type", (img.headers.get("content-type") ?? "").startsWith("image/"), img.headers.get("content-type"));
    await img.arrayBuffer();
    const f2 = new FormData(); f2.append("files", new File(["<?php echo 1; ?><script>alert(1)</script>"], "shell.png", { type: "image/png" }));
    eq("non-image disguised as PNG is rejected", (await admin.call("POST", `/api/admin/products/${id}/images`, f2)).status >= 400, true);
    const f3 = new FormData(); f3.append("files", new File(["<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'/>"], "x.svg", { type: "image/svg+xml" }));
    eq("SVG upload is rejected", (await admin.call("POST", `/api/admin/products/${id}/images`, f3)).status >= 400, true);
    eq("path traversal on /media is blocked", (await guest.raw("GET", "/media/..%2F..%2F.env")).status >= 400, true);
    eq("archive/delete", (await admin.del(`/api/admin/products/${id}`)).status, 200);
    eq("gone from the storefront", (await guest.get(`/api/products/${got.slug}`)).status, 404);
  });

  await group("roles and permissions", async () => {
    const roles = (await admin.get("/api/admin/roles")).data.rows as any[];
    const mk = async (key: string) => {
      const role = roles.find((r) => r.key === key);
      const mail = `${key}-${run}@example.com`;
      const u = await admin.post("/api/admin/users", { name: `E2E ${key}`, email: mail, password: "Staff12345", role_id: role.id });
      check(`create ${key} user`, u.status === 200 || u.status === 201, u.data);
      const c = await new Client().open();
      eq(`${key} login`, (await c.post("/api/auth/login", { email: mail, password: "Staff12345" })).status, 200);
      return c;
    };
    const inv = await mk("inventory"), sup = await mk("support"), acc = await mk("accountant"), sales = await mk("sales");
    eq("inventory: can view stock", (await inv.get("/api/admin/inventory")).status, 200);
    eq("inventory: can move stock", (await inv.post("/api/admin/inventory/move", { product_id: pA.id, type: "stock_in", quantity: 1 })).status, 200);
    eq("inventory: cannot read orders", (await inv.get("/api/admin/orders")).status, 403);
    const invDash = (await inv.get("/api/admin/dashboard")).data;
    check("inventory: dashboard carries no sales figures or customer names", invDash.sales_visible === false && invDash.kpi.total_sales === undefined && invDash.recent_orders.length === 0, invDash.kpi);
    const f = new FormData(); f.append("file", new File([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64")], "x.png", { type: "image/png" }));
    eq("support: cannot upload files", (await sup.call("POST", "/api/admin/uploads?kind=banner", f)).status, 403);
    eq("inventory: cannot change settings", (await inv.put("/api/admin/settings/tax", { vat_rate_bp: 0 })).status, 403);
    eq("inventory: cannot create staff", (await inv.post("/api/admin/users", { name: "Sneaky", email: `sneaky-${run}@example.com`, password: "Staff12345", role_id: roles.find((r) => r.key === "super_admin").id })).status, 403);
    eq("support: can read tickets", (await sup.get("/api/admin/tickets")).status, 200);
    eq("support: cannot refund", (await sup.post(`/api/admin/orders/${guestOrder.id}/refund`, { reason: "nope" })).status, 403);
    eq("support: cannot edit products", (await sup.post("/api/admin/products", { sku: "NOPE", name_ar: "لا", price: 100 })).status, 403);
    eq("support: cannot see reports", (await sup.get("/api/admin/reports/sales")).status, 403);
    eq("accountant: can see VAT report", (await acc.get("/api/admin/reports/vat")).status, 200);
    eq("accountant: cannot move stock", (await acc.post("/api/admin/inventory/move", { product_id: pA.id, type: "stock_in", quantity: 1 })).status, 403);
    eq("sales: can use POS lookup", (await sales.get(`/api/admin/products/lookup?code=${pA.sku}`)).status, 200);
    eq("sales: cannot manage users", (await sales.get("/api/admin/users")).status, 403);
    eq("sales: cannot read audit logs", (await sales.get("/api/admin/audit-logs")).status, 403);
    const me = (await admin.get("/api/auth/me")).data.user;
    const selfDemote = await admin.put(`/api/admin/users/${me.id}`, { name: me.name, role_id: roles.find((r) => r.key === "support").id, status: "disabled" });
    check("an admin cannot disable or demote their own account", selfDemote.status >= 400, selfDemote.status);
    const users = (await admin.get("/api/admin/users")).data.rows;
    const supUser = users.find((u: any) => u.email === `support-${run}@example.com`);
    eq("disable staff account", (await admin.put(`/api/admin/users/${supUser.id}`, { name: supUser.name, role_id: supUser.role_id, status: "disabled" })).status, 200);
    eq("disabled account loses access at once", (await sup.get("/api/admin/tickets")).status, 401);
    const logs = (await admin.get("/api/admin/audit-logs")).data.rows;
    check("activity log records admin actions", logs.length > 10 && logs.some((l: any) => /inventory|order|product/.test(l.action)), logs.length);
  });

  await group("support tickets and contact form", async () => {
    const anon = await new Client().open();
    const ct = await anon.post("/api/contact", { name: "زائر", email: `visitor-${run}@example.com`, phone: "0556667788", subject: "استفسار عن منتج", message: "هل يتوفر قاطع 63 أمبير؟" });
    check("contact form creates a ticket", ct.status === 200 || ct.status === 201, ct.data);
    eq("contact form validates", (await anon.post("/api/contact", { name: "", email: "x", subject: "", message: "" })).status, 422);
    const t = await customer.post("/api/account/tickets", { subject: "Where is my order?", message: "Please update me.", order_number: custOrder.number });
    check("customer opens a ticket", t.status === 200 || t.status === 201, t.data);
    const number = t.data.ticket;
    const rows = (await admin.get("/api/admin/tickets")).data.rows;
    const row = rows.find((r: any) => r.number === number);
    check("ticket visible to staff", !!row, rows.slice(0, 2));
    eq("staff reply", (await admin.post(`/api/admin/tickets/${row.id}/reply`, { message: "It was delivered yesterday." })).status, 200);
    const thread = (await customer.get(`/api/account/tickets/${number}`)).data;
    eq("customer sees the reply", thread.messages?.length, 2);
    eq("customer follow-up", (await customer.post(`/api/account/tickets/${number}/messages`, { message: "Thanks!" })).status, 200);
    eq("close ticket", (await admin.post(`/api/admin/tickets/${row.id}/status`, { status: "closed" })).status, 200);
  });

  await group("reports and exports", async () => {
    for (const r of ["sales", "products", "customers", "vat", "profit"]) {
      const j = await admin.get(`/api/admin/reports/${r}`);
      eq(`${r} report`, j.status, 200);
      const csv = await admin.raw("GET", `/api/admin/reports/${r}?format=csv`);
      check(`${r} CSV`, csv.status === 200 && (csv.headers.get("content-type") ?? "").includes("text/csv"), csv.status);
      const bytes = Buffer.from(await csv.arrayBuffer());
      check(`${r} CSV has a UTF-8 BOM and a header row`, bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf && bytes.toString("utf8").includes(","));
      const xl = await admin.raw("GET", `/api/admin/reports/${r}?format=xlsx`);
      const buf = Buffer.from(await xl.arrayBuffer());
      check(`${r} XLSX is a zip`, xl.status === 200 && buf[0] === 0x50 && buf[1] === 0x4b, xl.status);
      if (r === "sales") await Bun.write(process.env.E2E_XLSX_OUT ?? "/dev/null", buf);
    }
    const vat = (await admin.get("/api/admin/reports/vat")).data;
    check("VAT report nets invoices and credit notes", vat.rows.length > 0 && vat.rows.some((v: any) => v.refunds_vat < 0 && v.net_vat === v.sales_vat + v.refunds_vat), vat.rows[0]);
    const orders = await admin.raw("GET", "/api/admin/orders?format=csv");
    const text = await orders.text();
    check("orders CSV includes this run's orders", text.includes(custOrder.number) && text.includes(guestOrder.number));
    check("CSV neutralises spreadsheet formulas", !/(^|,)"?[=+@]/m.test(text.split("\n").slice(1).join("\n")));
    const dash = (await admin.get("/api/admin/dashboard")).data;
    check("dashboard counts today's sales", dash.kpi.today_orders >= 1 && dash.kpi.total_sales > 0, dash.kpi);
  });

  await group("settings, content and catalogue administration", async () => {
    const s0 = (await admin.get("/api/admin/settings")).data;
    eq("bad VAT number rejected", (await admin.put("/api/admin/settings/store", { vat_number: "123" })).status, 422);
    eq("save store settings", (await admin.put("/api/admin/settings/store", { phone: "+966112345678", whatsapp: "+966501234567" })).status, 200);
    const pub = (await new Client().get("/api/settings")).data;
    eq("public settings reflect the change", pub.store.phone, "+966112345678");
    await admin.put("/api/admin/settings/store", { phone: s0.settings.store.phone, whatsapp: s0.settings.store.whatsapp });
    check("integration status never exposes secrets", !/sk_live|sk_test|secret/i.test(JSON.stringify(s0.integrations).replace(/"secret[^"]*":\s*(true|false)/g, "")), s0.integrations);
    const cat = await admin.post("/api/admin/categories", { name_ar: `تصنيف ${run}`, name_en: `Category ${run}`, name_ur: "", icon: "other", active: true, sort: 99 });
    check("create category", cat.status === 200 || cat.status === 201, cat.data);
    const cid = cat.data.row?.id ?? cat.data.id;
    const loop = await admin.put(`/api/admin/categories/${cid}`, { name_ar: `تصنيف ${run}`, name_en: `Category ${run}`, name_ur: "", parent_id: cid, active: true });
    eq("category cannot be its own parent", loop.status, 422);
    const tree = (await new Client("en").get("/api/categories")).data.categories;
    check("new category is live on the storefront", JSON.stringify(tree).includes(`Category ${run}`));
    eq("delete category", (await admin.del(`/api/admin/categories/${cid}`)).status, 200);
    const faq = await admin.post("/api/admin/faqs", { question_ar: `سؤال ${run}`, question_en: "", question_ur: "", answer_ar: "جواب", answer_en: "", answer_ur: "", sort: 50, active: true });
    check("create FAQ", faq.status === 200 || faq.status === 201, faq.data);
    check("FAQ shows on the storefront", JSON.stringify((await new Client().get("/api/faqs")).data).includes(`سؤال ${run}`));
    await admin.del(`/api/admin/faqs/${faq.data.row?.id ?? faq.data.id}`);
    for (const p of ["brands", "coupons", "discounts", "banners", "homepage-sections", "pages", "shipping-methods", "shipping-rates", "cities", "roles", "customers", "payments", "invoices", "reviews", "returns", "notifications", "audit-logs", "inventory", "products", "users"]) {
      eq(`list ${p}`, (await admin.get(`/api/admin/${p}`)).status, 200);
    }
  });

  await group("rate limiting and account lockout", async () => {
    const c = await new Client().open();
    let limited = 0, lastStatus = 0;
    for (let i = 0; i < 14; i++) { lastStatus = (await c.post("/api/auth/login", { email: `nobody-${run}@example.com`, password: "wrong-pass-1" })).status; if (lastStatus === 429) limited++; }
    check("repeated logins are rate limited (429)", limited > 0, lastStatus);
    const victim = `lock-${run}@example.com`;
    const v = await new Client().open();
    await v.post("/api/auth/register", { name: "Lock Test", email: victim, phone: "0507778899", password: "Lockme12345" });
    let locked = false;
    for (let i = 0; i < 12 && !locked; i++) {
      const a = await new Client().open(); // a new address each time, so only the account lock can stop it
      const r = await a.post("/api/auth/login", { email: victim, password: "bad-guess-99" });
      if (r.status === 423 || r.data?.error?.code === "account_locked") locked = true;
    }
    check("account locks after repeated wrong passwords", locked);
    const a = await new Client().open();
    check("correct password is refused while locked", (await a.post("/api/auth/login", { email: victim, password: "Lockme12345" })).status !== 200);
  });

  await group("account deletion", async () => {
    const c = await new Client("en").open();
    const mail = `delete-me-${run}@example.com`;
    eq("register", (await c.post("/api/auth/register", { name: "Delete Me", email: mail, phone: "0509990011", password: "DeleteMe123" })).status, 200);
    await c.post("/api/account/addresses", { ...address(riyadh.id), label: "Home", recipient_name: "Delete Me", phone: "0509990011" });
    await c.post("/api/account/wishlist", { product_id: pA.id });
    await c.post("/api/cart/items", { product_id: pA.id, quantity: 1 });
    const q = (await c.post("/api/checkout/quote", { city_id: riyadh.id })).data;
    const placed = (await c.post("/api/checkout/place", { customer: { name: "Delete Me", email: mail, phone: "0509990011" }, address: address(riyadh.id), shipping_method_id: q.shipping_options[0].id, payment_method: "cod", accept_terms: true })).data;
    eq("refused while an order is open", (await c.post("/api/account/delete", { password: "DeleteMe123" })).status, 409);
    const o = (await admin.get(`/api/admin/orders?q=${placed.number}`)).data.rows[0];
    eq("order cancelled by staff", (await admin.post(`/api/admin/orders/${o.id}/status`, { status: "cancelled", note: "test" })).status, 200);
    eq("wrong password refused", (await c.post("/api/account/delete", { password: "nope-nope-1" })).status, 401);
    eq("staff cannot delete themselves this way", (await admin.post("/api/account/delete", { password: ADMIN_PASSWORD })).status, 403);
    eq("account deleted", (await c.post("/api/account/delete", { password: "DeleteMe123" })).status, 200);
    eq("signed out", (await c.get("/api/auth/me")).data.user, null);
    eq("cannot sign in again", (await new Client().open().then((x) => x.post("/api/auth/login", { email: mail, password: "DeleteMe123" }))).status, 401);
    const left = await sql`SELECT (SELECT count(*)::int FROM users WHERE lower(email) = ${mail}) AS users, (SELECT count(*)::int FROM customers WHERE lower(email) = ${mail}) AS customers, (SELECT count(*)::int FROM audit_logs WHERE actor = ${mail}) AS logs`;
    check("no login, customer row or log entry keeps the e-mail", left[0].users === 0 && left[0].customers === 0 && left[0].logs === 0, left[0]);
    const kept = (await admin.get(`/api/admin/orders/${o.id}`)).data;
    check("order and invoice records kept for tax purposes", kept.order.number === placed.number && kept.invoices.length >= 1, kept.invoices);
    eq("customer shown as deleted to staff", kept.customer?.name, "Deleted customer");
    eq("addresses removed", (await sql`SELECT count(*)::int AS n FROM addresses WHERE customer_id = ${kept.order.customer_id}`)[0].n, 0);
    eq("email can register again", (await new Client().open().then((x) => x.post("/api/auth/register", { name: "Back Again", email: mail, phone: "0509990011", password: "DeleteMe123" }))).status, 200);
  });

  await group("logout", async () => {
    eq("logout", (await customer.post("/api/auth/logout")).status, 200);
    eq("session ended", (await customer.get("/api/auth/me")).data.user, null);
    eq("account API closed", (await customer.get("/api/account/orders")).status, 401);
  });

  console.log(`\n${passed} checks passed, ${failures.length} failed`);
  if (failures.length) { console.log(failures.map((f) => " - " + f).join("\n")); process.exitCode = 1; }
  await sql.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
