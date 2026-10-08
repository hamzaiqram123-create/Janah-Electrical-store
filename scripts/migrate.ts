/** Applies db/migrations/*.sql in filename order; each file runs once inside a transaction. */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { db, tx, closeDb } from "../src/server/db";

export async function migrate(quiet = false) {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const dir = join(import.meta.dir, "../db/migrations");
  const applied = new Set((await db.q<{ name: string }>(`SELECT name FROM schema_migrations`)).map((r) => r.name));
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    await tx(async (t) => {
      await t.exec(sql);
      await t.exec(`INSERT INTO schema_migrations (name) VALUES ($1)`, [file]);
    });
    if (!quiet) console.log(`applied ${file}`);
  }
  if (!quiet) console.log("migrations up to date");
}

if (import.meta.main) {
  await migrate();
  await closeDb();
}
