import { useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { useApp } from "../lib/ctx";
import { Icon } from "../ui/Icon";
import { Breadcrumbs, Button, Empty, Field, Input, Link, Textarea, useForm } from "../ui/kit";

export function Contact() {
  const app = useApp();
  const { t, shell } = app;
  const s = shell.settings.store;
  const u = shell.user;
  const form = useForm({ name: u?.name ?? "", email: u?.email ?? "", phone: u?.phone ?? "", subject: "", order_number: "", message: "", website: "" });
  const [ticket, setTicket] = useState<string | null>(null);
  const submit = () => form.submit(async (v) => {
    const r = await api<{ ticket: string }>("/api/contact", { body: v });
    setTicket(r.ticket);
    window.scrollTo({ top: 0 });
  }, (e) => app.toast(app.errorText(e), "err"));
  const wa = s.whatsapp.replace(/[^\d]/g, "");
  return (
    <div className="container-x py-5 md:py-7">
      <Breadcrumbs items={[{ name: t("contact.title") }]} />
      <h1 className="h-page">{t("contact.title")}</h1>
      <p className="mt-1 mb-6 max-w-[65ch] text-muted">{t("contact.intro")}</p>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="card p-4 md:p-6">
          {ticket ? (
            <div role="status" className="py-6 text-center">
              <span className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-ok text-white"><Icon name="check" size={28} /></span>
              <h2 className="text-xl font-bold">{t("contact.sent")}</h2>
              <p className="mt-2 text-muted">{t("contact.sent_text", { ticket })}</p>
              <Link to="/" className="btn btn-outline btn-md mt-5">{t("nav.home")}</Link>
            </div>
          ) : (
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
              <Field label={t("f.name")} required error={form.errors.name}><Input autoComplete="name" {...form.bind("name")} /></Field>
              <Field label={t("f.email")} required error={form.errors.email}><Input type="email" autoComplete="email" dir="ltr" className="text-start" {...form.bind("email")} /></Field>
              <Field label={t("f.phone")} error={form.errors.phone}><Input type="tel" autoComplete="tel" dir="ltr" className="text-start" {...form.bind("phone")} /></Field>
              <Field label={t("contact.order_no")} error={form.errors.order_number} hint={t("c.optional")}><Input dir="ltr" className="text-start uppercase" {...form.bind("order_number")} /></Field>
              <Field label={t("contact.subject")} required error={form.errors.subject} className="sm:col-span-2"><Input maxLength={160} {...form.bind("subject")} /></Field>
              <Field label={t("contact.message")} required error={form.errors.message} className="sm:col-span-2"><Textarea rows={6} maxLength={4000} {...form.bind("message")} /></Field>
              {/* honeypot: real visitors never see or fill this field */}
              <div className="hidden" aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={form.values.website} onChange={(e) => form.set("website", e.target.value)} /></label></div>
              <div className="sm:col-span-2"><Button type="submit" size="lg" busy={form.busy} icon="mail">{t("contact.send")}</Button></div>
            </form>
          )}
        </div>
        <aside className="card h-fit space-y-4 p-5">
          <h2 className="text-lg font-bold">{s.name}</h2>
          <ul className="space-y-3 text-sm">
            {s.phone && <li><a href={`tel:${s.phone}`} className="flex items-center gap-3 hover:text-accent"><Icon name="phone" className="text-accent" /><span dir="ltr">{s.phone}</span></a></li>}
            {wa && <li><a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 hover:text-accent"><Icon name="whatsapp" className="text-accent" />{t("c.whatsapp")}</a></li>}
            {s.email && <li><a href={`mailto:${s.email}`} className="flex items-center gap-3 hover:text-accent"><Icon name="mail" className="text-accent" /><span dir="ltr">{s.email}</span></a></li>}
            {s.address && <li className="flex items-start gap-3"><Icon name="pin" className="mt-0.5 text-accent" />{s.address}</li>}
            {s.working_hours && <li className="flex items-start gap-3"><Icon name="clock" className="mt-0.5 text-accent" />{s.working_hours}</li>}
          </ul>
          <p className="border-t border-line pt-4 text-sm text-muted">{t("contact.faq_hint")} <Link to="/faq" className="font-semibold text-accent hover:underline">{t("nav.faq")}</Link></p>
        </aside>
      </div>
    </div>
  );
}

export function Faq() {
  const { t, data } = useApp();
  const faqs = (data.faqs ?? []) as { id: number; question: string; answer: string }[];
  return (
    <div className="container-x max-w-3xl py-5 md:py-7">
      <Breadcrumbs items={[{ name: t("faq.title") }]} />
      <h1 className="h-page mb-5">{t("faq.title")}</h1>
      {faqs.length ? (
        <div className="card divide-y divide-line">
          {faqs.map((f) => (
            <details key={f.id} className="group px-4 md:px-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold [&::-webkit-details-marker]:hidden">
                {f.question}<Icon name="down" size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
              </summary>
              <p className="max-w-[70ch] pb-4 leading-7 whitespace-pre-line text-muted">{f.answer}</p>
            </details>
          ))}
        </div>
      ) : <Empty icon="help" title={t("faq.empty")} />}
      <p className="mt-6 text-muted">{t("faq.more")} <Link to="/contact" className="font-semibold text-accent hover:underline">{t("nav.contact")}</Link></p>
    </div>
  );
}

/** Renders the small formatting subset used by the content pages: "## " / "### " headings, "- " lists and paragraphs. Output is plain React nodes, never raw HTML. */
function renderBody(body: string): ReactNode[] {
  const out: ReactNode[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (list.length) { out.push(<ul key={out.length}>{list.map((x, i) => <li key={i}>{x}</li>)}</ul>); list = []; }
    if (para.length) { out.push(<p key={out.length}>{para.join(" ")}</p>); para = []; }
  };
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (line.startsWith("### ")) { flush(); out.push(<h3 key={out.length}>{line.slice(4)}</h3>); }
    else if (line.startsWith("## ")) { flush(); out.push(<h2 key={out.length}>{line.slice(3)}</h2>); }
    else if (/^[-•]\s+/.test(line)) { if (para.length) flush(); list.push(line.replace(/^[-•]\s+/, "")); }
    else { if (list.length) flush(); para.push(line); }
  }
  flush();
  return out;
}

export function StaticPage() {
  const { t, data, date } = useApp();
  const page = data.page;
  return (
    <div className="container-x py-5 md:py-7">
      <Breadcrumbs items={[{ name: page.title }]} />
      <article>
        <h1 className="h-page">{page.title}</h1>
        <p className="mt-1 mb-6 text-sm text-muted">{t("page.updated", { date: date(page.updated_at) })}</p>
        <div className="prose-page card p-5 md:p-8">{renderBody(page.body)}</div>
      </article>
    </div>
  );
}

export function NotFound() {
  const { t } = useApp();
  return (
    <div className="container-x py-8">
      <Empty icon="search" title={t("nf.title")} text={t("nf.text")}>
        <Link to="/" className="btn btn-primary btn-md">{t("nav.home")}</Link>
        <Link to="/products" className="btn btn-outline btn-md">{t("nav.all_products")}</Link>
      </Empty>
    </div>
  );
}
