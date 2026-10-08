import { z } from "zod";
import { db, tx, type Row } from "../../db";
import { bad, conflict, exportResponse, isExport, HttpError, notFound, pageParams, type Router } from "../../http";
import { audit } from "../../auth";
import { invalidate } from "../../cache";
import { sar, slugify } from "../../../shared/constants";
import { normalizeSearch, recomputePrices, refreshSearchText } from "../../services/catalog";
import { lowStockProducts, moveStock } from "../../services/inventory";
import { kickNotifications, notifyAdmins } from "../../services/notifications";
import { saveImage, saveVideo, storage } from "../../services/storage";
import { config } from "../../config";

const str = (max: number) => z.string().trim().max(max).default("");
const optStr = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));
const optInt = z.union([z.literal(""), z.null(), z.undefined(), z.coerce.number().int().min(0).max(2_000_000_000)]).transform((v) => (v === "" || v == null ? null : (v as number)));

const productSchema = z.object({
  sku: z.string().trim().min(1).max(60).regex(/^[A-Za-z0-9._\-\/]+$/, "invalid_sku"),
  barcode: z.string().trim().max(60).regex(/^[\x20-\x7E]*$/, "invalid_barcode").nullish().transform((v) => (v ? v : null)),
  slug: z.string().trim().toLowerCase().max(90).optional(),
  name_ar: z.string().trim().min(2).max(200), name_en: str(200), name_ur: str(200),
  description_ar: str(20000), description_en: str(20000), description_ur: str(20000),
  brand_id: optInt, category_id: optInt,
  purchase_price: z.coerce.number().int().min(0).default(0),
  price: z.coerce.number().int().min(1, "price_required"),
  discount_price: optInt,
  vat_rate_bp: z.coerce.number().int().min(0).max(10000).default(1500),
  weight_g: optInt, length_mm: optInt, width_mm: optInt, height_mm: optInt,
  warranty_months: z.coerce.number().int().min(0).max(600).default(0),
  specs: z.array(z.object({ label_ar: z.string().trim().min(1).max(80), label_en: str(80), label_ur: str(80), value: z.string().trim().min(1).max(200) })).max(60).default([]),
  video_url: z.string().trim().max(500).refine((v) => v === "" || v.startsWith("/media/") || /^https:\/\//.test(v), "invalid_url").nullish().transform((v) => (v ? v : null)),
  is_featured: z.boolean().default(false), is_new: z.boolean().default(false), is_best_seller: z.boolean().default(false),
  status: z.enum(["draft", "active", "archived"]).default("active"),
  seo_title_ar: optStr(160), seo_title_en: optStr(160), seo_title_ur: optStr(160),
  seo_description_ar: optStr(320), seo_description_en: optStr(320), seo_description_ur: optStr(320),
  keywords: str(500),
  // inventory fields (handled separately)
  min_stock: z.coerce.number().int().min(0).max(1_000_000).default(5),
  location: optStr(60),
  initial_stock: z.coerce.number().int().min(0).max(10_000_000).optional(),
}).refine((v) => v.discount_price == null || v.discount_price < v.price, { message: "discount_must_be_lower", path: ["discount_price"] });

async function uniqueSlug(base: string, excludeId: number | null): Promise<string> {
  const root = slugify(base) || "product";
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const hit = await db.one(`SELECT id FROM products WHERE slug = $1 AND id <> $2`, [candidate, excludeId ?? 0]);
    if (!hit) return candidate;
  }
  return `${root}-${Date.now()}`;
}

