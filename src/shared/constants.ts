export const LANGS = ["ar", "en", "ur"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "ar";
export const RTL_LANGS: Lang[] = ["ar", "ur"];
export const isLang = (v: unknown): v is Lang => typeof v === "string" && (LANGS as readonly string[]).includes(v);
export const dirOf = (l: Lang) => (RTL_LANGS.includes(l) ? "rtl" : "ltr");
export const LANG_NAMES: Record<Lang, string> = { ar: "العربية", en: "English", ur: "اردو" };
export const HTML_LANG: Record<Lang, string> = { ar: "ar-SA", en: "en-SA", ur: "ur" };

export const ORDER_STATUSES = [
  "pending", "confirmed", "processing", "ready_for_shipment", "shipped",
  "out_for_delivery", "delivered", "cancelled", "returned", "refunded",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Allowed order status transitions. */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["ready_for_shipment", "cancelled"],
  ready_for_shipment: ["shipped", "delivered", "cancelled"],
  shipped: ["out_for_delivery", "delivered", "returned"],
  out_for_delivery: ["delivered", "returned"],
  delivered: ["returned"],
  cancelled: ["refunded"],
  returned: ["refunded"],
  refunded: [],
};
/** The happy-path steps shown on the customer tracking timeline. */
export const TRACK_STEPS: OrderStatus[] = ["pending", "confirmed", "processing", "ready_for_shipment", "shipped", "out_for_delivery", "delivered"];

export const PERMISSIONS = [
  "dashboard.view", "orders.view", "orders.manage", "pos.use",
  "products.view", "products.manage", "catalog.manage",
  "inventory.view", "inventory.manage",
  "customers.view", "customers.manage",
  "promotions.manage", "reviews.manage",
  "payments.view", "payments.refund", "shipping.manage", "returns.manage",
  "invoices.view", "reports.view", "content.manage", "settings.manage",
  "tickets.manage", "users.manage", "logs.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const SYSTEM_ROLES: { key: string; name: string; permissions: string[] }[] = [
  { key: "super_admin", name: "Super admin", permissions: ["*"] },
  { key: "manager", name: "Store manager", permissions: PERMISSIONS.filter((p) => p !== "users.manage" && p !== "settings.manage") },
  { key: "sales", name: "Sales & orders", permissions: ["dashboard.view", "orders.view", "orders.manage", "pos.use", "products.view", "customers.view", "inventory.view", "invoices.view", "returns.manage", "tickets.manage", "payments.view"] },
  { key: "inventory", name: "Inventory keeper", permissions: ["dashboard.view", "products.view", "products.manage", "catalog.manage", "inventory.view", "inventory.manage"] },
  { key: "accountant", name: "Accountant", permissions: ["dashboard.view", "orders.view", "payments.view", "payments.refund", "invoices.view", "reports.view", "customers.view"] },
  { key: "support", name: "Customer support", permissions: ["orders.view", "customers.view", "tickets.manage", "reviews.manage", "products.view"] },
];

export const CURRENCY = "SAR";
/** Calendar date in Saudi time (UTC+3, no daylight saving), whatever the server's own time zone is. Used for document numbering and tax periods. */
export function riyadhDate(d: Date = new Date()): { year: number; month: number; day: number } {
  const l = new Date(d.getTime() + 3 * 3600_000);
  return { year: l.getUTCFullYear(), month: l.getUTCMonth() + 1, day: l.getUTCDate() };
}

/** Format halalas as a SAR amount string, e.g. 12345 → "123.45". */
export function sar(h: number | null | undefined): string {
  const v = Math.round(Number(h ?? 0));
  const sign = v < 0 ? "-" : "";
  const a = Math.abs(v);
  return `${sign}${Math.floor(a / 100).toLocaleString("en-US")}.${String(a % 100).padStart(2, "0")}`;
}
/** Parse a user-entered SAR amount ("12.5", "١٢٫٥") into halalas. */
export function toHalalas(v: string | number): number {
  if (typeof v === "number") return Math.round(v * 100);
  const s = v.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[٫,]/g, ".").replace(/[^\d.\-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}
export const pick = <T extends Record<string, any>>(row: T | null | undefined, field: string, lang: Lang): string =>
  (row?.[`${field}_${lang}`] || row?.[`${field}_ar`] || row?.[`${field}_en`] || "") as string;

/** Saudi mobile numbers → E.164 (+9665XXXXXXXX). Returns null when invalid. */
export function normalizePhone(input: string): string | null {
  const d = input.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x660)).replace(/[^\d+]/g, "");
  let m = d.replace(/^\+/, "").replace(/^00/, "");
  if (m.startsWith("966")) m = m.slice(3);
  if (m.startsWith("0")) m = m.slice(1);
  if (/^5\d{8}$/.test(m)) return `+966${m}`;
  // other valid international numbers
  if (d.startsWith("+") && /^\+\d{8,15}$/.test(d)) return d;
  return null;
}
export function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9؀-ۿ]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
}
