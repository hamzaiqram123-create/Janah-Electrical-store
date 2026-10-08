import type { ReactNode } from "react";
import { sar } from "../../shared/constants";
import { qrSvg } from "../../shared/qr";
import { useApp } from "../lib/ctx";
import { Icon } from "../ui/Icon";
import { Button } from "../ui/kit";

/**
 * Printable tax invoice / credit note. Labels are shown in the page language with a second language underneath
 * (Arabic is always present, as required for Saudi tax invoices). "Print" produces the PDF copy through the browser.
 */
export default function InvoicePage() {
  const app = useApp();
  const { t, lang } = app;
  const inv = app.data.invoice;
  const alt = (app.data.labels?.[lang === "ar" ? "en" : "ar"] ?? {}) as Record<string, string>;
  const credit = inv.kind === "credit_note";
  const staff = !!app.data.staff;
  const titleKey = credit ? "inv.credit_note" : inv.type === "standard" ? "inv.tax_invoice" : "inv.simplified";
  const s = inv.seller ?? {}, b = inv.buyer ?? {};
  const sep = lang === "en" ? ", " : "، ";
  const addr = (p: any) => [p.building_no, p.street, p.district, lang === "en" ? p.city_en || p.city : p.city, p.postal_code].filter(Boolean).join(sep);
  const key = app.query.get("key");

  const L = ({ k }: { k: string }) => (
    <span className="leading-tight">
      <span className="block">{t(k)}</span>
      {alt[k] && <span className="block text-[0.82em] font-normal opacity-70" lang={lang === "ar" ? "en" : "ar"} dir={lang === "ar" ? "ltr" : "rtl"}>{alt[k]}</span>}
    </span>
  );
  const Row = ({ k, children }: { k: string; children: ReactNode }) => (
    <div className="flex items-start justify-between gap-4 py-1"><dt className="text-[13px] font-semibold"><L k={k} /></dt><dd className="text-end">{children}</dd></div>
  );
  const pm = inv.payment_method && t(`paym.${inv.payment_method}`) !== `paym.${inv.payment_method}` ? t(`paym.${inv.payment_method}`) : inv.payment_method;
  // Issue time in Saudi time (UTC+3, no daylight saving), which is what the tax invoice must state.
  const issuedLocal = new Date(new Date(inv.issued_at).getTime() + 3 * 3600_000).toISOString().replace("T", " ").slice(0, 16);
  const sign = credit ? -1 : 1;

  return (
    <div className="min-h-dvh bg-bg py-6 print:bg-white print:py-0">
      <div className="no-print mx-auto mb-4 flex max-w-[860px] items-center justify-between gap-3 px-4">
        <a href={inv.order_number ? app.href(`/order/${inv.order_number}${key ? `?key=${encodeURIComponent(key)}` : ""}`) : app.href("/")} className="btn btn-ghost btn-md"><Icon name="chev" size={16} className="rotate-180" />{t("inv.back")}</a>
        <Button icon="print" onClick={() => window.print()}>{t("inv.print")}</Button>
      </div>

      <article className="mx-auto max-w-[860px] bg-white p-6 text-[#111] shadow-sm md:p-10 print:max-w-none print:p-0 print:shadow-none" style={{ colorScheme: "light" }}>
        <header className="flex items-start justify-between gap-6 border-b-2 border-[#111] pb-5">
          <div>
            <h1 className="text-2xl font-bold"><L k={titleKey} /></h1>
            <dl className="mt-3 text-sm">
              <div className="flex gap-2"><dt className="font-semibold">{t("inv.number")}:</dt><dd dir="ltr" className="tabular-nums">{inv.number}</dd></div>
              <div className="flex gap-2"><dt className="font-semibold">{t("inv.date")}:</dt><dd dir="ltr" className="tabular-nums">{issuedLocal}</dd></div>
              {inv.order_number && <div className="flex gap-2"><dt className="font-semibold">{t("inv.order")}:</dt><dd dir="ltr" className="tabular-nums">{inv.order_number}</dd></div>}
              {inv.ref_number && <div className="flex gap-2"><dt className="font-semibold">{t("inv.ref")}:</dt><dd dir="ltr" className="tabular-nums">{inv.ref_number}</dd></div>}
            </dl>
          </div>
          {s.vat_number
            ? <div className="shrink-0" role="img" aria-label={t("inv.qr")} dangerouslySetInnerHTML={{ __html: qrSvg(inv.qr_base64, { size: 132, margin: 2 }) }} />
            : staff ? <p className="no-print max-w-52 rounded border border-[#b73225] p-2 text-xs text-[#b73225]">{t("inv.no_vat_warning")}</p> : null}
        </header>

        <section className="grid gap-6 border-b border-[#bbb] py-5 text-sm sm:grid-cols-2">
          <div>
            <h2 className="mb-1.5 text-[13px] font-bold opacity-70"><L k="inv.seller" /></h2>
            <p className="text-base font-bold">{s.name}</p>
            {s.name_en && s.name_en !== s.name && <p dir="ltr" className="text-start">{s.name_en}</p>}
            <p>{addr(s)}</p>
            <p>{t("inv.vat_no")}: <span dir="ltr" className="font-semibold tabular-nums">{s.vat_number || "—"}</span></p>
            {s.cr_number && <p>{t("inv.cr_no")}: <span dir="ltr" className="tabular-nums">{s.cr_number}</span></p>}
            {s.phone && <p dir="ltr" className="text-start">{s.phone}</p>}
          </div>
          <div>
            <h2 className="mb-1.5 text-[13px] font-bold opacity-70"><L k="inv.buyer" /></h2>
            <p className="text-base font-bold">{b.name}</p>
            {addr(b) && <p>{addr(b)}</p>}
            {b.vat_number && <p>{t("inv.vat_no")}: <span dir="ltr" className="font-semibold tabular-nums">{b.vat_number}</span></p>}
            {b.phone && b.phone !== "-" && <p dir="ltr" className="text-start">{b.phone}</p>}
          </div>
        </section>

        <div className="overflow-x-auto">
          <table className="mt-5 w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-y border-[#111] bg-[#f1f2f1] text-start align-bottom print:bg-transparent">
                <th className="px-2 py-2 text-start">#</th>
                <th className="px-2 py-2 text-start"><L k="inv.item" /></th>
                <th className="px-2 py-2 text-end"><L k="inv.qty" /></th>
                <th className="px-2 py-2 text-end"><L k="inv.unit_price" /></th>
                <th className="px-2 py-2 text-end"><L k="inv.discount" /></th>
                <th className="px-2 py-2 text-end"><L k="inv.taxable" /></th>
                <th className="px-2 py-2 text-end"><L k="inv.vat" /></th>
                <th className="px-2 py-2 text-end"><L k="inv.line_total" /></th>
              </tr>
            </thead>
            <tbody>
              {inv.items.map((it: any) => (
                <tr key={it.line_no} className="border-b border-[#ccc] align-top">
                  <td className="px-2 py-2 tabular-nums">{it.line_no}</td>
                  <td className="px-2 py-2">
                    <span className="block font-medium">{lang === "en" ? it.name_en || it.name_ar : it.name_ar}</span>
                    {lang !== "en" && it.name_en && it.name_en !== it.name_ar && <span className="block text-xs opacity-70" dir="ltr" style={{ textAlign: "start" }}>{it.name_en}</span>}
                    {it.sku && <span className="block text-xs opacity-70 tabular-nums" dir="ltr" style={{ textAlign: "start" }}>{it.sku}</span>}
                  </td>
                  <td className="px-2 py-2 text-end tabular-nums">{it.quantity}</td>
                  <td className="px-2 py-2 text-end tabular-nums">{sar(it.unit_price_excl)}</td>
                  <td className="px-2 py-2 text-end tabular-nums">{it.discount_excl ? sar(it.discount_excl) : "—"}</td>
                  <td className="px-2 py-2 text-end tabular-nums">{sar(sign * it.net_amount)}</td>
                  <td className="px-2 py-2 text-end tabular-nums">{sar(sign * it.vat_amount)}<span className="block text-xs opacity-70">{it.vat_rate_bp / 100}%</span></td>
                  <td className="px-2 py-2 text-end font-semibold tabular-nums">{sar(sign * it.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="mt-5 flex flex-col justify-between gap-6 sm:flex-row">
          <div className="text-sm">
            {pm && <p><span className="font-semibold">{t("inv.payment_method")}:</span> {pm}</p>}
            {inv.reason && <p className="mt-1"><span className="font-semibold">{t("inv.reason")}:</span> {inv.reason}</p>}
            <p className="mt-3 max-w-xs text-xs opacity-70">{t("inv.currency_note")}</p>
          </div>
          <dl className="w-full shrink-0 text-sm sm:w-80">
            <Row k="inv.total_excl"><span className="tabular-nums">{sar(sign * inv.taxable_amount)}</span></Row>
            {inv.discount_amount > 0 && <Row k="inv.discount_total"><span className="tabular-nums">{sar(inv.discount_amount)}</span></Row>}
            <Row k="inv.vat_total"><span className="tabular-nums">{sar(sign * inv.vat_amount)}</span></Row>
            <div className="mt-1 flex items-start justify-between gap-4 border-t-2 border-[#111] pt-2 text-base font-bold">
              <dt><L k="inv.grand_total" /></dt><dd className="text-lg tabular-nums">{sar(sign * inv.total)} {lang === "en" ? "SAR" : "ر.س"}</dd>
            </div>
          </dl>
        </section>

        <footer className="mt-8 border-t border-[#bbb] pt-3 text-xs opacity-70">
          <p>{t("inv.footer", { name: s.name })}</p>
          <p className="mt-1 break-all" dir="ltr" style={{ textAlign: "start" }}>UUID {inv.uuid} &nbsp; ICV {inv.icv}</p>
        </footer>
      </article>
    </div>
  );
}
