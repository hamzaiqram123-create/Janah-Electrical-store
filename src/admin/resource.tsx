import { useEffect, useState, type ReactNode } from "react";
import { PERMISSIONS, sar } from "../shared/constants";
import { api, ApiError } from "../web/lib/api";
import { useApp } from "../web/lib/ctx";
import { GLYPHS, Glyph } from "../web/ui/Icon";
import { Badge, Button, Field, Input, Modal, Pagination, Select, Textarea } from "../web/ui/kit";
import { Confirm, DataTable, MoneyInput, PageHead, SearchInput, useAction, useAdmin, useFetch, useQueryState, type Column } from "./core";

type Opt = { value: string | number; label: string };
type FieldType = "text" | "textarea" | "number" | "money" | "percent" | "bool" | "select" | "datetime" | "image" | "i18n" | "i18n_area" | "perms" | "typed_value" | "scope_ref" | "glyph";
export interface FieldDef {
  key: string; label: string; type: FieldType; required?: boolean; hint?: string; wide?: boolean;
  options?: Opt[] | "categories" | "brands" | "regions" | "cities" | "shipping_methods" | "roles";
  nullable?: boolean; uploadKind?: string; rows?: number; showIf?: (v: Record<string, any>) => boolean; ltr?: boolean; upper?: boolean;
}
export interface ResourceDef {
  api: string; title: string; intro?: string; readPerm: string; writePerm: string;
  fields: FieldDef[]; columns: (t: (k: string, v?: any) => string, opts: Record<string, Opt[]>) => Column[];
  defaults: Record<string, any>; search?: boolean; filter?: { key: string; label: string; options: FieldDef["options"] };
  /** option lists the columns need */
  needs?: string[];
}

const optionCache = new Map<string, Promise<Opt[]>>();
export function loadOptions(source: string): Promise<Opt[]> {
  let p = optionCache.get(source);
  if (!p) {
    const name = (r: any) => r.name_ar || r.name_en || r.name || r.key;
    p = (source === "regions" ? api<any>("/api/admin/regions")
      : api<any>(`/api/admin/${source.replace("_", "-")}?per=500`)).then((d) => (d.rows as any[]).map((r) => ({ value: r.id, label: name(r) })));
    optionCache.set(source, p);
    p.catch(() => optionCache.delete(source));
  }
  return p;
}
export const clearOptions = (source?: string) => (source ? optionCache.delete(source) : optionCache.clear());

export function useOptions(sources: (FieldDef["options"] | undefined)[]): Record<string, Opt[]> {
  const [map, setMap] = useState<Record<string, Opt[]>>({});
  const keys = sources.filter((s): s is Exclude<FieldDef["options"], Opt[] | undefined> => typeof s === "string");
  useEffect(() => {
    let live = true;
    for (const k of new Set(keys)) loadOptions(k).then((o) => { if (live) setMap((m) => ({ ...m, [k]: o })); }).catch(() => {});
    return () => { live = false; };
  }, [keys.join(",")]);
  return map;
}

const toLocal = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export function ImageField({ value, onChange, kind }: { value: string | null; onChange: (url: string | null) => void; kind?: string }) {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await api<{ url: string }>(`/api/admin/uploads?kind=${kind ?? "content"}`, { form });
      onChange(r.url);
    } catch (e) { app.toast(app.errorText(e), "err"); } finally { setBusy(false); }
  };
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-md border border-line bg-white text-xs text-muted">
        {value ? <img src={value} alt="" className="size-full object-contain" /> : "—"}
      </span>
      <label className={`btn btn-outline btn-sm cursor-pointer ${busy ? "opacity-60" : ""}`}>
        {busy ? app.t("c.loading") : app.t("a.upload")}
        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
      </label>
      {value && <Button variant="ghost" size="sm" onClick={() => onChange(null)}>{app.t("c.remove")}</Button>}
    </div>
  );
}

