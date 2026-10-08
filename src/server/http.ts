import type { ZodType } from "zod";
import { DEFAULT_LANG, isLang, type Lang } from "../shared/constants";
import { tr } from "../shared/i18n";
import { buildXlsx } from "./xlsx";

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string, public details?: unknown) {
    super(message ?? code);
  }
}
export const bad = (code: string, details?: unknown) => new HttpError(400, code, undefined, details);
export const notFound = (code = "not_found") => new HttpError(404, code);
export const forbidden = (code = "forbidden") => new HttpError(403, code);
export const unauthorized = (code = "unauthorized") => new HttpError(401, code);
export const conflict = (code: string, details?: unknown) => new HttpError(409, code, undefined, details);

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  kind: "customer" | "admin";
  locale: Lang;
  customer_id: number | null;
  role: string | null;
  permissions: string[];
  session_id: number;
}

export interface Ctx {
  req: Request;
  url: URL;
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  ip: string;
  lang: Lang;
  cookies: Record<string, string>;
  user: AuthUser | null;
  setCookies: string[];
  nonce: string;
  body<T>(schema: ZodType<T, any, any>): Promise<T>;
  can(perm: string): boolean;
}

export type Handler = (c: Ctx) => Promise<Response | object | void> | Response | object | void;
export interface RouteOpts {
  auth?: "user" | "admin";
  perm?: string;
  rate?: "auth" | "write" | "search" | "default";
  csrf?: boolean;
}
interface Route { method: string; re: RegExp; keys: string[]; handler: Handler; opts: RouteOpts }

export class Router {
  routes: Route[] = [];
  add(method: string, pattern: string, handler: Handler, opts: RouteOpts = {}) {
    const keys: string[] = [];
    const re = new RegExp(
      "^" + pattern.replace(/\/:([a-zA-Z_]+)(\*)?/g, (_m, k, star) => { keys.push(k); return star ? "/(.+)" : "/([^/]+)"; }) + "/?$",
    );
    this.routes.push({ method, re, keys, handler, opts });
    return this;
  }
  get = (p: string, h: Handler, o?: RouteOpts) => this.add("GET", p, h, o);
  post = (p: string, h: Handler, o?: RouteOpts) => this.add("POST", p, h, o);
  put = (p: string, h: Handler, o?: RouteOpts) => this.add("PUT", p, h, o);
  patch = (p: string, h: Handler, o?: RouteOpts) => this.add("PATCH", p, h, o);
  delete = (p: string, h: Handler, o?: RouteOpts) => this.add("DELETE", p, h, o);

  match(method: string, path: string): { route: Route; params: Record<string, string> } | "method" | null {
    let pathMatched = false;
    for (const route of this.routes) {
      const m = route.re.exec(path);
      if (!m) continue;
      pathMatched = true;
      if (route.method !== method) continue;
      const params: Record<string, string> = {};
      route.keys.forEach((k, i) => { try { params[k] = decodeURIComponent(m[i + 1]!); } catch { params[k] = m[i + 1]!; } });
      return { route, params };
    }
    return pathMatched ? "method" : null;
  }
}

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore malformed */ }
  }
  return out;
}

export function cookie(name: string, value: string, o: { maxAge?: number; httpOnly?: boolean; secure?: boolean; sameSite?: "Lax" | "Strict" } = {}): string {
  let c = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=${o.sameSite ?? "Lax"}`;
  if (o.maxAge !== undefined) c += `; Max-Age=${o.maxAge}`;
  if (o.httpOnly !== false) c += "; HttpOnly";
  if (o.secure) c += "; Secure";
  return c;
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
}

export function errorResponse(e: unknown, lang: Lang): Response {
  if (e instanceof HttpError) {
    const key = `err.${e.code}`;
    const d = e.details as Record<string, unknown> | undefined;
    const msg = tr(lang, key, d && typeof d.available === "number" ? { available: d.available } : undefined);
    return json({ error: { code: e.code, message: msg === key ? e.message : msg, details: e.details } }, e.status);
  }
  return json({ error: { code: "internal", message: tr(lang, "err.internal") } }, 500);
}

const MAX_JSON = 1024 * 1024;
export async function readJson(req: Request): Promise<unknown> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_JSON) throw new HttpError(413, "payload_too_large");
  const text = await req.text();
  if (text.length > MAX_JSON) throw new HttpError(413, "payload_too_large");
  if (!text) return {};
  try { return JSON.parse(text); } catch { throw bad("invalid_json"); }
}

export function validate<T>(schema: ZodType<T, any, any>, data: unknown): T {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  const fields: Record<string, string> = {};
  for (const i of r.error.issues) fields[i.path.join(".") || "_"] ??= issueCode(i);
  throw new HttpError(422, "validation", "Validation failed", { fields });
}

/** Maps a zod issue to a stable, translatable code (dictionary key `v.<code>`). Schemas may set their own code as the message. */
function issueCode(i: { code: string; message: string; [k: string]: any }): string {
  if (/^[a-z][a-z0-9_]*$/.test(i.message)) return i.message;
  switch (i.code) {
    case "invalid_type": return i.received === "undefined" || i.received === "null" ? "required" : "invalid";
    case "too_small": return i.type === "string" ? (i.minimum <= 1 ? "required" : "too_short") : i.type === "array" ? "required" : "too_small";
    case "too_big": return i.type === "string" ? "too_long" : "too_big";
    case "invalid_string": return i.validation === "email" ? "invalid_email" : i.validation === "url" ? "invalid_url" : "invalid_format";
    case "invalid_enum_value": case "invalid_literal": case "invalid_union": return "invalid_choice";
    default: return "invalid";
  }
}

export function langFrom(req: Request, cookies: Record<string, string>, path?: string): Lang {
  const seg = path?.split("/")[1];
  if (isLang(seg)) return seg;
  const h = req.headers.get("x-lang");
  if (isLang(h)) return h;
  if (isLang(cookies.lang)) return cookies.lang;
  return DEFAULT_LANG;
}

export function csvResponse(filename: string, rows: (string | number | null | undefined)[][]): Response {
  const esc = (v: string | number | null | undefined) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = "'" + s; // neutralise spreadsheet formulas
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
  return new Response(body, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename}"`, "cache-control": "no-store" } });
}

export function pageParams(q: URLSearchParams, defPer = 20, maxPer = 100) {
  const page = Math.max(1, Math.floor(Number(q.get("page")) || 1));
  const per = Math.min(maxPer, Math.max(1, Math.floor(Number(q.get("per")) || defPer)));
  return { page, per, offset: (page - 1) * per };
}

/** True when the request asks for a file export (`?format=csv` or `?format=xlsx`). */
export const isExport = (c: Ctx) => c.query.get("format") === "csv" || c.query.get("format") === "xlsx";

/** Sends `rows` (first row = headers) as CSV or XLSX depending on `?format=`. `filename` may end in .csv; the extension is adjusted. */
export function exportResponse(c: Ctx, filename: string, rows: (string | number | null | undefined)[][]): Response {
  if (c.query.get("format") !== "xlsx") return csvResponse(filename.replace(/\.xlsx$/, ".csv"), rows);
  const name = filename.replace(/\.csv$/, "") + ".xlsx";
  return new Response(buildXlsx(rows, name.replace(/\.xlsx$/, "")), {
    headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
  });
}
