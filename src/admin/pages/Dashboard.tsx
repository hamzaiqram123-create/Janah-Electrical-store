import { useState } from "react";
import { sar } from "../../shared/constants";
import { useApp } from "../../web/lib/ctx";
import { Icon } from "../../web/ui/Icon";
import { Link, StatusBadge } from "../../web/ui/kit";
import { PageHead, Stat, useAdmin, useFetch, nm } from "../core";

/** Single-series daily bar chart: thin bars on a shared baseline, recessive grid, per-bar hover readout. */
export function BarChart({ data, label, format }: { data: { key: string; value: number; sub?: string }[]; label: string; format: (v: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const W = 720, H = 220, padL = 8, padR = 8, padT = 18, padB = 22;
  const bw = (W - padL - padR) / Math.max(1, data.length);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / top);
  const h = hover !== null ? data[hover] : null;
  return (
    <figure className="relative" dir="ltr">
      <figcaption className="sr-only">{label}</figcaption>
      <div className="mb-2 flex h-10 items-end justify-between gap-3 text-sm">
        <span className="text-muted">{h ? h.key : label}</span>
        <span className="font-semibold tabular-nums">{h ? `${format(h.value)}${h.sub ? ` — ${h.sub}` : ""}` : ""}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={label} onMouseLeave={() => setHover(null)}>
        {ticks.map((tk) => (
          <g key={tk}>
            <line x1={padL} x2={W - padR} y1={y(tk)} y2={y(tk)} stroke="var(--line)" strokeWidth="1" strokeDasharray={tk === 0 ? undefined : "3 4"} />
            {tk > 0 && <text x={padL + 2} y={y(tk) - 4} fontSize="10" fill="var(--muted)">{format(tk)}</text>}
          </g>
        ))}
        {data.map((d, i) => {
          const x = padL + i * bw, barH = Math.max(d.value > 0 ? 2 : 0, H - padB - y(d.value)), w = Math.max(2, bw - 2);
          return (
            <g key={d.key} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${d.key}: ${format(d.value)}`} style={{ outline: "none" }}>
              <rect x={x} y={padT} width={bw} height={H - padT - padB} fill="transparent" />
              {barH > 0 && <path d={`M${x + 1} ${H - padB} V${H - padB - barH + Math.min(3, barH)} Q${x + 1} ${H - padB - barH} ${x + 1 + Math.min(3, w / 2)} ${H - padB - barH} H${x + 1 + w - Math.min(3, w / 2)} Q${x + 1 + w} ${H - padB - barH} ${x + 1 + w} ${H - padB - barH + Math.min(3, barH)} V${H - padB} Z`} fill="var(--info)" opacity={hover === null || hover === i ? 1 : 0.45} />}
            </g>
          );
        })}
        {data.map((d, i) => (i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2)) && (
          <text key={`l${d.key}`} x={padL + i * bw + bw / 2} y={H - 6} fontSize="10" fill="var(--muted)" textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"}>{d.key.slice(5)}</text>
        ))}
      </svg>
    </figure>
  );
}
function niceStep(max: number): number {
  const raw = max / 4, pow = Math.pow(10, Math.floor(Math.log10(raw || 1))), n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

export default function Dashboard() {
  const app = useApp();
  const { t, money, date } = app;
  const admin = useAdmin();
  const { data } = useFetch<any>("/api/admin/dashboard");
  const setup = useFetch<any>(admin.can("settings.manage") ? "/api/admin/settings" : null);
  if (!data) return <p className="text-muted">{t("c.loading")}</p>;
  const k = data.kpi;
  if (!data.sales_visible) {
    return (
      <>
        <PageHead title={t("a.nav.dashboard")} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t("a.kpi_products")} value={k.products} />
          <Stat label={t("a.kpi_low")} value={k.low_stock} tone={k.low_stock ? "danger" : undefined} />
        </div>
        {admin.can("inventory.view") && (
          <section className="card mt-5 max-w-2xl overflow-hidden">
            <h2 className="flex items-center justify-between border-b border-line px-4 py-3 font-bold">{t("a.low_stock")}<Link to="/inventory?low=1" className="text-sm font-semibold text-accent hover:underline">{t("c.view_all")}</Link></h2>
            <table className="table-x">
              <tbody>
                {data.low_stock.map((p: any) => (
                  <tr key={p.id}><td>{nm(p)}<span className="block text-xs text-muted" dir="ltr" style={{ textAlign: "start" }}>{p.sku}</span></td><td className={`text-end font-bold tabular-nums ${p.quantity === 0 ? "text-danger" : ""}`}>{p.quantity}</td><td className="text-end text-xs text-muted">{t("a.min_n", { n: p.min_stock })}</td></tr>
                ))}
                {!data.low_stock.length && <tr><td className="py-8 text-center text-muted">{t("a.stock_ok")}</td></tr>}
              </tbody>
            </table>
          </section>
        )}
      </>
    );
  }
  const change = k.prev_month_sales ? Math.round(((k.month_sales - k.prev_month_sales) / k.prev_month_sales) * 100) : null;
  const store = setup.data?.settings?.store;
  const todo: [string, string][] = [];
  if (store && !store.vat_number) todo.push(["a.todo_vat", "/settings"]);
  if (store && !store.phone) todo.push(["a.todo_contact", "/settings"]);
  if (setup.data && !setup.data.integrations.payment.ready) todo.push(["a.todo_payment", "/settings"]);
  if (setup.data && !setup.data.integrations.email.ready) todo.push(["a.todo_email", "/settings"]);

  return (
    <>
      <PageHead title={t("a.nav.dashboard")} sub={t("a.dash_sub")} />
      {todo.length > 0 && (
        <section className="card mb-5 border-warn/50 bg-warn-soft p-4">
          <h2 className="flex items-center gap-2 font-bold"><Icon name="alert" size={18} />{t("a.todo_title")}</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {todo.map(([key, to]) => <li key={key} className="flex flex-wrap items-center gap-2"><span>{t(key)}</span><Link to={to} className="font-semibold underline">{t("a.nav.settings")}</Link></li>)}
          </ul>
        </section>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t("a.kpi_today")} value={money(k.today_sales)} hint={t("a.kpi_orders_n", { n: k.today_orders })} />
        <Stat label={t("a.kpi_month")} value={money(k.month_sales)} hint={change === null ? t("a.kpi_orders_n", { n: k.month_orders }) : t("a.kpi_vs_prev", { pct: `${change > 0 ? "+" : ""}${change}%` })} />
        <Stat label={t("a.kpi_total")} value={money(k.total_sales)} hint={t("a.kpi_orders_n", { n: k.total_orders })} />
        <Stat label={t("a.kpi_avg")} value={money(k.avg_order)} hint={t("a.kpi_conv", { pct: (k.conversion_rate * 100).toFixed(1) })} />
        <Stat label={t("a.kpi_open")} value={k.open_orders} />
        <Stat label={t("a.kpi_customers")} value={k.customers} hint={t("a.kpi_new_month", { n: k.new_customers })} />
        <Stat label={t("a.kpi_products")} value={k.products} />
        <Stat label={t("a.kpi_low")} value={k.low_stock} tone={k.low_stock ? "danger" : undefined} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
        <section className="card p-4">
          <h2 className="mb-1 font-bold">{t("a.chart_sales")}</h2>
          <BarChart label={t("a.chart_sales_sub")} format={(v) => sar(v)} data={data.series.map((s: any) => ({ key: s.day, value: s.total, sub: t("a.kpi_orders_n", { n: s.orders }) }))} />
        </section>
        <section className="card p-4">
          <h2 className="mb-3 font-bold">{t("a.needs_attention")}</h2>
          <ul className="divide-y divide-line text-sm">
            {[["a.kpi_open", k.open_orders, "/orders"], ["a.att_returns", k.pending_returns, "/returns?status=requested"], ["a.att_reviews", k.pending_reviews, "/reviews?status=pending"], ["a.att_tickets", k.open_tickets, "/tickets?status=open"], ["a.kpi_low", k.low_stock, "/inventory?low=1"]].map(([key, n, to]) => (
              <li key={key as string}><Link to={to as string} className="flex items-center justify-between py-2.5 hover:text-accent"><span>{t(key as string)}</span><span className={`font-bold tabular-nums ${(n as number) > 0 ? "" : "text-muted"}`}>{n as number}</span></Link></li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <section className="card overflow-hidden">
          <h2 className="flex items-center justify-between border-b border-line px-4 py-3 font-bold">{t("a.recent_orders")}<Link to="/orders" className="text-sm font-semibold text-accent hover:underline">{t("c.view_all")}</Link></h2>
          <table className="table-x">
            <tbody>
              {data.recent_orders.map((o: any) => (
                <tr key={o.id} className="cursor-pointer hover:bg-surface-2" onClick={() => admin.go(`/admin/orders/${o.id}`)}>
                  <td><b dir="ltr" className="tabular-nums">{o.number}</b><span className="block text-xs text-muted">{date(o.created_at, true)}</span></td>
                  <td>{o.customer_name}</td>
                  <td><StatusBadge status={o.status} /></td>
                  <td className="text-end font-semibold tabular-nums">{sar(o.total)}</td>
                </tr>
              ))}
              {!data.recent_orders.length && <tr><td className="py-8 text-center text-muted">{t("a.no_rows")}</td></tr>}
            </tbody>
          </table>
        </section>
        <div className="space-y-5">
          <section className="card overflow-hidden">
            <h2 className="border-b border-line px-4 py-3 font-bold">{t("a.top_products")}</h2>
            <table className="table-x">
              <tbody>
                {data.top_products.map((p: any) => (
                  <tr key={p.sku}><td>{nm(p)}<span className="block text-xs text-muted" dir="ltr" style={{ textAlign: "start" }}>{p.sku}</span></td><td className="text-end tabular-nums">{p.units}</td><td className="text-end font-semibold tabular-nums">{sar(p.revenue)}</td></tr>
                ))}
                {!data.top_products.length && <tr><td className="py-8 text-center text-muted">{t("a.no_sales_yet")}</td></tr>}
              </tbody>
            </table>
          </section>
          <section className="card overflow-hidden">
            <h2 className="flex items-center justify-between border-b border-line px-4 py-3 font-bold">{t("a.low_stock")}<Link to="/inventory?low=1" className="text-sm font-semibold text-accent hover:underline">{t("c.view_all")}</Link></h2>
            <table className="table-x">
              <tbody>
                {data.low_stock.map((p: any) => (
                  <tr key={p.id}><td>{nm(p)}<span className="block text-xs text-muted" dir="ltr" style={{ textAlign: "start" }}>{p.sku}</span></td><td className={`text-end font-bold tabular-nums ${p.quantity === 0 ? "text-danger" : ""}`}>{p.quantity}</td><td className="text-end text-xs text-muted">{t("a.min_n", { n: p.min_stock })}</td></tr>
                ))}
                {!data.low_stock.length && <tr><td className="py-8 text-center text-muted">{t("a.stock_ok")}</td></tr>}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </>
  );
}
