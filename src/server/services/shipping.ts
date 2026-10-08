import { db, type Row } from "../db";
import { cached } from "../cache";
import { pick, type Lang } from "../../shared/constants";

export interface ShippingOption {
  id: number; key: string; name: string; description: string; carrier: string | null;
  fee: number; base_fee: number; free: boolean; free_threshold: number | null;
  min_days: number; max_days: number; delivery_from: string; delivery_to: string;
  cod_allowed: boolean; is_pickup: boolean;
}

export async function listRegions(lang: Lang) {
  const { regions, cities } = await cached("shell:geo", 600, async () => ({
    regions: await db.q(`SELECT * FROM regions ORDER BY id`),
    cities: await db.q(`SELECT * FROM cities WHERE active ORDER BY name_en`),
  }));
  return regions.map((r) => ({
    id: r.id, code: r.code, name: pick(r, "name", lang),
    cities: cities.filter((c) => c.region_id === r.id).map((c) => ({ id: c.id, name: pick(c, "name", lang) })),
  })).filter((r) => r.cities.length);
}

export async function getCity(cityId: number): Promise<Row | undefined> {
  return db.one(
    `SELECT c.*, r.name_ar AS region_ar, r.name_en AS region_en, r.name_ur AS region_ur, r.code AS region_code
       FROM cities c JOIN regions r ON r.id = c.region_id WHERE c.id = $1 AND c.active`, [cityId]);
}

/** Skips Fridays (no courier collection) when counting delivery days. */
function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let left = days;
  while (left > 0) { d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() !== 5) left--; }
  return d;
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Shipping methods available for a city, with the fee after rate overrides and the free-delivery threshold. */
export async function shippingOptions(cityId: number, itemsSubtotal: number, lang: Lang): Promise<ShippingOption[]> {
  const city = await getCity(cityId);
  if (!city) return [];
  const methods = await db.q(`SELECT * FROM shipping_methods WHERE active ORDER BY sort, id`);
  const rates = await db.q(`SELECT * FROM shipping_rates WHERE city_id = $1 OR region_id = $2`, [city.id, city.region_id]);
  const now = new Date();
  const out: ShippingOption[] = [];
  for (const m of methods) {
    const rate = rates.find((r) => r.method_id === m.id && r.city_id === city.id) ?? rates.find((r) => r.method_id === m.id && r.region_id === city.region_id && r.city_id == null);
    if (rate && !rate.active) continue;                      // method blocked for this destination
    if (m.is_pickup && !rate) continue;                      // pickup only where a rate row enables it
    const base = rate ? rate.fee : m.base_fee;
    const minDays = rate?.min_days ?? m.min_days, maxDays = rate?.max_days ?? m.max_days;
    const free = m.free_threshold != null && itemsSubtotal >= m.free_threshold;
    out.push({
      id: m.id, key: m.key, name: pick(m, "name", lang), description: pick(m, "description", lang), carrier: m.carrier,
      fee: free ? 0 : base, base_fee: base, free: free && base > 0, free_threshold: m.free_threshold,
      min_days: minDays, max_days: maxDays, delivery_from: iso(addBusinessDays(now, minDays)), delivery_to: iso(addBusinessDays(now, maxDays)),
      cod_allowed: m.cod_allowed, is_pickup: m.is_pickup,
    });
  }
  return out;
}

export function trackingNumber(): string {
  const n = crypto.getRandomValues(new Uint32Array(2));
  return `JR${String(n[0]! % 1e6).padStart(6, "0")}${String(n[1]! % 1e6).padStart(6, "0")}SA`;
}
