import { useState } from "react";
import { ORDER_STATUSES, ORDER_TRANSITIONS, sar, type OrderStatus } from "../../shared/constants";
import { api } from "../../web/lib/api";
import { useApp } from "../../web/lib/ctx";
import { Icon } from "../../web/ui/Icon";
import { Badge, Button, Field, Input, Link, Modal, Pagination, Select, StatusBadge, Textarea } from "../../web/ui/kit";
import { DataTable, ExportButtons, MoneyInput, PageHead, SearchInput, useAction, useAdmin, useFetch, useQueryState, nm } from "../core";

export const payMethodLabel = (t: (k: string) => string, m: string | null | undefined) => (m && t(`paym.${m}`) !== `paym.${m}` ? t(`paym.${m}`) : m ?? "—");
/** Who collected the money: cash on delivery, the shop counter, or the named payment gateway. */
export const providerLabel = (t: (k: string) => string, p: string) => (p === "cod" ? t("paym.cod") : p === "pos" ? t("a.ch.pos") : p.charAt(0).toUpperCase() + p.slice(1));

export function OrdersList() {
  const app = useApp();
  const { t, date } = app;
  const admin = useAdmin();
  const qs = useQueryState();
  const page = Number(qs.get("page")) || 1;
  const params = new URLSearchParams();
  for (const k of ["q", "status", "payment_status", "channel", "from", "to", "customer_id"]) if (qs.get(k)) params.set(k, qs.get(k));
  const list = useFetch<any>(`/api/admin/orders?page=${page}&${params}`);
  const counts = list.data?.counts ?? {};
  return (
    <>
      <PageHead title={t("a.nav.orders")} sub={list.data ? t("a.n_results", { n: list.data.total }) : undefined}>
        <ExportButtons url={`/api/admin/orders?${params}`} />
      </PageHead>
      <div className="no-print mb-3 flex gap-1 overflow-x-auto border-b border-line">
        <button type="button" className={`tab ${!qs.get("status") ? "tab-on" : ""}`} onClick={() => qs.set({ status: null })}>{t("a.all")}</button>
        {ORDER_STATUSES.map((s) => (
          <button type="button" key={s} className={`tab ${qs.get("status") === s ? "tab-on" : ""}`} onClick={() => qs.set({ status: s })}>{t(`status.${s}`)}{counts[s] ? <span className="ms-1.5 text-xs text-muted tabular-nums">{counts[s]}</span> : null}</button>
        ))}
      </div>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={qs.get("q")} onChange={(v) => qs.set({ q: v })} placeholder={t("a.orders_search")} />
        <Select className="h-10 w-auto" value={qs.get("payment_status")} onChange={(e) => qs.set({ payment_status: e.target.value })} aria-label={t("a.f.payment")}>
          <option value="">{t("a.f.payment")}</option>{["unpaid", "pending", "paid", "failed", "refunded", "partially_refunded"].map((s) => <option key={s} value={s}>{t(`pstatus.${s}`)}</option>)}
        </Select>
        <Select className="h-10 w-auto" value={qs.get("channel")} onChange={(e) => qs.set({ channel: e.target.value })} aria-label={t("a.f.channel")}>
          <option value="">{t("a.f.channel")}</option><option value="web">{t("a.ch.web")}</option><option value="pos">{t("a.ch.pos")}</option>
        </Select>
        <label className="flex items-center gap-1.5 text-sm text-muted">{t("f.from")}<Input type="date" dir="ltr" className="h-10 w-40" value={qs.get("from")} onChange={(e) => qs.set({ from: e.target.value })} /></label>
        <label className="flex items-center gap-1.5 text-sm text-muted">{t("f.to")}<Input type="date" dir="ltr" className="h-10 w-40" value={qs.get("to")} onChange={(e) => qs.set({ to: e.target.value })} /></label>
      </div>
      <DataTable rows={list.data?.rows} loading={list.loading} onRow={(o) => admin.go(`/admin/orders/${o.id}`)} columns={[
        { key: "number", label: t("a.f.order"), render: (o) => <><b dir="ltr" className="tabular-nums">{o.number}</b><span className="block text-xs text-muted">{date(o.created_at, true)}</span></> },
        { key: "customer_name", label: t("a.f.customer"), render: (o) => <>{o.customer_name}<span className="block text-xs text-muted" dir="ltr" style={{ textAlign: "start" }}>{o.customer_phone}</span></> },
        { key: "city", label: t("addr.city"), render: (o) => o.city ?? (o.channel === "pos" ? t("a.ch.pos") : "—") },
        { key: "units", label: t("a.f.units"), className: "text-end tabular-nums" },
        { key: "payment", label: t("a.f.payment"), render: (o) => <><StatusBadge status={o.payment_status} prefix="pstatus" /><span className="block text-xs text-muted">{payMethodLabel(t, o.payment_method)}</span></> },
        { key: "status", label: t("a.f.status"), render: (o) => <StatusBadge status={o.status} /> },
        { key: "total", label: t("tot.total"), className: "text-end font-semibold tabular-nums", render: (o) => sar(o.total) },
      ]} />
      <Pagination page={page} pages={list.data?.pages ?? 1} onPage={(p) => qs.set({ page: String(p) }, true)} />
    </>
  );
}

