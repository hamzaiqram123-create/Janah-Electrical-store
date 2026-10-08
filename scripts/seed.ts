/**
 * Seeds reference data (regions, cities, roles, shipping methods, legal pages, FAQs, homepage layout),
 * the first admin account and — unless SEED_SAMPLE_CATALOG=false — a sample electrical catalogue.
 * Safe to run more than once: existing rows are left untouched.
 */
import { closeDb, db, tx } from "../src/server/db";
import { hashPassword } from "../src/server/auth";
import { recomputePrices, refreshSearchText } from "../src/server/services/catalog";
import { moveStock } from "../src/server/services/inventory";
import { DEFAULT_SETTINGS } from "../src/server/services/settings";
import { ean13CheckDigit } from "../src/shared/barcode";
import { slugify, SYSTEM_ROLES } from "../src/shared/constants";
import { migrate } from "./migrate";
import { BANNERS, BRANDS, CATEGORIES, DESCRIPTIONS, FAQS, HOME_SECTIONS, PRODUCTS, REGIONS, SHIPPING_METHODS, SPEC_LABELS } from "./seed-data";
import { PAGES } from "./seed-pages";

/** Everyday search words customers use for each family (Arabic, Gulf dialect, English, Urdu). */
const KEYWORDS: Record<string, string> = {
  switches: "مفتاح مفاتيح سويتش switch سوئچ بٹن", sockets: "فيش افياش بلك مقبس بريزة socket outlet ساکٹ", "led-lights": "ليد اضاءة انارة led لائٹ",
  bulbs: "لمبة لمبات مصباح bulb lamp بلب", "ceiling-lights": "سقف نجفة ceiling سیلنگ", downlights: "سبوت سبوتات spot downlight ڈاؤن لائٹ", "flood-lights": "كشاف كشافات بروجكتر flood فلڈ",
  "outdoor-lights": "خارجي حديقة outdoor garden", "building-wires": "سلك اسلاك واير wire تار", "flexible-cables": "كيبل كابل cable کیبل", mcb: "قاطع بريكر breaker mcb بریکر",
  rccb: "قاطع تسريب ارضي ايرث ليكج elcb rcd rccb", "distribution-boards": "طبلون لوحة db panel بورڈ", contactors: "كونتاكتور كونتكتر contactor", relays: "ريلاي ريليه relay overload",
  accessories: "اكسسوارات شطرطون تيب علبة tape box", "extension-boards": "توصيلة مشترك وصلة extension", plugs: "فيشة قابس plug پلگ", fans: "مروحة مراوح شفاط fan پنکھا",
  tools: "عدة ادوات مفك زرادية tools اوزار", safety: "سلامة قفازات خوذة safety ppe", smart: "ذكي سمارت واي فاي smart wifi", other: "مؤقت تايمر جرس timer bell",
};

