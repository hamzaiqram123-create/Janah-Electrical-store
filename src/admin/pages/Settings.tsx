import { useEffect, useState } from "react";
import { api, ApiError } from "../../web/lib/api";
import { useApp } from "../../web/lib/ctx";
import { Icon } from "../../web/ui/Icon";
import { Badge, Button, Pagination, Select, StatusBadge } from "../../web/ui/kit";
import { DataTable, PageHead, SearchInput, useAdmin, useFetch, useQueryState } from "../core";
import { FormFields, type FieldDef } from "../resource";

const GROUPS: Record<string, FieldDef[]> = {
  store: [
    { key: "name", label: "a.s.store_name", type: "i18n" }, { key: "legal_name", label: "a.s.legal_name", type: "text", hint: "a.s.legal_name_hint" }, { key: "tagline", label: "a.s.tagline", type: "i18n" },
    { key: "vat_number", label: "f.vat_number", type: "text", hint: "f.vat_hint", ltr: true }, { key: "cr_number", label: "inv.cr_no", type: "text", ltr: true },
    { key: "phone", label: "a.s.phone", type: "text", ltr: true }, { key: "whatsapp", label: "a.s.whatsapp", type: "text", hint: "a.s.whatsapp_hint", ltr: true }, { key: "email", label: "f.email", type: "text", ltr: true },
    { key: "city_ar", label: "a.s.city_ar", type: "text" }, { key: "city_en", label: "a.s.city_en", type: "text", ltr: true }, { key: "district", label: "addr.district", type: "text" }, { key: "street", label: "addr.street", type: "text" },
    { key: "building_no", label: "addr.building", type: "text", ltr: true }, { key: "postal_code", label: "addr.postal", type: "text", ltr: true }, { key: "additional_no", label: "a.s.additional_no", type: "text", ltr: true },
    { key: "working_hours", label: "a.s.hours", type: "i18n" },
    { key: "instagram", label: "Instagram", type: "text", ltr: true }, { key: "x", label: "X", type: "text", ltr: true }, { key: "tiktok", label: "TikTok", type: "text", ltr: true }, { key: "snapchat", label: "Snapchat", type: "text", ltr: true },
  ],
  tax: [{ key: "vat_rate_bp", label: "a.s.vat_rate", type: "percent", hint: "a.s.vat_rate_hint" }],
  checkout: [
    { key: "guest_checkout", label: "a.s.guest_checkout", type: "bool" }, { key: "cod_enabled", label: "a.s.cod_enabled", type: "bool" }, { key: "cod_fee", label: "a.s.cod_fee", type: "money" }, { key: "cod_max_total", label: "a.s.cod_max", type: "money", hint: "a.s.cod_max_hint" },
    { key: "auto_confirm_cod", label: "a.s.auto_confirm", type: "bool", hint: "a.s.auto_confirm_hint" }, { key: "unpaid_order_ttl_minutes", label: "a.s.unpaid_ttl", type: "number", hint: "a.s.unpaid_ttl_hint" },
    { key: "cart_recovery_hours", label: "a.s.recovery_hours", type: "number", hint: "a.s.recovery_hint" }, { key: "max_qty_per_item", label: "a.s.max_qty", type: "number" },
  ],
  numbering: [{ key: "order_prefix", label: "a.s.order_prefix", type: "text", ltr: true, hint: "a.s.prefix_hint" }, { key: "invoice_prefix", label: "a.s.invoice_prefix", type: "text", ltr: true }, { key: "credit_note_prefix", label: "a.s.credit_prefix", type: "text", ltr: true }],
  reviews: [{ key: "auto_approve", label: "a.s.auto_approve", type: "bool", hint: "a.s.auto_approve_hint" }, { key: "verified_only", label: "a.s.verified_only", type: "bool" }],
  notifications: [{ key: "admin_email", label: "a.s.admin_email", type: "text", ltr: true, hint: "a.s.admin_email_hint" }, { key: "admin_phone", label: "a.s.admin_phone", type: "text", ltr: true }, { key: "send_sms", label: "a.s.send_sms", type: "bool" }, { key: "send_whatsapp", label: "a.s.send_whatsapp", type: "bool" }],
  seo: [{ key: "title", label: "a.f.seo_title", type: "i18n" }, { key: "description", label: "a.f.seo_description", type: "i18n_area", rows: 2 }],
};

