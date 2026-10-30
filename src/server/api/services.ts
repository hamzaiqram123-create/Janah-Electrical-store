import { z } from "zod";
import { db, nextCounter, tx, type Db, type Row } from "../db";
import { bad, conflict, forbidden, HttpError, notFound, pageParams, type Ctx, type Router } from "../http";
import { audit, ensureCustomer, hashPassword, requireUser } from "../auth";
import { JOB_FLOW, pick, riyadhDate, SERVICE_SLOTS, type Lang } from "../../shared/constants";
import { moveStock } from "../services/inventory";
import { normalizeSearch } from "../services/catalog";
import { saveImage } from "../services/storage";
import { phone } from "./schemas";

// ── shared helpers

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid_date");
const slot = z.enum(SERVICE_SLOTS);
const photoList = z.array(z.string().trim().max(500).refine((u) => u.startsWith("/media/"), "invalid_url")).max(6).default([]);

/** Today in Riyadh as YYYY-MM-DD. */
export function todayRiyadh(): string {
  const d = riyadhDate();
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

function serviceView(r: Row, lang: Lang) {
  return { id: r.id, slug: r.slug, icon: r.icon, name: pick(r, "name", lang), description: pick(r, "description", lang), visit_fee: r.visit_fee, duration_min: r.duration_min };
}

const BOOKING_SELECT = `
  SELECT b.*, st.name_ar AS service_name_ar, st.name_en AS service_name_en, st.name_ur AS service_name_ur, st.icon AS service_icon,
         tu.name AS technician_name, tu.phone AS technician_phone
    FROM service_bookings b
    JOIN service_types st ON st.id = b.service_type_id
    LEFT JOIN technicians te ON te.id = b.technician_id
    LEFT JOIN users tu ON tu.id = te.user_id`;

async function bookingView(b: Row, lang: Lang, withEvents = true) {
  const events = withEvents ? await db.q(`SELECT status, note, actor, created_at FROM service_booking_events WHERE booking_id = $1 ORDER BY id`, [b.id]) : [];
  return {
    id: b.id, number: b.number, status: b.status, problem: b.problem, photos: b.photos,
    service: { id: b.service_type_id, name: pick(b, "service_name", lang), icon: b.service_icon },
    contact_name: b.contact_name, contact_phone: b.contact_phone, city: b.city, address: b.address,
    scheduled_date: typeof b.scheduled_date === "string" ? b.scheduled_date.slice(0, 10) : new Date(b.scheduled_date).toISOString().slice(0, 10),
    slot: b.slot, visit_fee: b.visit_fee, quote_lines: b.quote_lines, quote_total: b.quote_total, quote_status: b.quote_status, total: b.total,
    payment_status: b.payment_status, payment_method: b.payment_method, paid_at: b.paid_at,
    before_photos: b.before_photos, after_photos: b.after_photos, rating: b.rating, review: b.review, cancel_reason: b.cancel_reason,
    technician: b.technician_id ? { id: b.technician_id, name: b.technician_name, phone: b.technician_phone } : null,
    created_at: b.created_at, updated_at: b.updated_at, events,
  };
}

async function addEvent(t: Db, bookingId: number, status: string, actor: string, note: string | null = null) {
  await t.exec(`INSERT INTO service_booking_events (booking_id, status, note, actor) VALUES ($1, $2, $3, $4)`, [bookingId, status, note, actor]);
}

/** Booked jobs per slot on a date for one service type (cancelled jobs free their place). */
async function slotsFor(serviceTypeId: number, date: string) {
  const st = await db.one(`SELECT daily_capacity FROM service_types WHERE id = $1 AND active`, [serviceTypeId]);
  if (!st) throw notFound("service_not_found");
  const rows = await db.q<{ slot: string; n: number }>(
    `SELECT slot, count(*)::int AS n FROM service_bookings WHERE service_type_id = $1 AND scheduled_date = $2 AND status <> 'cancelled' GROUP BY slot`, [serviceTypeId, date]);
  const today = todayRiyadh();
  const nowHour = new Date(Date.now() + 3 * 3600_000).getUTCHours();
  return SERVICE_SLOTS.map((s) => {
    const taken = rows.find((r) => r.slot === s)?.n ?? 0;
    const past = date < today || (date === today && Number(s.slice(0, 2)) <= nowHour + 1); // at least an hour's notice
    return { slot: s, left: Math.max(0, st.daily_capacity - taken), available: !past && taken < st.daily_capacity };
  });
}

async function assertSlotFree(serviceTypeId: number, date: string, s: string) {
  const slots = await slotsFor(serviceTypeId, date);
  if (!slots.find((x) => x.slot === s)?.available) throw conflict("slot_unavailable");
}

const quoteLine = z.object({
  kind: z.enum(["part", "labor"]),
  product_id: z.coerce.number().int().positive().nullish().transform((v) => v ?? null),
  name: z.string().trim().min(1).max(200),
  qty: z.coerce.number().int().min(1).max(999),
  unit_price: z.coerce.number().int().min(0).max(100_000_000),
});

async function loadForCustomer(c: Ctx, number: string) {
  const u = requireUser(c);
  const b = await db.one(`${BOOKING_SELECT} WHERE b.number = $1`, [number]);
  if (!b || b.customer_id !== u.customer_id) throw notFound("booking_not_found");
  return b;
}

async function myTechnician(c: Ctx) {
  const u = requireUser(c);
  const t = await db.one(`SELECT te.*, u.name, u.phone, u.email FROM technicians te JOIN users u ON u.id = te.user_id WHERE te.user_id = $1`, [u.id]);
  if (!t) throw forbidden("not_a_technician");
  return t;
}

async function loadForTechnician(c: Ctx, id: number) {
  const te = await myTechnician(c);
  const b = await db.one(`${BOOKING_SELECT} WHERE b.id = $1`, [id]);
  if (!b || b.technician_id !== te.id) throw notFound("booking_not_found");
  return { b, te };
}

const ACTIVE = `status NOT IN ('completed','cancelled')`;

export function registerServicesApi(r: Router) {
  // ── storefront: catalogue of services and slots
  r.get("/api/services", async (c) => {
    const rows = await db.q(`SELECT * FROM service_types WHERE active ORDER BY sort, id`);
    return { services: rows.map((s) => serviceView(s, c.lang)) };
  });
  r.get("/api/services/:id/slots", async (c) => {
    const date = dateStr.parse(c.query.get("date") ?? todayRiyadh());
    return { date, slots: await slotsFor(Number(c.params.id), date) };
  });

  // ── storefront: customer bookings
  r.post("/api/bookings/photos", async (c) => {
    if (!(c.req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) throw new HttpError(415, "multipart_required");
    const file = (await c.req.formData()).get("file");
    if (!(file instanceof File) || !file.size) throw bad("file_required");
    const saved = await saveImage(file, "bookings");
    return { url: saved.url };
  }, { auth: "user", rate: "write" });

  r.post("/api/bookings", async (c) => {
    const u = requireUser(c);
    const body = await c.body(z.object({
      service_type_id: z.coerce.number().int().positive(), problem: z.string().trim().min(5).max(2000), photos: photoList,
      contact_name: z.string().trim().min(2).max(120), contact_phone: phone, city: z.string().trim().min(2).max(80), address: z.string().trim().min(5).max(500),
      date: dateStr, slot,
    }));
    const st = await db.one(`SELECT * FROM service_types WHERE id = $1 AND active`, [body.service_type_id]);
    if (!st) throw notFound("service_not_found");
    await assertSlotFree(st.id, body.date, body.slot);
    const booking = await tx(async (t) => {
      const customerId = await ensureCustomer(u, t);
      const seq = await nextCounter(t, "booking");
      const b = await t.insert("service_bookings", {
        number: `SRV-${String(seq).padStart(5, "0")}`, customer_id: customerId, service_type_id: st.id, problem: body.problem,
        contact_name: body.contact_name, contact_phone: body.contact_phone, city: body.city, address: body.address,
        scheduled_date: body.date, slot: body.slot, visit_fee: st.visit_fee, total: st.visit_fee,
      });
      await t.exec(`UPDATE service_bookings SET photos = $2::text::jsonb WHERE id = $1`, [b.id, JSON.stringify(body.photos)]);
      await addEvent(t, b.id, "requested", "customer");
      return b;
    });
    return { number: booking.number };
  }, { auth: "user", rate: "write" });

  r.get("/api/account/bookings", async (c) => {
    const u = requireUser(c);
    if (!u.customer_id) return { upcoming: [], past: [] };
    const rows = await db.q(`${BOOKING_SELECT} WHERE b.customer_id = $1 ORDER BY b.scheduled_date DESC, b.slot DESC LIMIT 200`, [u.customer_id]);
    const views = await Promise.all(rows.map((b) => bookingView(b, c.lang, false)));
    return { upcoming: views.filter((b) => !["completed", "cancelled"].includes(b.status)).reverse(), past: views.filter((b) => ["completed", "cancelled"].includes(b.status)) };
  }, { auth: "user" });

  r.get("/api/account/bookings/:number", async (c) => ({ booking: await bookingView(await loadForCustomer(c, c.params.number!), c.lang) }), { auth: "user" });

  r.post("/api/account/bookings/:number/cancel", async (c) => {
    const b = await loadForCustomer(c, c.params.number!);
    const { reason } = await c.body(z.object({ reason: z.string().trim().max(300).default("") }));
    if (!["requested", "assigned"].includes(b.status)) throw conflict("booking_not_cancellable");
    await tx(async (t) => {
      await t.exec(`UPDATE service_bookings SET status = 'cancelled', cancel_reason = $2, updated_at = now() WHERE id = $1`, [b.id, reason || null]);
      await addEvent(t, b.id, "cancelled", "customer", reason || null);
    });
    return { ok: true };
  }, { auth: "user", rate: "write" });

  r.post("/api/account/bookings/:number/reschedule", async (c) => {
    const b = await loadForCustomer(c, c.params.number!);
    const body = await c.body(z.object({ date: dateStr, slot }));
    if (!["requested", "assigned"].includes(b.status)) throw conflict("booking_not_reschedulable");
    await assertSlotFree(b.service_type_id, body.date, body.slot);
    await tx(async (t) => {
      await t.exec(`UPDATE service_bookings SET scheduled_date = $2, slot = $3, updated_at = now() WHERE id = $1`, [b.id, body.date, body.slot]);
      await addEvent(t, b.id, b.status, "customer", `${body.date} ${body.slot}`);
    });
    return { ok: true };
  }, { auth: "user", rate: "write" });

  r.post("/api/account/bookings/:number/quote", async (c) => {
    const b = await loadForCustomer(c, c.params.number!);
    const { approve } = await c.body(z.object({ approve: z.boolean() }));
    if (b.quote_status !== "sent") throw conflict("no_quote_pending");
    await tx(async (t) => {
      await t.exec(`UPDATE service_bookings SET quote_status = $2, total = visit_fee + CASE WHEN $2 = 'approved' THEN quote_total ELSE 0 END, updated_at = now() WHERE id = $1`, [b.id, approve ? "approved" : "rejected"]);
      await addEvent(t, b.id, approve ? "quote_approved" : "quote_rejected", "customer");
    });
    return { ok: true };
  }, { auth: "user", rate: "write" });

  r.post("/api/account/bookings/:number/rate", async (c) => {
    const b = await loadForCustomer(c, c.params.number!);
    const body = await c.body(z.object({ rating: z.coerce.number().int().min(1).max(5), review: z.string().trim().max(1000).default("") }));
    if (b.status !== "completed") throw conflict("booking_not_completed");
    await db.exec(`UPDATE service_bookings SET rating = $2, review = $3, updated_at = now() WHERE id = $1`, [b.id, body.rating, body.review || null]);
    return { ok: true };
  }, { auth: "user", rate: "write" });

  // ── technician app
  r.get("/api/tech/me", async (c) => {
    const te = await myTechnician(c);
    const stats = await db.one(
      `SELECT count(*) FILTER (WHERE status = 'completed')::int AS completed,
              count(*) FILTER (WHERE status NOT IN ('completed','cancelled'))::int AS open,
              round(avg(rating)::numeric, 1)::float AS rating, count(rating)::int AS ratings
         FROM service_bookings WHERE technician_id = $1`, [te.id]);
    const upcoming = await db.q(`SELECT scheduled_date::text AS date, count(*)::int AS jobs FROM service_bookings WHERE technician_id = $1 AND ${ACTIVE} AND scheduled_date >= $2 GROUP BY 1 ORDER BY 1 LIMIT 14`, [te.id, todayRiyadh()]);
    return { technician: { id: te.id, name: te.name, phone: te.phone, email: te.email, areas: te.areas, skills: te.skills, available: te.available }, stats, upcoming };
  }, { auth: "admin", perm: "jobs.own" });

  r.post("/api/tech/availability", async (c) => {
    const te = await myTechnician(c);
    const { available } = await c.body(z.object({ available: z.boolean() }));
    await db.exec(`UPDATE technicians SET available = $2, updated_at = now() WHERE id = $1`, [te.id, available]);
    return { available };
  }, { auth: "admin", perm: "jobs.own" });

  r.get("/api/tech/jobs", async (c) => {
    const te = await myTechnician(c);
    const date = dateStr.parse(c.query.get("date") ?? todayRiyadh());
    const rows = await db.q(`${BOOKING_SELECT} WHERE b.technician_id = $1 AND b.scheduled_date = $2 ORDER BY b.slot, b.id`, [te.id, date]);
    return { date, jobs: await Promise.all(rows.map((b) => bookingView(b, c.lang, false))) };
  }, { auth: "admin", perm: "jobs.own" });

  r.get("/api/tech/jobs/:id", async (c) => {
    const { b } = await loadForTechnician(c, Number(c.params.id));
    return { job: await bookingView(b, c.lang) };
  }, { auth: "admin", perm: "jobs.own" });

  r.post("/api/tech/jobs/:id/status", async (c) => {
    const { b, te } = await loadForTechnician(c, Number(c.params.id));
    const { status } = await c.body(z.object({ status: z.enum(["on_the_way", "arrived", "in_progress", "completed"]) }));
    const from = JOB_FLOW.indexOf(b.status), to = JOB_FLOW.indexOf(status);
    if (b.status === "cancelled" || to !== from + 1) throw conflict("invalid_status_change");
    if (status === "completed") {
      if (b.quote_status === "sent") throw conflict("quote_waiting");
      if (b.payment_status !== "paid" && b.total > 0) throw conflict("payment_required");
    }
    await tx(async (t) => {
      await t.exec(`UPDATE service_bookings SET status = $2, updated_at = now() WHERE id = $1`, [b.id, status]);
      await addEvent(t, b.id, status, `technician:${te.name}`);
    });
    return { ok: true };
  }, { auth: "admin", perm: "jobs.own", rate: "write" });

  r.post("/api/tech/jobs/:id/quote", async (c) => {
    const { b, te } = await loadForTechnician(c, Number(c.params.id));
    const { lines } = await c.body(z.object({ lines: z.array(quoteLine).min(1).max(30) }));
    if (!["arrived", "in_progress"].includes(b.status)) throw conflict("quote_not_allowed");
    if (b.quote_status === "approved") throw conflict("quote_already_approved");
    const total = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
    await tx(async (t) => {
      await t.exec(`UPDATE service_bookings SET quote_lines = $2::text::jsonb, quote_total = $3, quote_status = 'sent', total = visit_fee, updated_at = now() WHERE id = $1`, [b.id, JSON.stringify(lines), total]);
      await addEvent(t, b.id, "quote_sent", `technician:${te.name}`);
    });
    return { ok: true, quote_total: total };
  }, { auth: "admin", perm: "jobs.own", rate: "write" });

  r.post("/api/tech/jobs/:id/payment", async (c) => {
    const { b, te } = await loadForTechnician(c, Number(c.params.id));
    const body = await c.body(z.object({ method: z.enum(["cash", "card"]), before_photos: photoList, after_photos: photoList }));
    if (b.status !== "in_progress") throw conflict("payment_not_allowed");
    if (b.quote_status === "sent") throw conflict("quote_waiting");
    if (b.payment_status === "paid") throw conflict("already_paid");
    await tx(async (t) => {
      // parts used on an approved quote leave the shop's stock
      if (b.quote_status === "approved") {
        for (const l of b.quote_lines as z.infer<typeof quoteLine>[]) {
          if (l.kind === "part" && l.product_id) await moveStock(t, { productId: l.product_id, type: "sale", delta: -l.qty, referenceType: "service_booking", referenceId: b.number, userId: c.user!.id });
        }
      }
      await t.exec(`UPDATE service_bookings SET payment_status = 'paid', payment_method = $2, paid_at = now(), before_photos = $3::text::jsonb, after_photos = $4::text::jsonb, updated_at = now() WHERE id = $1`,
        [b.id, body.method, JSON.stringify(body.before_photos), JSON.stringify(body.after_photos)]);
      await addEvent(t, b.id, "paid", `technician:${te.name}`, body.method);
    });
    return { ok: true };
  }, { auth: "admin", perm: "jobs.own", rate: "write" });

  r.get("/api/tech/parts", async (c) => {
    await myTechnician(c);
    const q = c.query.get("q")?.trim() ?? "";
    if (q.length < 2) return { parts: [] };
    const rows = await db.q(
      `SELECT p.id, p.sku, p.name_ar, p.name_en, p.name_ur, p.effective_price, COALESCE(i.quantity, 0) AS stock
         FROM products p LEFT JOIN inventory i ON i.product_id = p.id
        WHERE p.status = 'active' AND (p.search_text LIKE $1 OR p.barcode = $2 OR lower(p.sku) = lower($2))
        ORDER BY COALESCE(i.quantity, 0) > 0 DESC, p.id LIMIT 15`,
      [`%${normalizeSearch(q).replace(/[\\%_]/g, (m) => "\\" + m)}%`, q]);
    return { parts: rows.map((p) => ({ id: p.id, sku: p.sku, name: pick(p, "name", c.lang), price: p.effective_price, stock: p.stock })) };
  }, { auth: "admin", perm: "jobs.own", rate: "search" });

  // ── admin: jobs board
  r.get("/api/admin/bookings", async (c) => {
    const { page, per, offset } = pageParams(c.query, 50, 200);
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace("?", `$${params.length}`)); };
    if (c.query.get("status")) add("b.status = ?", c.query.get("status"));
    if (c.query.get("date")) add("b.scheduled_date = ?", dateStr.parse(c.query.get("date")));
    if (c.query.get("technician_id")) add("b.technician_id = ?", Number(c.query.get("technician_id")));
    if (c.query.get("unassigned") === "1") where.push("b.technician_id IS NULL AND b.status <> 'cancelled'");
    const q = c.query.get("q")?.trim();
    if (q) add("(b.number ILIKE ? OR b.contact_name ILIKE $X OR b.contact_phone ILIKE $X)".replace(/\$X/g, `$${params.length + 1}`), `%${q}%`);
    const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = await db.q(`${BOOKING_SELECT} ${w} ORDER BY b.scheduled_date DESC, b.slot, b.id DESC LIMIT ${per} OFFSET ${offset}`, params);
    const total = (await db.one<{ n: number }>(`SELECT count(*)::int AS n FROM service_bookings b ${w}`, params))!.n;
    const counts = await db.q(`SELECT status, count(*)::int AS n FROM service_bookings GROUP BY status`);
    return { rows: await Promise.all(rows.map((b) => bookingView(b, c.lang, false))), total, page, pages: Math.max(1, Math.ceil(total / per)), counts: Object.fromEntries(counts.map((x) => [x.status, x.n])) };
  }, { auth: "admin", perm: "services.manage" });

  r.get("/api/admin/bookings/:id", async (c) => {
    const b = await db.one(`${BOOKING_SELECT} WHERE b.id = $1`, [Number(c.params.id)]);
    if (!b) throw notFound("booking_not_found");
    const customer = await db.one(`SELECT id, name, email, phone FROM customers WHERE id = $1`, [b.customer_id]);
    return { booking: await bookingView(b, c.lang), customer };
  }, { auth: "admin", perm: "services.manage" });

  r.post("/api/admin/bookings/:id/assign", async (c) => {
    const id = Number(c.params.id);
    const { technician_id } = await c.body(z.object({ technician_id: z.coerce.number().int().positive() }));
    const b = await db.one(`SELECT * FROM service_bookings WHERE id = $1`, [id]);
    if (!b) throw notFound("booking_not_found");
    if (["completed", "cancelled"].includes(b.status)) throw conflict("booking_closed");
    const te = await db.one(`SELECT te.id, u.name FROM technicians te JOIN users u ON u.id = te.user_id WHERE te.id = $1 AND u.status = 'active'`, [technician_id]);
    if (!te) throw bad("technician_not_found");
    await tx(async (t) => {
      await t.exec(`UPDATE service_bookings SET technician_id = $2, status = CASE WHEN status = 'requested' THEN 'assigned' ELSE status END, updated_at = now() WHERE id = $1`, [id, te.id]);
      await addEvent(t, id, b.status === "requested" ? "assigned" : b.status, c.user!.email, te.name);
      await audit(c, "booking.assign", "service_booking", id, { technician_id: te.id }, t);
    });
    return { ok: true };
  }, { auth: "admin", perm: "services.manage", rate: "write" });

  r.post("/api/admin/bookings/:id/cancel", async (c) => {
    const id = Number(c.params.id);
    const { reason } = await c.body(z.object({ reason: z.string().trim().min(2).max(300) }));
    const b = await db.one(`SELECT * FROM service_bookings WHERE id = $1`, [id]);
    if (!b) throw notFound("booking_not_found");
    if (["completed", "cancelled"].includes(b.status)) throw conflict("booking_closed");
    await tx(async (t) => {
      await t.exec(`UPDATE service_bookings SET status = 'cancelled', cancel_reason = $2, updated_at = now() WHERE id = $1`, [id, reason]);
      await addEvent(t, id, "cancelled", c.user!.email, reason);
      await audit(c, "booking.cancel", "service_booking", id, { reason }, t);
    });
    return { ok: true };
  }, { auth: "admin", perm: "services.manage", rate: "write" });

  // ── admin: technicians
  r.get("/api/admin/technicians", async () => {
    const rows = await db.q(
      `SELECT te.id, te.areas, te.skills, te.available, u.id AS user_id, u.name, u.email, u.phone, u.status,
              count(b.id) FILTER (WHERE b.status = 'completed')::int AS completed,
              count(b.id) FILTER (WHERE b.status NOT IN ('completed','cancelled'))::int AS open,
              round(avg(b.rating)::numeric, 1)::float AS rating
         FROM technicians te JOIN users u ON u.id = te.user_id
         LEFT JOIN service_bookings b ON b.technician_id = te.id
        GROUP BY te.id, u.id ORDER BY u.name`);
    return { rows };
  }, { auth: "admin", perm: "services.manage" });

  r.post("/api/admin/technicians", async (c) => {
    const body = await c.body(z.object({
      name: z.string().trim().min(2).max(120), email: z.string().trim().toLowerCase().email().max(200), phone,
      password: z.string().min(10, "password_too_short").max(200), areas: z.string().trim().max(300).default(""), skills: z.string().trim().max(300).default(""),
    }));
    if (await db.one(`SELECT 1 AS ok FROM users WHERE lower(email) = $1`, [body.email])) throw conflict("email_taken");
    const role = await db.one(`SELECT id FROM roles WHERE key = 'technician'`);
    if (!role) throw new HttpError(500, "technician_role_missing");
    const hash = await hashPassword(body.password);
    const te = await tx(async (t) => {
      const u = await t.insert("users", { email: body.email, name: body.name, phone: body.phone, password_hash: hash, kind: "admin" });
      await t.insert("admins", { user_id: u.id, role_id: role.id });
      const te = await t.insert("technicians", { user_id: u.id, areas: body.areas, skills: body.skills });
      await audit(c, "technician.create", "technician", te.id, { email: body.email }, t);
      return te;
    });
    return { id: te.id };
  }, { auth: "admin", perm: "users.manage", rate: "write" });

  r.patch("/api/admin/technicians/:id", async (c) => {
    const id = Number(c.params.id);
    const body = await c.body(z.object({ areas: z.string().trim().max(300).optional(), skills: z.string().trim().max(300).optional(), available: z.boolean().optional(), active: z.boolean().optional() }));
    const te = await db.one(`SELECT * FROM technicians WHERE id = $1`, [id]);
    if (!te) throw notFound();
    await tx(async (t) => {
      const { active, ...rest } = body;
      if (Object.keys(rest).length) await t.update("technicians", id, { ...rest, updated_at: new Date() });
      if (active !== undefined) await t.exec(`UPDATE users SET status = $2, updated_at = now() WHERE id = $1`, [te.user_id, active ? "active" : "disabled"]);
      await audit(c, "technician.update", "technician", id, body, t);
    });
    return { ok: true };
  }, { auth: "admin", perm: "services.manage", rate: "write" });
}
