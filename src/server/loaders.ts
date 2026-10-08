import { config } from "./config";
import { db } from "./db";
import { cached } from "./cache";
import type { Ctx } from "./http";
import { pick, type Lang } from "../shared/constants";
import type { PageMeta, RouteName } from "../shared/routes";
import { dicts, tr } from "../shared/i18n";
import { parseProductQuery, publicSettings } from "./api/store";
import { categoryTree, getProduct, homeLists, listBrands, listProducts } from "./services/catalog";
import { cartView, findCart } from "./services/cart";
import { invoiceWithItems } from "./services/invoices";
import { canAccessOrder, loadOrder, orderView } from "./services/orders";
import { getSettings } from "./services/settings";
import { listRegions } from "./services/shipping";

export interface LoaderResult { data: any; meta: PageMeta; status?: number; redirect?: string }
type Loader = (c: Ctx, params: Record<string, string>, query: URLSearchParams) => Promise<LoaderResult>;

const abs = (path: string) => `${config.APP_URL.replace(/\/$/, "")}${path}`;
const absMedia = (u: string | null | undefined) => (u ? (u.startsWith("http") ? u : abs(u)) : null);

export async function shellData(c: Ctx) {
  const lang = c.lang;
  const [categories, settings, cart] = await Promise.all([
    categoryTree(lang),
    cached(`shell:settings:${lang}`, 60, () => publicSettings(lang)),
    findCart(c).then((ct) => (ct ? db.one<{ n: number }>(`SELECT COALESCE(sum(quantity), 0)::int AS n FROM cart_items WHERE cart_id = $1`, [ct.id]) : undefined)),
  ]);
  const u = c.user;
  return {
    lang, categories, settings, cart_count: cart?.n ?? 0,
    user: u ? { id: u.id, name: u.name, email: u.email, phone: u.phone, kind: u.kind, is_admin: u.kind === "admin" } : null,
  };
}

const notFoundResult = (lang: Lang): LoaderResult => ({ data: {}, status: 404, meta: { title: tr(lang, "nf.title"), noindex: true } });
const plain = (key: string, noindex = true): Loader => async (c) => ({ data: {}, meta: { title: tr(c.lang, key), noindex } });
const guarded = (key: string): Loader => async (c) => {
  if (!c.user) return { data: {}, meta: { title: "" }, redirect: `/${c.lang}/login?next=${encodeURIComponent(c.path + c.url.search)}` };
  return { data: {}, meta: { title: tr(c.lang, key), noindex: true } };
};

const breadcrumbLd = (items: { name: string; path: string }[]) => ({
  "@context": "https://schema.org", "@type": "BreadcrumbList",
  itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: abs(it.path) })),
});

async function listing(c: Ctx, query: URLSearchParams, base: { category?: string; brand?: string }, title: string, crumbs: { name: string; path: string }[], description?: string): Promise<LoaderResult> {
  const pq = parseProductQuery(query);
  if (base.category) pq.category = base.category;
  if (base.brand) pq.brands = [base.brand];
  const result = await listProducts(pq, c.lang);
  const filtered = ["q", "brand", "min", "max", "in_stock", "rating", "sort", "flag"].some((k) => query.get(k)) && !base.brand || !!query.get("q");
  const store = (await getSettings()).store;
  return {
    data: { ...result, title, crumbs, fixed_brand: base.brand ?? null },
    meta: {
      title: `${title} | ${pick(store, "name", c.lang)}`,
      description: description || tr(c.lang, "seo.listing_desc", { title }),
      noindex: filtered || (result.page ?? 1) > 1,
      jsonld: [breadcrumbLd([{ name: tr(c.lang, "nav.home"), path: `/${c.lang}` }, ...crumbs])],
    },
  };
}

