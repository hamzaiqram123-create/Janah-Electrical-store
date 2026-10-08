import type { ZodType } from "zod";
import { db, type Db, type Row } from "../../db";
import { conflict, notFound, pageParams, type Ctx, type Router } from "../../http";
import { audit } from "../../auth";

export interface CrudOptions {
  path: string;            // /api/admin/<path>
  table: string;
  readPerm: string;
  writePerm: string;
  schema: ZodType<Row, any, any>;
  search?: string[];       // columns searched by ?q=
  filters?: string[];      // exact-match columns accepted as query params
  orderBy?: string;
  /** Extra checks before insert / update (throw an HttpError to reject). `id` is null on create. */
  validate?: (data: Row, id: number | null) => Promise<void>;
  afterWrite?: (row: Row | null, t: Db) => Promise<void> | void;
  beforeDelete?: (id: number) => Promise<void>;
}

const IDENT = /^[a-z_][a-z0-9_]*$/;

/** Registers list / read / create / update / delete endpoints for a simple table, with validation, RBAC and audit logging. */
export function crud(r: Router, o: CrudOptions) {
  const base = `/api/admin/${o.path}`;
  for (const col of [...(o.search ?? []), ...(o.filters ?? []), o.table]) if (!IDENT.test(col)) throw new Error(`bad identifier ${col}`);

  r.get(base, async (c) => {
    const { page, per, offset } = pageParams(c.query, 50, 500);
    const where: string[] = [];
    const params: unknown[] = [];
    const q = c.query.get("q")?.trim();
    if (q && o.search?.length) {
      params.push(`%${q.replace(/[\\%_]/g, (m) => "\\" + m)}%`);
      where.push("(" + o.search.map((col) => `${col}::text ILIKE $${params.length}`).join(" OR ") + ")");
    }
    for (const f of o.filters ?? []) {
      const v = c.query.get(f);
      if (v !== null && v !== "") { params.push(v); where.push(`${f}::text = $${params.length}`); }
    }
    const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = await db.q(`SELECT * FROM ${o.table} ${w} ORDER BY ${o.orderBy ?? "id DESC"} LIMIT ${per} OFFSET ${offset}`, params);
    const total = (await db.one<{ n: number }>(`SELECT count(*)::int AS n FROM ${o.table} ${w}`, params))!.n;
    return { rows, total, page, pages: Math.ceil(total / per) };
  }, { auth: "admin", perm: o.readPerm });

  r.get(`${base}/:id`, async (c) => {
    const row = await db.one(`SELECT * FROM ${o.table} WHERE id = $1`, [Number(c.params.id) || 0]);
    if (!row) throw notFound();
    return { row };
  }, { auth: "admin", perm: o.readPerm });

  const write = async (c: Ctx, id: number | null) => {
    const data = await c.body(o.schema);
    await o.validate?.(data, id);
    try {
      const row = id === null ? await db.insert(o.table, data) : await db.update(o.table, id, data);
      if (!row) throw notFound();
      await audit(c, id === null ? "create" : "update", o.table, row.id, { fields: Object.keys(data) });
      await o.afterWrite?.(row, db);
      return { row };
    } catch (e: any) {
      if (e?.errno === "23505") throw conflict("duplicate_value", { constraint: e.constraint });
      if (e?.errno === "23503") throw conflict("invalid_reference", { constraint: e.constraint });
      throw e;
    }
  };
  r.post(base, (c) => write(c, null), { auth: "admin", perm: o.writePerm });
  r.put(`${base}/:id`, (c) => write(c, Number(c.params.id) || 0), { auth: "admin", perm: o.writePerm });

  r.delete(`${base}/:id`, async (c) => {
    const id = Number(c.params.id) || 0;
    await o.beforeDelete?.(id);
    try {
      const n = await db.exec(`DELETE FROM ${o.table} WHERE id = $1`, [id]);
      if (!n) throw notFound();
    } catch (e: any) {
      if (e?.errno === "23503") throw conflict("in_use");
      throw e;
    }
    await audit(c, "delete", o.table, id);
    await o.afterWrite?.(null, db);
    return { ok: true };
  }, { auth: "admin", perm: o.writePerm });
}
