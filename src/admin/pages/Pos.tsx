import { useEffect, useState } from "react";
import { sar } from "../../shared/constants";
import { computeTotals } from "../../shared/pricing";
import { api } from "../../web/lib/api";
import { useApp } from "../../web/lib/ctx";
import { Icon } from "../../web/ui/Icon";
import { Button, Empty, Field, Input, Qty, Select } from "../../web/ui/kit";
import { PageHead, ScanInput, SearchInput, useAction, nm } from "../core";

interface Line { id: number; sku: string; name: string; price: number; vat_bp: number; stock: number; qty: number }

/** Counter sales: scan or search products, take cash or card, issue the tax invoice and deduct stock in one step. */
export default function Pos() {
  const app = useApp();
  const { t, money } = app;
  const [lines, setLines] = useState<Line[]>([]);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<any[]>([]);
  const [cust, setCust] = useState({ name: "", phone: "", vat: "" });
  const [method, setMethod] = useState<"cash" | "card">("cash");
  const [coupon, setCoupon] = useState("");
  const [done, setDone] = useState<{ number: string; invoice_number: string; total: number } | null>(null);
  const act = useAction();

  const add = (p: any) => {
    if (p.status === "archived") { app.toast(t("err.product_not_found"), "err"); return; }
    if (p.stock <= 0) { app.toast(t("err.out_of_stock"), "err"); return; }
    setLines((ls) => {
      const cur = ls.find((l) => l.id === p.id);
      if (cur) return ls.map((l) => (l.id === p.id ? { ...l, qty: Math.min(l.stock, l.qty + 1) } : l));
      return [...ls, { id: p.id, sku: p.sku, name: nm(p), price: p.effective_price, vat_bp: p.vat_rate_bp ?? 1500, stock: p.stock, qty: 1 }];
    });
  };
  const scan = async (code: string) => {
    try { add((await api<any>(`/api/admin/products/lookup?code=${encodeURIComponent(code)}`)).product); }
    catch (e) { app.toast(app.errorText(e), "err"); }
  };
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    let live = true;
    api<any>(`/api/admin/products?per=8&status=active&q=${encodeURIComponent(q)}`).then((r) => { if (live) setHits(r.rows); }).catch(() => {});
    return () => { live = false; };
  }, [q]);

  const totals = computeTotals({ lines: lines.map((l) => ({ key: l.id, unitPrice: l.price, quantity: l.qty, vatBp: l.vat_bp })) });
  const submit = async () => {
    let res: any;
    const ok = await act.run("sale", async () => {
      res = await api("/api/admin/pos/sale", { body: { items: lines.map((l) => ({ product_id: l.id, quantity: l.qty })), customer_name: cust.name || null, customer_phone: cust.phone || null, vat_number: cust.vat || null, payment_method: method, coupon_code: coupon || null } });
    });
    if (ok) { setDone(res); setLines([]); setCust({ name: "", phone: "", vat: "" }); setCoupon(""); }
  };

  if (done) {
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <span className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-ok text-white"><Icon name="check" size={32} /></span>
        <h1 className="text-2xl font-bold">{t("a.pos_done")}</h1>
        <p className="mt-2 text-muted">{t("a.pos_done_text", { number: done.number, total: sar(done.total) })}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a className="btn btn-primary btn-md" href={`/${app.lang}/invoice/${done.invoice_number}`} target="_blank" rel="noopener"><Icon name="print" size={18} />{t("a.print_invoice")}</a>
          <Button variant="outline" onClick={() => setDone(null)}>{t("a.pos_new")}</Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHead title={t("a.nav.pos")} sub={t("a.pos_sub")} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="card space-y-3 p-4">
            <ScanInput onCode={scan} autoFocus />
            <div className="relative">
              <SearchInput value={q} onChange={setQ} placeholder={t("a.pos_search")} />
              {hits.length > 0 && (
                <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-md border border-line bg-surface shadow-lg sm:w-[28rem]">
                  {hits.map((p) => (
                    <li key={p.id}><button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2 text-start hover:bg-surface-2" onClick={() => { add(p); setQ(""); setHits([]); }}>
                      <span><span className="font-medium">{nm(p)}</span><span className="block text-xs text-muted" dir="ltr" style={{ textAlign: "start" }}>{p.sku} — {t("a.in_stock_n", { n: p.stock })}</span></span>
                      <span className="shrink-0 font-semibold tabular-nums">{sar(p.effective_price)}</span>
                    </button></li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          {lines.length ? (
            <div className="card overflow-x-auto">
              <table className="table-x">
                <thead><tr><th>{t("a.f.product")}</th><th className="text-end">{t("a.f.unit_price")}</th><th>{t("p.qty")}</th><th className="text-end">{t("tot.total")}</th><th /></tr></thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id}>
                      <td><span className="font-medium">{l.name}</span><span className="block text-xs text-muted" dir="ltr" style={{ textAlign: "start" }}>{l.sku}</span></td>
                      <td className="text-end tabular-nums">{sar(l.price)}</td>
                      <td><Qty small value={l.qty} max={l.stock} onChange={(n) => setLines((ls) => ls.map((x) => (x.id === l.id ? { ...x, qty: n } : x)))} /></td>
                      <td className="text-end font-semibold tabular-nums">{sar(l.price * l.qty)}</td>
                      <td className="w-px"><Button variant="ghost" size="sm" icon="trash" aria-label={t("c.remove")} onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="card"><Empty icon="barcode" title={t("a.pos_empty")} text={t("a.pos_empty_text")} /></div>}
        </div>

        <aside className="card h-fit space-y-4 p-4">
          <h2 className="font-bold">{t("a.pos_customer")}</h2>
          <Field label={t("f.name")} hint={t("c.optional")}><Input value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} /></Field>
          <Field label={t("f.phone")} hint={t("c.optional")}><Input dir="ltr" className="text-start" value={cust.phone} onChange={(e) => setCust({ ...cust, phone: e.target.value })} /></Field>
          <Field label={t("f.vat_number")} hint={t("a.pos_vat_hint")}><Input dir="ltr" className="text-start tabular-nums" maxLength={15} value={cust.vat} onChange={(e) => setCust({ ...cust, vat: e.target.value.replace(/\D/g, "") })} /></Field>
          <Field label={t("coupon.placeholder")} hint={t("c.optional")}><Input dir="ltr" className="text-start uppercase" value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} /></Field>
          <Field label={t("inv.payment_method")}><Select value={method} onChange={(e) => setMethod(e.target.value as "cash" | "card")}><option value="cash">{t("paym.cash")}</option><option value="card">{t("paym.card")}</option></Select></Field>
          <dl className="space-y-1.5 border-t border-line pt-3 text-sm">
            <div className="flex justify-between text-muted"><dt>{t("inv.total_excl")}</dt><dd className="tabular-nums">{sar(totals.totalExclVat)}</dd></div>
            <div className="flex justify-between text-muted"><dt>{t("inv.vat_total")}</dt><dd className="tabular-nums">{sar(totals.vatTotal)}</dd></div>
            <div className="flex justify-between text-lg font-bold"><dt>{t("tot.total")}</dt><dd className="tabular-nums">{money(totals.total)}</dd></div>
          </dl>
          <Button size="lg" className="w-full" icon="check" busy={act.busy === "sale"} disabled={!lines.length} onClick={submit}>{t("a.pos_complete")}</Button>
        </aside>
      </div>
    </>
  );
}
