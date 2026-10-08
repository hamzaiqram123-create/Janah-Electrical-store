import { renderToString } from "react-dom/server";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { config, isProd } from "./config";
import type { Ctx } from "./http";
import { dirOf, HTML_LANG, LANGS, type Lang } from "../shared/constants";
import { matchRoute, type PageMeta, type RouteName } from "../shared/routes";
import { loaders, shellData } from "./loaders";
import { App } from "../web/App";
import { dicts, tr } from "../shared/i18n";

const DIST = join(import.meta.dir, "../../dist");
let manifest: { app: string; admin: string; css: string } | null = null;
export function assets() {
  if (!manifest || !isProd) {
    const file = join(DIST, "manifest.json");
    if (!existsSync(file)) throw new Error("dist/manifest.json not found — run `bun run build` first");
    manifest = JSON.parse(readFileSync(file, "utf8"));
  }
  return manifest!;
}

const base = config.APP_URL.replace(/\/$/, "");
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
/** JSON safe for embedding inside <script> */
const safeJson = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

const FONTS = "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Noto+Naskh+Arabic:wght@400;500;600;700&display=swap";
const FAVICON = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#17202a"/><path d="M18 4 8 18h7l-2 10 11-15h-7z" fill="#e39a5b"/></svg>`)}`;

function head(lang: Lang, path: string, search: string, meta: PageMeta, nonce: string): string {
  const a = assets();
  const canonical = `${base}${meta.canonical ?? path}${meta.noindex ? "" : pageParam(search)}`;
  const rest = path.replace(/^\/(ar|en|ur)/, "");
  const alternates = meta.noindex || meta.alternates === false ? "" :
    LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${esc(`${base}/${l}${rest}`)}">`).join("") + `<link rel="alternate" hreflang="x-default" href="${esc(`${base}/ar${rest}`)}">`;
  const ld = (meta.jsonld ?? []).map((j) => `<script type="application/ld+json">${safeJson(j)}</script>`).join("");
  const ogLocale = { ar: "ar_SA", en: "en_US", ur: "ur_PK" }[lang];
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(meta.title)}</title>
${meta.description ? `<meta name="description" content="${esc(meta.description)}">` : ""}
${meta.noindex ? `<meta name="robots" content="noindex, nofollow">` : `<link rel="canonical" href="${esc(canonical)}">`}
${alternates}
<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(tr(lang, "brand.name"))}">
<meta property="og:title" content="${esc(meta.title)}">${meta.description ? `<meta property="og:description" content="${esc(meta.description)}">` : ""}
<meta property="og:url" content="${esc(canonical)}"><meta property="og:locale" content="${ogLocale}">
${meta.image ? `<meta property="og:image" content="${esc(meta.image)}"><meta name="twitter:card" content="summary_large_image">` : `<meta name="twitter:card" content="summary">`}
<meta name="theme-color" content="#17202a">
<link rel="icon" href="${FAVICON}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="/assets/${a.css}">
<script nonce="${nonce}">(function(){try{var m=document.cookie.match(/(?:^|; )theme=(dark|light)/);var t=m?m[1]:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");if(t==="dark")document.documentElement.classList.add("dark")}catch(e){}})()</script>
${ld}`;
}
function pageParam(search: string): string {
  const p = new URLSearchParams(search).get("page");
  return p && p !== "1" ? `?page=${encodeURIComponent(p)}` : "";
}

export interface PagePayload { route: { name: RouteName; params: Record<string, string>; path: string; search: string }; data: any; meta: PageMeta; shell?: any }

/** Runs the route loader for a storefront path. Used for full page renders and for client-side navigations (/__data). */
export async function loadPage(c: Ctx, pathname: string, search: string): Promise<{ payload?: PagePayload; redirect?: string; status: number }> {
  const m = matchRoute(pathname) ?? { name: "not_found" as RouteName, params: { lang: c.lang } };
  const res = await loaders[m.name](c, m.params, new URLSearchParams(search));
  if (res.redirect) return { redirect: res.redirect, status: 302 };
  const name = res.status === 404 ? "not_found" : m.name;
  return { payload: { route: { name, params: m.params, path: pathname, search }, data: res.data, meta: res.meta }, status: res.status ?? (m.name === "not_found" ? 404 : 200) };
}

export async function renderPage(c: Ctx): Promise<Response> {
  const { payload, redirect, status } = await loadPage(c, c.path, c.url.search);
  if (redirect) return new Response(null, { status: 302, headers: { location: redirect } });
  const lang = c.lang;
  payload!.shell = await shellData(c);
  const theme = c.cookies.theme === "dark" ? "dark" : "";
  const html = renderToString(<App initial={payload as any} dict={dicts[lang]} />);
  const a = assets();
  const doc = `<!doctype html>
<html lang="${HTML_LANG[lang]}" dir="${dirOf(lang)}" class="${theme}" data-lang="${lang}">
<head>
${head(lang, c.path, c.url.search, payload!.meta, c.nonce)}
</head>
<body>
<div id="root">${html}</div>
<script id="__DATA__" type="application/json">${safeJson(payload)}</script>
<script type="module" src="/assets/${a.app}"></script>
</body>
</html>`;
  return new Response(doc, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
}

export function adminShell(c: Ctx): Response {
  const a = assets();
  const lang = c.lang;
  const doc = `<!doctype html>
<html lang="${HTML_LANG[lang]}" dir="${dirOf(lang)}" data-lang="${lang}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(tr(lang, "admin.title"))}</title><meta name="robots" content="noindex, nofollow">
<link rel="icon" href="${FAVICON}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}"><link rel="stylesheet" href="/assets/${a.css}">
<script nonce="${c.nonce}">(function(){try{var m=document.cookie.match(/(?:^|; )theme=(dark|light)/);if(m&&m[1]==="dark")document.documentElement.classList.add("dark")}catch(e){}})()</script>
</head>
<body><div id="admin-root"></div><script type="module" src="/assets/${a.admin}"></script></body>
</html>`;
  return new Response(doc, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