export function OrderDetail({ params }: { params: string[] }) {
  const app = useApp();
  const { t, date, money } = app;
  const admin = useAdmin();
  const id = params[0];
  const { data, reload } = useFetch<any>(`/api/admin/orders/${id}`);
  const act = useAction();
  const [statusTo, setStatusTo] = useState<OrderStatus | null>(null);
  const [sf, setSf] = useState({ note: "", tracking_number: "", carrier: "", tracking_url: "", restock: true });
  const [refund, setRefund] = useState<{ amount: number | null; reason: string } | null>(null);
  const [paid, setPaid] = useState<string | null>(null);
  if (!data) return <p className="text-muted">{t("c.loading")}</p>;
  const { order: o, items, history, payments, shipments, invoices, returns, customer } = data;
  const a = o.address ?? {};
  const next = (ORDER_TRANSITIONS[o.status as OrderStatus] ?? []).filter((s) => s !== "refunded");
  const pay = [...payments].reverse().find((p: any) => p.status === "paid" || p.status === "partially_refunded");
  const refundable = pay ? pay.amount - pay.refunded_amount : 0;
  const canManage = admin.can("orders.manage");
  const canMoney = admin.can("payments.refund");

  const changeStatus = async () => {
    const ok = await act.run("status", () => api(`/api/admin/orders/${id}/status`, { body: { status: statusTo, note: sf.note || null, tracking_number: sf.tracking_number || null, carrier: sf.carrier || null, tracking_url: sf.tracking_url || null, restock: sf.restock } }), t("a.saved"));
    if (ok) { setStatusTo(null); setSf({ note: "", tracking_number: "", carrier: "", tracking_url: "", restock: true }); await reload(); }
  };
  const doRefund = async () => {
    const ok = await act.run("refund", () => api(`/api/admin/orders/${id}/refund`, { body: { amount: refund!.amount, reason: refund!.reason } }), t("a.refunded_ok"));
    if (ok) { setRefund(null); await reload(); }
  };
  const markPaid = async () => {
    const ok = await act.run("paid", () => api(`/api/admin/orders/${id}/mark-paid`, { body: { method: paid } }), t("a.saved"));
    if (ok) { setPaid(null); await reload(); }
  };

  return (
    <>
      <PageHead title={<><Link to="/orders" className="text-muted hover:text-fg">{t("a.nav.orders")}</Link> <span className="text-muted">/</span> <span dir="ltr" className="tabular-nums">{o.number}</span></>}
        sub={<>{date(o.created_at, true)} — {t(`a.ch.${o.channel}`)}</>}>
        <StatusBadge status={o.status} /><StatusBadge status={o.payment_status} prefix="pstatus" />
        <Button variant="outline" size="sm" icon="print" onClick={() => window.print()}>{t("a.print_pdf")}</Button>
      </PageHead>

      {canManage && next.length > 0 && (
        <div className="no-print card mb-4 flex flex-wrap items-center gap-2 p-3">
          <span className="text-sm font-semibold text-muted">{t("a.move_to")}</span>
          {next.map((s) => <Button key={s} size="sm" variant={s === "cancelled" || s === "returned" ? "danger" : s === next[0] ? "primary" : "outline"} onClick={() => setStatusTo(s)}>{t(`status.${s}`)}</Button>)}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <section className="card overflow-x-auto">
            <table className="table-x">
              <thead><tr><th>{t("a.f.product")}</th><th className="text-end">{t("a.f.unit_price")}</th><th className="text-end">{t("p.qty")}</th><th className="text-end">{t("a.f.stock_now")}</th><th className="text-end">{t("tot.total")}</th></tr></thead>
              <tbody>
                {items.map((it: any) => (
                  <tr key={it.id}>
                    <td>{it.product_id ? <Link to={`/products/${it.product_id}`} className="font-medium hover:text-accent">{nm(it)}</Link> : nm(it)}<span className="block text-xs text-muted" dir="ltr" style={{ textAlign: "start" }}>{it.sku}{it.barcode ? ` / ${it.barcode}` : ""}</span></td>
                    <td className="text-end tabular-nums">{sar(it.unit_price)}{it.original_unit_price > it.unit_price && <s className="block text-xs text-muted">{sar(it.original_unit_price)}</s>}</td>
                    <td className="text-end font-semibold tabular-nums">{it.quantity}</td>
                    <td className="text-end text-muted tabular-nums">{it.stock_now}</td>
                    <td className="text-end font-semibold tabular-nums">{sar(it.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="ms-auto w-full max-w-sm space-y-1.5 border-t border-line p-4 text-sm">
              <div className="flex justify-between"><dt className="text-muted">{t("tot.subtotal_plain")}</dt><dd className="tabular-nums">{sar(o.items_subtotal)}</dd></div>
              {o.discount_total > 0 && <div className="flex justify-between"><dt className="text-muted">{t("tot.discount")} {o.coupon_code && <span dir="ltr">({o.coupon_code})</span>}</dt><dd className="tabular-nums" dir="ltr">−{sar(o.discount_total)}</dd></div>}
              <div className="flex justify-between"><dt className="text-muted">{t("tot.shipping")}</dt><dd className="tabular-nums">{sar(o.shipping_fee)}</dd></div>
              {o.cod_fee > 0 && <div className="flex justify-between"><dt className="text-muted">{t("tot.cod_fee")}</dt><dd className="tabular-nums">{sar(o.cod_fee)}</dd></div>}
              <div className="flex justify-between text-muted"><dt>{t("inv.total_excl")}</dt><dd className="tabular-nums">{sar(o.total_excl_vat)}</dd></div>
              <div className="flex justify-between text-muted"><dt>{t("inv.vat_total")}</dt><dd className="tabular-nums">{sar(o.vat_total)}</dd></div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-bold"><dt>{t("tot.total")}</dt><dd className="tabular-nums">{money(o.total)}</dd></div>
            </dl>
          </section>

          <section className="card p-4">
            <h2 className="mb-3 font-bold">{t("order.payment")}</h2>
            <table className="table-x">
              <tbody>
                {payments.map((p: any) => (
                  <tr key={p.id}>
                    <td>{providerLabel(t, p.provider)}<span className="block text-xs text-muted">{payMethodLabel(t, p.method)}</span></td>
                    <td><StatusBadge status={p.status} prefix="pstatus" /></td>
                    <td className="text-end tabular-nums">{sar(p.amount)}{p.refunded_amount > 0 && <span className="block text-xs text-danger" dir="ltr">−{sar(p.refunded_amount)}</span>}</td>
                    <td className="text-xs text-muted">{p.paid_at ? date(p.paid_at, true) : "—"}{p.gateway_id && <span className="block" dir="ltr" style={{ textAlign: "start" }}>{String(p.gateway_id).slice(0, 18)}…</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {canMoney && (
              <div className="no-print mt-3 flex flex-wrap gap-2">
                {o.payment_status !== "paid" && o.payment_status !== "refunded" && o.payment_status !== "partially_refunded" && o.status !== "cancelled" && <Button size="sm" variant="outline" icon="cash" onClick={() => setPaid("cash")}>{t("a.mark_paid")}</Button>}
                {refundable > 0 && <Button size="sm" variant="danger" icon="undo" onClick={() => setRefund({ amount: refundable, reason: "" })}>{t("a.refund")}</Button>}
                {payments.some((p: any) => p.status === "pending" && p.provider !== "cod" && p.provider !== "pos") && <Button size="sm" variant="outline" icon="refresh" busy={act.busy === "sync"} onClick={async () => { if (await act.run("sync", () => api(`/api/admin/orders/${id}/sync-payment`, { body: {} }))) await reload(); }}>{t("a.sync_payment")}</Button>}
              </div>
            )}
          </section>

          <section className="card p-4">
            <h2 className="mb-3 font-bold">{t("a.history")}</h2>
            <ol className="space-y-3 text-sm">
              {history.map((h: any, i: number) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />
                  <div><p><b>{t(`status.${h.status}`)}</b> <span className="text-muted">{date(h.created_at, true)}{h.user_name ? ` — ${h.user_name}` : ""}</span></p>{h.note && <p className="text-muted">{h.note}</p>}</div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="card p-4 text-sm">
            <h2 className="mb-2 font-bold">{t("a.f.customer")}</h2>
            <p className="font-medium">{customer ? <Link to={`/customers/${customer.id}`} className="hover:text-accent">{o.customer_name}</Link> : o.customer_name}</p>
            <p dir="ltr" style={{ textAlign: "start" }}>{o.customer_phone}</p>
            {o.customer_email && <p dir="ltr" style={{ textAlign: "start" }}>{o.customer_email}</p>}
            {customer?.company_name && <p className="mt-1" dir="auto">{customer.company_name}</p>}
            {customer?.vat_number && <p>{t("inv.vat_no")}: <span dir="ltr">{customer.vat_number}</span></p>}
            {customer && <p className="mt-1 text-muted">{t("a.customer_orders", { n: customer.order_count })}{customer.is_guest ? ` — ${t("a.guest")}` : ""}</p>}
          </section>
          {o.channel === "web" && (
            <section className="card p-4 text-sm">
              <h2 className="mb-2 font-bold">{t("order.delivery")}</h2>
              <p>{[a.district, a.street, a.building_no].filter(Boolean).join("، ")}</p>
              <p>{[a.city, a.region, a.postal_code].filter(Boolean).join("، ")}</p>
              {a.short_address && <p dir="ltr" style={{ textAlign: "start" }}>{a.short_address}</p>}
              {a.notes && <p className="mt-1 text-muted">{a.notes}</p>}
              <p className="mt-2 flex items-center gap-2"><Icon name="truck" size={16} className="text-muted" />{o.shipping_method_name ?? "—"}</p>
              {o.delivery_to && <p className="text-muted">{t("ship.eta", { from: date(o.delivery_from), to: date(o.delivery_to) })}</p>}
              {shipments.map((s: any) => <p key={s.id} className="mt-2 rounded-md bg-surface-2 p-2"><b dir="ltr">{s.tracking_number}</b> {s.carrier && <span className="text-muted">({s.carrier})</span>} <Badge tone="info">{s.status}</Badge></p>)}
            </section>
          )}
          {o.notes && <section className="card p-4 text-sm"><h2 className="mb-2 font-bold">{t("checkout.notes")}</h2><p className="whitespace-pre-line">{o.notes}</p></section>}
          {o.cancel_reason && <section className="card p-4 text-sm"><h2 className="mb-2 font-bold">{t("order.reason")}</h2><p>{o.cancel_reason}</p></section>}
          <section className="card p-4 text-sm">
            <h2 className="mb-2 font-bold">{t("order.invoices")}</h2>
            {invoices.length ? (
              <ul className="space-y-2">
                {invoices.map((inv: any) => (
                  <li key={inv.id} className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2">
                    <span><b dir="ltr">{inv.number}</b><span className="block text-xs text-muted">{t(inv.kind === "credit_note" ? "inv.credit_note" : inv.type === "standard" ? "inv.tax_invoice" : "inv.simplified")} — {sar(inv.total)}</span></span>
                    <a className="btn btn-outline btn-sm" href={`/${app.lang}/invoice/${inv.number}`} target="_blank" rel="noopener"><Icon name="print" size={16} />{t("a.open")}</a>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <p className="text-muted">{t("a.no_invoice")}</p>
                {canManage && o.status !== "cancelled" && <Button size="sm" variant="outline" className="mt-2" icon="receipt" busy={act.busy === "inv"} onClick={async () => { if (await act.run("inv", () => api(`/api/admin/orders/${id}/invoice`, { body: {} }), t("a.saved"))) await reload(); }}>{t("a.issue_invoice")}</Button>}
              </>
            )}
          </section>
          {returns.length > 0 && (
            <section className="card p-4 text-sm">
              <h2 className="mb-2 font-bold">{t("ret.title")}</h2>
              {returns.map((r: any) => <p key={r.id} className="flex items-center justify-between gap-2 py-1"><Link to="/returns" className="hover:text-accent"><b dir="ltr">{r.number}</b></Link><StatusBadge status={r.status} prefix="rstatus" /></p>)}
            </section>
          )}
        </aside>
      </div>

      <Modal open={!!statusTo} onClose={() => setStatusTo(null)} title={statusTo ? t("a.change_status_to", { status: t(`status.${statusTo}`) }) : ""}>
        <div className="space-y-4">
          {statusTo === "shipped" && (
            <>
              <Field label={t("order.tracking_no")} hint={t("a.tracking_hint")}><Input dir="ltr" className="text-start" value={sf.tracking_number} onChange={(e) => setSf({ ...sf, tracking_number: e.target.value })} /></Field>
              <Field label={t("a.f.carrier")}><Input value={sf.carrier} onChange={(e) => setSf({ ...sf, carrier: e.target.value })} /></Field>
              <Field label={t("a.f.tracking_url")}><Input dir="ltr" className="text-start" placeholder="https://" value={sf.tracking_url} onChange={(e) => setSf({ ...sf, tracking_url: e.target.value })} /></Field>
            </>
          )}
          {statusTo === "returned" && <label className="flex items-center gap-2.5"><input type="checkbox" className="check" checked={sf.restock} onChange={(e) => setSf({ ...sf, restock: e.target.checked })} />{t("a.restock")}</label>}
          {statusTo === "cancelled" && <p className="rounded-md bg-warn-soft p-3 text-sm">{t("a.cancel_note")}</p>}
          <Field label={statusTo === "cancelled" ? t("order.reason") : t("a.f.note")} hint={t("a.note_hint")}><Textarea rows={2} value={sf.note} onChange={(e) => setSf({ ...sf, note: e.target.value })} /></Field>
          <div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => setStatusTo(null)}>{t("c.cancel")}</Button><Button busy={act.busy === "status"} onClick={changeStatus}>{t("a.confirm")}</Button></div>
        </div>
      </Modal>

      <Modal open={!!refund} onClose={() => setRefund(null)} title={t("a.refund")}>
        {refund && (
          <div className="space-y-4">
            <p className="text-sm text-muted">{t("a.refund_text", { max: sar(refundable) })}</p>
            <Field label={t("a.f.amount")} required><MoneyInput value={refund.amount} onChange={(h) => setRefund({ ...refund, amount: h })} /></Field>
            <Field label={t("order.reason")} required><Textarea rows={2} value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} /></Field>
            <div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => setRefund(null)}>{t("c.cancel")}</Button><Button variant="danger" busy={act.busy === "refund"} disabled={!refund.amount || refund.reason.trim().length < 3} onClick={doRefund}>{t("a.refund")}</Button></div>
          </div>
        )}
      </Modal>

      <Modal open={!!paid} onClose={() => setPaid(null)} title={t("a.mark_paid")}>
        <div className="space-y-4">
          <p className="text-sm text-muted">{t("a.mark_paid_text", { total: sar(o.total) })}</p>
          <Field label={t("inv.payment_method")}><Select value={paid ?? "cash"} onChange={(e) => setPaid(e.target.value)}><option value="cash">{t("paym.cash")}</option><option value="transfer">{t("paym.transfer")}</option><option value="card">{t("paym.card")}</option></Select></Field>
          <div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => setPaid(null)}>{t("c.cancel")}</Button><Button busy={act.busy === "paid"} onClick={markPaid}>{t("a.confirm")}</Button></div>
        </div>
      </Modal>
    </>
  );
}
