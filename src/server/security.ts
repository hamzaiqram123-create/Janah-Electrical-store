import { config, isProd, isTest } from "./config";
import { HttpError, type Ctx, type RouteOpts } from "./http";

/** Fixed-window in-memory rate limiter. For multi-instance deployments put a shared limiter (e.g. at the load balancer) in front. */
const LIMITS: Record<NonNullable<RouteOpts["rate"]>, [max: number, windowSec: number]> = {
  auth: [10, 60],
  write: [90, 60],
  search: [180, 60],
  default: [900, 60],
};
const buckets = new Map<string, { n: number; reset: number }>();

export function rateLimit(ip: string, kind: NonNullable<RouteOpts["rate"]>) {
  const [max, win] = LIMITS[kind];
  const key = `${kind}:${ip}`;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset < now) { b = { n: 0, reset: now + win * 1000 }; buckets.set(key, b); }
  b.n++;
  if (b.n > max) throw new HttpError(429, "rate_limited", undefined, { retry_after: Math.ceil((b.reset - now) / 1000) });
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k); }, 60_000).unref?.();

export function clientIp(req: Request, server: { requestIP(req: Request): { address: string } | null }): string {
  if (config.TRUST_PROXY) {
    const dedicated = config.CLIENT_IP_HEADER ? req.headers.get(config.CLIENT_IP_HEADER)?.trim() : undefined;
    if (dedicated) return dedicated;
    const xff = req.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim();
  }
  return server.requestIP(req)?.address ?? "unknown";
}

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);
const appOrigin = new URL(config.APP_URL).origin;

/** CSRF defence: same-origin check plus double-submit token (cookie `csrf` must equal header `x-csrf-token`). */
export function checkCsrf(c: Ctx) {
  if (SAFE.has(c.method)) return;
  const origin = c.req.headers.get("origin");
  if (origin && origin !== appOrigin && origin !== c.url.origin && !(isTest || !isProd && origin.startsWith("http://localhost"))) {
    throw new HttpError(403, "csrf");
  }
  const header = c.req.headers.get("x-csrf-token");
  if (!header || !c.cookies.csrf || header !== c.cookies.csrf) throw new HttpError(403, "csrf");
}

export function randomToken(bytes = 32): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("base64url");
}
export function sha256(input: string): string {
  return new Bun.CryptoHasher("sha256").update(input).digest("hex");
}

export function securityHeaders(nonce: string, html: boolean): Record<string, string> {
  const h: Record<string, string> = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "x-frame-options": "DENY",
    "permissions-policy": "camera=(self), microphone=(), geolocation=()",
    "cross-origin-opener-policy": "same-origin",
  };
  if (isProd) h["strict-transport-security"] = "max-age=31536000; includeSubDomains";
  if (html) {
    h["content-security-policy"] = [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "media-src 'self' https:",
      "frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; ");
  }
  return h;
}