async function seedReference() {
  for (const role of SYSTEM_ROLES) {
    await db.exec(
      `INSERT INTO roles (key, name, permissions, is_system) VALUES ($1, $2, $3::jsonb, true)
       ON CONFLICT (key) DO UPDATE SET permissions = EXCLUDED.permissions, is_system = true`, [role.key, role.name, role.permissions]);
  }

  if (!(await db.one(`SELECT 1 AS ok FROM regions LIMIT 1`))) {
    for (const [code, ar, en, ur, cities] of REGIONS) {
      const region = await db.insert("regions", { code, name_ar: ar, name_en: en, name_ur: ur });
      for (const [car, cen, cur] of cities) await db.insert("cities", { region_id: region.id, name_ar: car, name_en: cen, name_ur: cur });
    }
    console.log(`regions: ${REGIONS.length}, cities: ${REGIONS.reduce((s, r) => s + r[4].length, 0)}`);
  }

  for (const m of SHIPPING_METHODS) {
    await db.exec(
      `INSERT INTO shipping_methods (key, name_ar, name_en, name_ur, description_ar, description_en, description_ur, base_fee, free_threshold, min_days, max_days, cod_allowed, is_pickup, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (key) DO NOTHING`,
      [m.key, m.name_ar, m.name_en, m.name_ur, m.description_ar, m.description_en, m.description_ur, m.base_fee, m.free_threshold, m.min_days, m.max_days, m.cod_allowed, m.is_pickup, m.sort]);
  }
  if (!(await db.one(`SELECT 1 AS ok FROM shipping_rates LIMIT 1`))) {
    const std = await db.one(`SELECT id FROM shipping_methods WHERE key = 'standard'`);
    const exp = await db.one(`SELECT id FROM shipping_methods WHERE key = 'express'`);
    const pick = await db.one(`SELECT id FROM shipping_methods WHERE key = 'pickup'`);
    const regions = await db.q(`SELECT id, code FROM regions`);
    const remote = new Set(["NBR", "JAZ", "NAJ", "BAH", "JOF", "TBK"]);
    const major = new Set(["RUH", "MAK", "EAS", "MED", "QAS"]);
    for (const r of regions) {
      // remote regions: higher standard fee and longer lead time; express only where couriers offer it
      if (remote.has(r.code)) await db.insert("shipping_rates", { method_id: std!.id, region_id: r.id, fee: 3500, min_days: 3, max_days: 7 });
      if (!major.has(r.code)) await db.insert("shipping_rates", { method_id: exp!.id, region_id: r.id, fee: 0, active: false });
    }
    // shop pickup is offered only for the home city; change the city in Admin → Shipping
    const riyadh = await db.one(`SELECT id FROM cities WHERE name_en = 'Riyadh'`);
    if (riyadh) await db.insert("shipping_rates", { method_id: pick!.id, city_id: riyadh.id, fee: 0 });
  }

  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[]) {
    await db.exec(`INSERT INTO settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO NOTHING`, [key, DEFAULT_SETTINGS[key]]);
  }

  for (const p of PAGES) {
    await db.exec(
      `INSERT INTO pages (slug, title_ar, title_en, title_ur, body_ar, body_en, body_ur) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (slug) DO NOTHING`,
      [p.slug, p.title[0], p.title[1], p.title[2], p.body[0], p.body[1], p.body[2]]);
  }
  if (!(await db.one(`SELECT 1 AS ok FROM faqs LIMIT 1`))) {
    for (const [i, f] of FAQS.entries()) await db.insert("faqs", { question_ar: f[0], question_en: f[1], question_ur: f[2], answer_ar: f[3], answer_en: f[4], answer_ur: f[5], sort: i + 1 });
  }
  if (!(await db.one(`SELECT 1 AS ok FROM homepage_sections LIMIT 1`))) {
    for (const [i, s] of HOME_SECTIONS.entries()) await db.insert("homepage_sections", { type: s[0], title_ar: s[1], title_en: s[2], title_ur: s[3], item_limit: s[4], sort: i + 1 });
  }
  if (!(await db.one(`SELECT 1 AS ok FROM banners LIMIT 1`))) {
    for (const b of BANNERS) await db.insert("banners", b);
  }

  for (const [i, c] of CATEGORIES.filter((c) => !c[5]).entries()) {
    await db.exec(`INSERT INTO categories (slug, icon, name_ar, name_en, name_ur, sort) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (slug) DO NOTHING`, [c[0], c[1], c[2], c[3], c[4], i + 1]);
  }
  for (const [i, c] of CATEGORIES.filter((c) => c[5]).entries()) {
    const parent = await db.one(`SELECT id FROM categories WHERE slug = $1`, [c[5]]);
    await db.exec(`INSERT INTO categories (slug, icon, name_ar, name_en, name_ur, parent_id, sort) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (slug) DO NOTHING`, [c[0], c[1], c[2], c[3], c[4], parent!.id, i + 1]);
  }
}