export function I18nInputs({ base, values, onChange, area, errors, rows }: { base: string; values: Record<string, any>; onChange: (k: string, v: string) => void; area?: boolean; errors: Record<string, string>; rows?: number }) {
  const langs: [string, string, "rtl" | "ltr"][] = [["ar", "العربية", "rtl"], ["en", "English", "ltr"], ["ur", "اردو", "rtl"]];
  return (
    <div className="space-y-2">
      {langs.map(([l, name, dir]) => {
        const k = `${base}_${l}`;
        const props = { value: values[k] ?? "", dir, lang: l, invalid: !!errors[k], "aria-label": name, onChange: (e: { target: { value: string } }) => onChange(k, e.target.value) };
        return (
          <div key={l} className="flex items-start gap-2">
            <span className="mt-2.5 w-14 shrink-0 text-xs font-semibold text-muted">{name}</span>
            {area ? <Textarea rows={rows ?? 3} {...props} /> : <Input {...props} />}
          </div>
        );
      })}
    </div>
  );
}

export function FormFields({ fields, values, set, errors, opts }: { fields: FieldDef[]; values: Record<string, any>; set: (k: string, v: any) => void; errors: Record<string, string>; opts: Record<string, Opt[]> }) {
  const { t } = useApp();
  const options = (f: FieldDef): Opt[] => (Array.isArray(f.options) ? f.options : f.options ? opts[f.options] ?? [] : []);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.filter((f) => !f.showIf || f.showIf(values)).map((f) => {
        const err = errors[f.key] || errors[`${f.key}_ar`] || null;
        const v = values[f.key];
        const wide = f.wide || f.type === "i18n" || f.type === "i18n_area" || f.type === "textarea" || f.type === "perms" || f.type === "glyph";
        let control: ReactNode;
        switch (f.type) {
          case "i18n": case "i18n_area": control = <I18nInputs base={f.key} values={values} onChange={set} area={f.type === "i18n_area"} errors={errors} rows={f.rows} />; break;
          case "textarea": control = <Textarea rows={f.rows ?? 3} value={v ?? ""} onChange={(e) => set(f.key, e.target.value)} invalid={!!err} />; break;
          case "number": control = <Input inputMode="numeric" dir="ltr" className="text-start tabular-nums" value={v ?? ""} onChange={(e) => set(f.key, e.target.value.replace(/[^\d-]/g, ""))} invalid={!!err} />; break;
          case "money": control = <MoneyInput value={v ?? null} onChange={(h) => set(f.key, h)} invalid={!!err} />; break;
          case "percent": control = <Input inputMode="decimal" dir="ltr" className="text-start tabular-nums" value={v == null || v === "" ? "" : String(v / 100)} onChange={(e) => set(f.key, e.target.value === "" ? "" : Math.round(Number(e.target.value.replace(/[^\d.]/g, "")) * 100))} invalid={!!err} />; break;
          case "typed_value":
            control = values.type === "percent"
              ? <span className="relative block" dir="ltr"><Input inputMode="decimal" className="pe-9 tabular-nums" value={v ? String(v / 100) : ""} onChange={(e) => set(f.key, Math.round(Number(e.target.value.replace(/[^\d.]/g, "")) * 100) || 0)} invalid={!!err} /><span className="pointer-events-none absolute end-3 top-2.5 text-muted">%</span></span>
              : <MoneyInput value={v ?? null} onChange={(h) => set(f.key, h ?? 0)} invalid={!!err} />;
            break;
          case "scope_ref":
            control = values.scope === "product"
              ? <Input inputMode="numeric" dir="ltr" className="text-start" value={v ?? ""} onChange={(e) => set(f.key, e.target.value.replace(/\D/g, ""))} placeholder={t("a.product_id")} invalid={!!err} />
              : <Select value={v ?? ""} onChange={(e) => set(f.key, e.target.value)} invalid={!!err}><option value="">{t("a.choose")}</option>{(opts[values.scope === "brand" ? "brands" : "categories"] ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>;
            break;
          case "bool": control = <label className="flex h-11 items-center gap-2.5"><input type="checkbox" className="check" checked={!!v} onChange={(e) => set(f.key, e.target.checked)} />{t("a.yes")}</label>; break;
          case "select": control = <Select value={v ?? ""} onChange={(e) => set(f.key, e.target.value)} invalid={!!err}>{(f.nullable || !f.required) && <option value="">{f.nullable ? t("a.none") : t("a.choose")}</option>}{options(f).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>; break;
          case "datetime": control = <Input type="datetime-local" dir="ltr" className="text-start" value={toLocal(v)} onChange={(e) => set(f.key, e.target.value ? new Date(e.target.value).toISOString() : null)} invalid={!!err} />; break;
          case "image": control = <ImageField value={v ?? null} onChange={(u) => set(f.key, u)} kind={f.uploadKind} />; break;
          case "glyph": control = (
            <div className="flex flex-wrap gap-1.5">
              {GLYPHS.map((g) => <button type="button" key={g} title={g} aria-pressed={v === g} onClick={() => set(f.key, g)} className={`grid size-10 place-items-center rounded-md border ${v === g ? "border-accent bg-accent-soft text-accent" : "border-line text-muted hover:border-fg"}`}><Glyph name={g} size={22} /></button>)}
            </div>
          ); break;
          case "perms": control = (
            <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
              {PERMISSIONS.map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm"><input type="checkbox" className="check" checked={(v ?? []).includes(p) || (v ?? []).includes("*")} disabled={(v ?? []).includes("*")}
                  onChange={(e) => set(f.key, e.target.checked ? [...(v ?? []), p] : (v ?? []).filter((x: string) => x !== p))} />{t(`perm.${p}`)}</label>
              ))}
            </div>
          ); break;
          default: control = <Input value={v ?? ""} dir={f.ltr ? "ltr" : undefined} className={`${f.ltr ? "text-start" : ""} ${f.upper ? "uppercase" : ""}`} onChange={(e) => set(f.key, e.target.value)} invalid={!!err} />;
        }
        return <Field key={f.key} label={t(f.label)} required={f.required} error={err} hint={f.hint ? t(f.hint) : undefined} className={wide ? "sm:col-span-2" : ""}>{control}</Field>;
      })}
    </div>
  );
}

