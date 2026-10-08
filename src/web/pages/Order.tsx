import { useState } from "react";
import { TRACK_STEPS, type OrderStatus } from "../../shared/constants";
import { api } from "../lib/api";
import { useApp } from "../lib/ctx";
import { Icon } from "../ui/Icon";
import { Breadcrumbs, Button, Field, Input, Link, Modal, ProductImage, StatusBadge, Textarea } from "../ui/kit";

export function Timeline({ status, history }: { status: OrderStatus; history: { status: string; created_at: string }[] }) {
  const { t, date } = useApp();
  const at = (s: string) => history.find((h) => h.status === s)?.created_at;
  if (status === "cancelled" || status === "returned" || status === "refunded") {
    return (
      <p className="flex items-center gap-3 rounded-md bg-surface-2 p-4 font-semibold">
        <Icon name={status === "cancelled" ? "x" : "undo"} className={status === "cancelled" ? "text-danger" : "text-muted"} />
        {t(`status.${status}`)}<span className="font-normal text-muted">{date(at(status), true)}</span>
      </p>
    );
  }
  const cur = TRACK_STEPS.indexOf(status);
  return (
    <ol className="grid gap-0 md:grid-cols-7">
      {TRACK_STEPS.map((s, i) => {
        const done = i <= cur, on = i === cur;
        return (
          <li key={s} className="relative flex gap-3 pb-5 md:flex-col md:items-center md:gap-2 md:pb-0 md:text-center" aria-current={on ? "step" : undefined}>
            {i < TRACK_STEPS.length - 1 && <span className={`absolute start-[13px] top-7 h-[calc(100%-28px)] w-0.5 md:start-1/2 md:top-[13px] md:h-0.5 md:w-full ${i < cur ? "bg-ok" : "bg-line"}`} aria-hidden="true" />}
            <span className={`relative z-10 grid size-7 shrink-0 place-items-center rounded-full border-2 ${done ? "border-ok bg-ok text-white" : "border-line bg-surface text-muted"}`}>
              {done ? <Icon name="check" size={15} /> : <span className="size-1.5 rounded-full bg-current" />}
            </span>
            <span>
              <span className={`block text-sm leading-tight ${on ? "font-bold" : done ? "font-medium" : "text-muted"}`}>{t(`status.${s}`)}</span>
              {at(s) && <time className="block text-xs text-muted" dateTime={at(s)}>{date(at(s), true)}</time>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Shipment({ s }: { s: any }) {
  const { t, date } = useApp();
  if (!s) return null;
  return (
    <div className="text-sm">
      <p className="flex flex-wrap items-center gap-2"><span className="text-muted">{t("order.tracking_no")}</span><b dir="ltr" className="tabular-nums">{s.tracking_number}</b>{s.carrier && <span className="text-muted">({s.carrier})</span>}</p>
      {s.shipped_at && <p className="text-muted">{t("order.shipped_on", { date: date(s.shipped_at) })}</p>}
      {s.tracking_url && <a href={s.tracking_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 font-semibold text-accent hover:underline">{t("order.track_carrier")}<Icon name="arrow" size={14} /></a>}
    </div>
  );
}

export default function OrderPage() {
  const app = useApp();
  const { t, money, date } = app;
  const [o, setO] = useState<any>(app.data.order);
  const [busy, setBusy] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [retOpen, setRetOpen] = useState(false);
  const [retQty, setRetQty] = useState<Record<number, number>>({});
  const [retReason, setRetReason] = useState("");
  const key = app.query.get("key");
  const qs = key ? `?key=${encodeURIComponent(key)}` : "";
  const placed = app.query.get("placed") === "1";
  const sep = app.lang === "en" ? ", " : "، ";
  const a = o.address ?? {};

  const act = async (name: string, fn: () => Promise<void>) => { setBusy(name); try { await fn(); } catch (e) { app.toast(app.errorText(e), "err"); } finally { setBusy(""); } };
  const cancel = () => act("cancel", async () => {
    const r = await api<any>(`/api/orders/${o.number}/cancel${qs}`, { body: { reason } });
    setO(r.order); setCancelOpen(false); app.toast(t("order.cancelled_ok"));
  });
  const reorder = () => act("reorder", async () => {
    const r = await api<any>(`/api/orders/${o.number}/reorder${qs}`, { body: {} });
    app.setCartCount(r.cart.count);
    app.toast(r.skipped.length ? t("order.reorder_partial") : t("order.reorder_ok"));
    void app.navigate(app.href("/cart"));
  });
  const requestReturn = () => act("return", async () => {
    const items = Object.entries(retQty).filter(([, q]) => q > 0).map(([id, q]) => ({ order_item_id: Number(id), quantity: q }));
    if (!items.length) { app.toast(t("ret.pick_items"), "err"); return; }
    if (retReason.trim().length < 5) { app.toast(t("ret.reason_required"), "err"); return; }
    await api(`/api/orders/${o.number}/return${qs}`, { body: { reason: retReason, items } });
    setRetOpen(false); app.toast(t("ret.sent"));
    await app.reload();
  });

  const pay = o.payment;
  const payLabel = pay?.method && t(`paym.${pay.method}`) !== `paym.${pay.method}` ? t(`paym.${pay.method}`) : t(`paym.${o.payment_method}`);

  return (
    <div className="container-x py-5 md:py-7">
      {app.shell.user ? <Breadcrumbs items={[{ name: t("account.orders"), to: "/account/orders" }, { name: o.number }]} /> : <Breadcrumbs items={[{ name: `${t("order.title")} ${o.number}` }]} />}

      {placed && o.status !== "cancelled" && (
        <div className="mb-5 flex items-start gap-4 rounded-md border border-ok/40 bg-ok-soft p-5" role="status">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-ok text-white"><Icon name="check" size={24} /></span>
          <div>
            <h1 className="text-xl font-bold">{t("order.thanks")}</h1>
            <p className="mt-1">{t("order.thanks_text", { number: o.number })}</p>
            {o.customer.email && app.shell.settings.email_enabled && <p className="mt-1 text-sm text-muted [overflow-wrap:anywhere]">{t("order.thanks_email", { email: o.customer.email })}</p>}
          </div>
        </div>
      )}
      {pay?.pay_url && (
        <div className="mb-5 flex flex-col items-start justify-between gap-3 rounded-md border border-warn/50 bg-warn-soft p-5 sm:flex-row sm:items-center" role="alert">
          <div><h2 className="font-bold">{t("order.pay_pending")}</h2><p className="text-sm">{t("order.pay_pending_text")}</p></div>
          <a href={pay.pay_url} className="btn btn-primary btn-md shrink-0"><Icon name="lock" size={18} />{t("checkout.pay_now", { total: money(o.totals.total) })}</a>
        </div>
      )}
      {o.payment_status === "failed" && <p className="mb-5 rounded-md border border-danger/40 bg-danger-soft p-4 font-medium">{t("order.pay_failed")}</p>}

      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          {!placed && <h1 className="h-page">{t("order.title")} <span dir="ltr" className="tabular-nums">{o.number}</span></h1>}
          <p className="text-sm text-muted">{t("order.placed_on", { date: date(o.created_at, true) })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={o.status} />
          <StatusBadge status={o.payment_status} prefix="pstatus" />
        </div>
      </header>

      <section className="card mb-5 p-5" aria-label={t("order.progress")}>
        <Timeline status={o.status} history={o.history} />
        {o.status === "cancelled" && o.cancel_reason && <p className="mt-3 text-sm text-muted">{t("order.reason")}: {o.cancel_reason}</p>}
        {o.shipment && <div className="mt-4 border-t border-line pt-4"><Shipment s={o.shipment} /></div>}
        {!o.shipment && o.delivery_to && !["cancelled", "delivered", "returned", "refunded"].includes(o.status) && (
          <p className="mt-4 flex items-center gap-2 border-t border-line pt-4 text-sm"><Icon name="clock" size={16} className="text-muted" />{t("ship.eta", { from: date(o.delivery_from), to: date(o.delivery_to) })}</p>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="card h-fit">
          <h2 className="border-b border-line px-4 py-3 font-bold">{t("order.items")}</h2>
          <ul className="divide-y divide-line">
            {o.items.map((it: any) => (
              <li key={it.id} className="flex items-center gap-3 p-3 md:p-4">
                <span className="size-16 shrink-0 overflow-hidden rounded border border-line bg-white"><ProductImage src={it.image} alt="" glyph={it.glyph} /></span>
                <div className="min-w-0 flex-1">
                  {it.slug ? <Link to={`/p/${it.slug}`} className="line-clamp-2 font-medium hover:text-accent">{it.name}</Link> : <span className="line-clamp-2 font-medium">{it.name}</span>}
                  <p className="text-xs text-muted tabular-nums" dir="ltr" style={{ textAlign: "start" }}>{it.sku}</p>
                  <p className="text-sm text-muted tabular-nums">{it.quantity} × {money(it.unit_price)}</p>
                </div>
                <span className="price shrink-0">{money(it.line_total)}</span>
              </li>
            ))}
          </ul>
          <dl className="space-y-2 border-t border-line p-4 text-sm">
            <div className="flex justify-between"><dt className="text-muted">{t("tot.subtotal_plain")}</dt><dd className="tabular-nums">{money(o.totals.items_subtotal)}</dd></div>
            {o.totals.discount_total > 0 && <div className="flex justify-between text-ok"><dt>{t("tot.discount")}{o.coupon_code ? ` (${o.coupon_code})` : ""}</dt><dd className="tabular-nums" dir="ltr">−{money(o.totals.discount_total)}</dd></div>}
            {o.channel === "web" && <div className="flex justify-between"><dt className="text-muted">{t("tot.shipping")}</dt><dd className="tabular-nums">{o.totals.shipping_fee ? money(o.totals.shipping_fee) : t("tot.free")}</dd></div>}
            {o.totals.cod_fee > 0 && <div className="flex justify-between"><dt className="text-muted">{t("tot.cod_fee")}</dt><dd className="tabular-nums">{money(o.totals.cod_fee)}</dd></div>}
            <div className="flex justify-between border-t border-line pt-3 text-base"><dt className="font-bold">{t("tot.total")}</dt><dd className="price text-xl">{money(o.totals.total)}</dd></div>
            <div className="flex justify-between text-xs text-muted"><dt>{t("tot.vat_included")}</dt><dd className="tabular-nums">{money(o.totals.vat_total)}</dd></div>
          </dl>
        </section>

        <aside className="space-y-4">
          {o.channel === "web" && (
            <section className="card p-4 text-sm">
              <h2 className="mb-2 font-bold">{t("order.delivery")}</h2>
              <p className="font-medium">{a.recipient_name}</p>
              <p className="text-muted">{[a.district, a.street, a.building_no].filter(Boolean).join(sep)}</p>
              <p className="text-muted">{[a.city, a.region, a.postal_code].filter(Boolean).join(sep)}</p>
              {a.phone && <p className="text-muted" dir="ltr" style={{ textAlign: "start" }}>{a.phone}</p>}
              {o.shipping_method && <p className="mt-2 flex items-center gap-2"><Icon name="truck" size={16} className="text-muted" />{o.shipping_method}</p>}
            </section>
          )}
          <section className="card p-4 text-sm">
            <h2 className="mb-2 font-bold">{t("order.payment")}</h2>
            <p className="flex items-center justify-between gap-2"><span>{payLabel}</span><StatusBadge status={o.payment_status} prefix="pstatus" /></p>
            {pay?.refunded_amount > 0 && <p className="mt-1 text-muted">{t("order.refunded_amount", { amount: money(pay.refunded_amount) })}</p>}
          </section>
          {o.invoices.length > 0 && (
            <section className="card p-4 text-sm">
              <h2 className="mb-2 font-bold">{t("order.invoices")}</h2>
              <ul className="space-y-2">
                {o.invoices.map((inv: any) => (
                  <li key={inv.number}>
                    <a href={app.href(`/invoice/${inv.number}${qs}`)} target="_blank" rel="noopener" className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2 hover:border-fg">
                      <span className="flex items-center gap-2"><Icon name="receipt" size={18} className="text-accent" /><span><b dir="ltr">{inv.number}</b><br /><span className="text-xs text-muted">{t(inv.kind === "credit_note" ? "inv.credit_note" : "inv.tax_invoice")}</span></span></span>
                      <Icon name="print" size={18} className="text-muted" />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {o.returns.length > 0 && (
            <section className="card p-4 text-sm">
              <h2 className="mb-2 font-bold">{t("ret.title")}</h2>
              <ul className="space-y-2">
                {o.returns.map((r: any) => <li key={r.number} className="flex items-center justify-between gap-2"><span><b dir="ltr">{r.number}</b> <span className="text-muted">{date(r.created_at)}</span></span><StatusBadge status={r.status} prefix="rstatus" /></li>)}
              </ul>
            </section>
          )}
          <div className="no-print flex flex-col gap-2">
            {o.channel === "web" && <Button variant="outline" icon="refresh" busy={busy === "reorder"} onClick={reorder}>{t("order.reorder")}</Button>}
            {o.can_return && <Button variant="outline" icon="undo" onClick={() => { setRetQty({}); setRetOpen(true); }}>{t("ret.request")}</Button>}
            {o.can_cancel && <Button variant="danger" icon="x" onClick={() => setCancelOpen(true)}>{t("order.cancel")}</Button>}
            <Link to="/contact" className="btn btn-ghost btn-md"><Icon name="chat" size={18} />{t("order.help")}</Link>
          </div>
        </aside>
      </div>

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title={t("order.cancel")}>
        <p className="mb-4 text-muted">{t("order.cancel_confirm", { number: o.number })}</p>
        <Field label={t("order.cancel_reason")}><Textarea rows={3} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></Field>
        <div className="mt-5 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => setCancelOpen(false)}>{t("c.back")}</Button>
          <Button variant="danger" busy={busy === "cancel"} onClick={cancel}>{t("order.cancel_yes")}</Button>
        </div>
      </Modal>

      <Modal open={retOpen} onClose={() => setRetOpen(false)} title={t("ret.request")}>
        <p className="mb-3 text-sm text-muted">{t("ret.intro")}</p>
        <ul className="mb-4 divide-y divide-line rounded-md border border-line">
          {o.items.map((it: any) => (
            <li key={it.id} className="flex items-center gap-3 p-3">
              <span className="line-clamp-2 flex-1 text-sm">{it.name}</span>
              <label className="flex items-center gap-2 text-sm"><span className="sr-only">{t("p.qty")}</span>
                <select className="input h-9 w-20" value={retQty[it.id] ?? 0} onChange={(e) => setRetQty((q) => ({ ...q, [it.id]: Number(e.target.value) }))}>
                  {Array.from({ length: it.quantity + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </li>
          ))}
        </ul>
        <Field label={t("ret.reason")} required><Textarea rows={3} value={retReason} maxLength={1000} onChange={(e) => setRetReason(e.target.value)} /></Field>
        <Button className="mt-5 w-full" busy={busy === "return"} onClick={requestReturn}>{t("ret.submit")}</Button>
      </Modal>
    </div>
  );
}

export function TrackPage() {
  const app = useApp();
  const { t, date } = app;
  const [mode, setMode] = useState<"order" | "tracking">("order");
  const [number, setNumber] = useState("");
  const [contact, setContact] = useState("");
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);

  const submit = async () => {
    setBusy(true); setNotFound(false); setRes(null);
    try {
      const q = mode === "order" ? `number=${encodeURIComponent(number.trim())}&contact=${encodeURIComponent(contact.trim())}` : `tracking=${encodeURIComponent(tracking.trim())}`;
      setRes((await api<any>(`/api/track?${q}`)).tracking);
    } catch (e: any) {
      if (e?.status === 404) setNotFound(true); else app.toast(app.errorText(e), "err");
    } finally { setBusy(false); }
  };

  return (
    <div className="container-x max-w-3xl py-5 md:py-8">
      <Breadcrumbs items={[{ name: t("track.title") }]} />
      <h1 className="h-page">{t("track.title")}</h1>
      <p className="mt-1 mb-5 text-muted">{t("track.intro")}</p>
      <form className="card p-4 md:p-6" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="mb-4 flex gap-2 border-b border-line" role="tablist">
          <button type="button" role="tab" aria-selected={mode === "order"} className={`tab ${mode === "order" ? "tab-on" : ""}`} onClick={() => setMode("order")}>{t("track.by_order")}</button>
          <button type="button" role="tab" aria-selected={mode === "tracking"} className={`tab ${mode === "tracking" ? "tab-on" : ""}`} onClick={() => setMode("tracking")}>{t("track.by_tracking")}</button>
        </div>
        {mode === "order" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("track.order_no")} required><Input dir="ltr" className="text-start uppercase" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="JR-2026-000123" required /></Field>
            <Field label={t("track.contact")} required hint={t("track.contact_hint")}><Input dir="ltr" className="text-start" value={contact} onChange={(e) => setContact(e.target.value)} required /></Field>
          </div>
        ) : (
          <Field label={t("order.tracking_no")} required><Input dir="ltr" className="text-start uppercase" value={tracking} onChange={(e) => setTracking(e.target.value)} required /></Field>
        )}
        <Button type="submit" className="mt-5" icon="search" busy={busy}>{t("track.submit")}</Button>
      </form>

      {notFound && <p className="mt-5 rounded-md border border-danger/40 bg-danger-soft p-4" role="alert">{t("track.not_found")}</p>}
      {res && (
        <section className="card mt-5 p-5" aria-live="polite">
          <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold">{t("order.title")} <span dir="ltr" className="tabular-nums">{res.number}</span></h2>
            <StatusBadge status={res.status} />
          </header>
          <Timeline status={res.status} history={res.history} />
          <dl className="mt-4 grid gap-2 border-t border-line pt-4 text-sm sm:grid-cols-2">
            <div><dt className="text-muted">{t("order.placed")}</dt><dd>{date(res.created_at)}</dd></div>
            {res.shipping_method && <div><dt className="text-muted">{t("checkout.s_shipping")}</dt><dd>{res.shipping_method}{res.city ? ` (${res.city})` : ""}</dd></div>}
            {res.delivery_to && !["delivered", "cancelled"].includes(res.status) && <div className="sm:col-span-2"><dt className="text-muted">{t("order.expected")}</dt><dd>{t("ship.eta", { from: date(res.delivery_from), to: date(res.delivery_to) })}</dd></div>}
          </dl>
          {res.shipment && <div className="mt-4 border-t border-line pt-4"><Shipment s={res.shipment} /></div>}
        </section>
      )}
    </div>
  );
}
