import { sar } from "../../shared/constants";
import { useApp } from "../../web/lib/ctx";
import { Badge, Input, Link, Select } from "../../web/ui/kit";
import { DataTable, ExportButtons, PageHead, Stat, useFetch, useQueryState } from "../core";
import { BarChart } from "./Dashboard";
import { payMethodLabel } from "./Orders";

const TABS = ["sales", "products", "profit", "customers", "vat"] as const;

export default function Reports() {
  const { t, money, date } = useApp();
  const qs = useQueryState();
  const tab = (TABS as readonly string[]).includes(qs.get("tab")) ? qs.get("tab") : "sales";
  const range = `${qs.get("from") ? `&from=${qs.get("from")}` : ""}${qs.get("to") ? `&to=${qs.get("to")}` : ""}`;
  const url = `/api/admin/reports/${tab}?x=1${range}${tab === "sales" && qs.get("group") ? `&group=${qs.get("group")}` : ""}`;
  const { data, loading } = useFetch<any>(url);
  const rows = data?.rows as any[] | undefined;

  return (
    <>
      <PageHead title={t("a.nav.reports")} sub={data?.from ? <bdi>{t("a.rep_range", { from: "\u2068" + data.from + "\u2069", to: "\u2068" + data.to + "\u2069" })}</bdi> : t("a.rep_sub")}>
        <ExportButtons url={url} />
      </PageHead>
      <div className="no-print mb-3 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {TABS.map((x) => <button type="button" key={x} role="tab" aria-selected={tab === x} className={`tab ${tab === x ? "tab-on" : ""}`} onClick={() => qs.set({ tab: x })}>{t(`a.rep.${x}`)}</button>)}
        <Link to="/inventory" className="tab">{t("a.rep.inventory")}</Link>
        <Link to="/invoices" className="tab">{t("a.rep.invoices")}</Link>
      </div>
      {tab !== "vat" && (
        <div className="no-print mb-4 flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-muted">{t("f.from")}<Input type="date" dir="ltr" className="h-10 w-40" value={qs.get("from")} onChange={(e) => qs.set({ from: e.target.value })} /></label>
          <label className="flex items-center gap-1.5 text-sm text-muted">{t("f.to")}<Input type="date" dir="ltr" className="h-10 w-40" value={qs.get("to")} onChange={(e) => qs.set({ to: e.target.value })} /></label>
          {tab === "sales" && <Select className="h-10 w-auto" value={qs.get("group") || "day"} onChange={(e) => qs.set({ group: e.target.value })} aria-label={t("a.rep_group")}><option value="day">{t("a.rep_daily")}</option><option value="month">{t("a.rep_monthly")}</option></Select>}
        </div>
      )}

      {tab === "sales" && data?.totals && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label={t("a.rep_total")} value={money(data.totals.total)} hint={t("a.kpi_orders_n", { n: data.totals.orders })} />
            <Stat label={t("inv.total_excl")} value={money(data.totals.net)} />
            <Stat label={t("inv.vat_total")} value={money(data.totals.vat)} />
            <Stat label={t("tot.discount")} value={money(data.totals.discounts)} />
            <Stat label={t("a.f.refunded")} value={money(data.totals.refunds)} tone={data.totals.refunds ? "danger" : undefined} />
          </div>
          {rows && rows.length > 1 && <section className="card mb-4 p-4"><BarChart label={t("a.chart_sales_sub")} format={(v) => sar(v)} data={rows.map((r) => ({ key: r.period, value: r.total, sub: t("a.kpi_orders_n", { n: r.orders }) }))} /></section>}
          <DataTable rows={rows} loading={loading} rowKey="period" columns={[
            { key: "period", label: t("a.f.period") }, { key: "orders", label: t("a.nav.orders"), className: "text-end tabular-nums" }, { key: "units", label: t("a.f.units"), className: "text-end tabular-nums" },
            { key: "discounts", label: t("tot.discount"), className: "text-end tabular-nums", render: (r) => sar(r.discounts) }, { key: "shipping", label: t("tot.shipping"), className: "text-end tabular-nums", render: (r) => sar(r.shipping) },
            { key: "net", label: t("inv.total_excl"), className: "text-end tabular-nums", render: (r) => sar(r.net) }, { key: "vat", label: t("inv.vat"), className: "text-end tabular-nums", render: (r) => sar(r.vat) },
            { key: "total", label: t("tot.total"), className: "text-end font-semibold tabular-nums", render: (r) => sar(r.total) }, { key: "refunds", label: t("a.f.refunded"), className: "text-end tabular-nums", render: (r) => (r.refunds ? sar(r.refunds) : "—") },
          ]} />
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section><h2 className="mb-2 font-bold">{t("a.rep_by_method")}</h2>
              <DataTable rows={data.by_method} rowKey="payment_method" columns={[{ key: "payment_method", label: t("inv.payment_method"), render: (r) => <>{payMethodLabel(t, r.payment_method)} <Badge>{t(`a.ch.${r.channel}`)}</Badge></> }, { key: "orders", label: t("a.nav.orders"), className: "text-end tabular-nums" }, { key: "total", label: t("tot.total"), className: "text-end font-semibold tabular-nums", render: (r) => sar(r.total) }]} /></section>
            <section><h2 className="mb-2 font-bold">{t("a.rep_by_city")}</h2>
              <DataTable rows={data.by_city} rowKey="city" columns={[{ key: "city", label: t("addr.city") }, { key: "orders", label: t("a.nav.orders"), className: "text-end tabular-nums" }, { key: "total", label: t("tot.total"), className: "text-end font-semibold tabular-nums", render: (r) => sar(r.total) }]} /></section>
          </div>
        </>
      )}

      {tab === "products" && <DataTable rows={rows} loading={loading} rowKey="sku" empty={t("a.no_sales_yet")} columns={[
        { key: "name_ar", label: t("a.f.product"), render: (r) => <>{r.name_ar}<span className="block text-xs text-muted" dir="ltr" style={{ textAlign: "start" }}>{r.sku}</span></> },
        { key: "units", label: t("a.f.units"), className: "text-end font-semibold tabular-nums" }, { key: "revenue", label: t("a.f.revenue"), className: "text-end tabular-nums", render: (r) => sar(r.revenue) },
        { key: "cost", label: t("a.f.cost"), className: "text-end tabular-nums", render: (r) => sar(r.cost) }, { key: "profit", label: t("a.f.profit"), className: "text-end font-semibold tabular-nums", render: (r) => <span className={r.profit < 0 ? "text-danger" : ""}>{sar(r.profit)}</span> },
      ]} />}

      {tab === "profit" && data?.totals && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t("a.f.revenue")} value={money(data.totals.revenue)} hint={t("a.rep_excl_vat")} /><Stat label={t("a.f.cost")} value={money(data.totals.cost)} />
            <Stat label={t("a.f.profit")} value={money(data.totals.profit)} tone={data.totals.profit < 0 ? "danger" : "ok"} /><Stat label={t("a.f.margin")} value={`${(data.totals.margin * 100).toFixed(1)}%`} />
          </div>
          <p className="mb-3 text-sm text-muted">{t("a.rep_profit_note")}</p>
          <DataTable rows={rows} loading={loading} rowKey="period" empty={t("a.no_sales_yet")} columns={[
            { key: "period", label: t("a.f.date") }, { key: "revenue", label: t("a.f.revenue"), className: "text-end tabular-nums", render: (r) => sar(r.revenue) }, { key: "cost", label: t("a.f.cost"), className: "text-end tabular-nums", render: (r) => sar(r.cost) },
            { key: "profit", label: t("a.f.profit"), className: "text-end font-semibold tabular-nums", render: (r) => sar(r.profit) }, { key: "margin", label: t("a.f.margin"), className: "text-end tabular-nums", render: (r) => (r.revenue ? `${((r.profit / r.revenue) * 100).toFixed(1)}%` : "—") },
          ]} />
        </>
      )}

      {tab === "customers" && <DataTable rows={rows} loading={loading} empty={t("a.no_sales_yet")} columns={[
        { key: "name", label: t("a.f.customer"), render: (r) => <><Link to={`/customers/${r.id}`} className="font-medium hover:text-accent">{r.name}</Link><span className="block text-xs text-muted" dir="ltr" style={{ textAlign: "start" }}>{r.phone ?? r.email}</span></> },
        { key: "is_guest", label: t("a.f.type"), render: (r) => <Badge tone={r.is_guest ? "muted" : "info"}>{t(r.is_guest ? "a.guest" : "a.registered")}</Badge> },
        { key: "orders", label: t("a.nav.orders"), className: "text-end tabular-nums" }, { key: "total", label: t("a.f.spent"), className: "text-end font-semibold tabular-nums", render: (r) => sar(r.total) },
        { key: "last_order", label: t("a.f.last_order"), render: (r) => date(r.last_order) },
      ]} />}

      {tab === "vat" && (
        <>
          <p className="mb-3 max-w-[80ch] text-sm text-muted">{t("a.rep_vat_note")}</p>
          <DataTable rows={rows?.map((r, i) => ({ ...r, id: i }))} loading={loading} empty={t("a.no_invoices_yet")} columns={[
            { key: "period", label: t("a.f.tax_month") }, { key: "vat_rate_bp", label: t("a.f.vat_rate"), className: "text-end tabular-nums", render: (r) => `${r.vat_rate_bp / 100}%` },
            { key: "sales_taxable", label: t("a.f.sales_taxable"), className: "text-end tabular-nums", render: (r) => sar(r.sales_taxable) }, { key: "sales_vat", label: t("a.f.output_vat"), className: "text-end tabular-nums", render: (r) => sar(r.sales_vat) },
            { key: "refunds_vat", label: t("a.f.credit_vat"), className: "text-end tabular-nums", render: (r) => sar(r.refunds_vat) }, { key: "net_taxable", label: t("a.f.net_taxable"), className: "text-end tabular-nums", render: (r) => sar(r.net_taxable) },
            { key: "net_vat", label: t("a.f.net_vat"), className: "text-end font-bold tabular-nums", render: (r) => sar(r.net_vat) },
          ]} />
        </>
      )}
    </>
  );
}
