import { useEffect, useState } from "react";
import { sar } from "../../shared/constants";
import { barcodeSvg } from "../../shared/barcode";
import { api } from "../../web/lib/api";
import { useApp } from "../../web/lib/ctx";
import { Badge, Button, Empty, Field, Input, Link, Modal, Pagination, Select, Textarea } from "../../web/ui/kit";
import { DataTable, ExportButtons, MoneyInput, PageHead, ScanInput, SearchInput, Stat, useAction, useAdmin, useFetch, useQueryState, nm } from "../core";

const MOVE_TONE: Record<string, string> = { stock_in: "ok", return: "ok", cancellation: "ok", stock_out: "danger", sale: "info", adjustment: "warn" };

export function InventoryPage() {
  const app = useApp();
  const { t, date, money } = app;
  const admin = useAdmin();
  const qs = useQueryState();
  const page = Number(qs.get("page")) || 1;
  const params = new URLSearchParams();
  for (const k of ["q", "low", "out"]) if (qs.get(k)) params.set(k, qs.get(k));
  const list = useFetch<any>(`/api/admin/inventory?page=${page}&${params}`);
  const [move, setMove] = useState<any | null>(null);
  const [form, setForm] = useState<{ type: string; quantity: string; unit_cost: number | null; note: string }>({ type: "stock_in", quantity: "", unit_cost: null, note: "" });
  const act = useAction();
  const canManage = admin.can("inventory.manage");

  const open = (p: any) => { setForm({ type: "stock_in", quantity: "", unit_cost: p.purchase_price ?? null, note: "" }); setMove(p); };
  const scan = async (code: string) => {
    try {
      const { product } = await api<any>(`/api/admin/products/lookup?code=${encodeURIComponent(code)}`);
      if (canManage) open({ ...product, quantity: product.stock }); else qs.set({ q: product.sku });
    } catch (e) { app.toast(app.errorText(e), "err"); }
  };
  const submit = async () => {
    const ok = await act.run("move", () => api("/api/admin/inventory/move", { body: { product_id: move.id, type: form.type, quantity: Number(form.quantity), unit_cost: form.type === "stock_in" ? form.unit_cost : null, note: form.note || null } }), t("a.stock_updated"));
    if (ok) { setMove(null); await list.reload(); }
  };
  const s = list.data?.summary;
  const q = Number(form.quantity);
  const after = move ? (form.type === "adjustment" ? q : form.type === "stock_in" ? move.quantity + q : move.quantity - q) : 0;

  return (
    <>
      <PageHead title={t("a.nav.inventory")} sub={t("a.inventory_sub")}>
        <Link to="/inventory/history" className="btn btn-outline btn-sm">{t("a.stock_history")}</Link>
        <ExportButtons url={`/api/admin/inventory?${params}`} />
      </PageHead>
      {s && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t("a.inv_products")} value={s.products} hint={t("a.inv_units", { n: s.units })} />
          <Stat label={t("a.inv_value")} value={money(s.cost_value)} />
          <Stat label={t("a.kpi_low")} value={s.low} tone={s.low ? "danger" : undefined} />
          <Stat label={t("a.inv_out")} value={s.out_of_stock} tone={s.out_of_stock ? "danger" : undefined} />
        </div>
      )}
      <div className="no-print card mb-3 space-y-3 p-3">
        <ScanInput onCode={scan} placeholder={t("a.inv_scan_ph")} />
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={qs.get("q")} onChange={(v) => qs.set({ q: v })} placeholder={t("a.products_search")} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="check" checked={qs.get("low") === "1"} onChange={(e) => qs.set({ low: e.target.checked ? "1" : null })} />{t("a.low_only")}</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="check" checked={qs.get("out") === "1"} onChange={(e) => qs.set({ out: e.target.checked ? "1" : null })} />{t("a.out_only")}</label>
        </div>
      </div>
      <DataTable rows={list.data?.rows} loading={list.loading} columns={[
        { key: "name", label: t("a.f.product"), render: (p) => <><Link to={`/products/${p.id}`} className="font-medium hover:text-accent">{nm(p)}</Link><span className="block text-xs text-muted" dir="ltr" style={{ textAlign: "start" }}>{p.sku}{p.barcode ? ` / ${p.barcode}` : ""}</span></> },
        { key: "quantity", label: t("a.f.stock"), className: "text-end tabular-nums", render: (p) => <span className={`text-base font-bold ${p.quantity === 0 ? "text-danger" : p.quantity <= p.min_stock ? "text-warn" : ""}`}>{p.quantity}</span> },
        { key: "min_stock", label: t("a.f.min_stock"), className: "text-end tabular-nums" },
        { key: "state", label: t("a.f.status"), render: (p) => (p.quantity === 0 ? <Badge tone="danger">{t("a.st_out")}</Badge> : p.quantity <= p.min_stock ? <Badge tone="warn">{t("a.st_low")}</Badge> : <Badge tone="ok">{t("a.st_ok")}</Badge>) },
        { key: "location", label: t("a.f.location") },
        { key: "value", label: t("a.f.stock_value"), className: "text-end tabular-nums", render: (p) => sar(p.purchase_price * p.quantity) },
        { key: "updated_at", label: t("a.f.updated"), render: (p) => (p.updated_at ? date(p.updated_at) : "—") },
        ...(canManage ? [{ key: "_", label: "", className: "w-px", render: (p: any) => <Button size="sm" variant="outline" icon="swap" onClick={() => open(p)}>{t("a.move_stock")}</Button> }] : []),
      ]} />
      <Pagination page={page} pages={list.data?.pages ?? 1} onPage={(p) => qs.set({ page: String(p) }, true)} />

      <Modal open={!!move} onClose={() => setMove(null)} title={t("a.move_stock")}>
        {move && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <div className="rounded-md bg-surface-2 p-3"><p className="font-semibold">{nm(move)}</p><p className="text-sm text-muted"><span dir="ltr">{move.sku}</span> — {t("a.current_stock", { n: move.quantity })}</p></div>
            <div className="grid grid-cols-3 gap-2" role="radiogroup">
              {["stock_in", "stock_out", "adjustment"].map((ty) => (
                <button type="button" key={ty} role="radio" aria-checked={form.type === ty} onClick={() => setForm({ ...form, type: ty })} className={`rounded-md border px-2 py-2.5 text-sm font-semibold ${form.type === ty ? "border-accent bg-accent-soft text-accent" : "border-line hover:border-fg"}`}>{t(`a.mv.${ty}`)}</button>
              ))}
            </div>
            <Field label={form.type === "adjustment" ? t("a.counted_qty") : t("p.qty")} required hint={form.quantity !== "" && Number.isFinite(after) ? t("a.stock_after", { n: after }) : undefined}>
              <Input inputMode="numeric" dir="ltr" className="text-start text-lg tabular-nums" autoFocus value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value.replace(/\D/g, "") })} />
            </Field>
            {form.type === "stock_in" && <Field label={t("a.f.unit_cost")} hint={t("a.unit_cost_hint")}><MoneyInput value={form.unit_cost} onChange={(h) => setForm({ ...form, unit_cost: h })} /></Field>}
            <Field label={t("a.f.note")} hint={t("a.mv_note_hint")}><Textarea rows={2} value={form.note} maxLength={300} onChange={(e) => setForm({ ...form, note: e.target.value })} /></Field>
            <div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => setMove(null)}>{t("c.cancel")}</Button><Button type="submit" busy={act.busy === "move"} disabled={form.quantity === "" || after < 0 || (form.type !== "adjustment" && q <= 0)}>{t("a.confirm")}</Button></div>
          </form>
        )}
      </Modal>
    </>
  );
}

