import { z } from "zod";
import { db } from "../../db";
import { conflict, HttpError, type Router } from "../../http";
import { invalidate } from "../../cache";
import { PERMISSIONS, slugify } from "../../../shared/constants";
import { recomputePrices, refreshSearchText } from "../../services/catalog";
import { crud } from "./crud";

const t3 = (field: string, max = 200, required = true) => ({
  [`${field}_ar`]: required ? z.string().trim().min(1).max(max) : z.string().trim().max(max).default(""),
  [`${field}_en`]: z.string().trim().max(max).default(""),
  [`${field}_ur`]: z.string().trim().max(max).default(""),
});
const fill = <T extends Record<string, any>>(o: T, field: string): T => {
  const d = o as any;
  d[`${field}_en`] ||= d[`${field}_ar`];
  d[`${field}_ur`] ||= d[`${field}_ar`];
  return o;
};
const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9؀-ۿ]+(?:-[a-z0-9؀-ۿ]+)*$/, "invalid_slug").max(90);
const optUrl = z.string().trim().max(500).refine((v) => v === "" || v.startsWith("/") || /^https?:\/\//.test(v), "invalid_url").nullish().transform((v) => (v ? v : null));
const optDate = z.string().nullish().transform((v, ctx) => {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) { ctx.addIssue({ code: "custom", message: "invalid_date" }); return z.NEVER; }
  return d;
});
const int = (min = 0, max = 2_000_000_000) => z.coerce.number().int().min(min).max(max);
const optInt = (min = 0) => z.union([z.literal(""), z.null(), z.undefined(), z.coerce.number().int().min(min)]).transform((v) => (v === "" || v == null ? null : (v as number)));