export const loaders: Record<RouteName, Loader> = {
  home: async (c) => {
    const lang = c.lang;
    const settings = await getSettings();
    const content = await cached(`shell:homecontent:${lang}`, 60, async () => {
      const [sections, banners, reviews] = await Promise.all([
        db.q(`SELECT * FROM homepage_sections WHERE active ORDER BY sort, id`),
        db.q(`SELECT * FROM banners WHERE active AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now()) ORDER BY sort, id`),
        db.q(`SELECT r.rating, r.title, r.body, r.created_at, cu.name AS author, p.slug, p.name_ar, p.name_en, p.name_ur
                FROM reviews r JOIN customers cu ON cu.id = r.customer_id JOIN products p ON p.id = r.product_id
               WHERE r.status = 'approved' AND r.rating >= 4 AND length(r.body) > 10 AND p.status = 'active' ORDER BY r.created_at DESC LIMIT 6`),
      ]);
      return {
        sections: sections.map((s) => ({ id: s.id, type: s.type, title: pick(s, "title", lang), limit: s.item_limit })),
        banners: banners.map((b) => ({ id: b.id, placement: b.placement, title: pick(b, "title", lang), subtitle: pick(b, "subtitle", lang), cta: pick(b, "cta", lang), link: b.link, image_url: b.image_url })),
        reviews: reviews.map((r) => ({ rating: r.rating, title: r.title, body: r.body, author: r.author, created_at: r.created_at, product: { slug: r.slug, name: pick(r, "name", lang) } })),
      };
    });
    const maxLimit = Math.max(8, ...content.sections.map((s) => s.limit));
    const [lists, brands] = await Promise.all([homeLists(lang, Math.min(maxLimit, 24)), listBrands(lang, true)]);
    const s = settings.store;
    return {
      data: { ...content, lists, brands },
      meta: {
        title: pick(settings.seo, "title", lang), description: pick(settings.seo, "description", lang),
        jsonld: [
          { "@context": "https://schema.org", "@type": "Store", name: pick(s, "name", lang), legalName: s.legal_name, url: abs(`/${lang}`), telephone: s.phone || undefined, email: s.email || undefined, vatID: s.vat_number || undefined,
            address: { "@type": "PostalAddress", addressCountry: "SA", addressLocality: lang === "ar" ? s.city_ar : s.city_en || s.city_ar, streetAddress: [s.building_no, s.street, s.district].filter(Boolean).join(" ") || undefined, postalCode: s.postal_code || undefined },
            sameAs: [s.instagram, s.x, s.tiktok, s.snapchat].filter(Boolean), currenciesAccepted: "SAR" },
          { "@context": "https://schema.org", "@type": "WebSite", url: abs(`/${lang}`), name: pick(s, "name", lang), inLanguage: lang,
            potentialAction: { "@type": "SearchAction", target: abs(`/${lang}/search?q={search_term_string}`), "query-input": "required name=search_term_string" } },
        ],
      },
    };
  },

  listing: (c, _p, q) => {
    const flag = q.get("flag");
    const title = tr(c.lang, flag === "deals" ? "home.deals" : flag === "new" ? "home.new" : flag === "best" ? "home.best" : flag === "featured" ? "home.featured" : "nav.all_products");
    return listing(c, q, {}, title, [{ name: title, path: `/${c.lang}/products` }]);
  },
  search: (c, _p, q) => {
    const term = (q.get("q") ?? "").slice(0, 100);
    return listing(c, q, {}, term ? tr(c.lang, "search.results_for", { q: term }) : tr(c.lang, "search.title"), [{ name: tr(c.lang, "search.title"), path: `/${c.lang}/search` }]);
  },
  category: async (c, p, q) => {
    const res = await listing(c, q, { category: p.slug }, "", []);
    if (!res.data.category) return notFoundResult(c.lang);
    const cat = res.data.category;
    const crumbs = cat.path.map((x: any) => ({ name: x.name, path: `/${c.lang}/c/${x.slug}` }));
    const store = (await getSettings()).store;
    res.data.title = cat.name; res.data.crumbs = crumbs;
    res.meta.title = `${cat.name} | ${pick(store, "name", c.lang)}`;
    res.meta.description = cat.description || tr(c.lang, "seo.listing_desc", { title: cat.name });
    res.meta.jsonld = [breadcrumbLd([{ name: tr(c.lang, "nav.home"), path: `/${c.lang}` }, ...crumbs])];
    return res;
  },
  brand: async (c, p, q) => {
    const b = await db.one(`SELECT * FROM brands WHERE slug = $1 AND active`, [p.slug]);
    if (!b) return notFoundResult(c.lang);
    const name = pick(b, "name", c.lang);
    return listing(c, q, { brand: b.slug }, name, [{ name: tr(c.lang, "nav.brands"), path: `/${c.lang}/brands` }, { name, path: `/${c.lang}/brand/${b.slug}` }]);
  },
  categories: async (c) => ({ data: {}, meta: { title: tr(c.lang, "nav.categories"), description: tr(c.lang, "seo.categories_desc") } }),
  brands: async (c) => ({ data: { brands: await listBrands(c.lang) }, meta: { title: tr(c.lang, "nav.brands") } }),

  product: async (c, p) => {
    const product = await getProduct(p.slug!, c.lang);
    if (!product) return notFoundResult(c.lang);
    db.exec(`UPDATE products SET view_count = view_count + 1 WHERE id = $1`, [product.id]).catch(() => {});
    const store = (await getSettings()).store;
    const path = `/${c.lang}/p/${product.slug}`;
    const desc = (product.seo_description || product.description || "").replace(/\s+/g, " ").slice(0, 300);
    return {
      data: { product },
      meta: {
        title: product.seo_title || `${product.name}${product.brand ? ` - ${product.brand}` : ""} | ${pick(store, "name", c.lang)}`,
        description: desc, image: absMedia(product.images[0]?.url),
        jsonld: [
          { "@context": "https://schema.org", "@type": "Product", name: product.name, sku: product.sku, gtin13: /^\d{13}$/.test(product.barcode ?? "") ? product.barcode : undefined,
            image: product.images.map((i: any) => absMedia(i.url)), description: desc, brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
            aggregateRating: product.rating_count ? { "@type": "AggregateRating", ratingValue: product.rating_avg, reviewCount: product.rating_count } : undefined,
            offers: { "@type": "Offer", url: abs(path), priceCurrency: "SAR", price: (product.price / 100).toFixed(2), itemCondition: "https://schema.org/NewCondition",
              availability: product.in_stock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", seller: { "@type": "Organization", name: pick(store, "name", c.lang) } } },
          breadcrumbLd([{ name: tr(c.lang, "nav.home"), path: `/${c.lang}` }, ...product.breadcrumbs.map((b: any) => ({ name: b.name, path: `/${c.lang}/c/${b.slug}` })), { name: product.name, path }]),
        ],
      },
    };
  },

  cart: async (c) => ({ data: { cart: await cartView(await findCart(c), c.lang, { customerId: c.user?.customer_id, email: c.user?.email }) }, meta: { title: tr(c.lang, "cart.title"), noindex: true } }),
  checkout: async (c) => {
    const settings = await getSettings();
    if (!c.user && !settings.checkout.guest_checkout) return { data: {}, meta: { title: "" }, redirect: `/${c.lang}/login?next=${encodeURIComponent(`/${c.lang}/checkout`)}` };
    return { data: { regions: await listRegions(c.lang) }, meta: { title: tr(c.lang, "checkout.title"), noindex: true } };
  },
  order: async (c, p, q) => {
    const order = await loadOrder({ number: p.number });
    if (!order || !canAccessOrder(c, order, q.get("key"))) return notFoundResult(c.lang);
    return { data: { order: await orderView(order, c.lang) }, meta: { title: `${tr(c.lang, "order.title")} ${order.number}`, noindex: true } };
  },
  invoice: async (c, p, q) => {
    const inv = await invoiceWithItems({ number: p.number });
    const order = inv?.order_id ? await loadOrder({ id: inv.order_id }) : undefined;
    if (!inv || !(c.can("invoices.view") || (order && canAccessOrder(c, order, q.get("key"))))) return notFoundResult(c.lang);
    const { xml: _x, access_key: _k, zatca_response: _z, ...safe } = inv;
    const labels = (l: Lang) => Object.fromEntries(Object.entries(dicts[l]).filter(([k]) => k.startsWith("inv.")));
    return { data: { invoice: safe, staff: c.can("invoices.view"), labels: { ar: labels("ar"), en: labels("en") } }, meta: { title: `${tr(c.lang, "inv.title")} ${inv.number}`, noindex: true } };
  },
  track: plain("track.title", false),
  login: async (c, _p, q) => (c.user ? { data: {}, meta: { title: "" }, redirect: safeNext(q.get("next"), c.lang) } : { data: {}, meta: { title: tr(c.lang, "auth.login"), noindex: true } }),
  register: async (c, _p, q) => (c.user ? { data: {}, meta: { title: "" }, redirect: safeNext(q.get("next"), c.lang) } : { data: {}, meta: { title: tr(c.lang, "auth.register"), noindex: true } }),
  forgot: plain("auth.forgot_title"),
  reset: plain("auth.reset_title"),
  account: guarded("account.title"),
  account_orders: guarded("account.orders"),
  account_addresses: async (c, p, q) => {
    const g = await guarded("account.addresses")(c, p, q);
    if (!g.redirect) g.data = { regions: await listRegions(c.lang) };
    return g;
  },
  account_wishlist: guarded("account.wishlist"),
  account_tickets: guarded("account.tickets"),
  account_ticket: guarded("account.tickets"),
  contact: async (c) => ({ data: {}, meta: { title: tr(c.lang, "contact.title"), description: tr(c.lang, "contact.intro") } }),
  faq: async (c) => {
    const rows = await db.q(`SELECT * FROM faqs WHERE active ORDER BY sort, id`);
    const faqs = rows.map((f) => ({ id: f.id, question: pick(f, "question", c.lang), answer: pick(f, "answer", c.lang) }));
    return {
      data: { faqs },
      meta: { title: tr(c.lang, "faq.title"), jsonld: faqs.length ? [{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.question, acceptedAnswer: { "@type": "Answer", text: f.answer } })) }] : [] },
    };
  },
  page: async (c, p) => {
    const row = await db.one(`SELECT * FROM pages WHERE slug = $1`, [p.slug]);
    if (!row) return notFoundResult(c.lang);
    const body = pick(row, "body", c.lang);
    return { data: { page: { slug: row.slug, title: pick(row, "title", c.lang), body, updated_at: row.updated_at } }, meta: { title: pick(row, "title", c.lang), description: body.replace(/[#*\n]+/g, " ").slice(0, 200) } };
  },
  not_found: async (c) => notFoundResult(c.lang),
};

/** Only allow same-site relative redirects after login. */
export function safeNext(next: string | null, lang: Lang): string {
  return next && /^\/(ar|en|ur)(\/[\w\-./?=&%]*)?$/.test(next) ? next : `/${lang}/account`;
}