export function InventoryHistory() {
  const { t, date } = useApp();
  const qs = useQueryState();
  const page = Number(qs.get("page")) || 1;
  const params = new URLSearchParams();
  for (const k of ["type", "product_id"]) if (qs.get(k)) params.set(k, qs.get(k));
  const list = useFetch<any>(`/api/admin/inventory/transactions?page=${page}&${params}`);
  return (
    <>
      <PageHead title={<><Link to="/inventory" className="text-muted hover:text-fg">{t("a.nav.inventory")}</Link> <span className="text-muted">/</span> {t("a.stock_history")}</>}>
        <Select className="h-10 w-auto" value={qs.get("type")} onChange={(e) => qs.set({ type: e.target.value })} aria-label={t("a.f.type")}>
          <option value="">{t("a.all_moves")}</option>{["stock_in", "stock_out", "adjustment", "sale", "return", "cancellation"].map((x) => <option key={x} value={x}>{t(`a.mv.${x}`)}</option>)}
        </Select>
        {qs.get("product_id") && <Button variant="ghost" size="sm" icon="x" onClick={() => qs.set({ product_id: null })}>{t("a.all_products")}</Button>}
        <ExportButtons url={`/api/admin/inventory/transactions?${params}`} />
      </PageHead>
      <DataTable rows={list.data?.rows} loading={list.loading} columns={[
        { key: "created_at", label: t("a.f.date"), render: (x) => date(x.created_at, true) },
        { key: "product", label: t("a.f.product"), render: (x) => <><button type="button" className="text-start font-medium hover:text-accent" onClick={() => qs.set({ product_id: String(x.product_id) })}>{nm(x)}</button><span className="block text-xs text-muted" dir="ltr" style={{ textAlign: "start" }}>{x.sku}</span></> },
        { key: "type", label: t("a.f.type"), render: (x) => <Badge tone={MOVE_TONE[x.type] ?? "muted"}>{t(`a.mv.${x.type}`)}</Badge> },
        { key: "quantity", label: t("a.f.change"), className: "text-end tabular-nums", render: (x) => <b dir="ltr" className={x.quantity < 0 ? "text-danger" : "text-ok"}>{x.quantity > 0 ? "+" : ""}{x.quantity}</b> },
        { key: "balance_after", label: t("a.f.balance"), className: "text-end tabular-nums" },
        { key: "ref", label: t("a.f.reference"), render: (x) => <span dir="ltr">{[x.reference_type, x.reference_id].filter(Boolean).join(" ") || "—"}</span> },
        { key: "note", label: t("a.f.note") },
        { key: "user_name", label: t("a.f.user"), render: (x) => x.user_name || x.user_email || "—" },
      ]} />
      <Pagination page={page} pages={list.data?.pages ?? 1} onPage={(p) => qs.set({ page: String(p) }, true)} />
    </>
  );
}

