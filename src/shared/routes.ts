/** Storefront page routes shared by the server renderer and the client router. */
export const ROUTES = [
  { name: "home", path: "/:lang" },
  { name: "listing", path: "/:lang/products" },
  { name: "categories", path: "/:lang/categories" },
  { name: "category", path: "/:lang/c/:slug" },
  { name: "brands", path: "/:lang/brands" },
  { name: "brand", path: "/:lang/brand/:slug" },
  { name: "search", path: "/:lang/search" },
  { name: "product", path: "/:lang/p/:slug" },
  { name: "cart", path: "/:lang/cart" },
  { name: "checkout", path: "/:lang/checkout" },
  { name: "order", path: "/:lang/order/:number" },
  { name: "invoice", path: "/:lang/invoice/:number" },
  { name: "track", path: "/:lang/track" },
  { name: "login", path: "/:lang/login" },
  { name: "register", path: "/:lang/register" },
  { name: "forgot", path: "/:lang/forgot-password" },
  { name: "reset", path: "/:lang/reset-password" },
  { name: "account", path: "/:lang/account" },
  { name: "account_orders", path: "/:lang/account/orders" },
  { name: "account_addresses", path: "/:lang/account/addresses" },
  { name: "account_wishlist", path: "/:lang/account/wishlist" },
  { name: "account_tickets", path: "/:lang/account/tickets" },
  { name: "account_ticket", path: "/:lang/account/tickets/:number" },
  { name: "contact", path: "/:lang/contact" },
  { name: "faq", path: "/:lang/faq" },
  { name: "page", path: "/:lang/page/:slug" },
] as const;

export type RouteName = (typeof ROUTES)[number]["name"] | "not_found";

const compiled = ROUTES.map((r) => {
  const keys: string[] = [];
  const re = new RegExp("^" + r.path.replace(/:([a-z]+)/g, (_m, k) => { keys.push(k); return k === "lang" ? "(ar|en|ur)" : "([^/]+)"; }) + "/?$");
  return { name: r.name, re, keys };
});

export function matchRoute(pathname: string): { name: RouteName; params: Record<string, string> } | null {
  for (const r of compiled) {
    const m = r.re.exec(pathname);
    if (!m) continue;
    const params: Record<string, string> = {};
    r.keys.forEach((k, i) => { try { params[k] = decodeURIComponent(m[i + 1]!); } catch { params[k] = m[i + 1]!; } });
    return { name: r.name, params };
  }
  return null;
}

export interface PageMeta {
  title: string;
  description?: string;
  canonical?: string;      // path without language prefix handling — full path
  image?: string | null;
  noindex?: boolean;
  jsonld?: Record<string, unknown>[];
  alternates?: boolean;    // emit hreflang links (default true)
}
