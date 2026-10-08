import { db, intArray, type Db, type Row } from "../db";
import { cached, invalidate } from "../cache";
import { pick, type Lang } from "../../shared/constants";
import { addVat } from "../../shared/pricing";
import { getSettings } from "./settings";

export function normalizeSearch(s: string): string {
  return s
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/[ىیےئ]/g, "ي").replace(/ؤ/g, "و").replace(/[ةھہۂۃ]/g, "ه").replace(/ک/g, "ك")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .toLowerCase().replace(/\s+/g, " ").trim();
}
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

const CARD_SELECT = `
  p.id, p.slug, p.sku, p.name_ar, p.name_en, p.name_ur, p.price, p.effective_price, p.vat_rate_bp,
  p.rating_avg, p.rating_count, p.is_new, p.is_best_seller, p.is_featured, p.category_id, p.specs,
  (SELECT c.icon FROM categories c WHERE c.id = p.category_id) AS cat_icon,
  b.name_ar AS brand_ar, b.name_en AS brand_en, b.name_ur AS brand_ur, b.slug AS brand_slug,
  (SELECT COALESCE(pi.thumb_url, pi.url) FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort, pi.id LIMIT 1) AS image,
  COALESCE(i.quantity, 0) AS stock, COALESCE(i.min_stock, 0) AS min_stock`;
const CARD_FROM = `FROM products p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN inventory i ON i.product_id = p.id`;

export interface ProductCard {
  id: number; slug: string; sku: string; name: string; brand: string | null; brand_slug: string | null; image: string | null;
  price: number; list_price: number; discount_pct: number; rating_avg: number; rating_count: number;
  is_new: boolean; is_best_seller: boolean; in_stock: boolean; low_stock: boolean;
  /** category line-drawing shown when there is no photo */
  glyph: string | null;
  /** the first key ratings (e.g. "16A", "250V"), printed on the card like a device rating plate */
  plate: string[];
}

export function toCard(r: Row, lang: Lang, inclVat: boolean): ProductCard {
  const g = (v: number) => (inclVat ? v : addVat(v, r.vat_rate_bp));
  const price = g(r.effective_price), list = g(r.price);
  return {
    id: r.id, slug: r.slug, sku: r.sku, name: pick(r, "name", lang),
    brand: r.brand_ar ? pick(r, "brand", lang) : null, brand_slug: r.brand_slug ?? null, image: r.image ?? null,
    price, list_price: list, discount_pct: list > price ? Math.round(((list - price) / list) * 100) : 0,
    rating_avg: Math.round(Number(r.rating_avg) * 10) / 10, rating_count: r.rating_count,
    is_new: r.is_new, is_best_seller: r.is_best_seller, in_stock: r.stock > 0, low_stock: r.stock > 0 && r.stock <= Math.max(3, r.min_stock),
    glyph: r.cat_icon ?? null,
    plate: (Array.isArray(r.specs) ? r.specs : []).slice(0, 3).map((x: Row) => String(x?.value ?? "")).filter((v: string) => v && v.length <= 12),
  };
}

export interface CategoryNode {
  id: number; parent_id: number | null; slug: string; name: string; icon: string | null; image_url: string | null; product_count: number; children: CategoryNode[];
}

export async function categoryRows(): Promise<Row[]> {
  return cached("shell:categories", 120, () =>
    db.q(`SELECT c.*, (SELECT count(*)::int FROM products p WHERE p.category_id = c.id AND p.status = 'active') AS product_count
            FROM categories c WHERE c.active ORDER BY c.sort, c.id`));
}

export async function categoryTree(lang: Lang): Promise<CategoryNode[]> {
  const rows = await categoryRows();
  const map = new Map<number, CategoryNode>();
  for (const r of rows) map.set(r.id, { id: r.id, parent_id: r.parent_id, slug: r.slug, name: pick(r, "name", lang), icon: r.icon, image_url: r.image_url, product_count: r.product_count, children: [] });
  const roots: CategoryNode[] = [];
  for (const n of map.values()) {
    const parent = n.parent_id ? map.get(n.parent_id) : undefined;
    if (parent) { parent.children.push(n); } else roots.push(n);
  }
  const total = (n: CategoryNode): number => (n.product_count += n.children.reduce((s, ch) => s + total(ch), 0));
  roots.forEach(total);
  return roots;
}

