import { z } from "zod";
import { db, tx } from "../../db";
import { bad, conflict, exportResponse, isExport, forbidden, notFound, pageParams, type Router } from "../../http";
import { audit, hashPassword } from "../../auth";
import { DEFAULT_SETTINGS, getSettings, saveSettings, type SettingsGroup } from "../../services/settings";
import { config } from "../../config";
import { onlineGateway } from "../../services/payments/gateway";
import { zatcaReady } from "../../services/zatca";
import * as s from "../schemas";

const settingsSchemas: Record<SettingsGroup, z.ZodTypeAny> = {
  store: z.object(Object.fromEntries(Object.keys(DEFAULT_SETTINGS.store).map((k) => [k, z.string().trim().max(300)]))).partial()
    .refine((v: any) => !v.vat_number || /^3\d{13}3$/.test(v.vat_number), { message: "invalid_vat_number", path: ["vat_number"] }),
  tax: z.object({ vat_rate_bp: z.number().int().min(0).max(10000), prices_include_vat: z.boolean() }).partial(),
  checkout: z.object({
    guest_checkout: z.boolean(), cod_enabled: z.boolean(), cod_fee: z.number().int().min(0).max(100000), cod_max_total: z.number().int().min(0),
    auto_confirm_cod: z.boolean(), unpaid_order_ttl_minutes: z.number().int().min(10).max(2880), cart_recovery_hours: z.number().int().min(1).max(168), max_qty_per_item: z.number().int().min(1).max(100000),
  }).partial(),
  numbering: z.object({ order_prefix: z.string().regex(/^[A-Z0-9]{1,6}$/), invoice_prefix: z.string().regex(/^[A-Z0-9]{1,6}$/), credit_note_prefix: z.string().regex(/^[A-Z0-9]{1,6}$/) }).partial(),
  reviews: z.object({ auto_approve: z.boolean(), verified_only: z.boolean() }).partial(),
  notifications: z.object({ admin_email: z.string().trim().email().or(z.literal("")), admin_phone: z.string().trim().max(30), send_sms: z.boolean(), send_whatsapp: z.boolean() }).partial(),
  seo: z.object(Object.fromEntries(Object.keys(DEFAULT_SETTINGS.seo).map((k) => [k, z.string().trim().max(400)]))).partial(),
};

