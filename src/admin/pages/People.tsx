import { useEffect, useState } from "react";
import { sar } from "../../shared/constants";
import { api, ApiError } from "../../web/lib/api";
import { useApp } from "../../web/lib/ctx";
import { Badge, Button, Field, Input, Link, Modal, Pagination, Select, StatusBadge, Textarea, useForm } from "../../web/ui/kit";
import { DataTable, ExportButtons, PageHead, SearchInput, Stat, useAction, useAdmin, useFetch, useQueryState } from "../core";
import { useOptions } from "../resource";

export function CustomersList() {
  const { t, date } = useApp();
  const admin = useAdmin();
  const qs = useQueryState();
  const page = Number(qs.get("page")) || 1;
  const q = qs.get("q") ? `&q=${encodeURIComponent(qs.get("q"))}` : "";
  const list = useFetch<any>(`/api/admin/customers?page=${page}${q}`);
  return (
    <>
      <PageHead title={t("a.nav.customers")} sub={list.data ? t("a.n_results", { n: list.data.total }) : undefined}>
        <SearchInput value={qs.get("q")} onChange={(v) => qs.set({ q: v })} placeholder={t("a.customers_search")} />
        <ExportButtons url={`/api/admin/customers?${q.slice(1)}`} />
      </PageHead>
      <DataTable rows={list.data?.rows} loading={list.loading} onRow={(c) => admin.go(`/admin/customers/${c.id}`)} columns={[
        { key: "name", label: t("f.name"), render: (c) => <><span className="font-medium">{c.name}</span>{c.company_name && <span className="block text-xs text-muted">{c.company_name}</span>}</> },
        { key: "contact", label: t("a.f.contact"), render: (c) => <span dir="ltr" className="block text-start">{c.phone ?? "—"}<span className="block text-xs text-muted">{c.email}</span></span> },
        { key: "type", label: t("a.f.type"), render: (c) => (c.is_guest ? <Badge>{t("a.guest")}</Badge> : c.account_status === "disabled" ? <Badge tone="danger">{t("a.disabled")}</Badge> : <Badge tone="info">{t("a.registered")}</Badge>) },
        { key: "orders", label: t("a.nav.orders"), className: "text-end tabular-nums" },
        { key: "spent", label: t("a.f.spent"), className: "text-end font-semibold tabular-nums", render: (c) => sar(c.spent) },
        { key: "created_at", label: t("a.f.since"), render: (c) => date(c.created_at) },
      ]} />
      <Pagination page={page} pages={list.data?.pages ?? 1} onPage={(p) => qs.set({ page: String(p) }, true)} />
    </>
  );
}

export function CustomerDetail({ params }: { params: string[] }) {
  const app = useApp();
  const { t, date } = app;
  const admin = useAdmin();
  const { data, reload } = useFetch<any>(`/api/admin/customers/${params[0]}`);
  const form = useForm({ name: "", phone: "", company_name: "", vat_number: "", account_status: "active" });
  useEffect(() => { if (data) form.setValues({ name: data.customer.name ?? "", phone: data.customer.phone ?? "", company_name: data.customer.company_name ?? "", vat_number: data.customer.vat_number ?? "", account_status: data.customer.account_status ?? "active" }); }, [data]);
  if (!data) return <p className="text-muted">{t("c.loading")}</p>;
  const c = data.customer;
  const spent = data.orders.filter((o: any) => o.status !== "cancelled").reduce((s: number, o: any) => s + o.total, 0);
  const save = () => form.submit(async (v) => {
    await api(`/api/admin/customers/${c.id}`, { method: "PUT", body: { ...v, account_status: c.user_id ? v.account_status : undefined } });
    app.toast(t("a.saved")); await reload();
  }, (e) => app.toast(app.errorText(e), "err"));
  return (
    <>
      <PageHead title={<><Link to="/customers" className="text-muted hover:text-fg">{t("a.nav.customers")}</Link> <span className="text-muted">/</span> {c.name}</>} sub={<>{c.is_guest ? t("a.guest") : t("a.registered")} — {t("a.f.since")} {date(c.created_at)}</>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("a.nav.orders")} value={data.orders.length} />
        <Stat label={t("a.f.spent")} value={app.money(spent)} />
        <Stat label={t("f.email")} value={<span className="text-base break-all" dir="ltr">{c.email ?? "—"}</span>} />
        <Stat label={t("a.last_login")} value={<span className="text-base">{c.last_login_at ? date(c.last_login_at, true) : "—"}</span>} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <section className="card overflow-hidden">
            <h2 className="border-b border-line px-4 py-3 font-bold">{t("a.nav.orders")}</h2>
            <DataTable rows={data.orders} onRow={(o) => admin.go(`/admin/orders/${o.id}`)} columns={[
              { key: "number", label: t("a.f.order"), render: (o) => <b dir="ltr">{o.number}</b> }, { key: "created_at", label: t("a.f.date"), render: (o) => date(o.created_at) },
              { key: "status", label: t("a.f.status"), render: (o) => <StatusBadge status={o.status} /> }, { key: "total", label: t("tot.total"), className: "text-end tabular-nums", render: (o) => sar(o.total) },
            ]} />
          </section>
          {data.addresses.length > 0 && (
            <section className="card p-4">
              <h2 className="mb-3 font-bold">{t("account.addresses")}</h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {data.addresses.map((a: any) => <li key={a.id} className="rounded-md border border-line p-3 text-sm"><b>{a.label || a.recipient_name}</b>{a.is_default && <Badge tone="info">{t("addr.default")}</Badge>}<br />{[a.district, a.street, a.building_no].filter(Boolean).join("، ")}<br />{a.city} <span dir="ltr">{a.phone}</span></li>)}
              </ul>
            </section>
          )}
        </div>
        {admin.can("customers.manage") && (
          <form className="card h-fit space-y-4 p-4" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
            <h2 className="font-bold">{t("a.edit_customer")}</h2>
            <Field label={t("f.name")} error={form.errors.name} required><Input {...form.bind("name")} /></Field>
            <Field label={t("f.phone")} error={form.errors.phone}><Input dir="ltr" className="text-start" {...form.bind("phone")} /></Field>
            <Field label={t("f.company")} error={form.errors.company_name}><Input {...form.bind("company_name")} /></Field>
            <Field label={t("f.vat_number")} error={form.errors.vat_number} hint={t("f.vat_hint")}><Input dir="ltr" className="text-start tabular-nums" maxLength={15} {...form.bind("vat_number")} /></Field>
            {c.user_id && <Field label={t("a.account_status")}><Select {...form.bind("account_status")}><option value="active">{t("a.active")}</option><option value="disabled">{t("a.disabled")}</option></Select></Field>}
            <Button type="submit" busy={form.busy}>{t("c.save")}</Button>
          </form>
        )}
      </div>
    </>
  );
}

