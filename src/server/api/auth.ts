import { z } from "zod";
import { config } from "../config";
import { db, tx } from "../db";
import { bad, conflict, type Ctx, type Router, unauthorized } from "../http";
import { audit, checkCredentials, endSession, hashPassword, loadUserByToken, requireUser, startSession, verifyPassword } from "../auth";
import { randomToken, sha256 } from "../security";
import { mergeCartOnLogin } from "../services/cart";
import { kickNotifications, notifyCustomer } from "../services/notifications";
import * as s from "./schemas";

export function userDto(c: Ctx) {
  const u = c.user;
  return u ? { id: u.id, name: u.name, email: u.email, phone: u.phone, kind: u.kind, locale: u.locale, role: u.role, permissions: u.permissions } : null;
}

export function registerAuthApi(r: Router) {
  r.post("/api/auth/register", async (c) => {
    const body = await c.body(z.object({ name: s.name, email: s.email, phone: s.phone, password: s.password, marketing_opt_in: z.boolean().optional() }));
    const exists = await db.one(`SELECT 1 AS ok FROM users WHERE lower(email) = $1`, [body.email]);
    if (exists) throw conflict("email_taken");
    const hash = await hashPassword(body.password);
    const userId = await tx(async (t) => {
      const u = await t.insert("users", { email: body.email, phone: body.phone, name: body.name, password_hash: hash, kind: "customer", locale: c.lang });
      await t.insert("customers", { user_id: u.id, name: body.name, email: body.email, phone: body.phone, marketing_opt_in: body.marketing_opt_in ?? false });
      await notifyCustomer(t, "customer_registration", { lang: c.lang, email: body.email, phone: body.phone, userId: u.id }, { name: body.name }, { link: `${config.APP_URL}/${c.lang}`, smsToo: false });
      await audit(c, "customer.register", "user", u.id, {}, t);
      return u.id as number;
    });
    await startSession(c, userId);
    await mergeCartOnLogin(c, userId);
    kickNotifications();
    c.user = await loadFresh(c, userId);
    return { user: userDto(c) };
  }, { rate: "auth" });

  r.post("/api/auth/login", async (c) => {
    const body = await c.body(z.object({ email: s.email, password: z.string().min(1).max(128) }));
    const u = await checkCredentials(body.email, body.password);
    await startSession(c, u.id);
    await mergeCartOnLogin(c, u.id);
    c.user = await loadFresh(c, u.id);
    if (u.kind === "admin") await audit(c, "admin.login", "user", u.id);
    return { user: userDto(c) };
  }, { rate: "auth" });

  r.post("/api/auth/logout", async (c) => {
    await endSession(c);
    return { ok: true };
  });

  r.get("/api/auth/me", (c) => ({ user: userDto(c) }));

  r.post("/api/auth/forgot-password", async (c) => {
    const body = await c.body(z.object({ email: s.email }));
    const u = await db.one(`SELECT id, name, email, phone, locale FROM users WHERE lower(email) = $1 AND status = 'active'`, [body.email]);
    if (u) {
      const token = randomToken();
      await tx(async (t) => {
        await t.exec(`DELETE FROM password_resets WHERE user_id = $1 OR expires_at < now()`, [u.id]);
        await t.exec(`INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 hour')`, [u.id, sha256(token)]);
        await notifyCustomer(t, "password_reset", { lang: c.lang, email: u.email, userId: u.id }, { name: u.name }, { link: `${config.APP_URL}/${c.lang}/reset-password?token=${token}`, smsToo: false });
      });
      kickNotifications();
    }
    return { ok: true }; // same answer whether or not the address is registered
  }, { rate: "auth" });

  r.post("/api/auth/reset-password", async (c) => {
    const body = await c.body(z.object({ token: z.string().min(20).max(200), password: s.password }));
    const row = await db.one(`SELECT id, user_id FROM password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`, [sha256(body.token)]);
    if (!row) throw bad("reset_token_invalid");
    const hash = await hashPassword(body.password);
    await tx(async (t) => {
      await t.exec(`UPDATE users SET password_hash = $2, failed_logins = 0, locked_until = NULL, updated_at = now() WHERE id = $1`, [row.user_id, hash]);
      await t.exec(`UPDATE password_resets SET used_at = now() WHERE id = $1`, [row.id]);
      await t.exec(`DELETE FROM sessions WHERE user_id = $1`, [row.user_id]);
      await audit(c, "user.password_reset", "user", row.user_id, {}, t);
    });
    return { ok: true };
  }, { rate: "auth" });

  r.patch("/api/account/profile", async (c) => {
    const u = requireUser(c);
    const body = await c.body(z.object({ name: s.name, phone: s.phone, locale: s.lang.optional() }));
    await db.exec(`UPDATE users SET name = $2, phone = $3, locale = COALESCE($4, locale), updated_at = now() WHERE id = $1`, [u.id, body.name, body.phone, body.locale ?? null]);
    await db.exec(`UPDATE customers SET name = $2, phone = $3, updated_at = now() WHERE user_id = $1`, [u.id, body.name, body.phone]);
    c.user = await loadFresh(c, u.id);
    return { user: userDto(c) };
  }, { auth: "user" });

  r.post("/api/account/password", async (c) => {
    const u = requireUser(c);
    const body = await c.body(z.object({ current: z.string().min(1).max(128), password: s.password }));
    const row = await db.one<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id = $1`, [u.id]);
    if (!row?.password_hash || !(await verifyPassword(body.current, row.password_hash))) throw unauthorized("invalid_credentials");
    await db.exec(`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, [u.id, await hashPassword(body.password)]);
    await db.exec(`DELETE FROM sessions WHERE user_id = $1 AND id <> $2`, [u.id, u.session_id]);
    await audit(c, "user.password_change", "user", u.id);
    return { ok: true };
  }, { auth: "user", rate: "auth" });
}

async function loadFresh(c: Ctx, userId: number) {
  // the session cookie was just issued in this response; read its token back from the Set-Cookie header
  const sc = c.setCookies.findLast((x) => x.startsWith("sid="));
  const token = sc ? decodeURIComponent(sc.slice(4).split(";")[0]!) : c.cookies.sid;
  const u = token ? await loadUserByToken(token) : null;
  return u && u.id === userId ? u : null;
}
