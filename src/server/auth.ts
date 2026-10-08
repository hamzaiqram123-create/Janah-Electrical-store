import { config, isProd } from "./config";
import { db, type Db } from "./db";
import { cookie, forbidden, HttpError, unauthorized, type AuthUser, type Ctx } from "./http";
import { randomToken, sha256 } from "./security";
import type { Lang } from "../shared/constants";

const SESSION_COOKIE = "sid";
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export const hashPassword = (pw: string) => Bun.password.hash(pw, { algorithm: "argon2id" });
export const verifyPassword = (pw: string, hash: string) => Bun.password.verify(pw, hash).catch(() => false);

export async function loadUserByToken(token: string): Promise<AuthUser | null> {
  const row = await db.one(
    `SELECT u.id, u.email, u.name, u.phone, u.kind, u.locale, s.id AS session_id,
            c.id AS customer_id, r.key AS role, r.permissions
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN customers c ON c.user_id = u.id
       LEFT JOIN admins a ON a.user_id = u.id
       LEFT JOIN roles r ON r.id = a.role_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.status = 'active'`,
    [sha256(token)],
  );
  if (!row) return null;
  return {
    id: row.id, email: row.email, name: row.name, phone: row.phone, kind: row.kind, locale: row.locale as Lang,
    customer_id: row.customer_id ?? null, role: row.role ?? null,
    permissions: row.kind === "admin" ? (row.permissions ?? []) : [], session_id: row.session_id,
  };
}

export async function authenticate(c: Ctx) {
  const token = c.cookies[SESSION_COOKIE];
  if (token) c.user = await loadUserByToken(token);
}

export async function startSession(c: Ctx, userId: number, t: Db = db) {
  const token = randomToken();
  const days = config.SESSION_DAYS;
  await t.exec(
    `INSERT INTO sessions (user_id, token_hash, ip, user_agent, expires_at) VALUES ($1, $2, $3, $4, now() + ($5 || ' days')::interval)`,
    [userId, sha256(token), c.ip, (c.req.headers.get("user-agent") ?? "").slice(0, 300), String(days)],
  );
  c.setCookies.push(cookie(SESSION_COOKIE, token, { maxAge: days * 86400, secure: isProd }));
  // rotate the CSRF token together with the session
  c.setCookies.push(cookie("csrf", randomToken(18), { maxAge: days * 86400, httpOnly: false, secure: isProd }));
}

export async function endSession(c: Ctx) {
  const token = c.cookies[SESSION_COOKIE];
  if (token) await db.exec(`DELETE FROM sessions WHERE token_hash = $1`, [sha256(token)]);
  c.setCookies.push(cookie(SESSION_COOKIE, "", { maxAge: 0, secure: isProd }));
}

/** Verifies credentials with account lock-out after repeated failures. Same error for unknown email and wrong password. */
export async function checkCredentials(email: string, password: string): Promise<{ id: number; kind: string }> {
  const user = await db.one(`SELECT id, password_hash, status, kind, locked_until FROM users WHERE lower(email) = lower($1)`, [email]);
  if (!user || !user.password_hash) {
    await Bun.password.hash(password, { algorithm: "argon2id" }); // equalise timing
    throw unauthorized("invalid_credentials");
  }
  if (user.locked_until && new Date(user.locked_until) > new Date()) throw new HttpError(423, "account_locked");
  if (user.status !== "active") throw forbidden("account_disabled");
  if (!(await verifyPassword(password, user.password_hash))) {
    await db.exec(
      `UPDATE users SET failed_logins = failed_logins + 1,
              locked_until = CASE WHEN failed_logins + 1 >= $2 THEN now() + ($3 || ' minutes')::interval ELSE locked_until END
        WHERE id = $1`,
      [user.id, MAX_FAILED, String(LOCK_MINUTES)],
    );
    throw unauthorized("invalid_credentials");
  }
  await db.exec(`UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = now() WHERE id = $1`, [user.id]);
  return { id: user.id, kind: user.kind };
}

export function hasPermission(user: AuthUser | null, perm: string): boolean {
  if (!user || user.kind !== "admin") return false;
  return user.permissions.includes("*") || user.permissions.includes(perm);
}

export function requireUser(c: Ctx): AuthUser {
  if (!c.user) throw unauthorized();
  return c.user;
}
export function requireCustomer(c: Ctx): AuthUser & { customer_id: number } {
  const u = requireUser(c);
  if (!u.customer_id) throw forbidden("customer_only");
  return u as AuthUser & { customer_id: number };
}

/** Ensures a customers row exists for a registered user (admins shopping on the storefront get one lazily). */
export async function ensureCustomer(u: AuthUser, t: Db = db): Promise<number> {
  if (u.customer_id) return u.customer_id;
  const row = await t.one<{ id: number }>(
    `INSERT INTO customers (user_id, name, email, phone) VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET updated_at = now() RETURNING id`,
    [u.id, u.name || u.email, u.email, u.phone],
  );
  u.customer_id = row!.id;
  return row!.id;
}

export async function audit(c: Ctx | null, action: string, entity: string, entityId?: string | number | null, meta: Record<string, unknown> = {}, t: Db = db) {
  await t.exec(
    `INSERT INTO audit_logs (user_id, actor, action, entity, entity_id, meta, ip) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
    [c?.user?.id ?? null, c?.user?.email ?? "system", action, entity, entityId == null ? null : String(entityId), meta, c?.ip ?? null],
  );
}