export function UsersPage() {
  const app = useApp();
  const { t, date } = app;
  const list = useFetch<{ rows: any[] }>("/api/admin/users");
  const opts = useOptions(["roles"]);
  const [editing, setEditing] = useState<any | null>(null);
  const form = useForm({ name: "", email: "", password: "", role_id: "", status: "active" });
  const open = (u?: any) => { form.setErrors({}); form.setValues(u ? { name: u.name, email: u.email, password: "", role_id: String(u.role_id), status: u.status } : { name: "", email: "", password: "", role_id: String(opts.roles?.[0]?.value ?? ""), status: "active" }); setEditing(u ?? {}); };
  const save = () => form.submit(async (v) => {
    if (editing.id) await api(`/api/admin/users/${editing.id}`, { method: "PUT", body: { name: v.name, role_id: Number(v.role_id), status: v.status, password: v.password } });
    else await api("/api/admin/users", { body: { name: v.name, email: v.email, password: v.password, role_id: Number(v.role_id) } });
    setEditing(null); app.toast(t("a.saved")); await list.reload();
  }, (e) => { if (!(e instanceof ApiError) || e.code !== "validation") app.toast(app.errorText(e), "err"); else app.toast(app.errorText(e), "err"); });
  return (
    <>
      <PageHead title={t("a.nav.users")} sub={t("a.users_sub")}>
        <Link to="/roles" className="btn btn-outline btn-sm">{t("a.roles")}</Link>
        <Button icon="plus" size="sm" onClick={() => open()}>{t("a.add_user")}</Button>
      </PageHead>
      <DataTable rows={list.data?.rows} loading={list.loading} onRow={open} columns={[
        { key: "name", label: t("f.name"), render: (u) => <><span className="font-medium">{u.name}</span><span className="block text-xs text-muted" dir="ltr" style={{ textAlign: "start" }}>{u.email}</span></> },
        { key: "role_name", label: t("a.f.role"), render: (u) => <Badge tone="info">{u.role_name}</Badge> },
        { key: "status", label: t("a.f.status"), render: (u) => <Badge tone={u.status === "active" ? "ok" : "danger"}>{t(u.status === "active" ? "a.active" : "a.disabled")}</Badge> },
        { key: "last_login_at", label: t("a.last_login"), render: (u) => (u.last_login_at ? date(u.last_login_at, true) : "—") },
      ]} />
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? t("a.edit_user") : t("a.add_user")}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
          <Field label={t("f.name")} required error={form.errors.name}><Input {...form.bind("name")} /></Field>
          <Field label={t("f.email")} required error={form.errors.email}><Input type="email" dir="ltr" className="text-start" disabled={!!editing?.id} {...form.bind("email")} /></Field>
          <Field label={t("a.f.role")} required error={form.errors.role_id}><Select {...form.bind("role_id")}>{(opts.roles ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
          {editing?.id && <Field label={t("a.f.status")}><Select {...form.bind("status")}><option value="active">{t("a.active")}</option><option value="disabled">{t("a.disabled")}</option></Select></Field>}
          <Field label={editing?.id ? t("a.new_password_optional") : t("f.password")} required={!editing?.id} error={form.errors.password} hint={t("auth.pw_hint")}><Input type="password" dir="ltr" className="text-start" autoComplete="new-password" {...form.bind("password")} /></Field>
          <div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => setEditing(null)}>{t("c.cancel")}</Button><Button type="submit" busy={form.busy}>{t("c.save")}</Button></div>
        </form>
      </Modal>
    </>
  );
}

