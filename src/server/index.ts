import { existsSync } from "fs";
import { join } from "path";
import { config, isProd } from "./config";
import { closeDb } from "./db";
import { errMeta, log } from "./logger";
import { cookie, errorResponse, forbidden, HttpError, json, langFrom, parseCookies, readJson, Router, unauthorized, validate, type Ctx } from "./http";
import { checkCsrf, clientIp, randomToken, rateLimit, securityHeaders } from "./security";
import { authenticate, hasPermission } from "./auth";
import { registerAuthApi } from "./api/auth";
import { registerStoreApi } from "./api/store";
import { registerWebhooks } from "./api/webhooks";
import { registerResourceApi } from "./api/admin/resources";
import { registerCatalogAdminApi } from "./api/admin/catalog";
import { registerOrdersAdminApi } from "./api/admin/orders";
import { registerReportsApi } from "./api/admin/reports";
import { registerMiscAdminApi } from "./api/admin/misc";
import { adminShell, loadPage, renderPage } from "./ssr";
import { shellData } from "./loaders";
import { robotsTxt, sitemapXml } from "./seo";
import { serveMedia } from "./services/storage";
import { startJobs } from "./jobs";
import { DEFAULT_LANG, isLang, LANGS } from "../shared/constants";
import { matchRoute } from "../shared/routes";

const router = new Router();
registerAuthApi(router);
registerStoreApi(router);
registerWebhooks(router);
registerCatalogAdminApi(router);
registerResourceApi(router);
registerOrdersAdminApi(router);
registerReportsApi(router);
registerMiscAdminApi(router);
router.get("/api/health", () => ({ ok: true, time: new Date().toISOString() }));

const DIST_ASSETS = join(import.meta.dir, "../../dist/assets");
const assetCache = new Map<string, { body: Uint8Array; gz: Uint8Array | null; type: string }>();
const MIME: Record<string, string> = { js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", map: "application/json", svg: "image/svg+xml", woff2: "font/woff2", png: "image/png", webp: "image/webp" };

async function serveAsset(name: string, acceptGzip: boolean): Promise<Response | null> {
  if (!/^[\w.-]+$/.test(name)) return null;
  let a = isProd ? assetCache.get(name) : undefined;
  if (!a) {
    const file = join(DIST_ASSETS, name);
    if (!existsSync(file)) return null;
    const body = new Uint8Array(await Bun.file(file).arrayBuffer());
    const type = MIME[name.split(".").pop()!] ?? "application/octet-stream";
    a = { body, type, gz: /javascript|css|json|svg/.test(type) ? Bun.gzipSync(body) : null };
    if (isProd) assetCache.set(name, a);
  }
  const headers: Record<string, string> = { "content-type": a.type, "cache-control": isProd ? "public, max-age=31536000, immutable" : "no-cache", "x-content-type-options": "nosniff" };
  if (acceptGzip && a.gz) { headers["content-encoding"] = "gzip"; headers.vary = "accept-encoding"; return new Response(a.gz, { headers }); }
  return new Response(a.body, { headers });
}

async function finalize(c: Ctx, res: Response, started: number): Promise<Response> {
  const type = res.headers.get("content-type") ?? "";
  const html = type.startsWith("text/html");
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(securityHeaders(c.nonce, html))) if (!headers.has(k)) headers.set(k, v);
  if (!c.cookies.csrf && !c.setCookies.some((s) => s.startsWith("csrf=")) && (html || c.path.startsWith("/api/"))) {
    c.setCookies.push(cookie("csrf", randomToken(18), { maxAge: 86400 * config.SESSION_DAYS, httpOnly: false, secure: isProd }));
  }
  for (const sc of c.setCookies) headers.append("set-cookie", sc);
  let body: BodyInit | null = res.body;
  // compress text responses
  if (res.body && !headers.has("content-encoding") && /^(text\/html|application\/json|text\/csv|application\/xml|text\/plain)/.test(type) && (c.req.headers.get("accept-encoding") ?? "").includes("gzip")) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > 1024) { body = Bun.gzipSync(buf); headers.set("content-encoding", "gzip"); headers.append("vary", "accept-encoding"); }
    else body = buf;
  }
  if (!c.path.startsWith("/assets/") && !c.path.startsWith("/media/")) {
    log[res.status >= 500 ? "error" : "info"]("request", { method: c.method, path: c.path, status: res.status, ms: Math.round(performance.now() - started), ip: c.ip, user: c.user?.id });
  }
  return new Response(body, { status: res.status, headers });
}