/** id of the category plus all of its descendants */
export async function categoryScope(slug: string): Promise<{ row: Row; ids: number[]; path: Row[] } | null> {
  const rows = await categoryRows();
  const row = rows.find((r) => r.slug === slug);
  if (!row) return null;
  const ids = [row.id as number];
  for (let i = 0; i < ids.length; i++) for (const r of rows) if (r.parent_id === ids[i] && !ids.includes(r.id)) ids.push(r.id);
  const path: Row[] = [];
  for (let cur: Row | undefined = row; cur && path.length < 20; cur = rows.find((r) => r.id === cur!.parent_id)) path.unshift(cur);
  return { row, ids, path };
}

export interface ProductQuery {
  q?: string; category?: string; brands?: string[]; min?: number; max?: number;
  inStock?: boolean; rating?: number; flag?: "featured" | "new" | "best" | "deals";
  sort?: string; page?: number; per?: number; ids?: number[];
}

export async function listProducts(query: ProductQuery, lang: Lang) {
  const settings = await getSettings();
  const incl = settings.tax.prices_include_vat;
  const where: string[] = ["p.status = 'active'"];
  const params: unknown[] = [];
  const add = (v: unknown) => { params.push(v); return `$${params.length}`; };
  let relevance = "";

  let category: Awaited<ReturnType<typeof categoryScope>> = null;
  if (query.category) {
    category = await categoryScope(query.category);
    if (!category) return { items: [], total: 0, page: 1, pages: 0, facets: { brands: [], price_min: 0, price_max: 0 }, category: null };
    where.push(`p.category_id = ANY(${add(intArray(category.ids))}::int[])`);
  }
  if (query.ids) where.push(`p.id = ANY(${add(intArray(query.ids))}::int[])`);
  if (query.flag === "featured") where.push("p.is_featured");
  if (query.flag === "new") where.push("p.is_new");
  if (query.flag === "best") where.push("p.is_best_seller");
  if (query.flag === "deals") where.push("p.effective_price < p.price");

  const norm = query.q ? normalizeSearch(query.q).slice(0, 80) : "";
  if (norm) {
    const tokens = norm.split(" ").filter(Boolean).slice(0, 6);
    const mark = params.length;
    const strict = tokens.map((t) => `p.search_text LIKE ${add(`%${likeEscape(t)}%`)}`).join(" AND ");
    const strictHit = await db.one(`SELECT 1 AS ok FROM products p WHERE ${where.join(" AND ")} AND ${strict} LIMIT 1`, params.slice());
    if (strictHit) where.push(`(${strict})`);
    else {
      // nothing contains every word: fall back to trigram similarity so typos still find products
      params.length = mark;
      where.push(`word_similarity(${add(norm)}, p.search_text) > 0.36`);
    }
  }

  // facets are computed before brand / price narrowing so the user can widen the selection
  const facetWhere = where.join(" AND ");
  const facetParams = params.slice();

  if (query.brands?.length) where.push(`b.slug IN (SELECT jsonb_array_elements_text(${add(query.brands.slice(0, 30))}::jsonb))`);
  if (query.min != null && Number.isFinite(query.min)) where.push(`p.effective_price >= ${add(Math.round(query.min))}`);
  if (query.max != null && Number.isFinite(query.max)) where.push(`p.effective_price <= ${add(Math.round(query.max))}`);
  if (query.inStock) where.push("COALESCE(i.quantity, 0) > 0");
  if (query.rating) where.push(`p.rating_avg >= ${add(query.rating)}`);

  // Parameters used only for ordering are appended after the filter parameters, so the count and facet
  // queries (which share the filter parameters) never receive a parameter they do not reference.
  const itemParams = params.slice();
  if (norm) {
    itemParams.push(norm, `${likeEscape(norm)}%`);
    const pq = `$${itemParams.length - 1}::text`, prefix = `$${itemParams.length}::text`;
    relevance = `(lower(p.sku) = ${pq} OR p.barcode = ${pq}) DESC, (norm_text(p.name_${lang}) LIKE ${prefix}) DESC, word_similarity(${pq}, p.search_text) DESC, `;
  }

  const sorts: Record<string, string> = {
    price_asc: "p.effective_price ASC", price_desc: "p.effective_price DESC", newest: "p.created_at DESC",
    popular: "p.sold_count DESC, p.view_count DESC", rating: "p.rating_avg DESC, p.rating_count DESC",
  };
  const order = sorts[query.sort ?? ""] ?? `${relevance}(COALESCE(i.quantity,0) > 0) DESC, p.is_featured DESC, p.sold_count DESC, p.id DESC`;
  const per = Math.min(60, Math.max(1, query.per ?? 24));
  const page = Math.max(1, query.page ?? 1);
  const w = where.join(" AND ");

  const [items, count, brands, range] = await Promise.all([
    db.q(`SELECT ${CARD_SELECT} ${CARD_FROM} WHERE ${w} ORDER BY ${order} LIMIT ${per} OFFSET ${(page - 1) * per}`, sorts[query.sort ?? ""] ? params : itemParams),
    db.one<{ n: number }>(`SELECT count(*)::int AS n ${CARD_FROM} WHERE ${w}`, params),
    db.q(`SELECT b.slug, b.name_ar, b.name_en, b.name_ur, count(*)::int AS n ${CARD_FROM} WHERE ${facetWhere} AND b.id IS NOT NULL GROUP BY b.id ORDER BY n DESC, b.name_en LIMIT 40`, facetParams),
    db.one(`SELECT COALESCE(min(p.effective_price), 0)::int AS lo, COALESCE(max(p.effective_price), 0)::int AS hi ${CARD_FROM} WHERE ${facetWhere}`, facetParams),
  ]);
  const total = count?.n ?? 0;
  return {
    items: items.map((r) => toCard(r, lang, incl)),
    total, page, pages: Math.ceil(total / per),
    facets: { brands: brands.map((b) => ({ slug: b.slug, name: pick(b, "name", lang), count: b.n })), price_min: range?.lo ?? 0, price_max: range?.hi ?? 0 },
    category: category ? {
      id: category.row.id, slug: category.row.slug, name: pick(category.row, "name", lang), description: pick(category.row, "description", lang),
      path: category.path.map((c) => ({ slug: c.slug, name: pick(c, "name", lang) })),
    } : null,
  };
}