/** Convert form values to the JSON body: empty strings on numeric / reference fields become null. */
function toBody(fields: FieldDef[], values: Record<string, any>): Record<string, any> {
  const body: Record<string, any> = {};
  for (const f of fields) {
    if (f.type === "i18n" || f.type === "i18n_area") { for (const l of ["ar", "en", "ur"]) body[`${f.key}_${l}`] = values[`${f.key}_${l}`] ?? ""; continue; }
    let v = values[f.key];
    if (f.showIf && !f.showIf(values)) { if (f.type === "scope_ref") v = null; else continue; }
    if (["number", "money", "percent", "scope_ref", "typed_value"].includes(f.type) || (f.type === "select" && typeof f.options === "string")) v = v === "" || v === undefined || v === null ? null : Number(v);
    if (f.type === "select" && Array.isArray(f.options) && v === "") v = null;
    body[f.key] = v;
  }
  return body;
}

export function ResourcePage({ def }: { def: ResourceDef }) {
  const app = useApp();
  const { t } = app;
  const admin = useAdmin();
  const qs = useQueryState();
  const page = Number(qs.get("page")) || 1;
  const filterKey = def.filter?.key;
  const url = `/api/admin/${def.api}?page=${page}&per=50${qs.get("q") ? `&q=${encodeURIComponent(qs.get("q"))}` : ""}${filterKey && qs.get(filterKey) ? `&${filterKey}=${encodeURIComponent(qs.get(filterKey))}` : ""}`;
  const list = useFetch<{ rows: any[]; total: number; pages: number }>(url);
  const opts = useOptions([...def.fields.map((f) => f.options), def.filter?.options, ...(def.needs ?? []) as any[], ...(def.fields.some((f) => f.type === "scope_ref") ? ["categories", "brands"] as any[] : [])]);
  const [editing, setEditing] = useState<any | null>(null);
  const [values, setValues] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState<any | null>(null);
  const act = useAction();
  const canWrite = admin.can(def.writePerm);

  const open = (row?: any) => { setErrors({}); setValues(row ? { ...row } : { ...def.defaults }); setEditing(row ?? {}); };
  const save = async () => {
    setSaving(true); setErrors({});
    try {
      const body = toBody(def.fields, values);
      if (editing?.id) await api(`/api/admin/${def.api}/${editing.id}`, { method: "PUT", body });
      else await api(`/api/admin/${def.api}`, { body });
      clearOptions();
      setEditing(null); app.toast(t("a.saved")); await list.reload();
    } catch (e) {
      if (e instanceof ApiError) setErrors(e.fields);
      app.toast(app.errorText(e), "err");
    } finally { setSaving(false); }
  };
  const remove = async () => {
    const ok = await act.run("del", () => api(`/api/admin/${def.api}/${del.id}`, { method: "DELETE" }), t("a.deleted"));
    if (ok) { clearOptions(); setDel(null); await list.reload(); }
  };
  const filterOpts = def.filter ? (Array.isArray(def.filter.options) ? def.filter.options : opts[def.filter.options as string] ?? []) : [];

  const columns: Column[] = [
    ...def.columns(t, opts),
    ...(canWrite ? [{ key: "_", label: "", className: "w-px whitespace-nowrap text-end", render: (r: any) => (
      <span className="flex justify-end gap-1">
        <Button variant="ghost" size="sm" icon="edit" onClick={() => open(r)} aria-label={t("c.edit")} />
        <Button variant="ghost" size="sm" icon="trash" onClick={() => setDel(r)} aria-label={t("c.delete")} />
      </span>
    ) }] : []),
  ];

  return (
    <>
      <PageHead title={t(def.title)} sub={def.intro ? t(def.intro) : undefined}>
        {def.search && <SearchInput value={qs.get("q")} onChange={(v) => qs.set({ q: v })} />}
        {def.filter && <Select className="h-10 w-auto min-w-40" value={qs.get(def.filter.key)} onChange={(e) => qs.set({ [def.filter!.key]: e.target.value })} aria-label={t(def.filter.label)}><option value="">{t(def.filter.label)}</option>{filterOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>}
        {canWrite && <Button icon="plus" size="sm" className="h-10" onClick={() => open()}>{t("a.add")}</Button>}
      </PageHead>
      <DataTable columns={columns} rows={list.data?.rows} loading={list.loading} onRow={canWrite ? open : undefined} />
      <Pagination page={page} pages={list.data?.pages ?? 1} onPage={(p) => qs.set({ page: String(p) }, true)} />
      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? t("c.edit") : t("a.add")} wide>
        <form onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
          <FormFields fields={def.fields} values={values} set={(k, v) => { setValues((x) => ({ ...x, [k]: v })); setErrors((x) => (x[k] ? { ...x, [k]: "" } : x)); }} errors={errors} opts={opts} />
          <div className="mt-6 flex justify-end gap-3"><Button variant="ghost" onClick={() => setEditing(null)}>{t("c.cancel")}</Button><Button type="submit" busy={saving}>{t("c.save")}</Button></div>
        </form>
      </Modal>
      <Confirm open={!!del} danger title={t("a.delete_q")} text={t("a.delete_text")} busy={act.busy === "del"} yes={t("c.delete")} onYes={remove} onNo={() => setDel(null)} />
    </>
  );
}

