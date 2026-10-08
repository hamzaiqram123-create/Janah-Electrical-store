import { useEffect, useMemo, useState } from "react";
import { normalizePhone } from "../../shared/constants";
import { api, ApiError } from "../lib/api";
import { useApp } from "../lib/ctx";
import { Icon } from "../ui/Icon";
import { Button, Empty, Field, Input, Link, ProductImage, Select, Textarea } from "../ui/kit";
import { CouponBox, TotalsBox, type CartView } from "./Cart";

interface ShipOption { id: number; key: string; name: string; description: string; fee: number; base_fee: number; free: boolean; free_threshold: number | null; min_days: number; max_days: number; delivery_from: string; delivery_to: string; cod_allowed: boolean; is_pickup: boolean }
interface Quote { cart: CartView; shipping_options: ShipOption[]; shipping_method_id?: number; payment_methods: { key: "cod" | "online"; fee: number; brands: string[] }[]; payment_method?: string | null }

const STEPS = ["customer", "address", "shipping", "payment", "review"] as const;
const BRAND_LABEL: Record<string, string> = { mada: "mada", visa: "Visa", mastercard: "Mastercard", applepay: "Apple Pay", stcpay: "STC Pay" };

export default function Checkout() {
  const app = useApp();
  const { t, money, shell } = app;
  const user = shell.user;
  const regions = (app.data.regions ?? []) as { id: number; name: string; cities: { id: number; name: string }[] }[];

  const [step, setStep] = useState(1);
  const [cust, setCust] = useState({ name: user?.name ?? "", email: user?.email ?? "", phone: user?.phone ?? "", business: false, company_name: "", vat_number: "" });
  const [addresses, setAddresses] = useState<any[]>([]);
  const [addrId, setAddrId] = useState<number | "new">("new");
  const [addr, setAddr] = useState({ region_id: "", city_id: "", district: "", street: "", building_no: "", postal_code: "", short_address: "", notes: "" });
  const [save, setSave] = useState(true);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [shipId, setShipId] = useState<number | null>(null);
  const [pay, setPay] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [placing, setPlacing] = useState(false);

  const savedAddr = addrId === "new" ? null : addresses.find((a) => a.id === addrId) ?? null;
  const cityId = savedAddr ? (savedAddr.city_id as number) : Number(addr.city_id) || null;
  const cities = useMemo(() => regions.find((r) => String(r.id) === addr.region_id)?.cities ?? [], [regions, addr.region_id]);
  const sep = app.lang === "en" ? ", " : "، ";
  const cityName = (id: number | null) => { for (const r of regions) { const c = r.cities.find((x) => x.id === id); if (c) return `${c.name}${sep}${r.name}`; } return ""; };

  const refresh = async (o: { city?: number | null; ship?: number | null; pay?: string | null } = {}) => {
    setBusy(true);
    try {
      const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cust.email.trim());
      const q = await api<Quote>("/api/checkout/quote", { body: { city_id: o.city === undefined ? cityId : o.city, shipping_method_id: o.ship === undefined ? shipId : o.ship, payment_method: o.pay === undefined ? pay : o.pay, email: emailOk ? cust.email.trim() : null } });
      setQuote(q);
      app.setCartCount(q.cart.count);
      if (q.shipping_options.length) { setShipId(q.shipping_method_id ?? null); setPay(q.payment_method ?? null); }
      return q;
    } catch (e) { app.toast(app.errorText(e), "err"); return null; } finally { setBusy(false); }
  };

  useEffect(() => {
    void refresh({ city: null });
    if (user) {
      api<{ addresses: any[] }>("/api/account/addresses").then((r) => {
        setAddresses(r.addresses);
        const def = r.addresses.find((a) => a.is_default) ?? r.addresses[0];
        if (def) setAddrId(def.id);
      }).catch(() => {});
    }
  }, []);

  const validate = (n: number): Record<string, string> => {
    const e: Record<string, string> = {};
    if (n === 1) {
      if (cust.name.trim().length < 2) e["customer.name"] = "required";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cust.email.trim())) e["customer.email"] = "invalid_email";
      if (!normalizePhone(cust.phone)) e["customer.phone"] = "invalid_phone";
      if (cust.business) {
        if (cust.company_name.trim().length < 2) e["customer.company_name"] = "required";
        if (!/^3\d{13}3$/.test(cust.vat_number.trim())) e["customer.vat_number"] = "invalid_vat_number";
      }
    }
    if (n === 2 && addrId === "new") {
      if (!addr.city_id) e["address.city_id"] = "required";
      if (addr.district.trim().length < 2) e["address.district"] = "required";
      if (addr.street.trim().length < 2) e["address.street"] = "required";
      if (addr.postal_code && !/^\d{5}$/.test(addr.postal_code.trim())) e["address.postal_code"] = "invalid_postal_code";
      if (addr.short_address && !/^[A-Za-z]{4}\d{4}$/.test(addr.short_address.trim())) e["address.short_address"] = "invalid_short_address";
    }
    if (n === 3 && !shipId) e.shipping_method_id = "required";
    if (n === 4 && !pay) e.payment_method = "required";
    if (n === 5 && !terms) e.accept_terms = "terms_required";
    return e;
  };

  const next = async () => {
    const e = validate(step);
    setErrors(e);
    if (Object.keys(e).length) return;
    if (step === 1 || step === 2) { const q = await refresh(); if (!q) return; }
    setStep((s) => Math.min(5, s + 1));
    window.scrollTo({ top: 0 });
  };

  const place = async () => {
    for (let n = 1; n <= 5; n++) { const e = validate(n); if (Object.keys(e).length) { setErrors(e); setStep(n); return; } }
    setPlacing(true);
    try {
      const res = await api<{ number: string; access_key: string; redirect_url: string | null }>("/api/checkout/place", {
        body: {
          customer: { name: cust.name.trim(), email: cust.email.trim(), phone: cust.phone.trim(), company_name: cust.business ? cust.company_name.trim() : null, vat_number: cust.business ? cust.vat_number.trim() : null },
          address_id: savedAddr ? savedAddr.id : null,
          address: savedAddr ? null : { city_id: Number(addr.city_id), district: addr.district, street: addr.street, building_no: addr.building_no, postal_code: addr.postal_code, short_address: addr.short_address, notes: addr.notes },
          save_address: !!user && !savedAddr && save,
          shipping_method_id: shipId, payment_method: pay, notes, accept_terms: true,
        },
      });
      app.setCartCount(0);
      if (res.redirect_url) { window.location.href = res.redirect_url; return; }
      await app.navigate(app.href(`/order/${res.number}?key=${res.access_key}&placed=1`));
    } catch (e) {
      app.toast(app.errorText(e), "err");
      if (e instanceof ApiError) {
        if (e.code === "validation") {
          setErrors(e.fields);
          const first = Object.keys(e.fields)[0] ?? "";
          setStep(first.startsWith("customer") ? 1 : first.startsWith("address") ? 2 : first.startsWith("shipping") ? 3 : first.startsWith("payment") ? 4 : 5);
        } else if (["cart_changed", "insufficient_stock", "out_of_stock", "shipping_method_unavailable", "payment_method_unavailable"].includes(e.code)) {
          await refresh();
        } else if (e.code === "cart_empty") void app.navigate(app.href("/cart"));
      }
      setPlacing(false);
    }
  };

  const cart = quote?.cart;
  if (quote && !cart!.items.length) {
    return <div className="container-x py-6"><Empty icon="cart" title={t("cart.empty")} text={t("cart.empty_text")}><Link to="/products" className="btn btn-primary btn-md">{t("cart.start")}</Link></Empty></div>;
  }
  const ship = quote?.shipping_options.find((o) => o.id === shipId) ?? null;
  const err = (k: string) => errors[k] || null;
  const setC = (k: keyof typeof cust, v: any) => { setCust((c) => ({ ...c, [k]: v })); setErrors((e) => ({ ...e, [`customer.${k}`]: "" })); };
  const setA = (k: keyof typeof addr, v: string) => { setAddr((a) => ({ ...a, [k]: v, ...(k === "region_id" ? { city_id: "" } : {}) })); setErrors((e) => ({ ...e, [`address.${k}`]: "" })); };
  const payLabel = (key: string) => (key === "cod" ? t("pay.cod") : t("pay.online"));

  return (
    <div className="container-x py-5 md:py-7">
      <h1 className="h-page mb-5">{t("checkout.title")}</h1>

      <ol className="mb-6 flex items-start gap-1 overflow-x-auto pb-1" aria-label={t("checkout.steps")}>
        {STEPS.map((key, i) => {
          const n = i + 1, done = n < step, on = n === step;
          return (
            <li key={key} className="flex min-w-[64px] flex-1 flex-col items-center gap-1.5 text-center">
              <span className="flex w-full items-center">
                <span className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : n <= step ? "bg-accent" : "bg-line"}`} />
                <button type="button" disabled={!done} onClick={() => setStep(n)} aria-current={on ? "step" : undefined}
                  className={`grid size-9 shrink-0 place-items-center rounded-full border-2 text-sm font-bold tabular-nums ${on ? "border-accent bg-accent text-accent-fg" : done ? "border-accent bg-surface text-accent" : "border-line bg-surface text-muted"}`}>
                  {done ? <Icon name="check" size={18} /> : n}
                </button>
                <span className={`h-0.5 flex-1 ${i === STEPS.length - 1 ? "opacity-0" : n < step ? "bg-accent" : "bg-line"}`} />
              </span>
              <span className={`text-xs leading-tight md:text-sm ${on ? "font-bold" : "text-muted"}`}>{t(`checkout.s_${key}`)}</span>
            </li>
          );
        })}
      </ol>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="card h-fit min-w-0 p-4 md:p-6">
          {step === 1 && (
            <section>
              <h2 className="mb-1 text-xl font-bold">{t("checkout.s_customer")}</h2>
              {!user && <p className="mb-4 text-sm text-muted">{t("checkout.guest_hint")} <Link to={`/login?next=${encodeURIComponent(app.href("/checkout"))}`} className="font-semibold text-accent hover:underline">{t("nav.login")}</Link></p>}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("f.name")} required error={err("customer.name")} className="sm:col-span-2"><Input value={cust.name} onChange={(e) => setC("name", e.target.value)} autoComplete="name" invalid={!!err("customer.name")} /></Field>
                <Field label={t("f.email")} required error={err("customer.email")} hint={t("checkout.email_hint")}><Input type="email" dir="ltr" className="text-start" value={cust.email} onChange={(e) => setC("email", e.target.value)} autoComplete="email" invalid={!!err("customer.email")} /></Field>
                <Field label={t("f.phone")} required error={err("customer.phone")} hint={t("f.phone_hint")}><Input type="tel" dir="ltr" className="text-start" value={cust.phone} onChange={(e) => setC("phone", e.target.value)} autoComplete="tel" placeholder="05XXXXXXXX" invalid={!!err("customer.phone")} /></Field>
              </div>
              <label className="mt-5 flex items-center gap-2.5 font-medium"><input type="checkbox" className="check" checked={cust.business} onChange={(e) => setC("business", e.target.checked)} />{t("checkout.business")}</label>
              {cust.business && (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label={t("f.company")} required error={err("customer.company_name")}><Input value={cust.company_name} onChange={(e) => setC("company_name", e.target.value)} autoComplete="organization" invalid={!!err("customer.company_name")} /></Field>
                  <Field label={t("f.vat_number")} required error={err("customer.vat_number")} hint={t("f.vat_hint")}><Input dir="ltr" className="text-start tabular-nums" inputMode="numeric" maxLength={15} value={cust.vat_number} onChange={(e) => setC("vat_number", e.target.value.replace(/\D/g, ""))} invalid={!!err("customer.vat_number")} /></Field>
                </div>
              )}
            </section>
          )}

          {step === 2 && (
            <section>
              <h2 className="mb-4 text-xl font-bold">{t("checkout.s_address")}</h2>
              {addresses.length > 0 && (
                <ul className="mb-4 grid gap-3 sm:grid-cols-2">
                  {addresses.map((a) => (
                    <li key={a.id}>
                      <label className={`flex h-full cursor-pointer gap-3 rounded-md border p-3 ${addrId === a.id ? "border-accent bg-accent-soft" : "border-line hover:border-fg"}`}>
                        <input type="radio" name="addr" className="check mt-1 rounded-full" checked={addrId === a.id} onChange={() => setAddrId(a.id)} />
                        <span className="text-sm"><b>{a.label || a.recipient_name}</b><br />{[a.district, a.street, a.building_no].filter(Boolean).join(sep)}<br />{a.city}</span>
                      </label>
                    </li>
                  ))}
                  <li>
                    <label className={`flex h-full cursor-pointer items-center gap-3 rounded-md border p-3 ${addrId === "new" ? "border-accent bg-accent-soft" : "border-line hover:border-fg"}`}>
                      <input type="radio" name="addr" className="check rounded-full" checked={addrId === "new"} onChange={() => setAddrId("new")} />
                      <span className="flex items-center gap-2 font-medium"><Icon name="plus" size={16} />{t("addr.new")}</span>
                    </label>
                  </li>
                </ul>
              )}
              {addrId === "new" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("addr.region")} required><Select value={addr.region_id} onChange={(e) => setA("region_id", e.target.value)}><option value="">{t("addr.choose_region")}</option>{regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
                  <Field label={t("addr.city")} required error={err("address.city_id")}><Select value={addr.city_id} disabled={!addr.region_id} onChange={(e) => setA("city_id", e.target.value)} invalid={!!err("address.city_id")}><option value="">{t("addr.choose_city")}</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
                  <Field label={t("addr.district")} required error={err("address.district")}><Input value={addr.district} onChange={(e) => setA("district", e.target.value)} autoComplete="address-level3" invalid={!!err("address.district")} /></Field>
                  <Field label={t("addr.street")} required error={err("address.street")}><Input value={addr.street} onChange={(e) => setA("street", e.target.value)} autoComplete="address-line1" invalid={!!err("address.street")} /></Field>
                  <Field label={t("addr.building")} error={err("address.building_no")}><Input value={addr.building_no} onChange={(e) => setA("building_no", e.target.value)} dir="ltr" className="text-start" /></Field>
                  <Field label={t("addr.postal")} error={err("address.postal_code")}><Input value={addr.postal_code} onChange={(e) => setA("postal_code", e.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" dir="ltr" className="text-start tabular-nums" autoComplete="postal-code" invalid={!!err("address.postal_code")} /></Field>
                  <Field label={t("addr.short")} error={err("address.short_address")} hint={t("addr.short_hint")}><Input value={addr.short_address} onChange={(e) => setA("short_address", e.target.value.toUpperCase().slice(0, 8))} dir="ltr" className="text-start uppercase" placeholder="RRRD2929" invalid={!!err("address.short_address")} /></Field>
                  <Field label={t("addr.notes")}><Input value={addr.notes} onChange={(e) => setA("notes", e.target.value)} maxLength={300} placeholder={t("addr.notes_ph")} /></Field>
                  {user && <label className="flex items-center gap-2.5 sm:col-span-2"><input type="checkbox" className="check" checked={save} onChange={(e) => setSave(e.target.checked)} />{t("addr.save")}</label>}
                </div>
              )}
            </section>
          )}

          {step === 3 && (
            <section>
              <h2 className="mb-1 text-xl font-bold">{t("checkout.s_shipping")}</h2>
              <p className="mb-4 text-sm text-muted">{t("checkout.ship_to", { city: cityName(cityId) })}</p>
              {quote?.shipping_options.length ? (
                <ul className="space-y-3" role="radiogroup" aria-label={t("checkout.s_shipping")}>
                  {quote.shipping_options.map((o) => (
                    <li key={o.id}>
                      <label className={`flex cursor-pointer items-start gap-3 rounded-md border p-4 ${shipId === o.id ? "border-accent bg-accent-soft" : "border-line hover:border-fg"}`}>
                        <input type="radio" name="ship" className="check mt-1 rounded-full" checked={shipId === o.id} onChange={() => { setShipId(o.id); void refresh({ ship: o.id }); }} />
                        <span className="flex-1">
                          <span className="flex items-center gap-2 font-bold"><Icon name={o.is_pickup ? "store" : "truck"} size={18} />{o.name}</span>
                          <span className="mt-0.5 block text-sm text-muted">{o.description}</span>
                          <span className="mt-1 block text-sm">{o.is_pickup ? t("ship.ready", { date: app.date(o.delivery_to) }) : t("ship.eta", { from: app.date(o.delivery_from), to: app.date(o.delivery_to) })}</span>
                        </span>
                        <span className="text-end font-bold tabular-nums">{o.fee === 0 ? <span className="text-ok">{t("tot.free")}</span> : money(o.fee)}
                          {o.free && <s className="block text-xs font-normal text-muted">{money(o.base_fee)}</s>}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : <p className="rounded-md bg-warn-soft p-4">{busy ? t("c.loading") : t("ship.none")}</p>}
              {err("shipping_method_id") && <p className="mt-2 text-sm text-danger" role="alert">{t("v.required")}</p>}
            </section>
          )}

          {step === 4 && (
            <section>
              <h2 className="mb-4 text-xl font-bold">{t("checkout.s_payment")}</h2>
              {quote?.payment_methods.length ? (
                <ul className="space-y-3" role="radiogroup" aria-label={t("checkout.s_payment")}>
                  {quote.payment_methods.map((m) => (
                    <li key={m.key}>
                      <label className={`flex cursor-pointer items-start gap-3 rounded-md border p-4 ${pay === m.key ? "border-accent bg-accent-soft" : "border-line hover:border-fg"}`}>
                        <input type="radio" name="pay" className="check mt-1 rounded-full" checked={pay === m.key} onChange={() => { setPay(m.key); void refresh({ pay: m.key }); }} />
                        <span className="flex-1">
                          <span className="flex items-center gap-2 font-bold"><Icon name={m.key === "cod" ? "cash" : "card"} size={18} />{payLabel(m.key)}</span>
                          <span className="mt-0.5 block text-sm text-muted">{t(m.key === "cod" ? "pay.cod_desc" : "pay.online_desc")}</span>
                          {m.brands.length > 0 && <span className="mt-2 flex flex-wrap gap-1.5">{m.brands.map((b) => <span key={b} className="rounded border border-line bg-surface px-2 py-0.5 text-xs font-semibold">{BRAND_LABEL[b] ?? b}</span>)}</span>}
                        </span>
                        {m.fee > 0 && <span className="text-sm font-semibold tabular-nums">+ {money(m.fee)}</span>}
                      </label>
                    </li>
                  ))}
                </ul>
              ) : <p className="rounded-md bg-warn-soft p-4">{t("pay.none")}</p>}
              {quote?.payment_methods.some((m) => m.key === "online") && <p className="mt-4 flex items-center gap-2 text-sm text-muted"><Icon name="lock" size={16} />{t("pay.secure_note")}</p>}
            </section>
          )}

          {step === 5 && cart && (
            <section>
              <h2 className="mb-4 text-xl font-bold">{t("checkout.s_review")}</h2>
              <dl className="divide-y divide-line rounded-md border border-line text-sm">
                {[
                  [t("checkout.s_customer"), <>{cust.name}<br /><span dir="ltr">{cust.email}</span><br /><span dir="ltr">{cust.phone}</span>{cust.business && <><br />{cust.company_name}<br /><span dir="ltr">{cust.vat_number}</span></>}</>, 1],
                  [t("checkout.s_address"), savedAddr ? <>{[savedAddr.district, savedAddr.street].filter(Boolean).join(sep)}<br />{savedAddr.city}</> : <>{[addr.district, addr.street, addr.building_no].filter(Boolean).join(sep)}<br />{cityName(cityId)}{addr.postal_code ? ` ${addr.postal_code}` : ""}</>, 2],
                  [t("checkout.s_shipping"), ship ? <>{ship.name}<br /><span className="text-muted">{ship.is_pickup ? t("ship.ready", { date: app.date(ship.delivery_to) }) : t("ship.eta", { from: app.date(ship.delivery_from), to: app.date(ship.delivery_to) })}</span></> : "—", 3],
                  [t("checkout.s_payment"), pay ? payLabel(pay) : "—", 4],
                ].map(([label, value, n]) => (
                  <div key={n as number} className="flex items-start gap-3 p-3">
                    <dt className="w-24 shrink-0 font-semibold text-muted sm:w-28">{label}</dt>
                    <dd className="min-w-0 flex-1 leading-relaxed [overflow-wrap:anywhere]">{value}</dd>
                    <button type="button" className="shrink-0 font-semibold text-accent hover:underline" onClick={() => setStep(n as number)}>{t("c.edit")}</button>
                  </div>
                ))}
              </dl>
              <Field label={t("checkout.notes")} className="mt-4"><Textarea rows={2} value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder={t("checkout.notes_ph")} /></Field>
              <label className="mt-4 flex items-start gap-2.5">
                <input type="checkbox" className="check mt-1" checked={terms} onChange={(e) => { setTerms(e.target.checked); setErrors({}); }} />
                <span>{t("checkout.accept")} <a href={app.href("/page/terms")} target="_blank" rel="noopener" className="font-semibold text-accent underline">{t("foot.terms")}</a> {t("checkout.and")} <a href={app.href("/page/returns")} target="_blank" rel="noopener" className="font-semibold text-accent underline">{t("foot.returns")}</a></span>
              </label>
              {err("accept_terms") && <p className="mt-1 text-sm text-danger" role="alert">{t("v.terms_required")}</p>}
            </section>
          )}

          <div className="mt-6 flex items-center justify-between gap-3 border-t border-line pt-4">
            {step > 1 ? <Button variant="ghost" onClick={() => setStep((s) => s - 1)}><Icon name="chev" size={16} className="rotate-180" />{t("c.back")}</Button> : <Link to="/cart" className="btn btn-ghost btn-md"><Icon name="chev" size={16} className="rotate-180" />{t("cart.title")}</Link>}
            {step < 5
              ? <Button size="lg" busy={busy} onClick={next}>{t("c.continue")}<Icon name="chev" size={16} /></Button>
              : <Button size="lg" busy={placing} icon={pay === "online" ? "lock" : "check"} onClick={place}>{pay === "online" ? t("checkout.pay_now", { total: cart ? money(cart.totals.total) : "" }) : t("checkout.place")}</Button>}
          </div>
        </div>

        <aside className="card h-fit space-y-4 p-4 lg:sticky lg:top-4" aria-label={t("cart.summary")}>
          <h2 className="text-lg font-bold">{t("cart.summary")}</h2>
          {cart ? (
            <>
              <ul className="max-h-72 space-y-3 overflow-y-auto pe-1">
                {cart.items.filter((i) => i.issue !== "out_of_stock" && i.issue !== "unavailable").map((it) => (
                  <li key={it.item_id} className="flex items-center gap-3">
                    <span className="relative size-14 shrink-0 rounded border border-line bg-white">
                      <ProductImage src={it.image} alt="" glyph={it.glyph} className="rounded" />
                      <span className="absolute -end-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-fg px-1 text-[11px] font-bold text-bg tabular-nums">{it.quantity}</span>
                    </span>
                    <span className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-snug">{it.name}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums">{money(it.line_total)}</span>
                  </li>
                ))}
              </ul>
              {cart.has_issues && <p className="rounded-md bg-warn-soft p-3 text-sm">{t("cart.has_issues")}</p>}
              <CouponBox cart={cart} onCart={() => void refresh()} />
              <TotalsBox cart={cart} shippingKnown={step >= 3 && !!ship} />
            </>
          ) : <p className="text-muted">{t("c.loading")}</p>}
        </aside>
      </div>
    </div>
  );
}