export async function cardsByIds(ids: number[], lang: Lang): Promise<ProductCard[]> {
  if (!ids.length) return [];
  const incl = (await getSettings()).tax.prices_include_vat;
  const rows = await db.q(`SELECT ${CARD_SELECT} ${CARD_FROM} WHERE p.status = 'active' AND p.id = ANY($1::int[])`, [intArray(ids)]);
  const by = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => by.get(id)).filter(Boolean).map((r) => toCard(r!, lang, incl));
}

export async function homeLists(lang: Lang, limit = 8) {
  return cached(`shell:home:${lang}:${limit}`, 60, async () => {
    const incl = (await getSettings()).tax.prices_include_vat;
    const run = (cond: string, order: string) =>
      db.q(`SELECT ${CARD_SELECT} ${CARD_FROM} WHERE p.status = 'active' AND ${cond} ORDER BY (COALESCE(i.quantity,0) > 0) DESC, ${order} LIMIT ${limit}`).then((rs) => rs.map((r) => toCard(r, lang, incl)));
    const [featured, best_sellers, new_arrivals, deals] = await Promise.all([
      run("p.is_featured", "p.sold_count DESC, p.id DESC"),
      run("(p.is_best_seller OR p.sold_count > 0)", "p.is_best_seller DESC, p.sold_count DESC"),
      run("TRUE", "p.is_new DESC, p.created_at DESC, p.id DESC"),
      run("p.effective_price < p.price", "(p.price - p.effective_price)::float / NULLIF(p.price, 0) DESC"),
    ]);
    return { featured, best_sellers, new_arrivals, deals };
  });
}

