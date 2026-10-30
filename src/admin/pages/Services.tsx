import { useEffect, useState } from "react";
import { api } from "../../web/lib/api";
import { useApp } from "../../web/lib/ctx";
import { Glyph, Icon } from "../../web/ui/Icon";
import { Badge, Button, Field, Input, Modal, Pagination, Select, StatusBadge, Textarea, useForm } from "../../web/ui/kit";
import { BookingTimeline, PhotoPicker, QuoteTable } from "../../web/pages/Services";
import { DataTable, MoneyInput, PageHead, SearchInput, Stat, useAction, useAdmin, useFetch, useQueryState } from "../core";

const todayStr = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const STATUSES = ["requested", "assigned", "on_the_way", "arrived", "in_progress", "completed", "cancelled"];

function AssignModal({ booking, onClose, onDone }: { booking: any; onClose: () => void; onDone: () => void }) {
  const { t } = useApp();
  const techs = useFetch<{ rows: any[] }>("/api/admin/technicians");
  const [id, setId] = useState(String(booking.technician?.id ?? ""));
  const { busy, run } = useAction();
  return (
    <Modal open onClose={onClose} title={booking.technician ? t("a.jobs.reassign") : t("a.jobs.assign")}>
      <div className="space-y-4">
        <p className="text-sm"><b dir="ltr">{booking.number}</b> — {booking.service.name} — {booking.scheduled_date} <span dir="ltr">{booking.slot}</span> — {booking.city}</p>
        <Field label={t("a.jobs.technician")}>
          <Select value={id} onChange={(e) => setId(e.target.value)}>
            <option value="">{t("a.jobs.choose_tech")}</option>
            {techs.data?.rows.filter((r) => r.status === "active").map((r) => <option key={r.id} value={r.id}>{r.name}{r.areas ? ` — ${r.areas}` : ""}{r.available ? "" : ` (${t("a.no")} ${t("a.tech.available")})`} · {r.open} {t("a.tech.open")}</option>)}
          </Select>
        </Field>
        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>{t("c.cancel")}</Button>
          <Button disabled={!id} busy={busy === "assign"} onClick={async () => { if (await run("assign", () => api(`/api/admin/bookings/${booking.id}/assign`, { body: { technician_id: Number(id) } }), t("a.jobs.assigned"))) onDone(); }}>{t("a.jobs.assign")}</Button>
        </div>
      </div>
    </Modal>
  );
}

