/**
 * Creates an admin account or resets the password / role of an existing one.
 *   bun run admin:create <email> <password> [role-key] [name]
 * Roles: super_admin (default), manager, sales, inventory, accountant, support.
 */
import { closeDb, db, tx } from "../src/server/db";
import { hashPassword } from "../src/server/auth";

const [email, password, roleKey = "super_admin", ...nameParts] = process.argv.slice(2);
if (!email || !password) {
  console.error("usage: bun run admin:create <email> <password> [role-key] [name]");
  process.exit(1);
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.error("invalid email address"); process.exit(1); }
if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
  console.error("password must be at least 10 characters and contain letters and digits");
  process.exit(1);
}
const role = await db.one(`SELECT id, key FROM roles WHERE key = $1`, [roleKey]);
if (!role) { console.error(`unknown role "${roleKey}" — run the seed first (bun run seed)`); process.exit(1); }

const hash = await hashPassword(password);
const lower = email.trim().toLowerCase();
await tx(async (t) => {
  const existing = await t.one(`SELECT id, kind FROM users WHERE lower(email) = $1`, [lower]);
  if (existing) {
    await t.exec(`UPDATE users SET password_hash = $2, kind = 'admin', status = 'active', failed_logins = 0, locked_until = NULL, updated_at = now() WHERE id = $1`, [existing.id, hash]);
    await t.exec(`INSERT INTO admins (user_id, role_id) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET role_id = EXCLUDED.role_id`, [existing.id, role.id]);
    await t.exec(`DELETE FROM sessions WHERE user_id = $1`, [existing.id]);
    console.log(`updated ${lower} → role ${role.key}`);
  } else {
    const u = await t.insert("users", { email: lower, name: nameParts.join(" ") || "Admin", password_hash: hash, kind: "admin" });
    await t.insert("admins", { user_id: u.id, role_id: role.id });
    console.log(`created ${lower} → role ${role.key}`);
  }
});
await closeDb();
