import { config } from "./config";
import { db, tx } from "./db";
import { errMeta, log } from "./logger";
import { recomputePrices } from "./services/catalog";
import { submitQueuedInvoices } from "./services/invoices";
import { flushNotifications, notifyCustomer } from "./services/notifications";
import { expireUnpaidOrders } from "./services/orders";
import { getSettings } from "./services/settings";
import type { Lang } from "../shared/constants";

/** E-mails a "you left items in your cart" reminder once per abandoned cart that has a known e-mail address. */
export async function sendCartRecovery() {
  const hours = (await getSettings()).checkout.cart_recovery_hours;
  const carts = await db.q(
    `SELECT c.id, c.token, c.locale, COALESCE(u.email, c.email) AS email, COALESCE(u.name, '') AS name
       FROM carts c LEFT JOIN users u ON u.id = c.user_id
      WHERE c.status = 'active' AND c.recovery_sent_at IS NULL AND COALESCE(u.email, c.email) IS NOT NULL
        AND c.updated_at < now() - ($1 || ' hours')::interval AND c.updated_at > now() - interval '7 days'
        AND EXISTS (SELECT 1 FROM cart_items WHERE cart_id = c.id) LIMIT 50`, [String(hours)]);
  for (const c of carts) {
    await tx(async (t) => {
      await t.exec(`UPDATE carts SET recovery_sent_at = now() WHERE id = $1`, [c.id]);
      await notifyCustomer(t, "cart_recovery", { lang: c.locale as Lang, email: c.email }, { name: c.name }, { link: `${config.APP_URL}/${c.locale}/cart?recover=${c.token}`, smsToo: false });
    });
  }
}

async function cleanup() {
  await db.exec(`DELETE FROM sessions WHERE expires_at < now()`);
  await db.exec(`DELETE FROM password_resets WHERE expires_at < now() - interval '1 day'`);
  await db.exec(`UPDATE carts SET status = 'abandoned' WHERE status = 'active' AND updated_at < now() - interval '60 days'`);
}

const jobs: [name: string, everySec: number, fn: () => Promise<unknown>][] = [
  ["notifications", 30, () => flushNotifications()],
  ["unpaid-orders", 120, expireUnpaidOrders],
  ["prices", 300, () => recomputePrices()],
  ["zatca", 300, submitQueuedInvoices],
  ["cart-recovery", 900, sendCartRecovery],
  ["cleanup", 3600, cleanup],
];

/** In-process scheduler. With several app instances set RUN_JOBS=false on all but one. */
export function startJobs() {
  if (!config.RUN_JOBS) return;
  for (const [name, every, fn] of jobs) {
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try { await fn(); } catch (e) { log.error(`job ${name} failed`, errMeta(e)); } finally { running = false; }
    };
    setInterval(run, every * 1000).unref?.();
    setTimeout(run, 3000 + Math.random() * 2000).unref?.();
  }
  log.info("background jobs started", { jobs: jobs.map((j) => j[0]) });
}