async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    if (!(await db.one(`SELECT 1 AS ok FROM admins LIMIT 1`))) console.log("no admin account yet — run `bun run admin:create <email> <password>` (or set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD and re-run the seed)");
    return;
  }
  if (await db.one(`SELECT 1 AS ok FROM users WHERE lower(email) = $1`, [email])) return;
  if (password.length < 10) throw new Error("SEED_ADMIN_PASSWORD must be at least 10 characters");
  const role = await db.one(`SELECT id FROM roles WHERE key = 'super_admin'`);
  const hash = await hashPassword(password);
  await tx(async (t) => {
    const u = await t.insert("users", { email, name: process.env.SEED_ADMIN_NAME || "مدير المتجر", password_hash: hash, kind: "admin" });
    await t.insert("admins", { user_id: u.id, role_id: role!.id });
  });
  console.log(`admin account created: ${email}`);
}

async function seedCatalog() {
  if (await db.one(`SELECT 1 AS ok FROM products LIMIT 1`)) return;
  for (const [i, b] of BRANDS.entries()) {
    await db.exec(`INSERT INTO brands (slug, name_ar, name_en, name_ur, is_popular, sort) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (slug) DO NOTHING`, [b[0], b[1], b[2], b[3], b[4], i + 1]);
  }
  const cats = new Map((await db.q(`SELECT id, slug FROM categories`)).map((c) => [c.slug as string, c.id as number]));
  const brands = new Map((await db.q(`SELECT id, slug FROM brands`)).map((b) => [b.slug as string, b.id as number]));
  const used = new Set<string>();
  await tx(async (t) => {
    for (const [i, p] of PRODUCTS.entries()) {
      const base12 = `62810000${String(i + 1).padStart(4, "0")}`;
      const flags = new Set((p.flags ?? "").split(","));
      let slug = slugify(p.en);
      if (used.has(slug)) slug = `${slug}-${p.sku.toLowerCase()}`;
      used.add(slug);
      const price = Math.round(p.price * 100), sale = p.sale ? Math.round(p.sale * 100) : null;
      const d = DESCRIPTIONS.default!;
      const row = await t.insert("products", {
        sku: p.sku, barcode: base12 + ean13CheckDigit(base12), slug, name_ar: p.ar, name_en: p.en, name_ur: p.ur,
        description_ar: d[0].replace("{name}", p.ar), description_en: d[1].replace("{name}", p.en), description_ur: d[2].replace("{name}", p.ur),
        brand_id: p.brand ? brands.get(p.brand) ?? null : null, category_id: cats.get(p.cat) ?? null,
        purchase_price: Math.round(p.cost * 100), price, discount_price: sale, effective_price: sale ?? price,
        warranty_months: p.warranty ?? 0, keywords: KEYWORDS[p.cat] ?? "",
        specs: p.specs.map(([k, v]) => ({ label_ar: SPEC_LABELS[k]![0], label_en: SPEC_LABELS[k]![1], label_ur: SPEC_LABELS[k]![2], value: v })),
        is_featured: flags.has("featured"), is_new: flags.has("new"), is_best_seller: flags.has("best"), status: "active",
      });
      await t.insert("inventory", { product_id: row.id, quantity: 0, min_stock: p.stock > 200 ? 30 : 5 });
      if (p.stock > 0) await moveStock(t, { productId: row.id, type: "stock_in", delta: p.stock, unitCost: Math.round(p.cost * 100), note: "opening stock" });
    }
    await refreshSearchText(null, t);
  });
  await recomputePrices();
  console.log(`sample catalogue: ${PRODUCTS.length} products, ${BRANDS.length} brands`);
}

await migrate(true);
await seedReference();
await seedAdmin();
if ((process.env.SEED_SAMPLE_CATALOG ?? "true").toLowerCase() !== "false") await seedCatalog();
console.log("seed complete");
await closeDb();
