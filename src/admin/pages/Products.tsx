import { useEffect, useState, type ReactNode } from "react";
import { sar } from "../../shared/constants";
import { api, ApiError } from "../../web/lib/api";
import { useApp } from "../../web/lib/ctx";
import { Icon } from "../../web/ui/Icon";
import { Badge, Button, Field, Input, Link, Pagination, Select, StatusBadge } from "../../web/ui/kit";
import { Confirm, DataTable, ExportButtons, MoneyInput, PageHead, SearchInput, useAction, useAdmin, useFetch, useQueryState, nm } from "../core";
import { I18nInputs, useOptions } from "../resource";

export function ProductsList() {
  const app = useApp();
  const { t } = app;
  const admin = useAdmin();
  const qs = useQueryState();
  const page = Number(qs.get("page")) || 1;
  const opts = useOptions(["categories", "brands"]);
  const params = new URLSearchParams();
  for (const k of ["q", "status", "category_id", "brand_id", "low"]) if (qs.get(k)) params.set(k, qs.get(k));
  const list = useFetch<any>(`/api/admin/products?page=${page}&${params}`);
  return (
    <>
      <PageHead title={t("a.nav.products")} sub={list.data ? t("a.n_results", { n: list.data.total }) : undefined}>
        <ExportButtons url={`/api/admin/products?${params}`} />
        {admin.can("products.manage") && <Button icon="plus" size="sm" onClick={() => admin.go("/admin/products/new")}>{t("a.add_product")}</Button>}
      </PageHead>
      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={qs.get("q")} onChange={(v) => qs.set({ q: v })} placeholder={t("a.products_search")} />
        <Select className="h-10 w-auto" value={qs.get("status")} onChange={(e) => qs.set({ status: e.target.value })} aria-label={t("a.f.status")}><option value="">{t("a.f.status")}</option>{["active", "draft", "archived"].map((s) => <option key={s} value={s}>{t(`a.ps.${s}`)}</option>)}</Select>
        <Select className="h-10 w-auto max-w-52" value={qs.get("category_id")} onChange={(e) => qs.set({ category_id: e.target.value })} aria-label={t("a.f.category")}><option value="">{t("a.f.category")}</option>{(opts.categories ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
        <Select className="h-10 w-auto max-w-52" value={qs.get("brand_id")} onChange={(e) => qs.set({ brand_id: e.target.value })} aria-label={t("a.f.brand")}><option value="">{t("a.f.brand")}</option>{(opts.brands ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="check" checked={qs.get("low") === "1"} onChange={(e) => qs.set({ low: e.target.checked ? "1" : null })} />{t("a.low_only")}</label>
      </div>
      <DataTable rows={list.data?.rows} loading={list.loading} onRow={(p) => admin.go(`/admin/products/${p.id}`)} columns={[
        { key: "image", label: "", className: "w-px", render: (p) => <span className="grid size-11 place-items-center overflow-hidden rounded border border-line bg-white text-muted">{p.image ? <img src={p.image} alt="" className="size-full object-contain" /> : <Icon name="image" size={18} />}</span> },
        { key: "name", label: t("a.f.product"), render: (p) => <><span className="font-medium">{nm(p)}</span><span className="block text-xs text-muted" dir="ltr" style={{ textAlign: "start" }}>{p.sku}{p.barcode ? ` / ${p.barcode}` : ""}</span></> },
        { key: "category", label: t("a.f.category"), render: (p) => <>{p.category ?? "—"}<span className="block text-xs text-muted">{p.brand}</span></> },
        { key: "price", label: t("a.f.price"), className: "text-end tabular-nums", render: (p) => <>{sar(p.effective_price)}{p.effective_price < p.price && <s className="block text-xs text-muted">{sar(p.price)}</s>}</> },
        { key: "stock", label: t("a.f.stock"), className: "text-end tabular-nums", render: (p) => <span className={p.stock === 0 ? "font-bold text-danger" : p.stock <= p.min_stock ? "font-bold text-warn" : ""}>{p.stock}</span> },
        { key: "sold_count", label: t("a.f.sold"), className: "text-end tabular-nums" },
        { key: "status", label: t("a.f.status"), render: (p) => <span className="flex flex-wrap gap-1"><StatusBadge status={p.status} prefix="a.ps" />{p.is_featured && <Badge tone="info">{t("a.f.featured")}</Badge>}</span> },
      ]} />
      <Pagination page={page} pages={list.data?.pages ?? 1} onPage={(p) => qs.set({ page: String(p) }, true)} />
    </>
  );
}

const BLANK = {
  sku: "", barcode: "", slug: "", name_ar: "", name_en: "", name_ur: "", description_ar: "", description_en: "", description_ur: "", brand_id: "", category_id: "",
  purchase_price: 0 as number | null, price: null as number | null, discount_price: null as number | null, vat_rate_bp: 1500, weight_g: "", length_mm: "", width_mm: "", height_mm: "", warranty_months: 0,
  specs: [] as { label_ar: string; label_en: string; label_ur: string; value: string }[], video_url: "", is_featured: false, is_new: false, is_best_seller: false, status: "active",
  seo_title_ar: "", seo_title_en: "", seo_title_ur: "", seo_description_ar: "", seo_description_en: "", seo_description_ur: "", keywords: "", min_stock: 5, location: "", initial_stock: "" as string | number,
};

// Declared at module level: a component created inside ProductForm would be a new type on every render and remount the inputs (losing focus while typing).
function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return <section className="card p-4 md:p-5"><h2 className="font-bold">{title}</h2>{hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}<div className="mt-4">{children}</div></section>;
}

export function ProductForm({ params }: { params: string[] }) {
  const app = useApp();
  const { t } = app;
  const admin = useAdmin();
  const isNew = params[0] === "new";
  const id = isNew ? null : Number(params[0]);
  const opts = useOptions(["categories", "brands"]);
  const [v, setV] = useState<typeof BLANK>({ ...BLANK });
  const [images, setImages] = useState<any[]>([]);
  const [stock, setStock] = useState(0);
  const [loaded, setLoaded] = useState(isNew);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [del, setDel] = useState(false);
  const act = useAction();
  const canWrite = admin.can("products.manage");

  useEffect(() => {
    if (isNew) return;
    api<{ row: any }>(`/api/admin/products/${id}`).then(({ row }) => {
      const next: any = { ...BLANK };
      for (const k of Object.keys(BLANK)) if (row[k] !== undefined && row[k] !== null) next[k] = row[k];
      next.specs = (row.specs ?? []).map((s: any) => ({ label_ar: s.label_ar ?? "", label_en: s.label_en ?? "", label_ur: s.label_ur ?? "", value: s.value ?? "" }));
      setV(next); setImages(row.images ?? []); setStock(row.stock ?? 0); setLoaded(true);
    }).catch((e) => app.toast(app.errorText(e), "err"));
  }, [id]);

  const set = (k: string, val: any) => { setV((x) => ({ ...x, [k]: val })); setErrors((e) => (e[k] ? { ...e, [k]: "" } : e)); };
  const num = (x: any) => (x === "" || x === null || x === undefined ? null : Number(x));
  const save = async () => {
    setSaving(true); setErrors({});
    try {
      const { initial_stock, ...rest } = v;
      const body: any = { ...rest, brand_id: num(v.brand_id), category_id: num(v.category_id), weight_g: num(v.weight_g), length_mm: num(v.length_mm), width_mm: num(v.width_mm), height_mm: num(v.height_mm), specs: v.specs.filter((s) => s.label_ar.trim() && s.value.trim()), slug: v.slug || undefined };
      if (isNew && initial_stock !== "") body.initial_stock = Number(initial_stock);
      const r = await api<{ row: any }>(isNew ? "/api/admin/products" : `/api/admin/products/${id}`, { method: isNew ? "POST" : "PUT", body });
      app.toast(t("a.saved"));
      if (isNew) admin.go(`/admin/products/${r.row.id}`, true);
    } catch (e) {
      if (e instanceof ApiError) setErrors(e.fields);
      app.toast(app.errorText(e), "err");
    } finally { setSaving(false); }
  };
  const upload = async (files: FileList | null) => {
    if (!files?.length || !id) return;
    setUploading(true);
    try {
      const form = new FormData();
      for (const f of Array.from(files)) form.append("files", f);
      const r = await api<{ images: any[] }>(`/api/admin/products/${id}/images`, { form });
      setImages((im) => [...im, ...r.images]);
    } catch (e) { app.toast(app.errorText(e), "err"); } finally { setUploading(false); }
  };
  const moveImage = async (i: number, d: number) => {
    const next = [...images]; const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setImages(next);
    await api(`/api/admin/products/${id}/images/order`, { method: "PUT", body: { ids: next.map((x) => x.id) } }).catch((e) => app.toast(app.errorText(e), "err"));
  };
  const removeImage = async (imageId: number) => { if (await act.run("img", () => api(`/api/admin/products/${id}/images/${imageId}`, { method: "DELETE" }))) setImages((im) => im.filter((x) => x.id !== imageId)); };
  const uploadVideo = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try { const form = new FormData(); form.append("file", file); const r = await api<{ url: string }>("/api/admin/uploads?kind=video", { form }); set("video_url", r.url); }
    catch (e) { app.toast(app.errorText(e), "err"); } finally { setUploading(false); }
  };
  const remove = async () => {
    let res: any;
    if (await act.run("del", async () => { res = await api(`/api/admin/products/${id}`, { method: "DELETE" }); })) { app.toast(t(res?.archived ? "a.archived_instead" : "a.deleted")); admin.go("/admin/products"); }
  };

  if (!loaded) return <p className="text-muted">{t("c.loading")}</p>;
  const E = (k: string) => errors[k] || null;

  return (
    <form onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
      <PageHead title={<><Link to="/products" className="text-muted hover:text-fg">{t("a.nav.products")}</Link> <span className="text-muted">/</span> {isNew ? t("a.add_product") : nm(v)}</>}>
        {!isNew && v.slug && <a className="btn btn-outline btn-sm" href={`/${app.lang}/p/${v.slug}`} target="_blank" rel="noopener"><Icon name="eye" size={16} />{t("a.view_in_store")}</a>}
        {!isNew && canWrite && <Button variant="danger" size="sm" icon="trash" onClick={() => setDel(true)}>{t("c.delete")}</Button>}
        {canWrite && <Button type="submit" size="sm" icon="check" busy={saving}>{t("c.save")}</Button>}
      </PageHead>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          {Section({ title: t("a.sec_basic"), children: (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("a.f.name")} required error={E("name_ar")} className="sm:col-span-2"><I18nInputs base="name" values={v} onChange={set} errors={errors} /></Field>
              <Field label={t("p.sku")} required error={E("sku")}><Input dir="ltr" className="text-start" value={v.sku} onChange={(e) => set("sku", e.target.value)} invalid={!!E("sku")} /></Field>
              <Field label={t("p.barcode")} error={E("barcode")} hint={t("a.f.barcode_hint")}><Input dir="ltr" className="text-start tabular-nums" value={v.barcode ?? ""} onChange={(e) => set("barcode", e.target.value)} invalid={!!E("barcode")} /></Field>
              <Field label={t("a.f.category")} error={E("category_id")}><Select value={v.category_id ?? ""} onChange={(e) => set("category_id", e.target.value)}><option value="">{t("a.choose")}</option>{(opts.categories ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
              <Field label={t("a.f.brand")} error={E("brand_id")}><Select value={v.brand_id ?? ""} onChange={(e) => set("brand_id", e.target.value)}><option value="">{t("a.none")}</option>{(opts.brands ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
              <Field label={t("p.description")} className="sm:col-span-2"><I18nInputs base="description" values={v} onChange={set} errors={errors} area rows={4} /></Field>
            </div>
          ) })}

          {Section({ title: t("a.sec_pricing"), hint: t("a.sec_pricing_hint"), children: (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t("a.f.selling_price")} required error={E("price")}><MoneyInput value={v.price} onChange={(h) => set("price", h)} invalid={!!E("price")} /></Field>
              <Field label={t("a.f.discount_price")} error={E("discount_price")} hint={t("c.optional")}><MoneyInput value={v.discount_price} onChange={(h) => set("discount_price", h)} invalid={!!E("discount_price")} /></Field>
              <Field label={t("a.f.purchase_price")} error={E("purchase_price")}><MoneyInput value={v.purchase_price} onChange={(h) => set("purchase_price", h ?? 0)} /></Field>
              <Field label={t("a.f.vat_rate")} error={E("vat_rate_bp")}><Select value={String(v.vat_rate_bp)} onChange={(e) => set("vat_rate_bp", Number(e.target.value))}><option value="1500">15%</option><option value="0">0%</option></Select></Field>
            </div>
          ) })}

          {Section({ title: t("p.specs"), hint: t("a.specs_hint"), children: (
            <div className="space-y-2">
              {v.specs.map((s, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 rounded-md border border-line p-2 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                  <Input placeholder={`${t("a.f.spec_label")} — العربية`} dir="rtl" value={s.label_ar} onChange={(e) => set("specs", v.specs.map((x, j) => (j === i ? { ...x, label_ar: e.target.value } : x)))} />
                  <Input placeholder="English" dir="ltr" value={s.label_en} onChange={(e) => set("specs", v.specs.map((x, j) => (j === i ? { ...x, label_en: e.target.value } : x)))} />
                  <Input placeholder="اردو" dir="rtl" value={s.label_ur} onChange={(e) => set("specs", v.specs.map((x, j) => (j === i ? { ...x, label_ur: e.target.value } : x)))} />
                  <Input placeholder={t("a.f.spec_value")} dir="ltr" className="text-start" value={s.value} onChange={(e) => set("specs", v.specs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                  <Button variant="ghost" size="sm" icon="trash" className="h-11" aria-label={t("c.remove")} onClick={() => set("specs", v.specs.filter((_, j) => j !== i))} />
                </div>
              ))}
              <Button variant="outline" size="sm" icon="plus" onClick={() => set("specs", [...v.specs, { label_ar: "", label_en: "", label_ur: "", value: "" }])}>{t("a.add_spec")}</Button>
            </div>
          ) })}

          {Section({ title: t("a.sec_media"), hint: isNew ? t("a.media_after_save") : t("a.media_hint"), children: isNew ? null : (
            <div className="space-y-4">
              <ul className="flex flex-wrap gap-3">
                {images.map((im, i) => (
                  <li key={im.id} className="w-28">
                    <span className="block size-28 overflow-hidden rounded-md border border-line bg-white"><img src={im.thumb_url ?? im.url} alt="" className="size-full object-contain" /></span>
                    <span className="mt-1 flex justify-between">
                      <Button variant="ghost" size="sm" className="px-1.5" disabled={i === 0} onClick={() => moveImage(i, -1)} aria-label={t("a.move_first")}><Icon name="chev" size={14} className="rotate-180" /></Button>
                      <Button variant="ghost" size="sm" className="px-1.5" disabled={i === images.length - 1} onClick={() => moveImage(i, 1)} aria-label={t("a.move_last")}><Icon name="chev" size={14} /></Button>
                      <Button variant="ghost" size="sm" className="px-1.5 text-danger" onClick={() => removeImage(im.id)} aria-label={t("c.delete")}><Icon name="trash" size={14} /></Button>
                    </span>
                    {i === 0 && <span className="badge badge-info mt-1">{t("a.main_image")}</span>}
                  </li>
                ))}
                <li>
                  <label className={`grid size-28 cursor-pointer place-items-center rounded-md border-2 border-dashed border-line text-center text-sm text-muted hover:border-fg hover:text-fg ${uploading ? "opacity-60" : ""}`}>
                    <span><Icon name="upload" className="mx-auto mb-1" />{uploading ? t("c.loading") : t("a.upload_images")}</span>
                    <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={uploading} onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
                  </label>
                </li>
              </ul>
              <Field label={t("a.f.video")} hint={t("a.f.video_hint")} error={E("video_url")}>
                <div className="flex gap-2">
                  <Input dir="ltr" className="text-start" placeholder="https://www.youtube.com/watch?v=…" value={v.video_url ?? ""} onChange={(e) => set("video_url", e.target.value)} invalid={!!E("video_url")} />
                  <label className="btn btn-outline btn-md shrink-0 cursor-pointer">{t("a.upload")}<input type="file" accept="video/mp4,video/webm" className="sr-only" disabled={uploading} onChange={(e) => { void uploadVideo(e.target.files?.[0]); e.target.value = ""; }} /></label>
                </div>
              </Field>
            </div>
          ) })}

          {Section({ title: t("a.sec_seo"), hint: t("a.sec_seo_hint"), children: (
            <div className="grid gap-4">
              <Field label={t("a.f.seo_title")}><I18nInputs base="seo_title" values={v} onChange={set} errors={errors} /></Field>
              <Field label={t("a.f.seo_description")}><I18nInputs base="seo_description" values={v} onChange={set} errors={errors} area rows={2} /></Field>
              <Field label={t("a.f.keywords")} hint={t("a.f.keywords_hint")}><Input value={v.keywords} onChange={(e) => set("keywords", e.target.value)} /></Field>
              <Field label={t("a.f.slug")} hint={t("a.f.slug_hint")} error={E("slug")}><Input dir="ltr" className="text-start" value={v.slug ?? ""} onChange={(e) => set("slug", e.target.value)} /></Field>
            </div>
          ) })}
        </div>

        <aside className="space-y-4">
          {Section({ title: t("a.sec_visibility"), children: (
            <div className="space-y-3">
              <Field label={t("a.f.status")}><Select value={v.status} onChange={(e) => set("status", e.target.value)}>{["active", "draft", "archived"].map((s) => <option key={s} value={s}>{t(`a.ps.${s}`)}</option>)}</Select></Field>
              {[["is_featured", "a.f.featured"], ["is_new", "a.f.is_new"], ["is_best_seller", "a.f.best_seller"]].map(([k, label]) => (
                <label key={k} className="flex items-center gap-2.5"><input type="checkbox" className="check" checked={(v as any)[k!]} onChange={(e) => set(k!, e.target.checked)} />{t(label!)}</label>
              ))}
            </div>
          ) })}
          {Section({ title: t("a.sec_inventory"), children: (
            <div className="space-y-3">
              {isNew
                ? <Field label={t("a.f.initial_stock")} error={E("initial_stock")}><Input inputMode="numeric" dir="ltr" className="text-start tabular-nums" value={v.initial_stock} onChange={(e) => set("initial_stock", e.target.value.replace(/\D/g, ""))} /></Field>
                : <p className="flex items-center justify-between rounded-md bg-surface-2 p-3"><span>{t("a.f.stock")}</span><span className="text-xl font-bold tabular-nums">{stock}</span></p>}
              {!isNew && <Link to={`/inventory?q=${encodeURIComponent(v.sku)}`} className="btn btn-outline btn-sm w-full">{t("a.adjust_stock")}</Link>}
              <Field label={t("a.f.min_stock")} hint={t("a.f.min_stock_hint")}><Input inputMode="numeric" dir="ltr" className="text-start tabular-nums" value={v.min_stock} onChange={(e) => set("min_stock", Number(e.target.value.replace(/\D/g, "")) || 0)} /></Field>
              <Field label={t("a.f.location")} hint={t("a.f.location_hint")}><Input value={v.location ?? ""} onChange={(e) => set("location", e.target.value)} /></Field>
            </div>
          ) })}
          {Section({ title: t("a.sec_shipping"), children: (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("a.f.weight_g")} className="col-span-2"><Input inputMode="numeric" dir="ltr" className="text-start" value={v.weight_g ?? ""} onChange={(e) => set("weight_g", e.target.value.replace(/\D/g, ""))} /></Field>
              {(["length_mm", "width_mm", "height_mm"] as const).map((k) => <Field key={k} label={t(`a.f.${k}`)}><Input inputMode="numeric" dir="ltr" className="text-start" value={v[k] ?? ""} onChange={(e) => set(k, e.target.value.replace(/\D/g, ""))} /></Field>)}
              <Field label={t("a.f.warranty_months")}><Input inputMode="numeric" dir="ltr" className="text-start" value={v.warranty_months} onChange={(e) => set("warranty_months", Number(e.target.value.replace(/\D/g, "")) || 0)} /></Field>
            </div>
          ) })}
        </aside>
      </div>
      <Confirm open={del} danger title={t("a.delete_q")} text={t("a.delete_product_text")} busy={act.busy === "del"} yes={t("c.delete")} onYes={remove} onNo={() => setDel(false)} />
    </form>
  );
}
