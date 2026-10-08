import { config } from "../config";
import { db, type Db } from "../db";
import { errMeta, log } from "../logger";
import { dirOf, type Lang } from "../../shared/constants";
import { tr, hasKey } from "../../shared/i18n";
import { getSettings } from "./settings";

export type NotifyEvent =
  | "customer_registration" | "password_reset" | "order_confirmation" | "payment_confirmation" | "order_status"
  | "order_shipped" | "order_delivered" | "order_cancelled" | "order_refunded" | "cart_recovery" | "ticket_reply"
  | "new_order" | "low_inventory" | "new_ticket" | "return_requested";

type Vars = Record<string, string | number>;

function emailHtml(lang: Lang, store: string, subject: string, body: string, link?: string, linkLabel?: string): string {
  const dir = dirOf(lang);
  const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));
  const paras = esc(body).split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;line-height:1.7">${p.replace(/\n/g, "<br>")}</p>`).join("");
  const btn = link ? `<p style="margin:22px 0"><a href="${esc(link)}" style="background:#b5622e;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;display:inline-block;font-weight:600">${esc(linkLabel ?? link)}</a></p>` : "";
  return `<!doctype html><html lang="${lang}" dir="${dir}"><body style="margin:0;background:#eef0ee;font-family:'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif;color:#17202a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:8px;overflow:hidden;text-align:${dir === "rtl" ? "right" : "left"}">
<tr><td style="background:#17202a;color:#fff;padding:18px 24px;font-size:18px;font-weight:700">${esc(store)}</td></tr>
<tr><td style="height:4px;background:linear-gradient(90deg,#7a4a2b 0 20%,#17202a 20% 40%,#8b9299 40% 60%,#1f5fbf 60% 80%,#2f8f4e 80% 100%)"></td></tr>
<tr><td style="padding:26px 24px;font-size:15px"><h1 style="font-size:19px;margin:0 0 16px">${esc(subject)}</h1>${paras}${btn}</td></tr>
<tr><td style="padding:14px 24px;background:#f6f7f5;font-size:12px;color:#5b6570">${esc(store)}</td></tr>
</table></td></tr></table></body></html>`;
}

interface Target { lang: Lang; email?: string | null; phone?: string | null; userId?: number | null }

/** Queue notifications for a customer on every configured channel. Call `kickNotifications()` after the transaction commits. */
export async function notifyCustomer(t: Db, event: NotifyEvent, target: Target, vars: Vars, opts: { link?: string; smsToo?: boolean } = {}) {
  const settings = await getSettings();
  const lang = target.lang;
  const store = settings.store[`name_${lang}`] || settings.store.name_ar;
  const v = { store, ...vars };
  const subject = tr(lang, `ntf.${event}.subject`, v);
  const body = tr(lang, `ntf.${event}.body`, v);
  if (target.email) {
    await t.insert("notifications", { event, channel: "email", recipient: target.email, user_id: target.userId ?? null, locale: lang, subject, body, payload: { ...v, link: opts.link ?? null } });
  }
  if (target.phone && opts.smsToo !== false && hasKey("en", `ntf.${event}.sms`)) {
    const sms = tr(lang, `ntf.${event}.sms`, v) + (opts.link ? ` ${opts.link}` : "");
    if (settings.notifications.send_sms) await t.insert("notifications", { event, channel: "sms", recipient: target.phone, user_id: target.userId ?? null, locale: lang, body: sms, payload: v });
    if (settings.notifications.send_whatsapp) await t.insert("notifications", { event, channel: "whatsapp", recipient: target.phone, user_id: target.userId ?? null, locale: lang, body: sms, payload: v });
  }
}

/** In-app admin notification (always) plus e-mail to the configured admin address. */
export async function notifyAdmins(t: Db, event: NotifyEvent, vars: Vars, link?: string) {
  const settings = await getSettings();
  const v = { store: settings.store.name_ar, ...vars };
  const subject = tr("ar", `ntf.${event}.subject`, v), body = tr("ar", `ntf.${event}.body`, v);
  await t.exec(
    `INSERT INTO notifications (event, channel, locale, subject, body, payload, status, sent_at) VALUES ($1, 'admin', 'ar', $2, $3, $4::jsonb, 'sent', now())`,
    [event, subject, body, { ...v, link: link ?? null }]);
  if (settings.notifications.admin_email) {
    await t.insert("notifications", { event, channel: "email", recipient: settings.notifications.admin_email, locale: "ar", subject, body, payload: { ...v, link: link ?? null } });
  }
}