/** Admin: every booking, with filters, a week view and technician assignment. */
export function JobsBoard() {
  const app = useApp();
  const { t, money } = app;
  const admin = useAdmin();
  const qs = useQueryState();
  const view = qs.get("view") || "list";
  const [weekStart, setWeekStart] = useState(todayStr());
  const url = view === "week" ? `/api/admin/bookings?per=200` : `/api/admin/bookings?${qs.qs}`;
  const { data, loading, reload } = useFetch<any>(url);
  const [assigning, setAssigning] = useState<any>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return (
    <>
      <PageHead title={t("a.nav.jobs")}>
        <div className="flex rounded-md border border-line p-0.5">
          {["list", "week"].map((v) => <button key={v} type="button" onClick={() => qs.set({ view: v === "list" ? null : v })} className={`rounded px-3 py-1.5 text-sm ${view === v ? "bg-accent-soft font-bold text-accent" : ""}`}>{t(v === "list" ? "a.jobs.list" : "a.jobs.calendar")}</button>)}
        </div>
      </PageHead>
      {data?.counts && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={t("bst.requested")} value={data.counts.requested ?? 0} tone={(data.counts.requested ?? 0) > 0 ? "danger" : undefined} />
          <Stat label={t("bst.assigned")} value={data.counts.assigned ?? 0} />
          <Stat label={t("bst.in_progress")} value={(data.counts.on_the_way ?? 0) + (data.counts.arrived ?? 0) + (data.counts.in_progress ?? 0)} />
          <Stat label={t("bst.completed")} value={data.counts.completed ?? 0} tone="ok" />
        </div>
      )}
      {view === "week" ? (
        <>
          <div className="mb-3 flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}><Icon name="chev" size={16} flip /></Button>
            <b className="tabular-nums" dir="ltr">{days[0]} → {days[6]}</b>
            <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}><Icon name="chev" size={16} /></Button>
          </div>
          <div className="overflow-x-auto">
            <div className="grid min-w-[900px] grid-cols-7 gap-2">
              {days.map((d) => (
                <div key={d} className="card min-h-40 p-2">
                  <p className="mb-2 text-sm font-bold tabular-nums" dir="ltr">{d}</p>
                  <ul className="space-y-1.5">
                    {data?.rows.filter((b: any) => b.scheduled_date === d && b.status !== "cancelled").map((b: any) => (
                      <li key={b.id}>
                        <button type="button" onClick={() => admin.go(`/admin/jobs/${b.id}`)} className={`w-full rounded border-s-4 bg-surface-2 p-1.5 text-start text-xs ${b.technician ? "border-info" : "border-danger"}`}>
                          <b dir="ltr">{b.slot}</b> {b.service.name}<span className="block text-muted">{b.technician?.name ?? t("a.jobs.unassigned")}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <SearchInput value={qs.get("q")} onChange={(v) => qs.set({ q: v })} />
            <Select className="h-10 w-auto" value={qs.get("unassigned") ? "unassigned" : qs.get("status")} onChange={(e) => qs.set(e.target.value === "unassigned" ? { unassigned: "1", status: null } : { status: e.target.value, unassigned: null })}>
              <option value="">{t("a.jobs.all")}</option>
              <option value="unassigned">{t("a.jobs.unassigned")}</option>
              {STATUSES.map((s) => <option key={s} value={s}>{t(`bst.${s}`)}</option>)}
            </Select>
            <Input type="date" className="h-10 w-auto" value={qs.get("date")} onChange={(e) => qs.set({ date: e.target.value })} aria-label={t("a.jobs.date")} />
          </div>
          <DataTable loading={loading} rows={data?.rows} empty={t("a.jobs.empty")} onRow={(r) => admin.go(`/admin/jobs/${r.id}`)} columns={[
            { key: "number", label: t("a.jobs.number"), render: (r) => <b dir="ltr">{r.number}</b> },
            { key: "service", label: t("a.jobs.service"), render: (r) => r.service.name },
            { key: "customer", label: t("a.jobs.customer"), render: (r) => <span>{r.contact_name}<span dir="ltr" className="block text-xs text-muted">{r.contact_phone}</span></span> },
            { key: "when", label: t("a.jobs.when"), render: (r) => <span className="tabular-nums" dir="ltr">{r.scheduled_date} {r.slot}</span> },
            { key: "tech", label: t("a.jobs.technician"), render: (r) => (r.technician ? r.technician.name : !["completed", "cancelled"].includes(r.status) ? <Button size="sm" variant="outline" onClick={() => setAssigning(r)}>{t("a.jobs.assign")}</Button> : "—") },
            { key: "status", label: t("a.jobs.status"), render: (r) => <StatusBadge status={r.status} prefix="bst" /> },
            { key: "total", label: t("a.jobs.total"), className: "text-end tabular-nums", render: (r) => money(r.total) },
          ]} />
          {data && <Pagination page={data.page} pages={data.pages} onPage={(p) => qs.set({ page: String(p) }, true)} />}
        </>
      )}
      {assigning && <AssignModal booking={assigning} onClose={() => setAssigning(null)} onDone={() => { setAssigning(null); void reload(); }} />}
    </>
  );
}

export function JobDetail({ params }: { params: string[] }) {
  const app = useApp();
  const { t, money } = app;
  const { data, reload } = useFetch<any>(`/api/admin/bookings/${params[0]}`);
  const [assigning, setAssigning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const { busy, run } = useAction();
  if (!data) return <p className="text-muted">{t("c.loading")}</p>;
  const b = data.booking;
  const open = !["completed", "cancelled"].includes(b.status);
  return (
    <>
      <PageHead title={<span dir="ltr">{b.number}</span>} sub={<StatusBadge status={b.status} prefix="bst" />}>
        {open && <Button variant="outline" icon="users" onClick={() => setAssigning(true)}>{b.technician ? t("a.jobs.reassign") : t("a.jobs.assign")}</Button>}
        {open && <Button variant="ghost" icon="x" onClick={() => setCancelling(true)}>{t("a.jobs.cancel")}</Button>}
      </PageHead>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <section className="card space-y-2 p-4">
            <p className="flex items-center gap-2 text-lg font-bold"><Glyph name={b.service.icon} size={24} className="text-accent" />{b.service.name}</p>
            <p><span className="text-muted">{t("a.jobs.when")}: </span><b dir="ltr">{b.scheduled_date} {b.slot}</b></p>
            <p><span className="text-muted">{t("a.jobs.customer")}: </span>{b.contact_name} <span dir="ltr">{b.contact_phone}</span>{data.customer?.email ? <span className="text-muted"> — {data.customer.email}</span> : null}</p>
            <p><span className="text-muted">{t("svc.where")}: </span>{b.address}{app.lang === "en" ? ", " : "، "}{b.city}</p>
            <p className="whitespace-pre-line"><span className="text-muted">{t("svc.problem_label")}: </span>{b.problem}</p>
            {!!b.photos.length && <div className="flex flex-wrap gap-2">{b.photos.map((u: string) => <img key={u} src={u} alt="" className="size-20 rounded border border-line object-cover" />)}</div>}
          </section>
          <section className="card p-4"><h2 className="mb-3 font-bold">{t("svc.timeline")}</h2><BookingTimeline events={b.events} /></section>
        </div>
        <aside className="space-y-4">
          <section className="card p-4"><h2 className="mb-1 font-bold">{t("a.jobs.technician")}</h2>{b.technician ? <p>{b.technician.name} <span dir="ltr" className="block text-sm text-muted">{b.technician.phone}</span></p> : <Badge tone="danger">{t("a.jobs.unassigned")}</Badge>}</section>
          <section className="card p-4">
            <h2 className="mb-1 flex items-center justify-between font-bold">{t("svc.quote")}<Badge tone={b.quote_status === "approved" ? "ok" : b.quote_status === "rejected" ? "danger" : "muted"}>{t(`t.quote.${b.quote_status}`)}</Badge></h2>
            <QuoteTable lines={b.quote_lines} visitFee={b.visit_fee} />
            <p className="mt-2 flex justify-between font-bold"><span>{t("svc.total")}</span><span>{money(b.total)}</span></p>
            <p className="mt-2 text-sm">{b.payment_status === "paid" ? <Badge tone="ok">{t("svc.paid_by", { method: t(`svc.pay.${b.payment_method}`) })}</Badge> : <Badge>{t("pstatus.unpaid")}</Badge>}</p>
            {b.rating && <p className="mt-2 text-warn">{"★".repeat(b.rating)}<span className="ms-2 text-sm text-fg">{b.review}</span></p>}
          </section>
        </aside>
      </div>
      {assigning && <AssignModal booking={b} onClose={() => setAssigning(false)} onDone={() => { setAssigning(false); void reload(); }} />}
      <Modal open={cancelling} onClose={() => setCancelling(false)} title={t("a.jobs.cancel")}>
        <div className="space-y-4">
          <Field label={t("a.jobs.cancel_reason")}><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => setCancelling(false)}>{t("c.cancel")}</Button>
            <Button variant="danger" disabled={reason.trim().length < 2} busy={busy === "cancel"} onClick={async () => { if (await run("cancel", () => api(`/api/admin/bookings/${b.id}/cancel`, { body: { reason } }), t("a.jobs.cancelled"))) { setCancelling(false); void reload(); } }}>{t("a.jobs.cancel")}</Button></div>
        </div>
      </Modal>
    </>
  );
}

export function TechniciansPage() {
  const app = useApp();
  const { t } = app;
  const admin = useAdmin();
  const { data, loading, reload } = useFetch<{ rows: any[] }>("/api/admin/technicians");
  const [adding, setAdding] = useState(false);
  const form = useForm({ name: "", email: "", phone: "", password: "", areas: "", skills: "" });
  const { run } = useAction();
  const create = () => form.submit(async (v) => {
    await api("/api/admin/technicians", { body: v });
    app.toast(t("a.tech.created")); setAdding(false); form.setValues({ name: "", email: "", phone: "", password: "", areas: "", skills: "" }); await reload();
  }, (e) => app.toast(app.errorText(e), "err"));
  const patch = (id: number, body: object) => run(`p${id}`, () => api(`/api/admin/technicians/${id}`, { method: "PATCH", body })).then(() => reload());
  return (
    <>
      <PageHead title={t("a.nav.technicians")} sub={t("a.tech.intro")}>{admin.can("users.manage") && <Button icon="plus" onClick={() => setAdding(true)}>{t("a.tech.new")}</Button>}</PageHead>
      <DataTable loading={loading} rows={data?.rows} empty={t("a.tech.none")} columns={[
        { key: "name", label: t("f.name"), render: (r) => <span><b>{r.name}</b><span dir="ltr" className="block text-xs text-muted">{r.phone} · {r.email}</span></span> },
        { key: "areas", label: t("a.tech.areas") }, { key: "skills", label: t("a.tech.skills") },
        { key: "open", label: t("a.tech.open"), className: "tabular-nums" }, { key: "completed", label: t("a.tech.completed"), className: "tabular-nums" },
        { key: "rating", label: t("a.tech.rating"), render: (r) => (r.rating ? <span className="text-warn">★ <span className="text-fg tabular-nums">{r.rating}</span></span> : "—") },
        { key: "available", label: t("a.tech.available"), render: (r) => <input type="checkbox" className="check" checked={r.available} onChange={(e) => patch(r.id, { available: e.target.checked })} aria-label={t("a.tech.available")} /> },
        { key: "status", label: "", render: (r) => <Button size="sm" variant={r.status === "active" ? "ghost" : "outline"} onClick={() => patch(r.id, { active: r.status !== "active" })}>{t(r.status === "active" ? "a.tech.disable" : "a.tech.enable")}</Button> },
      ]} />
      <Modal open={adding} onClose={() => setAdding(false)} title={t("a.tech.new")} wide>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void create(); }} noValidate>
          <Field label={t("f.name")} required error={form.errors.name}><Input {...form.bind("name")} /></Field>
          <Field label={t("f.phone")} required error={form.errors.phone}><Input type="tel" dir="ltr" className="text-start" {...form.bind("phone")} /></Field>
          <Field label={t("f.email")} required error={form.errors.email}><Input type="email" dir="ltr" className="text-start" autoComplete="off" {...form.bind("email")} /></Field>
          <Field label={t("f.password")} required error={form.errors.password} hint={t("auth.pw_hint")}><Input type="password" dir="ltr" className="text-start" autoComplete="new-password" {...form.bind("password")} /></Field>
          <Field label={t("a.tech.areas")}><Input {...form.bind("areas")} /></Field>
          <Field label={t("a.tech.skills")}><Input {...form.bind("skills")} /></Field>
          <div className="flex justify-end gap-3 sm:col-span-2"><Button variant="ghost" onClick={() => setAdding(false)}>{t("c.cancel")}</Button><Button type="submit" busy={form.busy}>{t("c.save")}</Button></div>
        </form>
      </Modal>
    </>
  );
}

// ── technician app (mobile-first screens inside the staff app, shown to the technician role)

const NEXT: Record<string, string> = { assigned: "on_the_way", on_the_way: "arrived", arrived: "in_progress", in_progress: "completed" };

export function TechJobs() {
  const app = useApp();
  const { t, money } = app;
  const admin = useAdmin();
  const [date, setDate] = useState(todayStr());
  const { data, loading, reload } = useFetch<{ jobs: any[] }>(`/api/tech/jobs?date=${date}`);
  return (
    <div className="mx-auto max-w-xl">
      <PageHead title={t("a.nav.my_jobs")}><Button variant="ghost" size="sm" icon="refresh" onClick={() => void reload()}>{t("t.refresh")}</Button></PageHead>
      <div className="mb-4 flex items-center gap-2">
        {[todayStr(), addDays(todayStr(), 1)].map((d, i) => <Button key={d} size="sm" variant={date === d ? "primary" : "outline"} onClick={() => setDate(d)}>{t(i ? "t.tomorrow" : "t.today")}</Button>)}
        <Input type="date" className="h-9 w-auto" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label={t("a.jobs.date")} />
      </div>
      {loading && !data ? <p className="text-muted">{t("c.loading")}</p> : !data?.jobs.length ? <p className="card p-6 text-center text-muted">{t("t.no_jobs")}</p> : (
        <ol className="space-y-3">
          {data.jobs.map((j) => (
            <li key={j.id}>
              <button type="button" onClick={() => admin.go(`/admin/tech/jobs/${j.id}`)} className={`card flex w-full items-start gap-3 p-4 text-start hover:border-fg ${j.status === "cancelled" ? "opacity-55" : ""}`}>
                <span className="w-14 shrink-0 text-center"><b className="block text-lg tabular-nums" dir="ltr">{j.slot}</b></span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2"><b>{j.service.name}</b><StatusBadge status={j.status} prefix="bst" /></span>
                  <span className="mt-1 block text-sm">{j.contact_name} — {j.city}</span>
                  <span className="block truncate text-sm text-muted">{j.address}</span>
                </span>
                <span className="text-sm tabular-nums">{money(j.total)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function QuoteBuilder({ job, onSent }: { job: any; onSent: () => void }) {
  const app = useApp();
  const { t, money } = app;
  const [lines, setLines] = useState<any[]>(job.quote_status !== "none" ? job.quote_lines : []);
  const [q, setQ] = useState("");
  const [parts, setParts] = useState<any[]>([]);
  const [labor, setLabor] = useState({ name: "", price: null as number | null });
  const { busy, run } = useAction();
  useEffect(() => {
    if (q.trim().length < 2) { setParts([]); return; }
    const id = setTimeout(() => api<{ parts: any[] }>(`/api/tech/parts?q=${encodeURIComponent(q)}`).then((r) => setParts(r.parts)).catch(() => {}), 250);
    return () => clearTimeout(id);
  }, [q]);
  const setQty = (i: number, qty: number) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, qty } : l)).filter((l) => l.qty > 0));
  const total = lines.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const locked = job.quote_status === "approved";
  return (
    <section className="card space-y-3 p-4">
      <h2 className="flex items-center justify-between font-bold">{t("t.parts_labor")}<Badge tone={job.quote_status === "approved" ? "ok" : job.quote_status === "rejected" ? "danger" : job.quote_status === "sent" ? "warn" : "muted"}>{t(`t.quote.${job.quote_status}`)}</Badge></h2>
      {!locked && (
        <>
          <div className="relative">
            <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("t.search_parts")} aria-label={t("t.search_parts")} />
            {!!parts.length && (
              <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-md border border-line bg-surface shadow-lg">
                {parts.map((p) => (
                  <li key={p.id}><button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm hover:bg-surface-2" onClick={() => { setLines((ls) => [...ls, { kind: "part", product_id: p.id, name: p.name, qty: 1, unit_price: p.price }]); setQ(""); setParts([]); }}>
                    <span className="min-w-0"><span className="block truncate">{p.name}</span><span className={`text-xs ${p.stock > 0 ? "text-muted" : "text-danger"}`}>{p.sku} · {t("t.in_stock", { n: p.stock })}</span></span><b className="tabular-nums">{money(p.price)}</b>
                  </button></li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid items-end gap-2 sm:grid-cols-[1fr_140px_auto]">
            <Field label={t("t.labor_name")}><Input value={labor.name} onChange={(e) => setLabor((l) => ({ ...l, name: e.target.value }))} /></Field>
            <Field label={t("svc.labor")}><MoneyInput value={labor.price} onChange={(h) => setLabor((l) => ({ ...l, price: h }))} /></Field>
            <Button variant="outline" icon="plus" disabled={!labor.name.trim() || !labor.price} onClick={() => { setLines((ls) => [...ls, { kind: "labor", product_id: null, name: labor.name.trim(), qty: 1, unit_price: labor.price }]); setLabor({ name: "", price: null }); }}>{t("t.add_labor")}</Button>
          </div>
        </>
      )}
      {!!lines.length && (
        <ul className="divide-y divide-line">
          {lines.map((l, i) => (
            <li key={i} className="flex items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1">{l.name} <span className="text-xs text-muted">({t(l.kind === "part" ? "svc.part" : "svc.labor")})</span></span>
              {!locked && <><Button size="sm" variant="ghost" onClick={() => setQty(i, l.qty - 1)} aria-label="-"><Icon name="minus" size={14} /></Button><b className="tabular-nums">{l.qty}</b><Button size="sm" variant="ghost" onClick={() => setQty(i, l.qty + 1)} aria-label="+"><Icon name="plus" size={14} /></Button></>}
              {locked && <b className="tabular-nums">×{l.qty}</b>}
              <span className="w-24 text-end tabular-nums">{money(l.qty * l.unit_price)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="flex justify-between font-bold"><span>{t("svc.quote")}</span><span className="tabular-nums">{money(total)}</span></p>
      {!locked && <Button className="w-full" icon="mail" disabled={!lines.length || !["arrived", "in_progress"].includes(job.status)} busy={busy === "q"} onClick={async () => { if (await run("q", () => api(`/api/tech/jobs/${job.id}/quote`, { body: { lines } }), t("t.quote_sent"))) onSent(); }}>{t("t.send_quote")}</Button>}
    </section>
  );
}

function CollectPayment({ job, onDone }: { job: any; onDone: () => void }) {
  const app = useApp();
  const { t, money } = app;
  const [method, setMethod] = useState<"cash" | "card">("card");
  const [before, setBefore] = useState<string[]>([]);
  const [after, setAfter] = useState<string[]>([]);
  const { busy, run } = useAction();
  return (
    <section className="card space-y-3 p-4">
      <h2 className="font-bold">{t("t.collect")}</h2>
      <QuoteTable lines={job.quote_status === "approved" ? job.quote_lines : []} visitFee={job.visit_fee} />
      <p className="flex justify-between text-lg font-bold"><span>{t("t.amount_due")}</span><span className="tabular-nums">{money(job.total)}</span></p>
      <div className="grid grid-cols-2 gap-2" role="radiogroup">
        {(["card", "cash"] as const).map((m) => <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)} className={`rounded-md border p-3 text-sm ${method === m ? "border-accent bg-accent-soft font-bold text-accent" : "border-line"}`}><Icon name={m === "card" ? "card" : "cash"} className="mx-auto mb-1" />{t(`t.${m}`)}</button>)}
      </div>
      <Field label={t("t.before")}><PhotoPicker value={before} onChange={setBefore} endpoint="/api/admin/uploads?kind=content" /></Field>
      <Field label={t("t.after")}><PhotoPicker value={after} onChange={setAfter} endpoint="/api/admin/uploads?kind=content" /></Field>
      <Button className="w-full" size="lg" icon="check" busy={busy === "pay"} disabled={job.quote_status === "sent"}
        onClick={async () => { if (await run("pay", () => api(`/api/tech/jobs/${job.id}/payment`, { body: { method, before_photos: before, after_photos: after } }), t("t.paid"))) onDone(); }}>{t("t.confirm_paid")}</Button>
    </section>
  );
}

export function TechJob({ params }: { params: string[] }) {
  const app = useApp();
  const { t } = app;
  const admin = useAdmin();
  const { data, reload } = useFetch<{ job: any }>(`/api/tech/jobs/${params[0]}`);
  const { busy, run } = useAction();
  if (!data) return <p className="text-muted">{t("c.loading")}</p>;
  const j = data.job;
  const next = NEXT[j.status];
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${j.address}, ${j.city}`)}`;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <button type="button" className="flex items-center gap-1 text-sm text-accent" onClick={() => admin.go("/admin/tech")}><Icon name="chev" size={16} flip />{t("t.back")}</button>
      <PageHead title={j.service.name} sub={<span><span dir="ltr">{j.number}</span> · <span dir="ltr">{j.scheduled_date} {j.slot}</span></span>}><StatusBadge status={j.status} prefix="bst" /></PageHead>
      <section className="card space-y-2 p-4">
        <h2 className="font-bold">{t("t.customer")}</h2>
        <p>{j.contact_name} <span dir="ltr" className="text-muted select-all">{j.contact_phone}</span></p>
        <p className="text-sm">{j.address}{app.lang === "en" ? ", " : "، "}{j.city}</p>
        <div className="flex gap-2 pt-1">
          <a href={`tel:${j.contact_phone}`} className="btn btn-outline btn-sm flex-1"><Icon name="phone" size={16} />{t("t.call")}</a>
          <a href={maps} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm flex-1"><Icon name="pin" size={16} />{t("t.navigate")}</a>
        </div>
      </section>
      <section className="card space-y-2 p-4">
        <h2 className="font-bold">{t("t.problem")}</h2>
        <p className="whitespace-pre-line text-sm">{j.problem}</p>
        {!!j.photos.length && <div className="flex flex-wrap gap-2">{j.photos.map((u: string) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="size-20 rounded border border-line object-cover" /></a>)}</div>}
      </section>
      {next && j.status !== "in_progress" && (
        <Button size="lg" className="w-full" busy={busy === "s"} onClick={async () => { if (await run("s", () => api(`/api/tech/jobs/${j.id}/status`, { body: { status: next } }))) void reload(); }}>{t(`t.next.${next}`)}</Button>
      )}
      {["arrived", "in_progress"].includes(j.status) && <QuoteBuilder key={j.quote_status} job={j} onSent={() => void reload()} />}
      {j.status === "in_progress" && j.payment_status !== "paid" && <CollectPayment job={j} onDone={() => void reload()} />}
      {j.status === "in_progress" && j.payment_status === "paid" && (
        <Button size="lg" className="w-full" icon="check" busy={busy === "s"} onClick={async () => { if (await run("s", () => api(`/api/tech/jobs/${j.id}/status`, { body: { status: "completed" } }))) void reload(); }}>{t("t.next.completed")}</Button>
      )}
      <section className="card p-4"><h2 className="mb-3 font-bold">{t("svc.timeline")}</h2><BookingTimeline events={j.events} /></section>
    </div>
  );
}

export function TechProfile() {
  const app = useApp();
  const { t } = app;
  const { data, reload } = useFetch<any>("/api/tech/me");
  const { run } = useAction();
  if (!data) return <p className="text-muted">{t("c.loading")}</p>;
  const te = data.technician;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHead title={te.name} sub={<span dir="ltr">{te.phone} · {te.email}</span>} />
      <div className="grid grid-cols-3 gap-3">
        <Stat label={t("t.completed_jobs")} value={data.stats.completed} />
        <Stat label={t("t.open_jobs")} value={data.stats.open} />
        <Stat label={t("t.avg_rating")} value={data.stats.rating ? `★ ${data.stats.rating}` : "—"} hint={data.stats.ratings ? `${data.stats.ratings}` : undefined} />
      </div>
      <label className="card flex items-center justify-between gap-3 p-4">
        <span className="font-semibold">{t("t.availability")}</span>
        <input type="checkbox" className="check" checked={te.available} onChange={(e) => void run("a", () => api("/api/tech/availability", { body: { available: e.target.checked } })).then(() => reload())} />
      </label>
      <section className="card p-4">
        <h2 className="mb-2 font-bold">{t("t.schedule")}</h2>
        {!data.upcoming.length ? <p className="text-sm text-muted">{t("t.no_jobs")}</p> : (
          <ul className="divide-y divide-line">{data.upcoming.map((d: any) => <li key={d.date} className="flex justify-between py-2 text-sm"><span dir="ltr" className="tabular-nums">{d.date}</span><b>{t("t.jobs_n", { n: d.jobs })}</b></li>)}</ul>
        )}
        {(te.areas || te.skills) && <p className="mt-3 text-sm text-muted">{te.areas}{te.areas && te.skills ? " · " : ""}{te.skills}</p>}
      </section>
    </div>
  );
}