export function SettingsPage() {
  const app = useApp();
  const { t } = app;
  const qs = useQueryState();
  const group = GROUPS[qs.get("tab")] ? qs.get("tab") : "store";
  const { data, setData } = useFetch<any>("/api/admin/settings");
  const [values, setValues] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data) { setValues({ ...data.settings[group] }); setErrors({}); } }, [data, group]);

  const save = async () => {
    setSaving(true); setErrors({});
    try {
      const body: Record<string, any> = {};
      for (const f of GROUPS[group]!) {
        if (f.type === "i18n" || f.type === "i18n_area") { for (const l of ["ar", "en", "ur"]) body[`${f.key}_${l}`] = values[`${f.key}_${l}`] ?? ""; }
        else if (f.type === "number" || f.type === "money" || f.type === "percent") body[f.key] = Number(values[f.key]) || 0;
        else body[f.key] = values[f.key] ?? (f.type === "bool" ? false : "");
      }
      const r = await api<any>(`/api/admin/settings/${group}`, { method: "PUT", body });
      setData({ ...data, settings: r.settings });
      app.toast(t("a.saved"));
    } catch (e) { if (e instanceof ApiError) setErrors(e.fields); app.toast(app.errorText(e), "err"); } finally { setSaving(false); }
  };
  if (!data) return <p className="text-muted">{t("c.loading")}</p>;
  const integ = data.integrations as Record<string, { provider: string; ready: boolean; reason?: string }>;

  return (
    <>
      <PageHead title={t("a.nav.settings")} sub={t("a.settings_sub")} />
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {Object.keys(GROUPS).map((g) => <button type="button" key={g} role="tab" aria-selected={group === g} className={`tab ${group === g ? "tab-on" : ""}`} onClick={() => qs.set({ tab: g })}>{t(`a.sg.${g}`)}</button>)}
        <button type="button" role="tab" aria-selected={qs.get("tab") === "integrations"} className={`tab ${qs.get("tab") === "integrations" ? "tab-on" : ""}`} onClick={() => qs.set({ tab: "integrations" })}>{t("a.sg.integrations")}</button>
      </div>
      {qs.get("tab") === "integrations" ? (
        <section className="card max-w-3xl p-4 md:p-6">
          <p className="mb-4 text-sm text-muted">{t("a.integ_intro")}</p>
          <ul className="divide-y divide-line">
            {Object.entries(integ).map(([key, v]) => (
              <li key={key} className="flex items-start justify-between gap-4 py-3">
                <div><p className="font-semibold">{t(`a.integ.${key}`)}</p><p className="text-sm text-muted">{t(`a.integ.${key}_d`)}</p>{!v.ready && v.reason && <p className="mt-1 text-xs text-muted" dir="ltr" style={{ textAlign: "start" }}>{v.reason}</p>}</div>
                <span className="flex shrink-0 items-center gap-2"><span className="text-sm text-muted" dir="ltr">{v.provider}</span><Badge tone={v.ready ? "ok" : "muted"}>{t(v.ready ? "a.integ_on" : "a.integ_off")}</Badge></span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <form className="card max-w-3xl p-4 md:p-6" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
          {group === "store" && !values.vat_number && <p className="mb-4 flex items-start gap-2 rounded-md bg-warn-soft p-3 text-sm"><Icon name="alert" size={18} className="mt-0.5 shrink-0" />{t("a.todo_vat")}</p>}
          {group === "tax" && <p className="mb-4 rounded-md bg-surface-2 p-3 text-sm">{t("a.s.tax_note")}</p>}
          <FormFields fields={GROUPS[group]!} values={values} set={(k, v) => setValues((x) => ({ ...x, [k]: v }))} errors={errors} opts={{}} />
          <div className="mt-6"><Button type="submit" busy={saving} icon="check">{t("c.save")}</Button></div>
        </form>
      )}
    </>
  );
}

export function LogsPage() {
  const { t, date } = useApp();
  const qs = useQueryState();
  const page = Number(qs.get("page")) || 1;
  const list = useFetch<any>(`/api/admin/audit-logs?page=${page}${qs.get("q") ? `&q=${encodeURIComponent(qs.get("q"))}` : ""}${qs.get("entity") ? `&entity=${qs.get("entity")}` : ""}`);
  return (
    <>
      <PageHead title={t("a.nav.logs")} sub={t("a.logs_sub")}>
        <SearchInput value={qs.get("q")} onChange={(v) => qs.set({ q: v })} placeholder={t("a.logs_search")} />
        <Select className="h-10 w-auto" value={qs.get("entity")} onChange={(e) => qs.set({ entity: e.target.value })} aria-label={t("a.f.entity")}>
          <option value="">{t("a.all")}</option>{["order", "products", "payment", "invoice", "return", "review", "user", "users", "customers", "settings", "coupons", "discounts", "categories", "brands", "banners", "pages"].map((x) => <option key={x} value={x}>{x}</option>)}
        </Select>
      </PageHead>
      <DataTable rows={list.data?.rows} loading={list.loading} columns={[
        { key: "created_at", label: t("a.f.date"), render: (r) => <span className="whitespace-nowrap">{date(r.created_at, true)}</span> },
        { key: "actor", label: t("a.f.user"), render: (r) => <span dir="ltr">{r.actor}</span> },
        { key: "action", label: t("a.f.action"), render: (r) => <Badge tone="info">{r.action}</Badge> },
        { key: "entity", label: t("a.f.entity"), render: (r) => <span dir="ltr">{r.entity}{r.entity_id ? ` #${r.entity_id}` : ""}</span> },
        { key: "meta", label: t("a.f.details"), render: (r) => <code className="block max-w-md truncate text-xs text-muted" dir="ltr" title={JSON.stringify(r.meta)}>{Object.keys(r.meta ?? {}).length ? JSON.stringify(r.meta) : ""}</code> },
        { key: "ip", label: "IP", render: (r) => <span dir="ltr" className="text-xs text-muted">{r.ip}</span> },
      ]} />
      <Pagination page={page} pages={list.data?.pages ?? 1} onPage={(p) => qs.set({ page: String(p) }, true)} />
    </>
  );
}

export function NotificationsPage() {
  const app = useApp();
  const { t, date } = app;
  const admin = useAdmin();
  const qs = useQueryState();
  const page = Number(qs.get("page")) || 1;
  const channel = qs.get("channel") || "admin";
  const list = useFetch<any>(`/api/admin/notifications?page=${page}&channel=${channel}`);
  useEffect(() => {
    if (channel !== "admin" || !list.data || !list.data.unread) return;
    api("/api/admin/notifications/read", { body: {} }).then(() => admin.setUnread(0)).catch(() => {});
  }, [list.data, channel]);
  const go = (link: string | null) => { if (!link) return; try { const u = new URL(link, location.origin); admin.go(u.pathname + u.search); } catch { /* ignore malformed link */ } };
  return (
    <>
      <PageHead title={t("a.nav.notifications")} sub={t("a.notif_sub")} />
      <div className="mb-3 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {["admin", "email", "sms", "whatsapp"].map((c) => <button type="button" key={c} role="tab" aria-selected={channel === c} className={`tab ${channel === c ? "tab-on" : ""}`} onClick={() => qs.set({ channel: c })}>{t(`a.nc.${c}`)}</button>)}
      </div>
      {channel === "admin" ? (
        <ul className="card divide-y divide-line">
          {(list.data?.rows ?? []).map((n: any) => (
            <li key={n.id}>
              <button type="button" className={`flex w-full items-start gap-3 p-4 text-start hover:bg-surface-2 ${n.read_at ? "" : "bg-info-soft/50"}`} onClick={() => go(n.payload?.link ?? null)}>
                <Icon name={n.event === "low_inventory" ? "alert" : n.event === "new_order" ? "box" : n.event === "return_requested" ? "undo" : "chat"} className="mt-0.5 shrink-0 text-accent" />
                <span className="min-w-0 flex-1"><span className="block font-semibold">{n.subject}</span><span className="block text-sm text-muted">{n.body}</span></span>
                <time className="shrink-0 text-xs text-muted">{date(n.created_at, true)}</time>
              </button>
            </li>
          ))}
          {list.data && !list.data.rows.length && <li className="p-10 text-center text-muted">{t("a.notif_none")}</li>}
        </ul>
      ) : (
        <DataTable rows={list.data?.rows} loading={list.loading} columns={[
          { key: "created_at", label: t("a.f.date"), render: (n) => <span className="whitespace-nowrap">{date(n.created_at, true)}</span> },
          { key: "event", label: t("a.f.event"), render: (n) => <Badge>{n.event}</Badge> },
          { key: "recipient", label: t("a.f.recipient"), render: (n) => <span dir="ltr">{n.recipient}</span> },
          { key: "subject", label: t("a.f.message"), render: (n) => <span className="block max-w-md"><b className="block">{n.subject}</b><span className="line-clamp-2 text-sm text-muted">{n.body}</span></span> },
          { key: "status", label: t("a.f.status"), render: (n) => <><StatusBadge status={n.status} prefix="a.ns" />{n.error && <span className="mt-1 block max-w-52 text-xs text-muted" dir="ltr" style={{ textAlign: "start" }}>{n.error}</span>}</> },
        ]} />
      )}
      <Pagination page={page} pages={list.data?.pages ?? 1} onPage={(p) => qs.set({ page: String(p) }, true)} />
    </>
  );
}