export async function suggest(q: string, lang: Lang) {
  const norm = normalizeSearch(q).slice(0, 60);
  if (norm.length < 2) return { products: [], categories: [], brands: [] };
  const like = `%${likeEscape(norm)}%`;
  const incl = (await getSettings()).tax.prices_include_vat;
  const [products, categories, brands] = await Promise.all([
    db.q(
      `SELECT ${CARD_SELECT} ${CARD_FROM}
        WHERE p.status = 'active' AND (p.search_text LIKE $1 OR word_similarity($2, p.search_text) > 0.4)
        ORDER BY (p.search_text LIKE $1) DESC, (norm_text(p.name_${lang}) LIKE $3) DESC, word_similarity($2, p.search_text) DESC, p.sold_count DESC LIMIT 6`,
      [like, norm, `${likeEscape(norm)}%`]),
    db.q(`SELECT slug, name_ar, name_en, name_ur FROM categories WHERE active AND norm_text(concat_ws(' ', name_ar, name_en, name_ur)) LIKE $1 ORDER BY sort LIMIT 4`, [like]),
    db.q(`SELECT slug, name_ar, name_en, name_ur FROM brands WHERE active AND norm_text(concat_ws(' ', name_ar, name_en, name_ur)) LIKE $1 ORDER BY sort LIMIT 4`, [like]),
  ]);
  return {
    products: products.map((r) => toCard(r, lang, incl)),
    categories: categories.map((c) => ({ slug: c.slug, name: pick(c, "name", lang) })),
    brands: brands.map((b) => ({ slug: b.slug, name: pick(b, "name", lang) })),
  };
}

export async function getProduct(slug: string, lang: Lang) {
  const p = await db.one(
    `SELECT p.*, b.name_ar AS brand_ar, b.name_en AS brand_en, b.name_ur AS brand_ur, b.slug AS brand_slug,
            (SELECT c.icon FROM categories c WHERE c.id = p.category_id) AS cat_icon,
            COALESCE(i.quantity, 0) AS stock, COALESCE(i.min_stock, 0) AS min_stock
       FROM products p LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN inventory i ON i.product_id = p.id
      WHERE p.slug = $1 AND p.status = 'active'`, [slug]);
  if (!p) return null;
  const settings = await getSettings();
  const incl = settings.tax.prices_include_vat;
  const cats = await categoryRows();
  const path: Row[] = [];
  for (let cur = cats.find((c) => c.id === p.category_id); cur && path.length < 20; cur = cats.find((c) => c.id === cur!.parent_id)) path.unshift(cur);

  const [images, related, together, reviews, hist] = await Promise.all([
    db.q(`SELECT id, url, thumb_url, alt FROM product_images WHERE product_id = $1 ORDER BY sort, id`, [p.id]),
    db.q(`SELECT ${CARD_SELECT} ${CARD_FROM} WHERE p.status = 'active' AND p.id <> $1 AND p.category_id = $2 ORDER BY (COALESCE(i.quantity,0) > 0) DESC, p.sold_count DESC, p.id LIMIT 8`, [p.id, p.category_id]),
    db.q(
      `SELECT ${CARD_SELECT}, fb.n ${CARD_FROM}
         JOIN (SELECT oi2.product_id, count(*) AS n FROM order_items oi1 JOIN order_items oi2 ON oi2.order_id = oi1.order_id AND oi2.product_id <> oi1.product_id
                WHERE oi1.product_id = $1 GROUP BY oi2.product_id ORDER BY n DESC LIMIT 4) fb ON fb.product_id = p.id
        WHERE p.status = 'active' AND COALESCE(i.quantity, 0) > 0 ORDER BY fb.n DESC`, [p.id]),
    db.q(`SELECT r.id, r.rating, r.title, r.body, r.verified_purchase, r.created_at, c.name AS author
            FROM reviews r JOIN customers c ON c.id = r.customer_id WHERE r.product_id = $1 AND r.status = 'approved' ORDER BY r.created_at DESC LIMIT 20`, [p.id]),
    db.q(`SELECT rating, count(*)::int AS n FROM reviews WHERE product_id = $1 AND status = 'approved' GROUP BY rating`, [p.id]),
  ]);
  // fall back to same-brand accessories when there is no order history yet
  let fbt = together;
  if (!fbt.length && p.brand_id) {
    fbt = await db.q(`SELECT ${CARD_SELECT} ${CARD_FROM} WHERE p.status = 'active' AND p.id <> $1 AND p.brand_id = $2 AND p.category_id <> $3 AND COALESCE(i.quantity,0) > 0 ORDER BY p.sold_count DESC, p.id LIMIT 3`, [p.id, p.brand_id, p.category_id ?? 0]);
  }
  const card = toCard({ ...p, image: images[0]?.thumb_url ?? images[0]?.url ?? null }, lang, incl);
  return {
    ...card,
    barcode: p.barcode,
    description: pick(p, "description", lang),
    images: images.map((im) => ({ url: im.url, thumb_url: im.thumb_url ?? im.url, alt: im.alt || card.name })),
    video_url: p.video_url,
    specs: ((p.specs ?? []) as Row[]).map((s) => ({ label: pick(s, "label", lang), value: pick(s, "value", lang) || s.value || "" })).filter((s) => s.label),
    weight_g: p.weight_g, dimensions_mm: p.length_mm ? [p.length_mm, p.width_mm, p.height_mm] : null,
    warranty_months: p.warranty_months,
    vat_rate_bp: p.vat_rate_bp, prices_include_vat: true,
    stock_left: p.stock <= 10 ? p.stock : null,
    max_qty: Math.min(p.stock, settings.checkout.max_qty_per_item),
    breadcrumbs: path.map((c) => ({ slug: c.slug, name: pick(c, "name", lang) })),
    category_id: p.category_id,
    seo_title: pick(p, "seo_title", lang) || null,
    seo_description: pick(p, "seo_description", lang) || null,
    related: related.map((r) => toCard(r, lang, incl)),
    together: fbt.map((r) => toCard(r, lang, incl)),
    reviews,
    rating_hist: [5, 4, 3, 2, 1].map((s) => ({ stars: s, count: hist.find((h) => h.rating === s)?.n ?? 0 })),
  };
}

