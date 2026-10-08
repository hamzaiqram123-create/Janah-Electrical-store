import { expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { ar } from "../src/shared/i18n/ar";
import { en } from "../src/shared/i18n/en";
import { ur } from "../src/shared/i18n/ur";
import { ar as aar } from "../src/shared/i18n/admin/ar";
import { en as aen } from "../src/shared/i18n/admin/en";
import { ur as aur } from "../src/shared/i18n/admin/ur";

const walk = (dir: string, out: string[] = []): string[] => {
  for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p, out); else if (/\.tsx?$/.test(n)) out.push(p); }
  return out;
};
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

for (const [name, a, b, c] of [["store", ar, en, ur], ["admin", aar, aen, aur]] as const) {
  test(`${name} dictionaries have identical keys in Arabic, English and Urdu`, () => {
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    expect(Object.keys(c).sort()).toEqual(Object.keys(b).sort());
  });
  test(`${name} dictionaries use the same placeholders and have no empty strings`, () => {
    for (const k of Object.keys(b)) {
      expect(a[k]!.trim().length, k).toBeGreaterThan(0);
      expect(c[k]!.trim().length, k).toBeGreaterThan(0);
      expect(placeholders(a[k]!), `ar ${k}`).toBe(placeholders(b[k]!));
      expect(placeholders(c[k]!), `ur ${k}`).toBe(placeholders(b[k]!));
    }
  });
}

test("every translation key referenced in the UI exists", () => {
  const root = join(import.meta.dir, "../src");
  const store = { ...en }, admin = { ...en, ...aen };
  const missing: string[] = [];
  for (const [dir, dict] of [["web", store], ["admin", admin]] as const) {
    for (const file of walk(join(root, dir))) {
      const src = readFileSync(file, "utf8");
      // t("key"), <L k="key" />, label: "key", hint: "key", title/intro: "key" and string literals that look like keys
      for (const m of src.matchAll(/"((?:a|c|nav|top|search|home|hero|why|dlv|p|rev|wish|list|f|sort|cart|coupon|tot|checkout|addr|ship|pay|paym|order|ret|track|inv|auth|account|ticket|contact|faq|foot|page|nf|err|v|perm|status|pstatus|rstatus|tstatus|brand|admin)\.[a-z0-9_.]+)"/g)) {
        const key = m[1]!;
        if (key in dict) continue;
        if (Object.keys(dict).some((k) => k.startsWith(key + "."))) continue; // prefix used to build a key
        missing.push(`${file.replace(root, "")}: ${key}`);
      }
    }
  }
  expect(missing).toEqual([]);
});

// Keys built at run time from database values (status badges, filters). A missing one would show the raw key on screen.
test("every status and type stored in the database has a label in all three languages", () => {
  const sql = readFileSync(join(import.meta.dir, "../db/migrations/001_init.sql"), "utf8");
  const enumOf = (table: string, column: string): string[] => {
    const body = sql.slice(sql.indexOf(`CREATE TABLE ${table} (`));
    const m = new RegExp(`\\b${column} text[^\\n]*?CHECK \\(${column} IN\\s*\\(([^)]*)\\)`, "s").exec(body.slice(0, body.indexOf("\n);")));
    if (!m) throw new Error(`no CHECK list for ${table}.${column}`);
    return [...m[1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!);
  };
  const store: Record<string, string>[] = [ar, en, ur];
  const admin: Record<string, string>[] = [{ ...ar, ...aar }, { ...en, ...aen }, { ...ur, ...aur }];
  const need: [dicts: Record<string, string>[], prefix: string, values: string[]][] = [
    [store, "status", enumOf("orders", "status")],
    [store, "pstatus", [...new Set([...enumOf("orders", "payment_status"), ...enumOf("payments", "status")])]],
    [store, "rstatus", enumOf("returns", "status")],
    [store, "tstatus", enumOf("support_tickets", "status")],
    [admin, "a.mv", enumOf("inventory_transactions", "type")],
    [admin, "a.ch", enumOf("orders", "channel")],
    [admin, "a.ps", enumOf("products", "status")],
    [admin, "a.ts", enumOf("support_tickets", "status")],
    [admin, "a.rv", enumOf("reviews", "status")],
    [admin, "a.pay", enumOf("payments", "status")],
    [admin, "a.nc", enumOf("notifications", "channel")],
    [admin, "a.sec", enumOf("homepage_sections", "type")],
    [admin, "a.t", [...enumOf("coupons", "type"), ...enumOf("discounts", "scope").filter((v) => v !== "all") /* shown as a.t.all_products */, ...enumOf("banners", "placement")]],
  ];
  const missing: string[] = [];
  for (const [dicts, prefix, values] of need) for (const v of values) for (const [i, d] of dicts.entries()) if (!d[`${prefix}.${v}`]) missing.push(`${["ar", "en", "ur"][i]}: ${prefix}.${v}`);
  expect(missing).toEqual([]);
});