export function registerCatalogAdminApi(r: Router) {
  // ── products
  r.get("/api/admin/products", async (c) => {
    const { page, per, offset } = pageParams(c.query, 25, 200);
    const where: string[] = ["TRUE"];
    const params: unknown[] = [];
    const add = (v: unknown) => { params.push(v); return `$${params.length}`; };
    const q = c.query.get("q")?.trim();
    if (q) {
      const n = normalizeSearch(q);
      where.push(`(p.search_text LIKE ${add(`%${n.replace(/[\\%_]/g, (m) => "\\" + m)}%`)} OR lower(p.sku) = ${add(q.toLowerCase())} OR p.barcode = ${add(q)})`);
    }
    if (c.query.get("status")) where.push(`p.status = ${add(c.query.get("status"))}`);
    if (c.query.get("category_id")) where.push(`p.category_id = ${add(Number(c.query.get("category_id")) || 0)}`);
    if (c.query.get("brand_id")) where.push(`p.brand_id = ${add(Number(c.query.get("brand_id")) || 0)}`);
    if (c.query.get("low") === "1") where.push(`COALESCE(i.quantity, 0) <= COALESCE(i.min_stock, 0)`);
    const from = `FROM products p LEFT JOIN inventory i ON i.product_id = p.id LEFT JOIN brands b ON b.id = p.brand_id LEFT JOIN categories c ON c.id = p.category_id WHERE ${where.join(" AND ")}`;
    const select = `SELECT p.id, p.sku, p.barcode, p.slug, p.name_ar, p.name_en, p.price, p.discount_price, p.effective_price, p.purchase_price, p.status, p.is_featured, p.is_new, p.is_best_seller, p.sold_count,
              b.name_ar AS brand, c.name_ar AS category, COALESCE(i.quantity, 0) AS stock, COALESCE(i.min_stock, 0) AS min_stock,
              (SELECT COALESCE(thumb_url, url) FROM product_images WHERE product_id = p.id ORDER BY sort, id LIMIT 1) AS image`;
    if (isExport(c)) {
      const rows = await db.q(`${select} ${from} ORDER BY p.id LIMIT 20000`, params);
      return exportResponse(c, "products.csv", [
        ["SKU", "Barcode", "Name (AR)", "Name (EN)", "Brand", "Category", "Price (SAR)", "Selling price (SAR)", "Cost (SAR)", "Stock", "Min stock", "Status", "Sold"],
        ...rows.map((p) => [p.sku, p.barcode, p.name_ar, p.name_en, p.brand, p.category, sar(p.price), sar(p.effective_price), sar(p.purchase_price), p.stock, p.min_stock, p.status, p.sold_count]),
      ]);
    }
    const rows = await db.q(`${select} ${from} ORDER BY p.id DESC LIMIT ${per} OFFSET ${offset}`, params);
    const total = (await db.one<{ n: number }>(`SELECT count(*)::int AS n ${from}`, params))!.n;
    return { rows, total, page, pages: Math.ceil(total / per) };
  }, { auth: "admin", perm: "products.view" });

  /** Barcode / SKU lookup used by the scanner, stock desk and point of sale. */
  r.get("/api/admin/products/lookup", async (c) => {
    const code = (c.query.get("code") ?? "").trim();
    if (!code) throw bad("code_required");
    const p = await db.one(
      `SELECT p.id, p.sku, p.barcode, p.slug, p.name_ar, p.name_en, p.name_ur, p.price, p.effective_price, p.vat_rate_bp, p.status,
              COALESCE(i.quantity, 0) AS stock, COALESCE(i.min_stock, 0) AS min_stock, i.location,
              (SELECT COALESCE(thumb_url, url) FROM product_images WHERE product_id = p.id ORDER BY sort, id LIMIT 1) AS image
         FROM products p LEFT JOIN inventory i ON i.product_id = p.id
        WHERE p.barcode = $1 OR lower(p.sku) = lower($1) ORDER BY (p.barcode = $1) DESC LIMIT 1`, [code]);
    if (!p) throw notFound("product_not_found");
    return { product: p };
  }, { auth: "admin", perm: "products.view" });

  r.get("/api/admin/products/:id", async (c) => {
    const id = Number(c.params.id) || 0;
    const p = await db.one(`SELECT p.*, COALESCE(i.quantity, 0) AS stock, COALESCE(i.min_stock, 5) AS min_stock, i.location FROM products p LEFT JOIN inventory i ON i.product_id = p.id WHERE p.id = $1`, [id]);
    if (!p) throw notFound("product_not_found");
    const images = await db.q(`SELECT id, url, thumb_url, alt, sort FROM product_images WHERE product_id = $1 ORDER BY sort, id`, [id]);
    return { row: { ...p, images } };
  }, { auth: "admin", perm: "products.view" });

  const save = async (c: any, id: number | null) => {
    const body = await c.body(productSchema);
    const { min_stock, location, initial_stock, ...fields } = body as Row;
    fields.name_en ||= fields.name_ar; fields.name_ur ||= fields.name_ar;
    // A product keeps its URL when it is renamed; the slug only changes when the admin edits it explicitly.
    const current = id !== null && !fields.slug ? (await db.one(`SELECT slug FROM products WHERE id = $1`, [id]))?.slug : null;
    fields.slug = current ?? (await uniqueSlug(fields.slug || fields.name_en || fields.sku, id));
    try {
      const row = await tx(async (t) => {
        let p: Row;
        if (id === null) {
          p = await t.insert("products", { ...fields, effective_price: fields.discount_price ?? fields.price });
          await t.insert("inventory", { product_id: p.id, quantity: 0, min_stock, location });
          if (initial_stock) await moveStock(t, { productId: p.id, type: "stock_in", delta: initial_stock, unitCost: fields.purchase_price, note: "opening stock", userId: c.user.id });
        } else {
          const updated = await t.update("products", id, { ...fields, updated_at: new Date() });
          if (!updated) throw notFound("product_not_found");
          p = updated;
          await t.exec(`INSERT INTO inventory (product_id, quantity, min_stock, location) VALUES ($1, 0, $2, $3) ON CONFLICT (product_id) DO UPDATE SET min_stock = EXCLUDED.min_stock, location = EXCLUDED.location`, [id, min_stock, location]);
        }
        await refreshSearchText([p.id], t);
        await audit(c, id === null ? "create" : "update", "products", p.id, { sku: p.sku }, t);
        return p;
      });
      await recomputePrices();
      invalidate("shell");
      return { row };
    } catch (e: any) {
      if (e?.errno === "23505") throw conflict(String(e.constraint).includes("barcode") ? "barcode_taken" : String(e.constraint).includes("sku") ? "sku_taken" : "duplicate_value");
      if (e?.errno === "23503") throw conflict("invalid_reference");
      throw e;
    }
  };
  r.post("/api/admin/products", (c) => save(c, null), { auth: "admin", perm: "products.manage" });
  r.put("/api/admin/products/:id", (c) => save(c, Number(c.params.id) || 0), { auth: "admin", perm: "products.manage" });

  r.delete("/api/admin/products/:id", async (c) => {
    const id = Number(c.params.id) || 0;
    const sold = await db.one(`SELECT 1 AS ok FROM order_items WHERE product_id = $1 LIMIT 1`, [id]);
    if (sold) {
      // keep history intact: products that were sold are archived instead of deleted
      await db.exec(`UPDATE products SET status = 'archived', updated_at = now() WHERE id = $1`, [id]);
      await audit(c, "archive", "products", id);
      invalidate("shell");
      return { ok: true, archived: true };
    }
    const images = await db.q(`SELECT url, thumb_url FROM product_images WHERE product_id = $1`, [id]);
    const n = await db.exec(`DELETE FROM products WHERE id = $1`, [id]);
    if (!n) throw notFound("product_not_found");
    for (const im of images) for (const u of [im.url, im.thumb_url]) if (u?.startsWith("/media/")) await storage().delete(u.slice(7));
    await audit(c, "delete", "products", id);
    invalidate("shell");
    return { ok: true, archived: false };
  }, { auth: "admin", perm: "products.manage" });

  // ── media
  const readFiles = async (c: any, field = "files"): Promise<File[]> => {
    const ct = c.req.headers.get("content-type") ?? "";
    if (!ct.startsWith("multipart/form-data")) throw new HttpError(415, "multipart_required");
    const form = await c.req.formData();
    const files = [...form.getAll(field), ...form.getAll("file")].filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) throw bad("file_required");
    if (files.length > 12) throw bad("too_many_files");
    return files;
  };

  r.post("/api/admin/products/:id/images", async (c) => {
    const id = Number(c.params.id) || 0;
    const p = await db.one(`SELECT id, name_ar FROM products WHERE id = $1`, [id]);
    if (!p) throw notFound("product_not_found");
    const files = await readFiles(c);
    const count = (await db.one<{ n: number }>(`SELECT count(*)::int AS n FROM product_images WHERE product_id = $1`, [id]))!.n;
    if (count + files.length > 15) throw conflict("image_limit");
    const out: Row[] = [];
    for (const [i, f] of files.entries()) {
      const saved = await saveImage(f, "products");
      out.push(await db.insert("product_images", { product_id: id, url: saved.url, thumb_url: saved.thumb_url, alt: p.name_ar, sort: count + i }));
    }
    await audit(c, "upload_images", "products", id, { count: files.length });
    invalidate("shell");
    return { images: out };
  }, { auth: "admin", perm: "products.manage" });

  r.put("/api/admin/products/:id/images/order", async (c) => {
    const id = Number(c.params.id) || 0;
    const body = await c.body(z.object({ ids: z.array(z.number().int()).max(30) }));
    await tx(async (t) => { for (const [i, imgId] of body.ids.entries()) await t.exec(`UPDATE product_images SET sort = $3 WHERE id = $1 AND product_id = $2`, [imgId, id, i]); });
    invalidate("shell");
    return { ok: true };
  }, { auth: "admin", perm: "products.manage" });

  r.delete("/api/admin/products/:id/images/:imageId", async (c) => {
    const img = await db.one(`DELETE FROM product_images WHERE id = $1 AND product_id = $2 RETURNING url, thumb_url`, [Number(c.params.imageId) || 0, Number(c.params.id) || 0]);
    if (!img) throw notFound();
    for (const u of [img.url, img.thumb_url]) if (u?.startsWith("/media/")) await storage().delete(u.slice(7));
    invalidate("shell");
    return { ok: true };
  }, { auth: "admin", perm: "products.manage" });

  r.post("/api/admin/uploads", async (c) => {
    // brand logos, banners and product videos: only roles that can actually edit that content may upload
    if (!["products.manage", "catalog.manage", "content.manage"].some((p) => c.can(p as any))) throw new HttpError(403, "forbidden");
    const [file] = await readFiles(c);
    const kind = c.query.get("kind");
    if (kind === "video") return saveVideo(file!);
    return saveImage(file!, kind === "brand" ? "brands" : kind === "banner" ? "banners" : "content");
  }, { auth: "admin" });

  // ── inventory
  r.get("/api/admin/inventory", async (c) => {
    const { page, per, offset } = pageParams(c.query, 50, 500);
    const params: unknown[] = [];
    const where: string[] = ["p.status <> 'archived'"];
    const q = c.query.get("q")?.trim();
    if (q) { params.push(`%${normalizeSearch(q).replace(/[\\%_]/g, (m) => "\\" + m)}%`, q); where.push(`(p.search_text LIKE $1 OR p.barcode = $2 OR lower(p.sku) = lower($2))`); }
    if (c.query.get("low") === "1") where.push("COALESCE(i.quantity, 0) <= COALESCE(i.min_stock, 0)");
    if (c.query.get("out") === "1") where.push("COALESCE(i.quantity, 0) = 0");
    const from = `FROM products p LEFT JOIN inventory i ON i.product_id = p.id WHERE ${where.join(" AND ")}`;
    const select = `SELECT p.id, p.sku, p.barcode, p.name_ar, p.name_en, p.purchase_price, p.effective_price, COALESCE(i.quantity, 0) AS quantity, COALESCE(i.min_stock, 0) AS min_stock, i.location, i.updated_at`;
    if (isExport(c)) {
      const rows = await db.q(`${select} ${from} ORDER BY p.sku LIMIT 20000`, params);
      return exportResponse(c, "inventory.csv", [
        ["SKU", "Barcode", "Name (AR)", "Name (EN)", "Quantity", "Min stock", "Location", "Unit cost (SAR)", "Stock value at cost (SAR)", "Stock value at selling price (SAR)"],
        ...rows.map((p) => [p.sku, p.barcode, p.name_ar, p.name_en, p.quantity, p.min_stock, p.location, sar(p.purchase_price), sar(p.purchase_price * p.quantity), sar(p.effective_price * p.quantity)]),
      ]);
    }
    const rows = await db.q(`${select} ${from} ORDER BY (COALESCE(i.quantity,0) <= COALESCE(i.min_stock,0)) DESC, p.id DESC LIMIT ${per} OFFSET ${offset}`, params);
    const total = (await db.one<{ n: number }>(`SELECT count(*)::int AS n ${from}`, params))!.n;
    const summary = await db.one(
      `SELECT count(*)::int AS products, COALESCE(sum(i.quantity), 0)::int AS units, COALESCE(sum(i.quantity::bigint * p.purchase_price), 0)::float8 AS cost_value,
              count(*) FILTER (WHERE COALESCE(i.quantity, 0) = 0)::int AS out_of_stock, count(*) FILTER (WHERE COALESCE(i.quantity, 0) <= COALESCE(i.min_stock, 0))::int AS low
         FROM products p LEFT JOIN inventory i ON i.product_id = p.id WHERE p.status <> 'archived'`);
    return { rows, total, page, pages: Math.ceil(total / per), summary };
  }, { auth: "admin", perm: "inventory.view" });

  r.get("/api/admin/inventory/low", async () => ({ rows: await lowStockProducts(200) }), { auth: "admin", perm: "inventory.view" });

  r.post("/api/admin/inventory/move", async (c) => {
    const body = await c.body(z.object({
      product_id: z.number().int().positive(),
      type: z.enum(["stock_in", "stock_out", "adjustment"]),
      quantity: z.number().int().min(0).max(10_000_000),
      unit_cost: z.number().int().min(0).nullish(),
      note: z.string().trim().max(300).nullish(),
    }).refine((v) => v.type === "adjustment" || v.quantity > 0, { message: "invalid_quantity", path: ["quantity"] }));
    const res = await tx(async (t) => {
      const m = await moveStock(t, {
        productId: body.product_id, type: body.type,
        ...(body.type === "adjustment" ? { setTo: body.quantity } : { delta: body.type === "stock_in" ? body.quantity : -body.quantity }),
        unitCost: body.unit_cost ?? null, note: body.note ?? null, userId: c.user!.id, referenceType: "manual",
      });
      if (body.type === "stock_in" && body.unit_cost != null) await t.exec(`UPDATE products SET purchase_price = $2 WHERE id = $1`, [body.product_id, body.unit_cost]);
      if (m.delta < 0 && m.balance <= m.min_stock && m.balance - m.delta > m.min_stock) {
        const p = await t.one(`SELECT name_ar, sku FROM products WHERE id = $1`, [body.product_id]);
        await notifyAdmins(t, "low_inventory", { product: p!.name_ar, sku: p!.sku, qty: m.balance }, `${config.APP_URL}/admin/inventory?low=1`);
      }
      await audit(c, `inventory.${body.type}`, "products", body.product_id, { quantity: body.quantity, balance: m.balance }, t);
      return m;
    });
    kickNotifications();
    invalidate("shell:home");
    return { balance: res.balance, delta: res.delta };
  }, { auth: "admin", perm: "inventory.manage" });

  r.get("/api/admin/inventory/transactions", async (c) => {
    const { page, per, offset } = pageParams(c.query, 50, 500);
    const pid = Number(c.query.get("product_id")) || null;
    const type = c.query.get("type") || null;
    const rows = await db.q(
      `SELECT it.*, p.sku, p.name_ar, u.name AS user_name, u.email AS user_email
         FROM inventory_transactions it JOIN products p ON p.id = it.product_id LEFT JOIN users u ON u.id = it.user_id
        WHERE ($1::int IS NULL OR it.product_id = $1) AND ($2::text IS NULL OR it.type = $2)
        ORDER BY it.id DESC LIMIT ${isExport(c) ? 20000 : per} OFFSET ${isExport(c) ? 0 : offset}`, [pid, type]);
    if (isExport(c)) {
      return exportResponse(c, "inventory-history.csv", [["Date", "SKU", "Product", "Type", "Change", "Balance", "Reference", "Note", "User"],
        ...rows.map((x) => [new Date(x.created_at).toISOString(), x.sku, x.name_ar, x.type, x.quantity, x.balance_after, [x.reference_type, x.reference_id].filter(Boolean).join(" "), x.note, x.user_email])]);
    }
    const total = (await db.one<{ n: number }>(`SELECT count(*)::int AS n FROM inventory_transactions it WHERE ($1::int IS NULL OR it.product_id = $1) AND ($2::text IS NULL OR it.type = $2)`, [pid, type]))!.n;
    return { rows, total, page, pages: Math.ceil(total / per) };
  }, { auth: "admin", perm: "inventory.view" });
}