async function handle(c: Ctx): Promise<Response> {
  const { path, method } = c;

  if (path.startsWith("/assets/")) return (await serveAsset(path.slice(8), (c.req.headers.get("accept-encoding") ?? "").includes("gzip"))) ?? new Response("Not found", { status: 404 });
  if (path.startsWith("/media/")) return (await serveMedia(decodeURIComponent(path.slice(7)))) ?? new Response("Not found", { status: 404 });
  if (path === "/robots.txt") return new Response(robotsTxt(), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
  if (path === "/sitemap.xml") return new Response(await sitemapXml(), { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=600" } });
  if (path === "/favicon.ico") return new Response(null, { status: 204 });

  await authenticate(c);

  // ── REST API & server actions
  if (path.startsWith("/api/") || path === "/pay/return") {
    const m = router.match(method, path);
    if (m === "method") throw new HttpError(405, "method_not_allowed");
    if (!m) throw new HttpError(404, "not_found");
    const { route, params } = m;
    c.params = params;
    rateLimit(c.ip, route.opts.rate ?? (method === "GET" ? "default" : "write"));
    if (route.opts.csrf !== false) checkCsrf(c);
    if (route.opts.auth && !c.user) throw unauthorized();
    if (route.opts.auth === "admin") {
      if (c.user!.kind !== "admin") throw forbidden();
      if (route.opts.perm && !hasPermission(c.user, route.opts.perm)) throw forbidden("missing_permission");
    }
    const out = await route.handler(c);
    return out instanceof Response ? out : json(out ?? { ok: true });
  }

  if (method !== "GET" && method !== "HEAD") throw new HttpError(405, "method_not_allowed");

  // ── client-side navigation data
  if (path === "/__data") {
    const target = new URL(c.query.get("path") ?? "/", c.url.origin);
    if (target.origin !== c.url.origin) throw new HttpError(400, "bad_path");
    const seg = target.pathname.split("/")[1];
    const pageCtx: Ctx = { ...c, url: target, path: target.pathname, query: target.searchParams, lang: isLang(seg) ? seg : c.lang, setCookies: c.setCookies };
    const { payload, redirect } = await loadPage(pageCtx, target.pathname, target.search);
    if (redirect) return json({ redirect });
    const shell = await shellData(pageCtx);
    return json({ ...payload, shell: { user: shell.user, cart_count: shell.cart_count } });
  }

  // ── admin panel (client-rendered, access enforced by the API)
  if (path === "/admin" || path.startsWith("/admin/")) return adminShell(c);

  // ── storefront
  if (path === "/") return new Response(null, { status: 302, headers: { location: `/${isLang(c.cookies.lang) ? c.cookies.lang : DEFAULT_LANG}` } });
  const seg = path.split("/")[1];
  if (!isLang(seg)) {
    // tolerate links without a language prefix: /p/slug → /ar/p/slug
    const lang = isLang(c.cookies.lang) ? c.cookies.lang : DEFAULT_LANG;
    if (matchRoute(`/${lang}${path}`)) return new Response(null, { status: 302, headers: { location: `/${lang}${path}${c.url.search}` } });
  } else if (c.cookies.lang !== seg) {
    c.setCookies.push(cookie("lang", seg, { maxAge: 86400 * 365, httpOnly: false, secure: isProd }));
  }
  return renderPage(c);
}

const server = Bun.serve({
  port: config.PORT,
  maxRequestBodySize: 70 * 1024 * 1024,
  async fetch(req, srv) {
    const started = performance.now();
    const url = new URL(req.url);
    const cookies = parseCookies(req.headers.get("cookie"));
    const c: Ctx = {
      req, url, method: req.method, path: url.pathname.replace(/\/+$/, "") || "/", params: {}, query: url.searchParams,
      ip: clientIp(req, srv), cookies, lang: langFrom(req, cookies, url.pathname), user: null, setCookies: [], nonce: randomToken(12),
      body: async (schema) => validate(schema, await readJson(req)),
      can: (perm) => hasPermission(c.user, perm),
    };
    try {
      return await finalize(c, await handle(c), started);
    } catch (e) {
      if (!(e instanceof HttpError)) log.error("unhandled error", { method: c.method, path: c.path, ...errMeta(e) });
      const wantsHtml = !c.path.startsWith("/api/") && c.path !== "/__data" && (req.headers.get("accept") ?? "").includes("text/html");
      const status = e instanceof HttpError ? e.status : 500;
      const res = wantsHtml
        ? new Response(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>${status}</title><body style="font-family:system-ui;padding:3rem;text-align:center"><h1>${status}</h1><p>حدث خطأ غير متوقع. حاول مرة أخرى بعد قليل.</p><p>Something went wrong. Please try again shortly.</p><p><a href="/">الرئيسية / Home</a></p></body></html>`, { status, headers: { "content-type": "text/html; charset=utf-8" } })
        : errorResponse(e, c.lang);
      if (e instanceof HttpError && e.status === 429) res.headers.set("retry-after", String((e.details as any)?.retry_after ?? 60));
      return finalize(c, res, started);
    }
  },
  error(e) {
    log.error("server error", errMeta(e));
    return new Response("Internal Server Error", { status: 500 });
  },
});

log.info("server started", { url: `http://localhost:${server.port}`, env: config.NODE_ENV, langs: LANGS });
startJobs();

const shutdown = async () => {
  log.info("shutting down");
  await server.stop();
  await closeDb().catch(() => {});
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