interface LabelItem { id: number; sku: string; barcode: string | null; name_ar: string; name_en: string; price: number; copies: number }

/** Shelf / product labels with a scannable barcode (EAN-13 when the code is one, otherwise Code 128). */
export function LabelsPage() {
  const app = useApp();
  const { t } = app;
  const [items, setItems] = useState<LabelItem[]>([]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<any[]>([]);
  const [size, setSize] = useState<"s" | "m" | "l">("m");
  const [showPrice, setShowPrice] = useState(true);

  const add = (p: any) => setItems((xs) => (xs.some((x) => x.id === p.id) ? xs.map((x) => (x.id === p.id ? { ...x, copies: x.copies + 1 } : x)) : [...xs, { id: p.id, sku: p.sku, barcode: p.barcode, name_ar: p.name_ar, name_en: p.name_en, price: p.effective_price, copies: 1 }]));
  const scan = async (code: string) => { try { add((await api<any>(`/api/admin/products/lookup?code=${encodeURIComponent(code)}`)).product); } catch (e) { app.toast(app.errorText(e), "err"); } };
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    let live = true;
    api<any>(`/api/admin/products?per=8&q=${encodeURIComponent(q)}`).then((r) => { if (live) setHits(r.rows); }).catch(() => {});
    return () => { live = false; };
  }, [q]);
  const dims = { s: "w-[38mm] h-[25mm]", m: "w-[50mm] h-[30mm]", l: "w-[70mm] h-[40mm]" }[size];
  const total = items.reduce((s, x) => s + x.copies, 0);

  return (
    <>
      <div className="no-print">
        <PageHead title={t("a.nav.labels")} sub={t("a.labels_sub")}>
          <Select dir="ltr" className="h-10 w-auto" value={size} onChange={(e) => setSize(e.target.value as "s" | "m" | "l")} aria-label={t("a.label_size")}><option value="s">38 × 25 mm</option><option value="m">50 × 30 mm</option><option value="l">70 × 40 mm</option></Select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="check" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} />{t("a.label_price")}</label>
          <Button icon="print" disabled={!total} onClick={() => window.print()}>{t("a.print_n_labels", { n: total })}</Button>
        </PageHead>
        <div className="card mb-4 space-y-3 p-3">
          <ScanInput onCode={scan} />
          <div className="relative">
            <SearchInput value={q} onChange={setQ} placeholder={t("a.products_search")} />
            {hits.length > 0 && (
              <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-md border border-line bg-surface shadow-lg sm:w-[28rem]">
                {hits.map((p) => <li key={p.id}><button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2 text-start hover:bg-surface-2" onClick={() => { add(p); setQ(""); setHits([]); }}><span className="font-medium">{nm(p)}</span><span className="text-xs text-muted" dir="ltr">{p.sku}</span></button></li>)}
              </ul>
            )}
          </div>
        </div>
        {items.length > 0 && (
          <div className="card mb-4 overflow-x-auto">
            <table className="table-x">
              <thead><tr><th>{t("a.f.product")}</th><th>{t("p.barcode")}</th><th>{t("a.label_copies")}</th><th /></tr></thead>
              <tbody>
                {items.map((x) => (
                  <tr key={x.id}>
                    <td>{nm(x)}<span className="block text-xs text-muted" dir="ltr" style={{ textAlign: "start" }}>{x.sku}</span></td>
                    <td dir="ltr" className="tabular-nums">{x.barcode || <span className="text-muted">{x.sku}</span>}</td>
                    <td><Input inputMode="numeric" dir="ltr" className="h-9 w-20 text-start tabular-nums" value={x.copies} onChange={(e) => setItems((xs) => xs.map((y) => (y.id === x.id ? { ...y, copies: Math.min(500, Number(e.target.value.replace(/\D/g, "")) || 0) } : y)))} /></td>
                    <td className="w-px"><Button variant="ghost" size="sm" icon="trash" aria-label={t("c.remove")} onClick={() => setItems((xs) => xs.filter((y) => y.id !== x.id))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!items.length && <div className="card"><Empty icon="barcode" title={t("a.labels_empty")} text={t("a.labels_empty_text")} /></div>}
      </div>
      <div className="flex flex-wrap gap-[2mm]" dir="ltr">
        {items.flatMap((x) => Array.from({ length: x.copies }, (_, i) => (
          <div key={`${x.id}-${i}`} className={`${dims} flex break-inside-avoid flex-col items-center justify-between overflow-hidden border border-dashed border-[#999] bg-white p-[1.5mm] text-center text-black print:border-0`}>
            <p className="line-clamp-2 w-full text-[8pt] leading-tight font-semibold" dir="rtl">{x.name_ar}</p>
            <div className="w-full flex-1 [&>svg]:mx-auto [&>svg]:h-full [&>svg]:max-w-full" dangerouslySetInnerHTML={{ __html: barcodeSvg(x.barcode || x.sku, { height: 44, module: 2 }).replace(/width="\d+" height="\d+"/, 'preserveAspectRatio="none" width="100%" height="100%"') }} />
            <p className="flex w-full items-baseline justify-between gap-1 text-[7pt] leading-none tabular-nums"><span>{x.barcode || x.sku}</span>{showPrice && <b className="text-[9pt]">{sar(x.price)} SAR</b>}</p>
          </div>
        )))}
      </div>
    </>
  );
}