export function TicketsPage() {
  const app = useApp();
  const { t, date } = app;
  const qs = useQueryState();
  const page = Number(qs.get("page")) || 1;
  const list = useFetch<any>(`/api/admin/tickets?page=${page}${qs.get("status") ? `&status=${qs.get("status")}` : ""}`);
  const [openId, setOpenId] = useState<number | null>(null);
  const thread = useFetch<any>(openId ? `/api/admin/tickets/${openId}` : null);
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState("pending");
  const act = useAction();
  const send = async () => {
    if (await act.run("reply", () => api(`/api/admin/tickets/${openId}/reply`, { body: { message: reply, status } }), t("a.reply_sent"))) { setReply(""); await thread.reload(); await list.reload(); }
  };
  const setOnly = async (s: string) => { if (await act.run("st", () => api(`/api/admin/tickets/${openId}/status`, { body: { status: s } }), t("a.saved"))) { await thread.reload(); await list.reload(); } };
  return (
    <>
      <PageHead title={t("a.nav.tickets")}>
        <Select className="h-10 w-auto" value={qs.get("status")} onChange={(e) => qs.set({ status: e.target.value })} aria-label={t("a.f.status")}><option value="">{t("a.all")}</option>{["open", "pending", "resolved", "closed"].map((s) => <option key={s} value={s}>{t(`a.ts.${s}`)}</option>)}</Select>
      </PageHead>
      <DataTable rows={list.data?.rows} loading={list.loading} onRow={(k) => { setOpenId(k.id); setReply(""); setStatus("pending"); }} columns={[
        { key: "number", label: "#", render: (k) => <b dir="ltr">{k.number}</b> },
        { key: "subject", label: t("contact.subject"), render: (k) => <><span className="font-medium">{k.subject}</span>{k.order_number && <span className="block text-xs text-muted" dir="ltr" style={{ textAlign: "start" }}>{k.order_number}</span>}</> },
        { key: "name", label: t("a.f.customer"), render: (k) => <>{k.name}<span className="block text-xs text-muted" dir="ltr" style={{ textAlign: "start" }}>{k.email}</span></> },
        { key: "messages", label: t("a.f.messages"), className: "text-end tabular-nums" },
        { key: "status", label: t("a.f.status"), render: (k) => <StatusBadge status={k.status} prefix="a.ts" /> },
        { key: "updated_at", label: t("a.f.updated"), render: (k) => date(k.updated_at, true) },
      ]} />
      <Pagination page={page} pages={list.data?.pages ?? 1} onPage={(p) => qs.set({ page: String(p) }, true)} />
      <Modal open={openId !== null} onClose={() => setOpenId(null)} title={thread.data?.ticket.subject ?? t("c.loading")} wide>
        {thread.data && (
          <div className="space-y-4">
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted"><b dir="ltr">{thread.data.ticket.number}</b>{thread.data.ticket.name}<span dir="ltr">{thread.data.ticket.email}</span>{thread.data.ticket.phone && <span dir="ltr">{thread.data.ticket.phone}</span>}<StatusBadge status={thread.data.ticket.status} prefix="a.ts" /></p>
            <ol className="max-h-[40dvh] space-y-3 overflow-y-auto">
              {thread.data.messages.map((m: any) => (
                <li key={m.id} className={`max-w-[88%] rounded-md border p-3 ${m.author === "staff" ? "ms-auto border-info/30 bg-info-soft" : "border-line bg-surface-2"}`}>
                  <p className="mb-1 text-xs font-semibold text-muted">{m.author === "staff" ? m.user_name ?? t("ticket.staff") : thread.data.ticket.name} — {date(m.created_at, true)}</p>
                  <p className="whitespace-pre-line">{m.body}</p>
                </li>
              ))}
            </ol>
            <Field label={t("a.reply")}><Textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} maxLength={4000} /></Field>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm">{t("a.then_set")}<Select className="h-10 w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>{["pending", "resolved", "closed", "open"].map((s) => <option key={s} value={s}>{t(`a.ts.${s}`)}</option>)}</Select></label>
              <span className="flex gap-2">
                {thread.data.ticket.status !== "closed" && <Button variant="outline" busy={act.busy === "st"} onClick={() => setOnly("closed")}>{t("a.close_ticket")}</Button>}
                <Button icon="mail" busy={act.busy === "reply"} disabled={reply.trim().length < 2} onClick={send}>{t("a.send_reply")}</Button>
              </span>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