export function registerResourceApi(r: Router) {
  const catalogChanged = async () => { invalidate("shell"); await refreshSearchText(null); };

  crud(r, {
    path: "categories", table: "categories", readPerm: "products.view", writePerm: "catalog.manage",
    search: ["name_ar", "name_en", "name_ur", "slug"], orderBy: "sort, id",
    schema: z.object({
      ...t3("name"), ...t3("description", 2000, false),
      slug: slug.optional().or(z.literal("")), parent_id: optInt(1), icon: z.string().trim().max(40).nullish().transform((v) => v || null), image_url: optUrl,
      sort: int().default(0), active: z.boolean().default(true),
    }).transform((v) => fill({ ...v, slug: v.slug || slugify(v.name_en || v.name_ar) }, "name")),
    afterWrite: catalogChanged,
    validate: async (data, id) => {
      // a category may not be placed under itself or under one of its own descendants
      if (id === null || data.parent_id == null) return;
      const rows = await db.q<{ id: number; parent_id: number | null }>(`SELECT id, parent_id FROM categories`);
      for (let cur: number | null = data.parent_id, depth = 0; cur != null && depth < 50; depth++) {
        if (cur === id) throw new HttpError(422, "validation", "Validation failed", { fields: { parent_id: "invalid_choice" } });
        cur = rows.find((r) => r.id === cur)?.parent_id ?? null;
      }
    },
    beforeDelete: async (id) => {
      const used = await db.one(`SELECT 1 AS ok FROM products WHERE category_id = $1 LIMIT 1`, [id]);
      if (used) throw conflict("category_has_products");
    },
  });

  crud(r, {
    path: "brands", table: "brands", readPerm: "products.view", writePerm: "catalog.manage",
    search: ["name_ar", "name_en", "slug"], orderBy: "sort, name_en",
    schema: z.object({ ...t3("name"), slug: slug.optional().or(z.literal("")), logo_url: optUrl, is_popular: z.boolean().default(false), active: z.boolean().default(true), sort: int().default(0) })
      .transform((v) => fill({ ...v, slug: v.slug || slugify(v.name_en || v.name_ar) }, "name")),
    afterWrite: catalogChanged,
  });

  crud(r, {
    path: "coupons", table: "coupons", readPerm: "promotions.manage", writePerm: "promotions.manage", search: ["code", "description"],
    schema: z.object({
      code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/, "invalid_code"),
      description: z.string().trim().max(200).default(""),
      type: z.enum(["percent", "fixed", "free_shipping"]),
      value: int(0), min_subtotal: int().default(0), max_discount: optInt(0), usage_limit: optInt(1), per_customer_limit: optInt(1),
      starts_at: optDate, ends_at: optDate, active: z.boolean().default(true),
    }).refine((v) => v.type !== "percent" || (v.value > 0 && v.value <= 10000), { message: "invalid_percent", path: ["value"] })
      .refine((v) => v.type !== "fixed" || v.value > 0, { message: "invalid_amount", path: ["value"] }),
  });

  crud(r, {
    path: "discounts", table: "discounts", readPerm: "promotions.manage", writePerm: "promotions.manage", search: ["name"],
    schema: z.object({
      name: z.string().trim().min(2).max(120), type: z.enum(["percent", "fixed"]), value: int(1),
      scope: z.enum(["all", "category", "brand", "product"]), scope_id: optInt(1), starts_at: optDate, ends_at: optDate, active: z.boolean().default(true),
    }).refine((v) => v.scope === "all" || v.scope_id != null, { message: "scope_required", path: ["scope_id"] })
      .refine((v) => v.type !== "percent" || v.value <= 9500, { message: "invalid_percent", path: ["value"] }),
    afterWrite: async () => { await recomputePrices(); invalidate("shell"); },
  });

  crud(r, {
    path: "banners", table: "banners", readPerm: "content.manage", writePerm: "content.manage", orderBy: "placement, sort, id",
    schema: z.object({
      placement: z.enum(["hero", "promo"]), ...t3("title"), ...t3("subtitle", 300, false), ...t3("cta", 60, false),
      link: z.string().trim().max(300).default(""), image_url: optUrl, sort: int().default(0), active: z.boolean().default(true), starts_at: optDate, ends_at: optDate,
    }).transform((v) => fill(v, "title")),
    afterWrite: () => invalidate("shell"),
  });

  crud(r, {
    path: "homepage-sections", table: "homepage_sections", readPerm: "content.manage", writePerm: "content.manage", orderBy: "sort, id",
    schema: z.object({
      type: z.enum(["hero", "categories", "featured", "best_sellers", "new_arrivals", "deals", "brands", "promo", "reviews", "why_us", "delivery", "contact"]),
      ...t3("title", 120, false), item_limit: int(1, 24).default(8), sort: int().default(0), active: z.boolean().default(true),
    }),
    afterWrite: () => invalidate("shell"),
  });

  crud(r, {
    path: "pages", table: "pages", readPerm: "content.manage", writePerm: "content.manage", orderBy: "id",
    schema: z.object({ slug, ...t3("title"), ...t3("body", 60000, false) }).transform((v) => ({ ...fill(v, "title"), updated_at: new Date() })),
    afterWrite: () => invalidate("shell"),
  });

  crud(r, {
    path: "faqs", table: "faqs", readPerm: "content.manage", writePerm: "content.manage", orderBy: "sort, id",
    schema: z.object({ ...t3("question", 300), ...t3("answer", 3000), sort: int().default(0), active: z.boolean().default(true) }).transform((v) => fill(fill(v, "question"), "answer")),
  });

  crud(r, {
    path: "shipping-methods", table: "shipping_methods", readPerm: "shipping.manage", writePerm: "shipping.manage", orderBy: "sort, id",
    schema: z.object({
      key: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{2,30}$/, "invalid_key"), ...t3("name", 80), ...t3("description", 300, false),
      carrier: z.string().trim().max(60).nullish().transform((v) => v || null), base_fee: int(), free_threshold: optInt(0),
      min_days: int(0, 60), max_days: int(0, 90), cod_allowed: z.boolean().default(true), is_pickup: z.boolean().default(false), active: z.boolean().default(true), sort: int().default(0),
    }).refine((v) => v.max_days >= v.min_days, { message: "invalid_range", path: ["max_days"] }).transform((v) => fill(v, "name")),
  });

  crud(r, {
    path: "shipping-rates", table: "shipping_rates", readPerm: "shipping.manage", writePerm: "shipping.manage", filters: ["method_id"], orderBy: "method_id, id",
    schema: z.object({ method_id: int(1), region_id: optInt(1), city_id: optInt(1), fee: int(), min_days: optInt(0), max_days: optInt(0), active: z.boolean().default(true) })
      .refine((v) => v.region_id != null || v.city_id != null, { message: "destination_required", path: ["region_id"] }),
  });

  crud(r, {
    path: "cities", table: "cities", readPerm: "shipping.manage", writePerm: "shipping.manage", search: ["name_ar", "name_en"], filters: ["region_id"], orderBy: "region_id, name_en",
    schema: z.object({ region_id: int(1), ...t3("name", 80), active: z.boolean().default(true) }).transform((v) => fill(v, "name")),
    afterWrite: () => invalidate("shell:geo"),
  });

  crud(r, {
    path: "roles", table: "roles", readPerm: "users.manage", writePerm: "users.manage", orderBy: "id",
    schema: z.object({
      key: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{2,40}$/, "invalid_key"), name: z.string().trim().min(2).max(80),
      permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
    }),
    beforeDelete: async (id) => {
      const role = await db.one(`SELECT is_system FROM roles WHERE id = $1`, [id]);
      if (role?.is_system) throw conflict("system_role");
      const used = await db.one(`SELECT 1 AS ok FROM admins WHERE role_id = $1 LIMIT 1`, [id]);
      if (used) throw conflict("in_use");
    },
  });

  r.get("/api/admin/regions", async () => ({ rows: await db.q(`SELECT * FROM regions ORDER BY id`) }), { auth: "admin" });
}
