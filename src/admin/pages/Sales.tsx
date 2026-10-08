import { useState } from "react";
import { sar } from "../../shared/constants";
import { api, download } from "../../web/lib/api";
import { useApp } from "../../web/lib/ctx";
import { Icon } from "../../web/ui/Icon";
import { Badge, Button, Field, Input, Link, Modal, Pagination, Select, Stars, StatusBadge, Textarea } from "../../web/ui/kit";
import { Confirm, DataTable, ExportButtons, MoneyInput, PageHead, SearchInput, useAction, useAdmin, useFetch, useQueryState } from "../core";
import { payMethodLabel, providerLabel } from "./Orders";

export function PaymentsPage() {
  const { t, date } = useApp();
  const admin = useAdmin();
  const qs = useQueryState();
  const page = Number(qs.get("page")) || 1;
  const list = useFetch<any>(`/api/admin/payments?page=${page}${qs.get("status") ? `&status=${qs.get("status")}` : ""}${qs.get("provider") ? `&provider=${qs.get("provider")}` : ""}`);
  return (
    <>
      <PageHead title={t("a.nav.payments")} sub={list.data ? (list.data.gateway === "none" ? t("a.gateway_off") : t("a.gateway_on", { name: list.data.gateway })) : undefined}>
        <Select className="h-10 w-auto" value={qs.get("status")} onChange={(e) => qs.set({ status: e.target.value })} aria-label={t("a.f.status")}><option value="">{t("a.f.status")}</option>{["pending", "paid", "failed", "cancelled", "refunded", "partially_refunded"].map((s) => <option key={s} value={s}>{t(`a.pay.${s}`)}</option>)}</Select>
        <Select className="h-10 w-auto" value={qs.get("provider")} onChange={(e) => qs.set({ provider: e.target.value })} aria-label={t("a.f.provider")}><option value="">{t("a.f.provider")}</option><option value="cod">{t("pay.cod")}</option><option value="moyasar">Moyasar</option><option value="pos">{t("a.ch.pos")}</option></Select>
      </PageHead>
      <DataTable rows={list.data?.rows} loading={list.loading} onRow={(p) => admin.go(`/admin/orders/${p.order_id}`)} columns={[
        { key: "created_at", label: t("a.f.date"), render: (p) => date(p.created_at, true) },
        { key: "order_number", label: t("a.f.order"), render: (p) => <><b dir="ltr">{p.order_number}</b><span className="block text-xs text-muted">{p.customer_name}</span></> },
        { key: "provider", label: t("a.f.provider"), render: (p) => <>{providerLabel(t, p.provider)}<span className="block text-xs text-muted">{payMethodLabel(t, p.method)}</span></> },
        { key: "status", label: t("a.f.status"), render: (p) => <StatusBadge status={p.status} prefix="a.pay" /> },
        { key: "amount", label: t("a.f.amount"), className: "text-end font-semibold tabular-nums", render: (p) => sar(p.amount) },
        { key: "refunded_amount", label: t("a.f.refunded"), className: "text-end tabular-nums", render: (p) => (p.refunded_amount ? sar(p.refunded_amount) : "—") },
        { key: "gateway_id", label: t("a.f.reference"), render: (p) => <span dir="ltr" className="text-xs">{p.gateway_id ? `${String(p.gateway_id).slice(0, 16)}…` : "—"}</span> },
      ]} />
      <Pagination page={page} pages={list.data?.pages ?? 1} onPage={(p) => qs.set({ page: String(p) }, true)} />
    </>
  );
}

