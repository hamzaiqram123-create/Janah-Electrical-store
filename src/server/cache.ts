/** Small in-process TTL cache for hot, rarely-changing reads (settings, category tree, homepage). */
const store = new Map<string, { exp: number; val: unknown }>();

export async function cached<T>(key: string, ttlSec: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.exp > Date.now()) return hit.val as T;
  const val = await load();
  store.set(key, { exp: Date.now() + ttlSec * 1000, val });
  return val;
}
/** Drop every entry whose key starts with one of the prefixes (call after admin writes). */
export function invalidate(...prefixes: string[]) {
  if (!prefixes.length) return store.clear();
  for (const k of store.keys()) if (prefixes.some((p) => k.startsWith(p))) store.delete(k);
}
