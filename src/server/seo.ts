import { config } from "./config";
import { db } from "./db";
import { cached } from "./cache";
import { LANGS } from "../shared/constants";

const base = config.APP_URL.replace(/\/$/, "");

export function robotsTxt(): string {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /api/",
    "Disallow: /__data",
    ...LANGS.flatMap((l) => [`Disallow: /${l}/cart`, `Disallow: /${l}/checkout`, `Disallow: /${l}/account`, `Disallow: /${l}/order/`, `Disallow: /${l}/invoice/`, `Disallow: /${l}/search`]),
    "",
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ].join("\n");
}

export async function sitemapXml(): Promise<string> {
  return cached("shell:sitemap", 600, async () => {
    const [products, categories, brands, pages] = await Promise.all([
      db.q(`SELECT slug, updated_at FROM products WHERE status = 'active' ORDER BY id LIMIT 15000`),
      db.q(`SELECT slug FROM categories WHERE active ORDER BY id`),
      db.q(`SELECT slug FROM brands WHERE active ORDER BY id`),
      db.q(`SELECT slug, updated_at FROM pages ORDER BY id`),
    ]);
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const entries: string[] = [];
    const add = (path: string, lastmod?: Date, priority = "0.6") => {
      for (const l of LANGS) {
        const alts = LANGS.map((a) => `<xhtml:link rel="alternate" hreflang="${a}" href="${esc(`${base}/${a}${path}`)}"/>`).join("");
        entries.push(`<url><loc>${esc(`${base}/${l}${path}`)}</loc>${lastmod ? `<lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>` : ""}<priority>${priority}</priority>${alts}</url>`);
      }
    };
    add("", undefined, "1.0");
    add("/products", undefined, "0.8");
    add("/categories"); add("/brands"); add("/contact", undefined, "0.3"); add("/faq", undefined, "0.3"); add("/track", undefined, "0.3");
    for (const c of categories) add(`/c/${encodeURIComponent(c.slug)}`, undefined, "0.8");
    for (const b of brands) add(`/brand/${encodeURIComponent(b.slug)}`, undefined, "0.5");
    for (const p of products) add(`/p/${encodeURIComponent(p.slug)}`, p.updated_at, "0.7");
    for (const p of pages) add(`/page/${encodeURIComponent(p.slug)}`, p.updated_at, "0.2");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${entries.join("")}</urlset>`;
  });
}