export function ReturnsPage() {
  const app = useApp();
  const { t, date } = app;
  const qs = useQueryState();
  const page = Number(qs.get("page")) || 1;
  const list = useFetch<any>(`/api/admin/returns?page=${page}${qs.get("status") ? `&status=${qs.get("status")}` : ""}`);
  const [cur, setCur] = useState<{ row: any; action: string } | null>(null);
  const [note, setNote] = useState("");
  const [restock, setRestock] = useState(true);
  const [amount, setAmount] = useState<number | null>(null);
  const act = useAction();
  const NEXT: Record<string, string[]> = { requested: ["approve", "reject"], approved: ["receive", "reject"], received: ["refund"] };
  const run = async () => {
    const ok = await act.run("ret", () => api(`/api/admin/returns/${cur!.row.id}/action`, { body: { action: cur!.action, note: note || null, restock, refund_amount: cur!.action === "refund" ? amount : null } }), t("a.saved"));
    if (ok) { setCur(null); await list.reload(); }
  };
  return (
    <>
      <PageHead title={t("a.nav.returns")} sub={t("a.returns_sub")}>
        <Select className="h-10 w-auto" value={qs.get("status")} onChange={(e) => qs.set({ status: e.target.value })} aria-label={t("a.f.status")}><option value="">{t("a.all")}</option>{["requested", "approved", "received", "refunded", "rejected"].map((s) => <option key={s} value={s}>{t(`rstatus.${s}`)}</option>)}</Select>
      </PageHead>
      <DataTable rows={list.data?.rows} loading={list.loading} columns={[
        { key: "number", label: "#", render: (r) => <><b dir="ltr">{r.number}</b><span className="block text-xs text-muted">{date(r.created_at)}</span></> },
        { key: "order_number", label: t("a.f.order"), render: (r) => <><Link to={`/orders/${r.order_id}`} className="font-medium hover:text-accent"><span dir="ltr">{r.order_number}</span></Link><span className="block text-xs text-muted">{r.customer_name}</span></> },
        { key: "reason", label: t("order.reason"), render: (r) => <span className="line-clamp-2 max-w-xs">{r.reason}</span> },
        { key: "items", label: t("a.f.units"), className: "text-end tabular-nums", render: (r) => (r.items ?? []).reduce((s: number, i: any) => s + i.quantity, 0) },
        { key: "status", label: t("a.f.status"), render: (r) => <StatusBadge status={r.status} prefix="rstatus" /> },
        { key: "refund_amount", label: t("a.f.refunded"), className: "text-end tabular-nums", render: (r) => (r.refund_amount ? sar(r.refund_amount) : "—") },
        { key: "_", label: "", className: "w-px whitespace-nowrap", render: (r) => <span className="flex gap-1.5">{(NEXT[r.status] ?? []).map((a) => <Button key={a} size="sm" variant={a === "reject" ? "danger" : "outline"} onClick={() => { setNote(""); setRestock(true); setAmount(a === "refund" ? r.suggested : null); setCur({ row: r, action: a }); }}>{t(`a.ret.${a}`)}</Button>)}</span> },
      ]} />
      <Pagination page={page} pages={list.data?.pages ?? 1} onPage={(p) => qs.set({ page: String(p) }, true)} />
      <Modal open={!!cur} onClose={() => setCur(null)} title={cur ? `${t(`a.ret.${cur.action}`)} — ${cur.row.number}` : ""}>
        {cur && (
          <div className="space-y-4">
            <p className="text-sm text-muted">{t(`a.ret.${cur.action}_text`)}</p>
            {cur.action === "receive" && <label className="flex items-center gap-2.5"><input type="checkbox" className="check" checked={restock} onChange={(e) => setRestock(e.target.checked)} />{t("a.restock")}</label>}
            {cur.action === "refund" && <Field label={t("a.f.amount")} hint={t("a.ret.refund_hint", { total: sar(cur.row.order_total), items: sar(cur.row.items_value) })}><MoneyInput value={amount} onChange={setAmount} /></Field>}
            {cur.action !== "refund" && <Field label={t("a.f.note")}><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>}
            <div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => setCur(null)}>{t("c.cancel")}</Button><Button variant={cur.action === "reject" || cur.action === "refund" ? "danger" : "primary"} busy={act.busy === "ret"} onClick={run}>{t("a.confirm")}</Button></div>
          </div>
        )}
      </Modal>
    </>
  );
}

