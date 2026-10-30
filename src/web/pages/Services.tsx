import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useApp } from "../lib/ctx";
import { Glyph, Icon } from "../ui/Icon";
import { Breadcrumbs, Button, Empty, Field, Input, Link, Modal, StatusBadge, Textarea, useForm } from "../ui/kit";
import { AccountLayout } from "./Account";

interface Service { id: number; slug: string; icon: string | null; name: string; description?: string; visit_fee: number; duration_min: number }
interface Slot { slot: string; left: number; available: boolean }

/** Next `n` calendar days as YYYY-MM-DD in Riyadh time. */
function nextDays(n: number): string[] {
  const base = Date.now() + 3 * 3600_000;
  return Array.from({ length: n }, (_, i) => new Date(base + i * 86400_000).toISOString().slice(0, 10));
}

function DayPicker({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const app = useApp();
  const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(app.lang === "en" ? "en-GB" : app.lang === "ur" ? "ur-PK" : "ar-SA-u-ca-gregory", { ...o, timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label={app.t("svc.date")}>
      {nextDays(14).map((d) => (
        <button key={d} type="button" role="radio" aria-checked={value === d} onClick={() => onChange(d)}
          className={`flex w-16 shrink-0 flex-col items-center rounded-md border py-2 text-sm ${value === d ? "border-accent bg-accent-soft font-bold text-accent" : "border-line hover:border-fg"}`}>
          <span className="text-xs">{fmt(d, { weekday: "short" })}</span>
          <span className="text-lg tabular-nums">{fmt(d, { day: "numeric" })}</span>
          <span className="text-xs text-muted">{fmt(d, { month: "short" })}</span>
        </button>
      ))}
    </div>
  );
}

function SlotPicker({ serviceId, date, value, onChange }: { serviceId: number; date: string; value: string; onChange: (s: string) => void }) {
  const { t } = useApp();
  const [slots, setSlots] = useState<Slot[] | null>(null);
  useEffect(() => { setSlots(null); api<{ slots: Slot[] }>(`/api/services/${serviceId}/slots?date=${date}`).then((r) => setSlots(r.slots)).catch(() => setSlots([])); }, [serviceId, date]);
  if (!slots) return <p className="text-sm text-muted">{t("c.loading")}</p>;
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={t("svc.slot")}>
      {slots.map((s) => (
        <button key={s.slot} type="button" role="radio" aria-checked={value === s.slot} disabled={!s.available} onClick={() => onChange(s.slot)}
          className={`rounded-md border px-2 py-2 text-center disabled:cursor-not-allowed disabled:opacity-45 ${value === s.slot ? "border-accent bg-accent-soft font-bold text-accent" : "border-line hover:border-fg"}`}>
          <span dir="ltr" className="block tabular-nums">{s.slot}</span>
          <span className="block text-xs text-muted">{s.available ? t("svc.left", { n: s.left }) : t("svc.slot_full")}</span>
        </button>
      ))}
    </div>
  );
}

export function PhotoPicker({ value, onChange, max = 6, endpoint }: { value: string[]; onChange: (v: string[]) => void; max?: number; endpoint: string }) {
  const app = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const out = [...value];
    try {
      for (const f of [...files].slice(0, max - out.length)) {
        const form = new FormData(); form.append("file", f);
        const r = await api<{ url: string }>(endpoint, { form });
        out.push(r.url);
      }
    } catch (e) { app.toast(app.errorText(e), "err"); }
    onChange(out); setBusy(false);
    if (input.current) input.current.value = "";
  };
  return (
    <div className="flex flex-wrap gap-2">
      {value.map((u) => (
        <span key={u} className="relative size-20 overflow-hidden rounded-md border border-line">
          <img src={u} alt="" className="size-full object-cover" />
          <button type="button" className="absolute end-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white" aria-label={app.t("c.delete")} onClick={() => onChange(value.filter((x) => x !== u))}><Icon name="x" size={14} /></button>
        </span>
      ))}
      {value.length < max && (
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="grid size-20 place-items-center rounded-md border border-dashed border-line text-muted hover:border-fg">
          <Icon name={busy ? "refresh" : "camera"} size={22} />
        </button>
      )}
      <input ref={input} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => void upload(e.target.files)} />
    </div>
  );
}

