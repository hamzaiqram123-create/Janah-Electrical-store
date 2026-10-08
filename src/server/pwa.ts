/**
 * Installable app support (Progressive Web App): web app manifests for the store and the back office,
 * the service worker, the offline page, static icons/screenshots, and the Digital Asset Links file that
 * lets a Google Play package (Trusted Web Activity) open the site full-screen. See docs/APPS.md.
 */
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { config, isProd } from "./config";
import { getSettings } from "./services/settings";
import { pick, type Lang } from "../shared/constants";
import { tr } from "../shared/i18n";

const ROOT = join(import.meta.dir, "../..");
const PUBLIC = join(ROOT, "public");
const DIST_ASSETS = join(ROOT, "dist/assets");

export const THEME = { light: "#17202a", dark: "#0b1015", background: "#eceeed" };

const MIME: Record<string, string> = { png: "image/png", webp: "image/webp", svg: "image/svg+xml", jpg: "image/jpeg", json: "application/json" };

/** /icons/* and /screenshots/* from public/ */
export async function servePublic(path: string): Promise<Response | null> {
  if (!/^\/(icons|screenshots)\/[\w.-]+$/.test(path)) return null;
  const file = join(PUBLIC, path);
  if (!existsSync(file)) return null;
  const ext = path.split(".").pop()!;
  return new Response(Bun.file(file), {
    headers: { "content-type": MIME[ext] ?? "application/octet-stream", "cache-control": isProd ? "public, max-age=604800" : "no-cache", "x-content-type-options": "nosniff" },
  });
}

const screenshots = () => {
  const dir = join(PUBLIC, "screenshots");
  if (!existsSync(dir)) return [];
  const sizes: Record<string, [number, number, "narrow" | "wide"]> = { "phone.webp": [780, 1688, "narrow"], "desktop.webp": [1600, 1000, "wide"] };
  return readdirSync(dir).filter((f) => sizes[f]).map((f) => ({ src: `/screenshots/${f}`, sizes: `${sizes[f]![0]}x${sizes[f]![1]}`, type: "image/webp", form_factor: sizes[f]![2] }));
};