export function InvoicesPage() {
  const app = useApp();
  const { t, date } = app;
  const admin = useAdmin();
  const qs = useQueryState();
  const page = Number(qs.get("page")) || 1;
  const params = new URLSearchParams();
  for (const k of ["q", "kind", "from", "to"]) if (qs.get(k)) params.set(k, qs.get(k));
  const list = useFetch<any>(`/api/admin/invoices?page=${page}&${params}`);
  const act = useAction();
  const z = list.data?.zatca;
  return (
    <>
      <PageHead title={t("a.nav.invoices")} sub={list.data ? t("a.n_results", { n: list.data.total }) : undefined}><ExportButtons url={`/api/admin/invoices?${params}`} /></PageHead>
      {z && (
        <p className={`no-print mb-3 flex items-start gap-2 rounded-md border p-3 text-sm ${z.ready ? "border-ok/40 bg-ok-soft" : "border-line bg-surface"}`}>
          <Icon name="info" size={18} className="mt-0.5 shrink-0" />
          <span>{z.ready ? t("a.zatca_ready", { env: z.env }) : t("a.zatca_phase1")}{!z.ready && z.env !== "disabled" && z.reason ? ` (${z.reason})` : ""}</span>
        </p>
      )}
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={qs.get("q")} onChange={(v) => qs.set({ q: v })} placeholder={t("a.invoices_search")} />
        <Select className="h-10 w-auto" value={qs.get("kind")} onChange={(e) => qs.set({ kind: e.target.value })} aria-label={t("a.f.type")}><option value="">{t("a.all")}</option><option value="invoice">{t("inv.tax_invoice")}</option><option value="credit_note">{t("inv.credit_note")}</option></Select>
        <label className="flex items-center gap-1.5 text-sm text-muted">{t("f.from")}<Input type="date" dir="ltr" className="h-10 w-40" value={qs.get("from")} onChange={(e) => qs.set({ from: e.target.value })} /></label>
        <label className="flex items-center gap-1.5 text-sm text-muted">{t("f.to")}<Input type="date" dir="ltr" className="h-10 w-40" value={qs.get("to")} onChange={(e) => qs.set({ to: e.target.value })} /></label>
      </div>
      <DataTable rows={list.data?.rows} loading={list.loading} columns={[
        { key: "number", label: t("inv.number"), render: (i) => <><b dir="ltr">{i.number}</b><span className="block text-xs text-muted">{date(i.issued_at, true)}</span></> },
        { key: "kind", label: t("a.f.type"), render: (i) => <Badge tone={i.kind === "credit_note" ? "warn" : "info"}>{t(i.kind === "credit_note" ? "inv.credit_note" : i.type === "standard" ? "inv.tax_invoice" : "inv.simplified")}</Badge> },
        { key: "order_number", label: t("a.f.order"), render: (i) => (i.order_id ? <Link to={`/orders/${i.order_id}`} className="hover:text-accent"><span dir="ltr">{i.order_number}</span></Link> : "—") },
        { key: "buyer_name", label: t("inv.buyer"), render: (i) => <>{i.buyer_name}{i.buyer_vat && <span className="block text-xs text-muted" dir="ltr" style={{ textAlign: "start" }}>{i.buyer_vat}</span>}</> },
        { key: "taxable_amount", label: t("inv.taxable"), className: "text-end tabular-nums", render: (i) => sar((i.kind === "credit_note" ? -1 : 1) * i.taxable_amount) },
        { key: "vat_amount", label: t("inv.vat"), className: "text-end tabular-nums", render: (i) => sar((i.kind === "credit_note" ? -1 : 1) * i.vat_amount) },
        { key: "total", label: t("tot.total"), className: "text-end font-semibold tabular-nums", render: (i) => sar((i.kind === "credit_note" ? -1 : 1) * i.total) },
        { key: "zatca_status", label: "ZATCA", render: (i) => <StatusBadge status={i.zatca_status} prefix="a.z" /> },
        { key: "_", label: "", className: "w-px whitespace-nowrap", render: (i) => (
          <span className="flex gap-1">
            <a className="btn btn-ghost btn-sm" href={`/${app.lang}/invoice/${i.number}`} target="_blank" rel="noopener" aria-label={t("a.open")} title={t("a.open")}><Icon name="print" size={16} /></a>
            <Button variant="ghost" size="sm" onClick={() => download(`/api/admin/invoices/${i.id}/xml`)} title="UBL XML">XML</Button>
            {z?.ready && admin.can("settings.manage") && ["not_submitted", "queued", "error"].includes(i.zatca_status) && <Button variant="outline" size="sm" busy={act.busy === `z${i.id}`} onClick={async () => { await act.run(`z${i.id}`, () => api(`/api/admin/invoices/${i.id}/submit`, { body: {} })); await list.reload(); }}>{t("a.zatca_submit")}</Button>}
          </span>
        ) },
      ]} />
      <Pagination page={page} pages={list.data?.pages ?? 1} onPage={(p) => qs.set({ page: String(p) }, true)} />
    </>
  );
}