/** Recalculate products.effective_price from discount_price and active discount rules. */
export async function recomputePrices(t: Db = db): Promise<number> {
  const n = await t.exec(`
    UPDATE products p SET effective_price = x.ep, updated_at = now()
      FROM (
        SELECT p2.id, LEAST(p2.price, COALESCE(p2.discount_price, p2.price), COALESCE((
          SELECT min(CASE d.type WHEN 'percent' THEN p2.price - round(p2.price * d.value / 10000.0)::int ELSE GREATEST(p2.price - d.value, 0) END)
            FROM discounts d
           WHERE d.active AND (d.starts_at IS NULL OR d.starts_at <= now()) AND (d.ends_at IS NULL OR d.ends_at > now())
             AND (d.scope = 'all' OR (d.scope = 'product' AND d.scope_id = p2.id) OR (d.scope = 'brand' AND d.scope_id = p2.brand_id)
               OR (d.scope = 'category' AND d.scope_id IN (
                    WITH RECURSIVE up AS (SELECT c.id, c.parent_id FROM categories c WHERE c.id = p2.category_id
                                          UNION SELECT c.id, c.parent_id FROM categories c JOIN up ON c.id = up.parent_id)
                    SELECT id FROM up)))
        ), p2.price)) AS ep
        FROM products p2
      ) x
     WHERE x.id = p.id AND p.effective_price <> x.ep`);
  if (n) invalidate("shell:home");
  return n;
}

export async function refreshSearchText(ids: number[] | null, t: Db = db) {
  await t.exec(
    `UPDATE products p SET search_text = norm_text(concat_ws(' ', p.name_ar, p.name_en, p.name_ur, p.sku, p.barcode, p.keywords,
              b.name_ar, b.name_en, b.name_ur, c.name_ar, c.name_en, c.name_ur))
       FROM products p0 LEFT JOIN brands b ON b.id = p0.brand_id LEFT JOIN categories c ON c.id = p0.category_id
      WHERE p0.id = p.id AND ($1::int[] IS NULL OR p.id = ANY($1::int[]))`,
    [ids ? intArray(ids) : null],
  );
}

export async function refreshRating(productId: number, t: Db = db) {
  await t.exec(
    `UPDATE products SET rating_avg = COALESCE(s.avg, 0), rating_count = COALESCE(s.n, 0)
       FROM (SELECT avg(rating)::real AS avg, count(*)::int AS n FROM reviews WHERE product_id = $1 AND status = 'approved') s
      WHERE id = $1`, [productId]);
}

export async function listBrands(lang: Lang, popularOnly = false) {
  const rows = await cached("shell:brands", 120, () => db.q(`SELECT * FROM brands WHERE active ORDER BY sort, name_en`));
  return rows.filter((b) => !popularOnly || b.is_popular).map((b) => ({ id: b.id, slug: b.slug, name: pick(b, "name", lang), logo_url: b.logo_url }));
}