export async function webManifest(lang: Lang, kind: "store" | "admin"): Promise<Response> {
  const st = await getSettings();
  const dir = lang === "en" ? "ltr" : "rtl";
  const png = (file: string, size: number, purpose: "any" | "maskable") => ({ src: `/icons/${file}`, sizes: `${size}x${size}`, type: "image/png", purpose });
  const related = config.ANDROID_APP_PACKAGE
    ? { related_applications: [{ platform: "play", id: config.ANDROID_APP_PACKAGE, url: `https://play.google.com/store/apps/details?id=${config.ANDROID_APP_PACKAGE}` }], prefer_related_applications: false }
    : {};
  const body = kind === "store"
    ? {
        id: "/",
        name: pick(st.store, "name", lang) || tr(lang, "brand.name"),
        short_name: tr(lang, "app.short_name"),
        description: pick(st.store, "tagline", lang),
        lang, dir,
        start_url: `/${lang}?source=app`,
        scope: "/",
        display: "standalone",
        orientation: "any",
        theme_color: THEME.light,
        background_color: THEME.background,
        categories: ["shopping", "business"],
        icons: [png("icon-192.png", 192, "any"), png("icon-512.png", 512, "any"), png("maskable-192.png", 192, "maskable"), png("maskable-512.png", 512, "maskable")],
        screenshots: screenshots(),
        shortcuts: [
          { name: tr(lang, "nav.cart"), url: `/${lang}/cart?source=app`, icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
          { name: tr(lang, "nav.track"), url: `/${lang}/track?source=app`, icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
          { name: tr(lang, "nav.categories"), url: `/${lang}/categories?source=app`, icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
          { name: tr(lang, "nav.deals"), url: `/${lang}/products?flag=deals&source=app`, icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
        ],
        ...related,
      }
    : {
        id: "/admin",
        name: tr(lang, "app.admin_name"),
        short_name: tr(lang, "app.admin_short"),
        description: tr(lang, "app.admin_desc"),
        lang, dir,
        start_url: "/admin",
        scope: "/admin",
        display: "standalone",
        orientation: "any",
        theme_color: THEME.light,
        background_color: THEME.light,
        categories: ["business", "productivity"],
        icons: [png("admin-192.png", 192, "any"), png("admin-512.png", 512, "any"), png("admin-maskable-512.png", 512, "maskable")],
        shortcuts: [
          { name: tr(lang, "app.sc_pos"), url: "/admin/pos", icons: [{ src: "/icons/admin-192.png", sizes: "192x192" }] },
          { name: tr(lang, "app.sc_orders"), url: "/admin/orders", icons: [{ src: "/icons/admin-192.png", sizes: "192x192" }] },
          { name: tr(lang, "app.sc_inventory"), url: "/admin/inventory", icons: [{ src: "/icons/admin-192.png", sizes: "192x192" }] },
        ],
      };
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

/** <head> tags that make a page installable and look right as a home-screen app on iOS and Android. */
export function appHeadTags(lang: Lang, kind: "store" | "admin"): string {
  const p = kind === "admin" ? "admin-" : "";
  const title = tr(lang, kind === "admin" ? "app.admin_short" : "app.short_name");
  return [
    `<link rel="manifest" href="/${kind === "admin" ? "admin" : "manifest"}.webmanifest?lang=${lang}">`,
    `<meta name="theme-color" content="${THEME.light}" media="(prefers-color-scheme: light)">`,
    `<meta name="theme-color" content="${THEME.dark}" media="(prefers-color-scheme: dark)">`,
    `<link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png">`,
    `<link rel="apple-touch-icon" href="/icons/${p}apple-touch-icon.png">`,
    `<meta name="mobile-web-app-capable" content="yes">`,
    `<meta name="apple-mobile-web-app-capable" content="yes">`,
    // store: dark header runs under the status bar (padded by safe-area-inset-top); admin: light top bar, plain status bar
    `<meta name="apple-mobile-web-app-status-bar-style" content="${kind === "admin" ? "default" : "black-translucent"}">`,
    `<meta name="apple-mobile-web-app-title" content="${title.replace(/"/g, "&quot;")}">`,
    `<meta name="format-detection" content="telephone=no">`,
  ].join("\n");
}

let swCache: { key: string; body: string } | null = null;
/**
 * The service worker. Its text embeds the build id, so every deploy installs a new worker that precaches the
 * new bundles and drops the old caches. Prices, stock, cart, checkout, accounts and the admin API are never
 * served from cache.
 */
export function serviceWorker(): Response {
  const manifestFile = join(ROOT, "dist/manifest.json");
  const build = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) : { built_at: "dev" };
  const key = String(build.built_at);
  if (!swCache || swCache.key !== key || !isProd) {
    const assets = existsSync(DIST_ASSETS) ? readdirSync(DIST_ASSETS).filter((f) => /\.(js|css)$/.test(f)).map((f) => `/assets/${f}`) : [];
    const version = Bun.hash(key + assets.join(",")).toString(36);
    swCache = { key, body: SW_SOURCE.replace("__VERSION__", version).replace("__PRECACHE__", JSON.stringify(["/offline.html", "/icons/icon-192.png", ...assets])) };
  }
  return new Response(swCache.body, {
    headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-cache", "service-worker-allowed": "/", "x-content-type-options": "nosniff" },
  });
}

const SW_SOURCE = `/* شركة جناح الريادة — service worker (generated) */
const VERSION = "__VERSION__";
const SHELL = "shell-" + VERSION, PAGES = "pages-v1", MEDIA = "media-v1", FONTS = "fonts-v1";
const PRECACHE = __PRECACHE__;
// Public catalogue pages may be shown from cache when offline. Personal pages (account, cart, checkout,
// orders, invoices, sign-in) are never stored, so nothing private stays on a shared device.
const CACHEABLE_PAGE = /^\\/(ar|en|ur)(\\/(products|categories|brands|search|faq|contact|c\\/[^/]+|brand\\/[^/]+|p\\/[^/]+|page\\/[^/]+))?\\/?$/;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("shell-") && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("message", (e) => {
  // sent on sign-out: forget cached pages, which can show the signed-in name and cart count
  if (e.data === "clear-pages") e.waitUntil(caches.delete(PAGES));
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

async function cacheFirst(req, cacheName, max) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && (res.type === "basic" || res.type === "cors")) { c.put(req, res.clone()); if (max) trim(cacheName, max); }
  return res;
}

async function page(req, url) {
  try {
    const res = await fetch(req);
    if (res.ok && res.type === "basic" && CACHEABLE_PAGE.test(url.pathname)) {
      const c = await caches.open(PAGES);
      c.put(url.pathname + url.search, res.clone());
      trim(PAGES, 60);
    }
    return res;
  } catch (err) {
    const cached = CACHEABLE_PAGE.test(url.pathname) ? await caches.match(url.pathname + url.search, { cacheName: PAGES }) : null;
    return cached || (await caches.match("/offline.html")) || Response.error();
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (req.mode === "navigate") {
      if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/pay/") || url.pathname.startsWith("/media/")) return;
      e.respondWith(page(req, url));
      return;
    }
    if (url.pathname.startsWith("/assets/")) { e.respondWith(cacheFirst(req, SHELL)); return; }
    if (url.pathname.startsWith("/media/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/screenshots/")) { e.respondWith(cacheFirst(req, MEDIA, 300)); return; }
    return; // API, /__data, manifests: always from the network
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") e.respondWith(cacheFirst(req, FONTS, 30));
});
`;

/** Shown by the service worker when a page is requested offline and is not in the cache. Self-contained, three languages. */
export function offlinePage(): Response {
  const block = (lang: Lang) => `<section lang="${lang}" dir="${lang === "en" ? "ltr" : "rtl"}"><h1>${tr(lang, "app.offline_title")}</h1><p>${tr(lang, "app.offline_text")}</p></section>`;
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${tr("ar", "app.offline_title")}</title><meta name="theme-color" content="${THEME.light}"><link rel="icon" href="/icons/favicon-32.png">
<style>
:root{color-scheme:light dark}
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;display:flex;flex-direction:column;font:16px/1.6 "IBM Plex Sans Arabic","Noto Naskh Arabic","Segoe UI",Tahoma,sans-serif;background:#eceeed;color:#17202a}
header{background:#17202a;color:#f2f4f3;padding:calc(14px + env(safe-area-inset-top)) 20px 14px;display:flex;align-items:center;gap:10px;font-weight:700;font-size:18px}
.stripe{height:4px;background:linear-gradient(90deg,#8a4b2a 0 20%,#17202a 20% 40%,#8f969c 40% 60%,#1d57b0 60% 80%,#2e8b57 80%)}
main{flex:1;width:100%;max-width:560px;margin:0 auto;padding:32px 20px}
section{background:#fff;border:1px solid #d3d8d5;border-radius:6px;padding:16px 18px;margin-bottom:12px}
section[lang=ur]{font-family:"Noto Naskh Arabic","IBM Plex Sans Arabic",serif;line-height:1.9}
h1{font-size:19px;margin:0 0 4px}p{margin:0;color:#56616c}
a.btn{display:block;text-align:center;background:#a4511f;color:#fff;text-decoration:none;font-weight:700;border-radius:6px;padding:12px;margin-top:8px}
@media (prefers-color-scheme:dark){body{background:#10161c;color:#e8ecea}section{background:#18212a;border-color:#2b3743}p{color:#a3adb6}a.btn{background:#e39a5b;color:#17202a}}
</style></head><body>
<header><svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><rect width="32" height="32" rx="5" fill="#e39a5b"/><path d="M18 4 8 18h7l-2 10 11-15h-7z" fill="#17202a"/></svg>${tr("ar", "brand.name")}</header>
<div class="stripe"></div>
<main>${block("ar")}${block("en")}${block("ur")}<a class="btn" href="/">${tr("ar", "app.retry")} / ${tr("en", "app.retry")} / ${tr("ur", "app.retry")}</a></main>
</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
}

/**
 * /.well-known/assetlinks.json — proves to Android that the Play Store package may show this site without a
 * browser bar (Trusted Web Activity). Set ANDROID_APP_PACKAGE and ANDROID_APP_SHA256 (the signing certificate
 * fingerprint from Play Console → App integrity; several may be comma-separated).
 */
export function assetLinks(): Response | null {
  if (!config.ANDROID_APP_PACKAGE || !config.ANDROID_APP_SHA256) return null;
  const fingerprints = config.ANDROID_APP_SHA256.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const body = [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: config.ANDROID_APP_PACKAGE, sha256_cert_fingerprints: fingerprints } }];
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json", "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" } });
}