// ───────────── column helpers ─────────────
const nameCol = (label: string, base = "name"): Column => ({ key: base, label, render: (r) => <span><span className="font-medium">{r[`${base}_ar`]}</span>{r[`${base}_en`] && r[`${base}_en`] !== r[`${base}_ar`] ? <span className="block text-xs text-muted" dir="ltr" style={{ textAlign: "start" }}>{r[`${base}_en`]}</span> : null}</span> });
const boolCol = (key: string, label: string, t: (k: string) => string): Column => ({ key, label, render: (r) => <Badge tone={r[key] ? "ok" : "muted"}>{t(r[key] ? "a.yes" : "a.no")}</Badge> });
const moneyCol = (key: string, label: string): Column => ({ key, label, className: "text-end tabular-nums", render: (r) => (r[key] == null ? "—" : sar(r[key])) });
const dateShort = (v: string | null) => (v ? new Date(v).toISOString().slice(0, 10) : "—");
const optLabel = (opts: Opt[] | undefined, id: any) => opts?.find((o) => String(o.value) === String(id))?.label ?? (id ?? "—");
const sel = (pairs: [string, string][], t: (k: string) => string): Opt[] => pairs.map(([value, key]) => ({ value, label: t(key) }));

export const RESOURCES: Record<string, (t: (k: string, v?: any) => string) => ResourceDef> = {
  categories: (t) => ({
    api: "categories", title: "a.nav.categories", intro: "a.categories_intro", readPerm: "products.view", writePerm: "catalog.manage", search: true, needs: ["categories"],
    defaults: { sort: 0, active: true, icon: "other" },
    fields: [
      { key: "name", label: "a.f.name", type: "i18n", required: true }, { key: "parent_id", label: "a.f.parent", type: "select", options: "categories", nullable: true },
      { key: "slug", label: "a.f.slug", type: "text", hint: "a.f.slug_hint", ltr: true }, { key: "icon", label: "a.f.icon", type: "glyph" },
      { key: "description", label: "a.f.description", type: "i18n_area" }, { key: "image_url", label: "a.f.image", type: "image", uploadKind: "content" },
      { key: "sort", label: "a.f.sort", type: "number" }, { key: "active", label: "a.f.active", type: "bool" },
    ],
    columns: (t, o) => [{ key: "icon", label: "", className: "w-px", render: (r) => <Glyph name={r.icon} size={22} className="text-muted" /> }, nameCol(t("a.f.name")), { key: "parent_id", label: t("a.f.parent"), render: (r) => (r.parent_id ? optLabel(o.categories, r.parent_id) : "—") }, { key: "slug", label: t("a.f.slug") }, { key: "sort", label: t("a.f.sort") }, boolCol("active", t("a.f.active"), t)],
  }),
  brands: (t) => ({
    api: "brands", title: "a.nav.brands", readPerm: "products.view", writePerm: "catalog.manage", search: true, defaults: { sort: 0, active: true, is_popular: false },
    fields: [
      { key: "name", label: "a.f.name", type: "i18n", required: true }, { key: "slug", label: "a.f.slug", type: "text", hint: "a.f.slug_hint", ltr: true }, { key: "logo_url", label: "a.f.logo", type: "image", uploadKind: "brand" },
      { key: "is_popular", label: "a.f.popular", type: "bool", hint: "a.f.popular_hint" }, { key: "sort", label: "a.f.sort", type: "number" }, { key: "active", label: "a.f.active", type: "bool" },
    ],
    columns: (t) => [nameCol(t("a.f.name")), { key: "slug", label: t("a.f.slug") }, boolCol("is_popular", t("a.f.popular"), t), boolCol("active", t("a.f.active"), t)],
  }),
  coupons: (t) => ({
    api: "coupons", title: "a.nav.coupons", intro: "a.coupons_intro", readPerm: "promotions.manage", writePerm: "promotions.manage", search: true,
    defaults: { type: "percent", value: 1000, min_subtotal: 0, active: true },
    fields: [
      { key: "code", label: "a.f.code", type: "text", required: true, ltr: true, upper: true }, { key: "type", label: "a.f.type", type: "select", required: true, options: sel([["percent", "a.t.percent"], ["fixed", "a.t.fixed"], ["free_shipping", "a.t.free_shipping"]], t) },
      { key: "value", label: "a.f.value", type: "typed_value", showIf: (v) => v.type !== "free_shipping" }, { key: "max_discount", label: "a.f.max_discount", type: "money", showIf: (v) => v.type === "percent" },
      { key: "min_subtotal", label: "a.f.min_subtotal", type: "money" }, { key: "usage_limit", label: "a.f.usage_limit", type: "number", hint: "a.f.blank_unlimited" },
      { key: "per_customer_limit", label: "a.f.per_customer", type: "number", hint: "a.f.blank_unlimited" }, { key: "description", label: "a.f.note", type: "text" },
      { key: "starts_at", label: "a.f.starts", type: "datetime" }, { key: "ends_at", label: "a.f.ends", type: "datetime" }, { key: "active", label: "a.f.active", type: "bool" },
    ],
    columns: (t) => [
      { key: "code", label: t("a.f.code"), render: (r) => <b dir="ltr">{r.code}</b> },
      { key: "value", label: t("a.f.value"), render: (r) => (r.type === "percent" ? `${r.value / 100}%` : r.type === "fixed" ? `${sar(r.value)} SAR` : t("a.t.free_shipping")) },
      moneyCol("min_subtotal", t("a.f.min_subtotal")), { key: "used_count", label: t("a.f.used"), render: (r) => `${r.used_count}${r.usage_limit ? ` / ${r.usage_limit}` : ""}` },
      { key: "ends_at", label: t("a.f.ends"), render: (r) => dateShort(r.ends_at) }, boolCol("active", t("a.f.active"), t),
    ],
  }),
  discounts: (t) => ({
    api: "discounts", title: "a.nav.discounts", intro: "a.discounts_intro", readPerm: "promotions.manage", writePerm: "promotions.manage", search: true, needs: ["categories", "brands"],
    defaults: { type: "percent", value: 1000, scope: "all", active: true },
    fields: [
      { key: "name", label: "a.f.name", type: "text", required: true, wide: true }, { key: "type", label: "a.f.type", type: "select", required: true, options: sel([["percent", "a.t.percent"], ["fixed", "a.t.fixed"]], t) },
      { key: "value", label: "a.f.value", type: "typed_value", required: true },
      { key: "scope", label: "a.f.scope", type: "select", required: true, options: sel([["all", "a.t.all_products"], ["category", "a.t.category"], ["brand", "a.t.brand"], ["product", "a.t.product"]], t) },
      { key: "scope_id", label: "a.f.scope_target", type: "scope_ref", showIf: (v) => v.scope !== "all" },
      { key: "starts_at", label: "a.f.starts", type: "datetime" }, { key: "ends_at", label: "a.f.ends", type: "datetime" }, { key: "active", label: "a.f.active", type: "bool" },
    ],
    columns: (t, o) => [
      { key: "name", label: t("a.f.name") }, { key: "value", label: t("a.f.value"), render: (r) => (r.type === "percent" ? `${r.value / 100}%` : `${sar(r.value)} SAR`) },
      { key: "scope", label: t("a.f.scope"), render: (r) => (r.scope === "all" ? t("a.t.all_products") : `${t(`a.t.${r.scope}`)}: ${r.scope === "category" ? optLabel(o.categories, r.scope_id) : r.scope === "brand" ? optLabel(o.brands, r.scope_id) : `#${r.scope_id}`}`) },
      { key: "starts_at", label: t("a.f.starts"), render: (r) => dateShort(r.starts_at) }, { key: "ends_at", label: t("a.f.ends"), render: (r) => dateShort(r.ends_at) }, boolCol("active", t("a.f.active"), t),
    ],
  }),
  banners: (t) => ({
    api: "banners", title: "a.nav.banners", intro: "a.banners_intro", readPerm: "content.manage", writePerm: "content.manage", defaults: { placement: "hero", sort: 0, active: true, link: "/products" },
    fields: [
      { key: "placement", label: "a.f.placement", type: "select", required: true, options: sel([["hero", "a.t.hero"], ["promo", "a.t.promo"]], t) }, { key: "link", label: "a.f.link", type: "text", hint: "a.f.link_hint", ltr: true },
      { key: "title", label: "a.f.title", type: "i18n", required: true }, { key: "subtitle", label: "a.f.subtitle", type: "i18n_area", rows: 2 }, { key: "cta", label: "a.f.cta", type: "i18n" },
      { key: "image_url", label: "a.f.image", type: "image", uploadKind: "banner" }, { key: "sort", label: "a.f.sort", type: "number" },
      { key: "starts_at", label: "a.f.starts", type: "datetime" }, { key: "ends_at", label: "a.f.ends", type: "datetime" }, { key: "active", label: "a.f.active", type: "bool" },
    ],
    columns: (t) => [{ key: "placement", label: t("a.f.placement"), render: (r) => t(`a.t.${r.placement}`) }, nameCol(t("a.f.title"), "title"), { key: "link", label: t("a.f.link") }, { key: "sort", label: t("a.f.sort") }, boolCol("active", t("a.f.active"), t)],
  }),
  homepage: (t) => ({
    api: "homepage-sections", title: "a.nav.homepage", intro: "a.homepage_intro", readPerm: "content.manage", writePerm: "content.manage", defaults: { type: "featured", item_limit: 10, sort: 0, active: true },
    fields: [
      { key: "type", label: "a.f.section", type: "select", required: true, options: sel(["hero", "categories", "featured", "best_sellers", "new_arrivals", "deals", "brands", "promo", "reviews", "why_us", "delivery", "contact"].map((x) => [x, `a.sec.${x}`]), t) },
      { key: "item_limit", label: "a.f.item_limit", type: "number" }, { key: "title", label: "a.f.title", type: "i18n", hint: "a.f.title_default" }, { key: "sort", label: "a.f.sort", type: "number" }, { key: "active", label: "a.f.active", type: "bool" },
    ],
    columns: (t) => [{ key: "sort", label: t("a.f.sort"), className: "w-px" }, { key: "type", label: t("a.f.section"), render: (r) => t(`a.sec.${r.type}`) }, nameCol(t("a.f.title"), "title"), { key: "item_limit", label: t("a.f.item_limit") }, boolCol("active", t("a.f.active"), t)],
  }),
  pages: (t) => ({
    api: "pages", title: "a.nav.pages", intro: "a.pages_intro", readPerm: "content.manage", writePerm: "content.manage", defaults: {},
    fields: [{ key: "slug", label: "a.f.slug", type: "text", required: true, ltr: true }, { key: "title", label: "a.f.title", type: "i18n", required: true }, { key: "body", label: "a.f.body", type: "i18n_area", rows: 10, hint: "a.f.body_hint" }],
    columns: (t) => [{ key: "slug", label: t("a.f.slug"), render: (r) => <span dir="ltr">/page/{r.slug}</span> }, nameCol(t("a.f.title"), "title"), { key: "updated_at", label: t("a.f.updated"), render: (r) => dateShort(r.updated_at) }],
  }),
  faqs: (t) => ({
    api: "faqs", title: "a.nav.faqs", readPerm: "content.manage", writePerm: "content.manage", defaults: { sort: 0, active: true },
    fields: [{ key: "question", label: "a.f.question", type: "i18n", required: true }, { key: "answer", label: "a.f.answer", type: "i18n_area", required: true, rows: 4 }, { key: "sort", label: "a.f.sort", type: "number" }, { key: "active", label: "a.f.active", type: "bool" }],
    columns: (t) => [{ key: "sort", label: t("a.f.sort"), className: "w-px" }, nameCol(t("a.f.question"), "question"), boolCol("active", t("a.f.active"), t)],
  }),
  shipping_methods: (t) => ({
    api: "shipping-methods", title: "a.nav.shipping", intro: "a.shipping_intro", readPerm: "shipping.manage", writePerm: "shipping.manage", defaults: { base_fee: 2500, min_days: 2, max_days: 5, cod_allowed: true, is_pickup: false, active: true, sort: 0 },
    fields: [
      { key: "key", label: "a.f.key", type: "text", required: true, ltr: true }, { key: "carrier", label: "a.f.carrier", type: "text" }, { key: "name", label: "a.f.name", type: "i18n", required: true }, { key: "description", label: "a.f.description", type: "i18n" },
      { key: "base_fee", label: "a.f.base_fee", type: "money", required: true }, { key: "free_threshold", label: "a.f.free_threshold", type: "money", hint: "a.f.free_threshold_hint" },
      { key: "min_days", label: "a.f.min_days", type: "number" }, { key: "max_days", label: "a.f.max_days", type: "number" },
      { key: "cod_allowed", label: "a.f.cod_allowed", type: "bool" }, { key: "is_pickup", label: "a.f.is_pickup", type: "bool", hint: "a.f.is_pickup_hint" }, { key: "sort", label: "a.f.sort", type: "number" }, { key: "active", label: "a.f.active", type: "bool" },
    ],
    columns: (t) => [nameCol(t("a.f.name")), moneyCol("base_fee", t("a.f.base_fee")), moneyCol("free_threshold", t("a.f.free_threshold")), { key: "days", label: t("a.f.days"), render: (r) => `${r.min_days}–${r.max_days}` }, boolCol("cod_allowed", t("a.f.cod_allowed"), t), boolCol("active", t("a.f.active"), t)],
  }),
  shipping_rates: (t) => ({
    api: "shipping-rates", title: "a.shipping_rates", intro: "a.shipping_rates_intro", readPerm: "shipping.manage", writePerm: "shipping.manage", needs: ["shipping_methods", "regions", "cities"],
    filter: { key: "method_id", label: "a.f.method", options: "shipping_methods" }, defaults: { fee: 0, active: true },
    fields: [
      { key: "method_id", label: "a.f.method", type: "select", required: true, options: "shipping_methods" }, { key: "region_id", label: "a.f.region", type: "select", options: "regions", nullable: true },
      { key: "city_id", label: "a.f.city", type: "select", options: "cities", nullable: true, hint: "a.f.city_hint" }, { key: "fee", label: "a.f.fee", type: "money", required: true },
      { key: "min_days", label: "a.f.min_days", type: "number" }, { key: "max_days", label: "a.f.max_days", type: "number" }, { key: "active", label: "a.f.available", type: "bool", hint: "a.f.available_hint" },
    ],
    columns: (t, o) => [{ key: "method_id", label: t("a.f.method"), render: (r) => optLabel(o.shipping_methods, r.method_id) }, { key: "dest", label: t("a.f.destination"), render: (r) => (r.city_id ? optLabel(o.cities, r.city_id) : optLabel(o.regions, r.region_id)) }, moneyCol("fee", t("a.f.fee")), { key: "days", label: t("a.f.days"), render: (r) => (r.min_days != null ? `${r.min_days}–${r.max_days ?? r.min_days}` : "—") }, boolCol("active", t("a.f.available"), t)],
  }),
  cities: (t) => ({
    api: "cities", title: "a.cities", readPerm: "shipping.manage", writePerm: "shipping.manage", search: true, needs: ["regions"], filter: { key: "region_id", label: "a.f.region", options: "regions" }, defaults: { active: true },
    fields: [{ key: "region_id", label: "a.f.region", type: "select", required: true, options: "regions" }, { key: "name", label: "a.f.name", type: "i18n", required: true }, { key: "active", label: "a.f.active", type: "bool" }],
    columns: (t, o) => [nameCol(t("a.f.name")), { key: "region_id", label: t("a.f.region"), render: (r) => optLabel(o.regions, r.region_id) }, boolCol("active", t("a.f.active"), t)],
  }),
  roles: (t) => ({
    api: "roles", title: "a.roles", intro: "a.roles_intro", readPerm: "users.manage", writePerm: "users.manage", defaults: { permissions: [] },
    fields: [{ key: "key", label: "a.f.key", type: "text", required: true, ltr: true }, { key: "name", label: "a.f.name", type: "text", required: true }, { key: "permissions", label: "a.f.permissions", type: "perms" }],
    columns: (t) => [{ key: "name", label: t("a.f.name"), render: (r) => <b>{r.name}</b> }, { key: "key", label: t("a.f.key") }, { key: "permissions", label: t("a.f.permissions"), render: (r) => ((r.permissions ?? []).includes("*") ? t("a.all_permissions") : (r.permissions ?? []).length) }, boolCol("is_system", t("a.f.system"), t)],
  }),
};