export function registerMiscAdminApi(r: Router) {
  // ── settings
  r.get("/api/admin/settings", async () => ({
    settings: await getSettings(),
    integrations: {
      payment: { provider: config.PAYMENT_PROVIDER, ready: !!onlineGateway() },
      email: { provider: config.EMAIL_PROVIDER, ready: config.EMAIL_PROVIDER === "resend" && !!config.RESEND_API_KEY },
      sms: { provider: config.SMS_PROVIDER, ready: config.SMS_PROVIDER !== "none" && !!config.UNIFONIC_APP_SID },
      whatsapp: { provider: config.WHATSAPP_PROVIDER, ready: config.WHATSAPP_PROVIDER !== "none" && !!config.WHATSAPP_TOKEN },
      storage: { provider: config.STORAGE_DRIVER, ready: true },
      zatca: { provider: config.ZATCA_ENV, ...zatcaReady() },
    },
  }), { auth: "admin", perm: "settings.manage" });

  r.put("/api/admin/settings/:group", async (c) => {
    const group = c.params.group as SettingsGroup;
    const schema = settingsSchemas[group];
    if (!schema) throw notFound();
    const body = (await c.body(schema)) as Record<string, unknown>;
    await saveSettings(group, body);
    await audit(c, "settings.update", "settings", group, { fields: Object.keys(body) });
    return { settings: await getSettings() };
  }, { auth: "admin", perm: "settings.manage" });

  // ── customers
  r.get("/api/admin/customers", async (c) => {
    const { page, per, offset } = pageParams(c.query, 30, 200);
    const q = c.query.get("q")?.trim() || null;
    const csv = isExport(c);
    const where = `($1::text IS NULL OR cu.name ILIKE '%' || $1 || '%' OR cu.email ILIKE '%' || $1 || '%' OR cu.phone ILIKE '%' || $1 || '%')`;
    const rows = await db.q(
      `SELECT cu.id, cu.name, cu.email, cu.phone, cu.is_guest, cu.company_name, cu.vat_number, cu.created_at, u.status AS account_status,
              (SELECT count(*)::int FROM orders o WHERE o.customer_id = cu.id) AS orders,
              (SELECT COALESCE(sum(total), 0)::float8 FROM orders o WHERE o.customer_id = cu.id AND o.status <> 'cancelled') AS spent
         FROM customers cu LEFT JOIN users u ON u.id = cu.user_id WHERE ${where} ORDER BY cu.id DESC LIMIT ${csv ? 50000 : per} OFFSET ${csv ? 0 : offset}`, [q]);
    if (csv) {
      return exportResponse(c, "customers.csv", [["ID", "Name", "Email", "Phone", "Type", "Company", "VAT number", "Orders", "Total spent (SAR)", "Since"],
        ...rows.map((x) => [x.id, x.name, x.email, x.phone, x.is_guest ? "guest" : "registered", x.company_name, x.vat_number, x.orders, (x.spent / 100).toFixed(2), new Date(x.created_at).toISOString()])]);
    }
    const total = (await db.one<{ n: number }>(`SELECT count(*)::int AS n FROM customers cu WHERE ${where}`, [q]))!.n;
    return { rows, total, page, pages: Math.ceil(total / per) };
  }, { auth: "admin", perm: "customers.view" });

  r.get("/api/admin/customers/:id", async (c) => {
    const id = Number(c.params.id) || 0;
    const customer = await db.one(`SELECT cu.*, u.status AS account_status, u.last_login_at FROM customers cu LEFT JOIN users u ON u.id = cu.user_id WHERE cu.id = $1`, [id]);
    if (!customer) throw notFound();
    const [orders, addresses] = await Promise.all([
      db.q(`SELECT id, number, status, payment_status, total, created_at FROM orders WHERE customer_id = $1 ORDER BY id DESC LIMIT 50`, [id]),
      db.q(`SELECT a.*, ci.name_ar AS city FROM addresses a JOIN cities ci ON ci.id = a.city_id WHERE a.customer_id = $1 ORDER BY a.is_default DESC, a.id`, [id]),
    ]);
    return { customer, orders, addresses };
  }, { auth: "admin", perm: "customers.view" });

  r.put("/api/admin/customers/:id", async (c) => {
    const id = Number(c.params.id) || 0;
    const body = await c.body(z.object({ name: s.name, phone: z.string().trim().max(30).nullish(), company_name: s.optText(160), vat_number: s.vatNumber, account_status: z.enum(["active", "disabled"]).optional() }));
    const cu = await db.one(`SELECT user_id FROM customers WHERE id = $1`, [id]);
    if (!cu) throw notFound();
    await db.exec(`UPDATE customers SET name = $2, phone = $3, company_name = $4, vat_number = $5, updated_at = now() WHERE id = $1`, [id, body.name, body.phone || null, body.company_name, body.vat_number]);
    if (cu.user_id && body.account_status) {
      await db.exec(`UPDATE users SET status = $2 WHERE id = $1 AND kind = 'customer'`, [cu.user_id, body.account_status]);
      if (body.account_status === "disabled") await db.exec(`DELETE FROM sessions WHERE user_id = $1`, [cu.user_id]);
    }
    await audit(c, "update", "customers", id, { status: body.account_status ?? null });
    return { ok: true };
  }, { auth: "admin", perm: "customers.manage" });

  // ── admin users
  r.get("/api/admin/users", async () => ({
    rows: await db.q(`SELECT u.id, u.name, u.email, u.phone, u.status, u.last_login_at, u.created_at, a.role_id, r.key AS role_key, r.name AS role_name FROM users u JOIN admins a ON a.user_id = u.id JOIN roles r ON r.id = a.role_id ORDER BY u.id`),
  }), { auth: "admin", perm: "users.manage" });

  r.post("/api/admin/users", async (c) => {
    const body = await c.body(z.object({ name: s.name, email: s.email, password: s.password, role_id: s.id }));
    const role = await db.one(`SELECT id FROM roles WHERE id = $1`, [body.role_id]);
    if (!role) throw bad("invalid_reference");
    if (await db.one(`SELECT 1 AS ok FROM users WHERE lower(email) = $1`, [body.email])) throw conflict("email_taken");
    const hash = await hashPassword(body.password);
    const id = await tx(async (t) => {
      const u = await t.insert("users", { email: body.email, name: body.name, password_hash: hash, kind: "admin" });
      await t.insert("admins", { user_id: u.id, role_id: body.role_id });
      await audit(c, "create", "users", u.id, { email: body.email, role_id: body.role_id }, t);
      return u.id as number;
    });
    return { id };
  }, { auth: "admin", perm: "users.manage" });

  r.put("/api/admin/users/:id", async (c) => {
    const id = Number(c.params.id) || 0;
    const body = await c.body(z.object({ name: s.name, role_id: s.id, status: z.enum(["active", "disabled"]), password: s.password.optional().or(z.literal("").transform(() => undefined)) }));
    const target = await db.one(`SELECT u.id, r.key AS role_key FROM users u JOIN admins a ON a.user_id = u.id JOIN roles r ON r.id = a.role_id WHERE u.id = $1`, [id]);
    if (!target) throw notFound();
    const newRole = await db.one(`SELECT key FROM roles WHERE id = $1`, [body.role_id]);
    if (!newRole) throw bad("invalid_reference");
    if (id === c.user!.id && (body.status === "disabled" || newRole.key !== target.role_key)) throw forbidden("cannot_change_own_access");
    if (target.role_key === "super_admin" && (newRole.key !== "super_admin" || body.status === "disabled")) {
      const others = await db.one<{ n: number }>(`SELECT count(*)::int AS n FROM users u JOIN admins a ON a.user_id = u.id JOIN roles r ON r.id = a.role_id WHERE r.key = 'super_admin' AND u.status = 'active' AND u.id <> $1`, [id]);
      if (!others!.n) throw conflict("last_super_admin");
    }
    await tx(async (t) => {
      await t.exec(`UPDATE users SET name = $2, status = $3, updated_at = now() WHERE id = $1`, [id, body.name, body.status]);
      await t.exec(`UPDATE admins SET role_id = $2 WHERE user_id = $1`, [id, body.role_id]);
      if (body.password) await t.exec(`UPDATE users SET password_hash = $2, failed_logins = 0, locked_until = NULL WHERE id = $1`, [id, await hashPassword(body.password)]);
      if (body.password || body.status === "disabled") await t.exec(`DELETE FROM sessions WHERE user_id = $1 AND id <> $2`, [id, id === c.user!.id ? c.user!.session_id : 0]);
      await audit(c, "update", "users", id, { role_id: body.role_id, status: body.status, password_changed: !!body.password }, t);
    });
    return { ok: true };
  }, { auth: "admin", perm: "users.manage" });

  // ── audit & notifications
  r.get("/api/admin/audit-logs", async (c) => {
    const { page, per, offset } = pageParams(c.query, 50, 200);
    const entity = c.query.get("entity") || null, q = c.query.get("q")?.trim() || null;
    const where = `($1::text IS NULL OR entity = $1) AND ($2::text IS NULL OR actor ILIKE '%' || $2 || '%' OR action ILIKE '%' || $2 || '%' OR entity_id = $2)`;
    const rows = await db.q(`SELECT * FROM audit_logs WHERE ${where} ORDER BY id DESC LIMIT ${per} OFFSET ${offset}`, [entity, q]);
    const total = (await db.one<{ n: number }>(`SELECT count(*)::int AS n FROM audit_logs WHERE ${where}`, [entity, q]))!.n;
    return { rows, total, page, pages: Math.ceil(total / per) };
  }, { auth: "admin", perm: "logs.view" });

  r.get("/api/admin/notifications", async (c) => {
    const { page, per, offset } = pageParams(c.query, 30, 200);
    const channel = c.query.get("channel") || null;
    const rows = await db.q(`SELECT id, event, channel, recipient, subject, body, payload, status, error, read_at, created_at, sent_at FROM notifications WHERE ($1::text IS NULL OR channel = $1) ORDER BY id DESC LIMIT ${per} OFFSET ${offset}`, [channel]);
    const total = (await db.one<{ n: number }>(`SELECT count(*)::int AS n FROM notifications WHERE ($1::text IS NULL OR channel = $1)`, [channel]))!.n;
    const unread = (await db.one<{ n: number }>(`SELECT count(*)::int AS n FROM notifications WHERE channel = 'admin' AND read_at IS NULL`))!.n;
    return { rows, total, page, pages: Math.ceil(total / per), unread };
  }, { auth: "admin", perm: "dashboard.view" });

  r.post("/api/admin/notifications/read", async () => {
    await db.exec(`UPDATE notifications SET read_at = now() WHERE channel = 'admin' AND read_at IS NULL`);
    return { ok: true };
  }, { auth: "admin", perm: "dashboard.view" });
}