export function ServicesPage() {
  const app = useApp();
  const { t, money } = app;
  const services = (app.data.services ?? []) as Service[];
  return (
    <div className="container-x py-5 md:py-7">
      <Breadcrumbs items={[{ name: t("nav.services") }]} />
      <h1 className="h-page mt-2">{t("svc.title")}</h1>
      <p className="mt-1 max-w-2xl text-muted">{t("svc.intro")}</p>
      {!services.length ? <Empty icon="cog" title={t("svc.none")} /> : (
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <li key={s.id} className="card flex flex-col p-5">
              <span className="grid size-12 place-items-center rounded-md bg-accent-soft text-accent"><Glyph name={s.icon} size={28} /></span>
              <h2 className="mt-3 text-lg font-bold">{s.name}</h2>
              <p className="mt-1 flex-1 text-sm text-muted">{s.description}</p>
              <p className="mt-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span><span className="text-muted">{t("svc.visit_fee")}: </span><b className="price">{money(s.visit_fee)}</b></span>
                <span className="text-muted">{t("svc.minutes", { n: s.duration_min })}</span>
              </p>
              <Link to={`/services/${s.slug}/book`} className="btn btn-primary btn-md mt-4 w-full">{t("svc.book")}</Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-5 max-w-2xl text-sm text-muted">{t("svc.fee_note")}</p>
    </div>
  );
}

export function BookServicePage() {
  const app = useApp();
  const { t, money, shell } = app;
  const service = app.data.service as Service;
  const [date, setDate] = useState(nextDays(1)[0]!);
  const form = useForm({ problem: "", photos: [] as string[], contact_name: shell.user?.name ?? "", contact_phone: shell.user?.phone ?? "", city: "", address: "", slot: "" });
  const submit = () => {
    if (!form.values.slot) { app.toast(t("svc.pick_slot"), "err"); return; }
    return form.submit(async (v) => {
      const r = await api<{ number: string }>("/api/bookings", { body: { ...v, service_type_id: service.id, date } });
      app.toast(t("svc.booked"));
      await app.navigate(`/account/bookings/${r.number}`);
    }, (e) => app.toast(app.errorText(e), "err"));
  };
  return (
    <div className="container-x py-5 md:py-7">
      <Breadcrumbs items={[{ name: t("nav.services"), to: "/services" }, { name: service.name }]} />
      <h1 className="h-page mt-2">{t("svc.book_title", { name: service.name })}</h1>
      <form className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
        <div className="space-y-5">
          <section className="card space-y-4 p-5">
            <Field label={t("svc.problem")} required error={form.errors.problem}><Textarea rows={4} maxLength={2000} placeholder={t("svc.problem_hint")} {...form.bind("problem")} /></Field>
            <Field label={t("svc.photos")} hint={t("svc.photos_hint")}><PhotoPicker value={form.values.photos} onChange={(v) => form.set("photos", v)} endpoint="/api/bookings/photos" /></Field>
          </section>
          <section className="card grid gap-4 p-5 sm:grid-cols-2">
            <h2 className="text-lg font-bold sm:col-span-2">{t("svc.where")}</h2>
            <Field label={t("f.name")} required error={form.errors.contact_name}><Input autoComplete="name" {...form.bind("contact_name")} /></Field>
            <Field label={t("f.phone")} required error={form.errors.contact_phone}><Input type="tel" dir="ltr" className="text-start" placeholder="05XXXXXXXX" autoComplete="tel" {...form.bind("contact_phone")} /></Field>
            <Field label={t("svc.city")} required error={form.errors.city}><Input autoComplete="address-level2" {...form.bind("city")} /></Field>
            <Field label={t("svc.address")} required error={form.errors.address} hint={t("svc.address_hint")}><Input autoComplete="street-address" {...form.bind("address")} /></Field>
          </section>
          <section className="card space-y-4 p-5">
            <h2 className="text-lg font-bold">{t("svc.when")}</h2>
            <DayPicker value={date} onChange={(d) => { setDate(d); form.set("slot", ""); }} />
            <SlotPicker serviceId={service.id} date={date} value={form.values.slot} onChange={(s) => form.set("slot", s)} />
          </section>
        </div>
        <aside className="card h-fit space-y-3 p-5 lg:sticky lg:top-24">
          <p className="flex items-center gap-3 font-bold"><Glyph name={service.icon} size={26} className="text-accent" />{service.name}</p>
          <p className="flex justify-between"><span className="text-muted">{t("svc.visit_fee")}</span><b className="price">{money(service.visit_fee)}</b></p>
          <p className="text-sm text-muted">{t("svc.fee_note")}</p>
          <Button type="submit" size="lg" className="w-full" busy={form.busy}>{t("svc.confirm")}</Button>
        </aside>
      </form>
    </div>
  );
}

export function AccountBookings() {
  const app = useApp();
  const { t, money, date } = app;
  const [res, setRes] = useState<{ upcoming: any[]; past: any[] } | null>(null);
  useEffect(() => { api<any>("/api/account/bookings").then(setRes).catch((e) => app.toast(app.errorText(e), "err")); }, []);
  const list = (rows: any[]) => (
    <ul className="space-y-3">
      {rows.map((b) => (
        <li key={b.number}>
          <Link to={`/account/bookings/${b.number}`} className="card flex items-center gap-4 p-4 hover:border-fg">
            <span className="grid size-12 shrink-0 place-items-center rounded-md bg-accent-soft text-accent"><Glyph name={b.service.icon} size={26} /></span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2"><b>{b.service.name}</b><StatusBadge status={b.status} prefix="bst" /></span>
              <span className="mt-1 block text-sm text-muted"><span dir="ltr">{b.number}</span> — {date(b.scheduled_date)} <span dir="ltr">{b.slot}</span></span>
            </span>
            <span className="price shrink-0">{money(b.total)}</span>
            <Icon name="chev" size={18} className="shrink-0 text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <AccountLayout title={t("account.bookings")} action={<Link to="/services" className="btn btn-primary btn-sm"><Icon name="plus" size={16} />{t("svc.book")}</Link>}>
      {!res ? <p className="text-muted">{t("c.loading")}</p> : !res.upcoming.length && !res.past.length ? (
        <Empty icon="cog" title={t("svc.no_bookings")} text={t("svc.no_bookings_text")}><Link to="/services" className="btn btn-primary btn-md">{t("svc.browse")}</Link></Empty>
      ) : (
        <div className="space-y-6">
          {!!res.upcoming.length && <section><h2 className="mb-3 font-bold">{t("svc.upcoming")}</h2>{list(res.upcoming)}</section>}
          {!!res.past.length && <section><h2 className="mb-3 font-bold">{t("svc.past")}</h2>{list(res.past)}</section>}
        </div>
      )}
    </AccountLayout>
  );
}

export function BookingTimeline({ events }: { events: { status: string; note: string | null; created_at: string }[] }) {
  const { t, date } = useApp();
  return (
    <ol className="relative space-y-4 border-s-2 border-line ps-5">
      {events.map((e, i) => (
        <li key={i} className="relative">
          <span className={`absolute -start-[1.6rem] top-1 size-3 rounded-full ${i === events.length - 1 ? "bg-accent" : "bg-line"}`} />
          <p className="font-semibold">{t(`bst.${e.status}`)}</p>
          <p className="text-sm text-muted">{date(e.created_at, true)}{e.note ? <> — <span dir="auto">{e.note}</span></> : null}</p>
        </li>
      ))}
    </ol>
  );
}

export function QuoteTable({ lines, visitFee }: { lines: any[]; visitFee: number }) {
  const { t, money } = useApp();
  return (
    <table className="w-full text-sm">
      <tbody className="divide-y divide-line">
        <tr><td className="py-2">{t("svc.visit_fee")}</td><td /><td className="py-2 text-end tabular-nums">{money(visitFee)}</td></tr>
        {lines.map((l, i) => (
          <tr key={i}><td className="py-2">{l.name} <span className="text-xs text-muted">({t(l.kind === "part" ? "svc.part" : "svc.labor")})</span></td><td className="py-2 text-center tabular-nums">×{l.qty}</td><td className="py-2 text-end tabular-nums">{money(l.qty * l.unit_price)}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

const vatOf = (total: number) => Math.round((total * 15) / 115);

export function AccountBooking() {
  const app = useApp();
  const { t, money, date } = app;
  const number = app.route.params.number!;
  const [b, setB] = useState<any>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState("");
  const [moving, setMoving] = useState(false);
  const [newDate, setNewDate] = useState(nextDays(2)[1]!);
  const [newSlot, setNewSlot] = useState("");
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const load = () => api<{ booking: any }>(`/api/account/bookings/${encodeURIComponent(number)}`).then((r) => setB(r.booking)).catch(() => setMissing(true));
  useEffect(() => { void load(); }, [number]);
  const act = async (name: string, path: string, body: object, ok: string) => {
    setBusy(name);
    try { await api(`/api/account/bookings/${encodeURIComponent(number)}/${path}`, { body }); app.toast(t(ok)); await load(); return true; }
    catch (e) { app.toast(app.errorText(e), "err"); return false; }
    finally { setBusy(""); }
  };
  if (missing) return <AccountLayout title={t("account.bookings")}><Empty icon="cog" title={t("nf.title")}><Link to="/account/bookings" className="btn btn-outline btn-md">{t("account.bookings")}</Link></Empty></AccountLayout>;
  if (!b) return <AccountLayout title={t("account.bookings")}><p className="text-muted">{t("c.loading")}</p></AccountLayout>;
  const early = ["requested", "assigned"].includes(b.status);
  const shownQuote = b.quote_status === "approved" ? b.quote_lines : [];
  return (
    <AccountLayout title={t("svc.booking", { number: b.number })} action={<StatusBadge status={b.status} prefix="bst" />}>
      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {b.quote_status === "sent" && (
            <section className="card border-warn/50 p-5" aria-live="polite">
              <h2 className="text-lg font-bold">{t("svc.quote")}</h2>
              <p className="mt-1 text-sm">{t("svc.quote_waiting")}</p>
              <div className="mt-3"><QuoteTable lines={b.quote_lines} visitFee={b.visit_fee} /></div>
              <p className="mt-2 flex justify-between font-bold"><span>{t("svc.total")}</span><span className="price">{money(b.visit_fee + b.quote_total)}</span></p>
              <div className="mt-4 flex gap-3">
                <Button busy={busy === "approve"} icon="check" onClick={() => act("approve", "quote", { approve: true }, "bst.quote_approved")}>{t("svc.approve")}</Button>
                <Button variant="outline" busy={busy === "reject"} onClick={() => act("reject", "quote", { approve: false }, "bst.quote_rejected")}>{t("svc.reject")}</Button>
              </div>
            </section>
          )}
          <section className="card space-y-3 p-5">
            <p className="flex items-center gap-3 text-lg font-bold"><Glyph name={b.service.icon} size={28} className="text-accent" />{b.service.name}</p>
            <p><span className="text-muted">{t("svc.when")}: </span>{date(b.scheduled_date)} <b dir="ltr">{b.slot}</b></p>
            <p><span className="text-muted">{t("svc.where")}: </span>{b.address}{app.lang === "en" ? ", " : "، "}{b.city}</p>
            <p className="whitespace-pre-line"><span className="text-muted">{t("svc.problem_label")}: </span>{b.problem}</p>
            {!!b.photos.length && <div className="flex flex-wrap gap-2">{b.photos.map((u: string) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="size-20 rounded-md border border-line object-cover" /></a>)}</div>}
            {early && (
              <div className="flex flex-wrap gap-3 pt-2">
                <Button variant="outline" size="sm" icon="clock" onClick={() => setMoving(true)}>{t("svc.reschedule")}</Button>
                <Button variant="ghost" size="sm" icon="x" busy={busy === "cancel"} onClick={() => { if (window.confirm(t("svc.cancel_confirm"))) void act("cancel", "cancel", {}, "svc.cancelled"); }}>{t("svc.cancel")}</Button>
              </div>
            )}
          </section>
          {b.status === "completed" && (
            <section className="card p-5">
              <h2 className="text-lg font-bold">{b.rating ? t("svc.your_rating") : t("svc.rate")}</h2>
              {b.rating ? (
                <p className="mt-2"><span className="text-xl text-warn" aria-label={`${b.rating}/5`}>{"★".repeat(b.rating)}{"☆".repeat(5 - b.rating)}</span>{b.review && <span className="mt-1 block text-sm">{b.review}</span>}</p>
              ) : (
                <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); if (rating) void act("rate", "rate", { rating, review }, "svc.rate_thanks"); }}>
                  <div className="flex gap-1" role="radiogroup" aria-label={t("svc.rate")}>
                    {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n}`} onClick={() => setRating(n)} className={`text-3xl ${n <= rating ? "text-warn" : "text-line"}`}>★</button>)}
                  </div>
                  <Field label={t("svc.review")}><Textarea rows={2} maxLength={1000} value={review} onChange={(e) => setReview(e.target.value)} /></Field>
                  <Button type="submit" disabled={!rating} busy={busy === "rate"}>{t("c.save")}</Button>
                </form>
              )}
            </section>
          )}
          {(!!b.before_photos.length || !!b.after_photos.length) && (
            <section className="card p-5">
              <h2 className="mb-3 text-lg font-bold">{t("svc.before_after")}</h2>
              <div className="flex flex-wrap gap-2">{[...b.before_photos, ...b.after_photos].map((u: string) => <img key={u} src={u} alt="" className="size-24 rounded-md border border-line object-cover" />)}</div>
            </section>
          )}
          <section className="card p-5">
            <h2 className="mb-4 text-lg font-bold">{t("svc.timeline")}</h2>
            <BookingTimeline events={b.events} />
          </section>
        </div>
        <aside className="space-y-5">
          <section className="card p-5">
            <h2 className="mb-2 font-bold">{t("svc.technician")}</h2>
            {b.technician ? (
              <div className="flex items-center justify-between gap-3">
                <span><b>{b.technician.name}</b><span dir="ltr" className="block text-sm text-muted select-all">{b.technician.phone}</span></span>
                <a href={`tel:${b.technician.phone}`} className="btn btn-outline btn-sm"><Icon name="phone" size={16} />{t("svc.call")}</a>
              </div>
            ) : <p className="text-sm text-muted">{t("svc.no_tech")}</p>}
          </section>
          <section className="card p-5">
            <h2 className="mb-2 font-bold">{t("svc.receipt")}</h2>
            <QuoteTable lines={shownQuote} visitFee={b.visit_fee} />
            <p className="mt-2 flex justify-between font-bold"><span>{t("svc.total")}</span><span className="price">{money(b.total)}</span></p>
            <p className="text-xs text-muted">{t("svc.vat_included", { vat: money(vatOf(b.total)) })}</p>
            <p className="mt-3 text-sm">{b.payment_status === "paid" ? <span className="badge badge-ok">{t("svc.paid_by", { method: t(`svc.pay.${b.payment_method}`) })}</span> : <span className="text-muted">{t("svc.unpaid")}</span>}</p>
          </section>
        </aside>
      </div>
      <Modal open={moving} onClose={() => setMoving(false)} title={t("svc.reschedule")} wide>
        <div className="space-y-4">
          <DayPicker value={newDate} onChange={(d) => { setNewDate(d); setNewSlot(""); }} />
          <SlotPicker serviceId={b.service.id} date={newDate} value={newSlot} onChange={setNewSlot} />
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setMoving(false)}>{t("c.cancel")}</Button>
            <Button disabled={!newSlot} busy={busy === "move"} onClick={async () => { if (await act("move", "reschedule", { date: newDate, slot: newSlot }, "svc.rescheduled")) setMoving(false); }}>{t("c.save")}</Button>
          </div>
        </div>
      </Modal>
    </AccountLayout>
  );
}