// ───────────── delivery ─────────────
type SendResult = { ok: true } | { ok: false; skipped?: boolean; error: string };

async function sendEmail(n: any): Promise<SendResult> {
  const settings = await getSettings();
  const lang = n.locale as Lang;
  const store = settings.store[`name_${lang}`] || settings.store.name_ar;
  const link = n.payload?.link as string | undefined;
  const html = emailHtml(lang, store, n.subject, n.body, link, link ? tr(lang, "ntf.open_link") : undefined);
  if (config.EMAIL_PROVIDER === "log") {
    log.info("email (log driver — set EMAIL_PROVIDER to deliver)", { to: n.recipient, subject: n.subject, link });
    return { ok: false, skipped: true, error: "EMAIL_PROVIDER=log (not delivered)" };
  }
  if (!config.RESEND_API_KEY) return { ok: false, skipped: true, error: "RESEND_API_KEY missing" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${config.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: config.EMAIL_FROM, to: [n.recipient], subject: n.subject, html, text: n.body + (link ? `\n\n${link}` : "") }),
    signal: AbortSignal.timeout(15_000),
  });
  return res.ok ? { ok: true } : { ok: false, error: `resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
}

async function sendSms(n: any): Promise<SendResult> {
  if (config.SMS_PROVIDER === "none" || !config.UNIFONIC_APP_SID) return { ok: false, skipped: true, error: "SMS provider not configured" };
  const form = new URLSearchParams({ AppSid: config.UNIFONIC_APP_SID, Recipient: String(n.recipient).replace(/^\+/, ""), Body: n.body });
  if (config.UNIFONIC_SENDER_ID) form.set("SenderID", config.UNIFONIC_SENDER_ID);
  const res = await fetch("https://el.cloud.unifonic.com/rest/SMS/messages", { method: "POST", body: form, signal: AbortSignal.timeout(15_000) });
  return res.ok ? { ok: true } : { ok: false, error: `unifonic ${res.status}: ${(await res.text()).slice(0, 200)}` };
}

async function sendWhatsapp(n: any): Promise<SendResult> {
  if (config.WHATSAPP_PROVIDER === "none" || !config.WHATSAPP_TOKEN || !config.WHATSAPP_PHONE_NUMBER_ID) return { ok: false, skipped: true, error: "WhatsApp provider not configured" };
  // Note: outside the 24-hour customer service window Meta only delivers pre-approved templates.
  const res = await fetch(`https://graph.facebook.com/v20.0/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.WHATSAPP_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: String(n.recipient).replace(/^\+/, ""), type: "text", text: { body: n.body } }),
    signal: AbortSignal.timeout(15_000),
  });
  return res.ok ? { ok: true } : { ok: false, error: `whatsapp ${res.status}: ${(await res.text()).slice(0, 200)}` };
}

let flushing = false;
/** Deliver queued notifications (also retried by the scheduler; gives up after 3 attempts). */
export async function flushNotifications(limit = 25) {
  if (flushing) return;
  flushing = true;
  try {
    const rows = await db.q(
      `UPDATE notifications SET attempts = attempts + 1
        WHERE id IN (SELECT id FROM notifications WHERE status = 'queued' AND attempts < 3 ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED)
        RETURNING *`, [limit]);
    for (const n of rows) {
      let r: SendResult;
      try {
        r = n.channel === "email" ? await sendEmail(n) : n.channel === "sms" ? await sendSms(n) : await sendWhatsapp(n);
      } catch (e) {
        r = { ok: false, error: e instanceof Error ? e.message : String(e) };
        log.warn("notification send failed", { id: n.id, ...errMeta(e) });
      }
      if (r.ok) await db.exec(`UPDATE notifications SET status = 'sent', sent_at = now(), error = NULL WHERE id = $1`, [n.id]);
      else if (r.skipped) await db.exec(`UPDATE notifications SET status = 'skipped', error = $2 WHERE id = $1`, [n.id, r.error]);
      else await db.exec(`UPDATE notifications SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'queued' END, error = $2 WHERE id = $1`, [n.id, r.error]);
    }
  } finally {
    flushing = false;
  }
}
export function kickNotifications() {
  setTimeout(() => flushNotifications().catch((e) => log.error("notification flush failed", errMeta(e))), 10);
}