export function ReviewsPage() {
  const app = useApp();
  const { t, date } = app;
  const qs = useQueryState();
  const page = Number(qs.get("page")) || 1;
  const list = useFetch<any>(`/api/admin/reviews?page=${page}${qs.get("status") ? `&status=${qs.get("status")}` : ""}`);
  const act = useAction();
  const [del, setDel] = useState<any | null>(null);
  const setStatus = async (id: number, status: string) => { if (await act.run(`s${id}`, () => api(`/api/admin/reviews/${id}/status`, { body: { status } }), t("a.saved"))) await list.reload(); };
  return (
    <>
      <PageHead title={t("a.nav.reviews")} sub={t("a.reviews_sub")}>
        <Select className="h-10 w-auto" value={qs.get("status")} onChange={(e) => qs.set({ status: e.target.value })} aria-label={t("a.f.status")}><option value="">{t("a.all")}</option>{["pending", "approved", "rejected"].map((s) => <option key={s} value={s}>{t(`a.rv.${s}`)}</option>)}</Select>
      </PageHead>
      <DataTable rows={list.data?.rows} loading={list.loading} columns={[
        { key: "product_name", label: t("a.f.product"), render: (r) => <><a href={`/${app.lang}/p/${r.product_slug}`} target="_blank" rel="noopener" className="font-medium hover:text-accent">{r.product_name}</a><span className="block text-xs text-muted">{r.customer_name} — {date(r.created_at)}</span></> },
        { key: "rating", label: t("f.rating"), render: (r) => <Stars value={r.rating} /> },
        { key: "body", label: t("a.f.review"), render: (r) => <span className="block max-w-md">{r.title && <b className="block">{r.title}</b>}<span className="line-clamp-3 text-muted">{r.body}</span>{r.verified_purchase && <Badge tone="ok">{t("rev.verified")}</Badge>}</span> },
        { key: "status", label: t("a.f.status"), render: (r) => <StatusBadge status={r.status} prefix="a.rv" /> },
        { key: "_", label: "", className: "w-px whitespace-nowrap", render: (r) => (
          <span className="flex gap-1.5">
            {r.status !== "approved" && <Button size="sm" variant="outline" icon="check" busy={act.busy === `s${r.id}`} onClick={() => setStatus(r.id, "approved")}>{t("a.approve")}</Button>}
            {r.status !== "rejected" && <Button size="sm" variant="ghost" onClick={() => setStatus(r.id, "rejected")}>{t("a.reject")}</Button>}
            <Button size="sm" variant="ghost" icon="trash" aria-label={t("c.delete")} onClick={() => setDel(r)} />
          </span>
        ) },
      ]} />
      <Pagination page={page} pages={list.data?.pages ?? 1} onPage={(p) => qs.set({ page: String(p) }, true)} />
      <Confirm open={!!del} danger title={t("a.delete_q")} text={t("a.delete_text")} busy={act.busy === "del"} yes={t("c.delete")} onNo={() => setDel(null)}
        onYes={async () => { if (await act.run("del", () => api(`/api/admin/reviews/${del.id}`, { method: "DELETE" }), t("a.deleted"))) { setDel(null); await list.reload(); } }} />
    </>
  );
}
