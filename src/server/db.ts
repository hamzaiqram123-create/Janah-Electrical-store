import { SQL } from "bun";
import { config } from "./config";

/**
 * Thin data-access layer over Bun's PostgreSQL client.
 * Every query is parameterised ($1, $2 …) — values are never concatenated into SQL.
 * Identifiers used by the dynamic helpers are validated against IDENT.
 */
const pool = new SQL({ url: config.DATABASE_URL, max: config.DB_POOL_MAX });

type Runner = { unsafe: (text: string, params?: unknown[]) => Promise<any> };
export type Row = Record<string, any>;

const IDENT = /^[a-z_][a-z0-9_]*$/;
function ident(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Invalid SQL identifier: ${name}`);
  return `"${name}"`;
}

export interface Db {
  q<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
  one<T = Row>(text: string, params?: unknown[]): Promise<T | undefined>;
  exec(text: string, params?: unknown[]): Promise<number>;
  insert<T = Row>(table: string, data: Row): Promise<T>;
  update<T = Row>(table: string, id: number, data: Row): Promise<T | undefined>;
}

function wrap(r: Runner): Db {
  const q = async <T = Row>(text: string, params: unknown[] = []) => Array.from((await r.unsafe(text, params)) as T[]);
  return {
    q,
    one: async <T = Row>(text: string, params: unknown[] = []) => (await q<T>(text, params))[0],
    exec: async (text, params = []) => {
      const res = await r.unsafe(text, params);
      return Number(res.count ?? res.length ?? 0);
    },
    insert: async <T = Row>(table: string, data: Row) => {
      const keys = Object.keys(data).filter((k) => data[k] !== undefined);
      const cols = keys.map(ident).join(", ");
      const vals = keys.map((_, i) => `$${i + 1}`).join(", ");
      const rows = await q<T>(`INSERT INTO ${ident(table)} (${cols}) VALUES (${vals}) RETURNING *`, keys.map((k) => data[k]));
      return rows[0]!;
    },
    update: async <T = Row>(table: string, id: number, data: Row) => {
      const keys = Object.keys(data).filter((k) => data[k] !== undefined);
      if (!keys.length) return (await q<T>(`SELECT * FROM ${ident(table)} WHERE id = $1`, [id]))[0];
      const set = keys.map((k, i) => `${ident(k)} = $${i + 1}`).join(", ");
      const rows = await q<T>(`UPDATE ${ident(table)} SET ${set} WHERE id = $${keys.length + 1} RETURNING *`, [...keys.map((k) => data[k]), id]);
      return rows[0];
    },
  };
}

export const db: Db = wrap(pool as unknown as Runner);

/** Run `fn` inside a transaction; throws roll back. */
export function tx<T>(fn: (t: Db) => Promise<T>): Promise<T> {
  return (pool as any).begin(async (t: Runner) => fn(wrap(t))) as Promise<T>;
}

/** PostgreSQL array literal for integer lists, used as `$n::int[]`. */
export function intArray(ids: number[]): string {
  return `{${ids.filter((n) => Number.isInteger(n)).join(",")}}`;
}

export async function nextCounter(t: Db, key: string): Promise<number> {
  const row = await t.one<{ value: number }>(
    `INSERT INTO counters (key, value) VALUES ($1, 1)
     ON CONFLICT (key) DO UPDATE SET value = counters.value + 1 RETURNING value`,
    [key],
  );
  return row!.value;
}

export async function closeDb() {
  await (pool as any).end();
}
