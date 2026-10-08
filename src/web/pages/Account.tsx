import { useEffect, useMemo, useState, type ReactNode } from "react";
import { clearCachedPages } from "../lib/pwa";
import { LANG_NAMES, LANGS } from "../../shared/constants";
import { api } from "../lib/api";
import { useApp } from "../lib/ctx";
import { ProductGrid, type Card } from "../parts/Product";
import { Icon } from "../ui/Icon";
import { Button, Empty, Field, Input, Link, Modal, Pagination, ProductImage, Select, StatusBadge, Textarea, useForm } from "../ui/kit";

function AccountLayout({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  const app = useApp();
  const { t, route, shell } = app;
  const links: [to: string, icon: string, label: string, names: string[]][] = [
    ["/account", "user", t("account.profile"), ["account"]],
    ["/account/orders", "box", t("account.orders"), ["account_orders"]],
    ["/account/addresses", "pin", t("account.addresses"), ["account_addresses"]],
    ["/account/wishlist", "heart", t("account.wishlist"), ["account_wishlist"]],
    ["/account/tickets", "chat", t("account.tickets"), ["account_tickets", "account_ticket"]],
  ];
  const logout = async () => {
    await api("/api/auth/logout", { body: {} }).catch(() => {});
    clearCachedPages();
    window.location.href = app.href("/");
  };
  return (
    <div className="container-x py-5 md:py-7">
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside>
          <div className="card overflow-hidden">
            <div className="border-b border-line p-4">
              <p className="truncate font-bold">{shell.user?.name}</p>
              <p className="truncate text-sm text-muted" dir="ltr" style={{ textAlign: "start" }}>{shell.user?.email}</p>
            </div>
            <nav className="flex gap-1 overflow-x-auto p-2 lg:flex-col" aria-label={t("account.title")}>
              {links.map(([to, icon, label, names]) => {
                const on = names.includes(route.name);
                return <Link key={to} to={to} aria-current={on ? "page" : undefined} className={`flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2.5 text-sm whitespace-nowrap ${on ? "bg-accent-soft font-bold text-accent" : "hover:bg-surface-2"}`}><Icon name={icon} size={18} />{label}</Link>;
              })}
              {shell.user?.is_admin && <a href="/admin" className="flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2.5 text-sm whitespace-nowrap hover:bg-surface-2"><Icon name="cog" size={18} />{t("account.admin")}</a>}
              <button type="button" onClick={logout} className="flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2.5 text-start text-sm whitespace-nowrap text-danger hover:bg-danger-soft"><Icon name="logout" size={18} />{t("account.logout")}</button>
            </nav>
          </div>
        </aside>
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h1 className="h-page">{title}</h1>{action}</div>
          {children}
        </section>
      </div>
    </div>
  );
}

export function AccountHome() {
  const app = useApp();
  const { t, shell } = app;
  const u = shell.user!;
  const profile = useForm({ name: u.name, phone: u.phone ?? "", locale: app.lang as string });
  const pw = useForm({ current: "", password: "", confirm: "" });
  const saveProfile = () => profile.submit(async (v) => {
    const r = await api<{ user: any }>("/api/account/profile", { method: "PATCH", body: v });
    app.setUser({ ...u, name: r.user.name, phone: r.user.phone });
    app.toast(t("account.saved"));
  }, (e) => app.toast(app.errorText(e), "err"));
  const savePw = () => {
    if (pw.values.password !== pw.values.confirm) { pw.setErrors({ confirm: "password_mismatch" }); return; }
    return pw.submit(async (v) => {
      await api("/api/account/password", { body: { current: v.current, password: v.password } });
      pw.setValues({ current: "", password: "", confirm: "" });
      app.toast(t("account.pw_changed"));
    }, (e) => app.toast(app.errorText(e), "err"));
  };
  return (
    <AccountLayout title={t("account.profile")}>
      <div className="grid gap-5 xl:grid-cols-2">
        <form className="card space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); void saveProfile(); }} noValidate>
          <h2 className="text-lg font-bold">{t("account.details")}</h2>
          <Field label={t("f.email")}><Input value={u.email} disabled dir="ltr" className="text-start opacity-70" /></Field>
          <Field label={t("f.name")} error={profile.errors.name} required><Input autoComplete="name" {...profile.bind("name")} /></Field>
          <Field label={t("f.phone")} error={profile.errors.phone} required><Input type="tel" dir="ltr" className="text-start" autoComplete="tel" {...profile.bind("phone")} /></Field>
          <Field label={t("account.language")} hint={t("account.language_hint")}><Select {...profile.bind("locale")}>{LANGS.map((l) => <option key={l} value={l}>{LANG_NAMES[l]}</option>)}</Select></Field>
          <Button type="submit" busy={profile.busy}>{t("c.save")}</Button>
        </form>
        <form className="card h-fit space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); void savePw(); }} noValidate>
          <h2 className="text-lg font-bold">{t("account.change_pw")}</h2>
          <Field label={t("account.current_pw")} error={pw.errors.current}><Input type="password" dir="ltr" className="text-start" autoComplete="current-password" {...pw.bind("current")} /></Field>
          <Field label={t("auth.new_password")} error={pw.errors.password} hint={t("auth.pw_hint")}><Input type="password" dir="ltr" className="text-start" autoComplete="new-password" {...pw.bind("password")} /></Field>
          <Field label={t("auth.confirm_password")} error={pw.errors.confirm}><Input type="password" dir="ltr" className="text-start" autoComplete="new-password" {...pw.bind("confirm")} /></Field>
          <Button type="submit" variant="outline" busy={pw.busy}>{t("auth.save_password")}</Button>
        </form>
      </div>
      <DeleteAccount />
    </AccountLayout>
  );
}

/** Self-service account deletion (app-store and PDPL requirement). */
function DeleteAccount() {
  const app = useApp();
  const { t } = app;
  const [open, setOpen] = useState(false);
  const form = useForm({ password: "" });
  const run = () => form.submit(async (v) => {
    await api("/api/account/delete", { body: v });
    clearCachedPages();
    app.toast(t("account.deleted"));
    setTimeout(() => { window.location.href = app.href("/"); }, 900);
  }, (e) => app.toast(app.errorText(e), "err"));
  return (
    <section className="card mt-5 border-danger/40 p-5">
      <h2 className="text-lg font-bold">{t("account.delete_title")}</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">{t("account.delete_text")}</p>
      <Button variant="danger" className="mt-4" icon="trash" onClick={() => { form.setValues({ password: "" }); setOpen(true); }}>{t("account.delete_button")}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("account.delete_title")}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void run(); }} noValidate>
          <p className="text-sm">{t("account.delete_confirm")}</p>
          <Field label={t("f.password")} error={form.errors.password}><Input type="password" dir="ltr" className="text-start" autoComplete="current-password" autoFocus {...form.bind("password")} /></Field>
          <div className="flex justify-end gap-3"><Button variant="ghost" onClick={() => setOpen(false)}>{t("c.cancel")}</Button><Button type="submit" variant="danger" busy={form.busy}>{t("account.delete_button")}</Button></div>
        </form>
      </Modal>
    </section>
  );
}

export function AccountOrders() {
  const app = useApp();
  const { t, money, date } = app;
  const [page, setPage] = useState(1);
  const [res, setRes] = useState<{ orders: any[]; pages: number; total: number } | null>(null);
  useEffect(() => { api<any>(`/api/account/orders?page=${page}`).then(setRes).catch((e) => app.toast(app.errorText(e), "err")); }, [page]);
  return (
    <AccountLayout title={t("account.orders")}>
      {!res ? <p className="text-muted">{t("c.loading")}</p> : !res.orders.length ? (
        <Empty icon="box" title={t("account.no_orders")} text={t("account.no_orders_text")}><Link to="/products" className="btn btn-primary btn-md">{t("cart.start")}</Link></Empty>
      ) : (
        <>
          <ul className="space-y-3">
            {res.orders.map((o) => (
              <li key={o.number}>
                <Link to={`/order/${o.number}`} className="card flex items-center gap-4 p-4 hover:border-fg">
                  <span className="hidden size-16 shrink-0 overflow-hidden rounded border border-line bg-white sm:block"><ProductImage src={o.image} alt="" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2"><b dir="ltr" className="tabular-nums">{o.number}</b><StatusBadge status={o.status} /></span>
                    <span className="mt-1 block text-sm text-muted">{date(o.created_at)} — {t("cart.items_n", { n: o.item_count })}</span>
                  </span>
                  <span className="price shrink-0">{money(o.total)}</span>
                  <Icon name="chev" size={18} className="shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
          <Pagination page={page} pages={res.pages} onPage={setPage} />
        </>
      )}
    </AccountLayout>
  );
}

const EMPTY_ADDR = { label: "", recipient_name: "", phone: "", region_id: "", city_id: "", district: "", street: "", building_no: "", postal_code: "", short_address: "", notes: "", is_default: false };

export function AccountAddresses() {
  const app = useApp();
  const { t, shell } = app;
  const regions = (app.data.regions ?? []) as { id: number; name: string; cities: { id: number; name: string }[] }[];
  const [list, setList] = useState<any[] | null>(null);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const form = useForm({ ...EMPTY_ADDR });
  const load = () => api<{ addresses: any[] }>("/api/account/addresses").then((r) => setList(r.addresses)).catch((e) => app.toast(app.errorText(e), "err"));
  useEffect(() => { void load(); }, []);
  const cities = useMemo(() => regions.find((r) => String(r.id) === String(form.values.region_id))?.cities ?? [], [regions, form.values.region_id]);
  const open = (a?: any) => {
    form.setErrors({});
    if (a) {
      const region = regions.find((r) => r.cities.some((c) => c.id === a.city_id));
      form.setValues({ label: a.label ?? "", recipient_name: a.recipient_name, phone: a.phone, region_id: String(region?.id ?? ""), city_id: String(a.city_id), district: a.district, street: a.street, building_no: a.building_no ?? "", postal_code: a.postal_code ?? "", short_address: a.short_address ?? "", notes: a.notes ?? "", is_default: a.is_default });
      setEditing(a.id);
    } else {
      form.setValues({ ...EMPTY_ADDR, recipient_name: shell.user?.name ?? "", phone: shell.user?.phone ?? "" });
      setEditing("new");
    }
  };
  const save = () => form.submit(async ({ region_id: _r, ...v }) => {
    const body = { ...v, city_id: Number(v.city_id) || 0 };
    if (editing === "new") await api("/api/account/addresses", { body });
    else await api(`/api/account/addresses/${editing}`, { method: "PUT", body });
    setEditing(null); app.toast(t("account.saved")); await load();
  }, (e) => app.toast(app.errorText(e), "err"));
  const remove = async (id: number) => {
    if (!window.confirm(t("addr.delete_confirm"))) return;
    await api(`/api/account/addresses/${id}`, { method: "DELETE" }).catch((e) => app.toast(app.errorText(e), "err"));
    await load();
  };
  const sep = app.lang === "en" ? ", " : "، ";
  return (
    <AccountLayout title={t("account.addresses")} action={<Button icon="plus" size="sm" onClick={() => open()}>{t("addr.new")}</Button>}>
      {!list ? <p className="text-muted">{t("c.loading")}</p> : !list.length ? (
        <Empty icon="pin" title={t("addr.none")} text={t("addr.none_text")}><Button icon="plus" onClick={() => open()}>{t("addr.new")}</Button></Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((a) => (
            <li key={a.id} className="card flex flex-col p-4">
              <p className="flex items-center gap-2 font-bold">{a.label || a.recipient_name}{a.is_default && <span className="badge badge-info">{t("addr.default")}</span>}</p>
              <p className="mt-1 text-sm">{a.recipient_name} <span dir="ltr" className="text-muted">{a.phone}</span></p>
              <p className="text-sm text-muted">{[a.district, a.street, a.building_no].filter(Boolean).join(sep)}</p>
              <p className="text-sm text-muted">{[a.city, a.postal_code].filter(Boolean).join(sep)}</p>
              <div className="mt-auto flex gap-2 pt-3">
                <Button variant="outline" size="sm" icon="edit" onClick={() => open(a)}>{t("c.edit")}</Button>
                <Button variant="ghost" size="sm" icon="trash" onClick={() => remove(a.id)}>{t("c.delete")}</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? t("addr.new") : t("addr.edit")} wide>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
          <Field label={t("addr.label")} error={form.errors.label} hint={t("addr.label_hint")}><Input maxLength={40} {...form.bind("label")} /></Field>
          <Field label={t("addr.recipient")} required error={form.errors.recipient_name}><Input autoComplete="name" {...form.bind("recipient_name")} /></Field>
          <Field label={t("f.phone")} required error={form.errors.phone}><Input type="tel" dir="ltr" className="text-start" {...form.bind("phone")} /></Field>
          <Field label={t("addr.region")} required><Select value={form.values.region_id} onChange={(e) => form.setValues((v) => ({ ...v, region_id: e.target.value, city_id: "" }))}><option value="">{t("addr.choose_region")}</option>{regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
          <Field label={t("addr.city")} required error={form.errors.city_id}><Select disabled={!form.values.region_id} {...form.bind("city_id")}><option value="">{t("addr.choose_city")}</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label={t("addr.district")} required error={form.errors.district}><Input {...form.bind("district")} /></Field>
          <Field label={t("addr.street")} required error={form.errors.street}><Input {...form.bind("street")} /></Field>
          <Field label={t("addr.building")} error={form.errors.building_no}><Input dir="ltr" className="text-start" {...form.bind("building_no")} /></Field>
          <Field label={t("addr.postal")} error={form.errors.postal_code}><Input dir="ltr" className="text-start" inputMode="numeric" maxLength={5} {...form.bind("postal_code")} /></Field>
          <Field label={t("addr.short")} error={form.errors.short_address} hint={t("addr.short_hint")}><Input dir="ltr" className="text-start uppercase" maxLength={8} {...form.bind("short_address")} /></Field>
          <Field label={t("addr.notes")} error={form.errors.notes} className="sm:col-span-2"><Input maxLength={300} {...form.bind("notes")} /></Field>
          <label className="flex items-center gap-2.5 sm:col-span-2"><input type="checkbox" className="check" checked={form.values.is_default} onChange={(e) => form.set("is_default", e.target.checked)} />{t("addr.make_default")}</label>
          <div className="flex justify-end gap-3 sm:col-span-2"><Button variant="ghost" onClick={() => setEditing(null)}>{t("c.cancel")}</Button><Button type="submit" busy={form.busy}>{t("c.save")}</Button></div>
        </form>
      </Modal>
    </AccountLayout>
  );
}

export function AccountWishlist() {
  const app = useApp();
  const { t } = app;
  const [items, setItems] = useState<Card[] | null>(null);
  useEffect(() => { api<{ items: Card[] }>("/api/account/wishlist").then((r) => setItems(r.items)).catch((e) => app.toast(app.errorText(e), "err")); }, []);
  return (
    <AccountLayout title={t("account.wishlist")}>
      {!items ? <p className="text-muted">{t("c.loading")}</p> : !items.length
        ? <Empty icon="heart" title={t("wish.empty")} text={t("wish.empty_text")}><Link to="/products" className="btn btn-primary btn-md">{t("cart.start")}</Link></Empty>
        : <ProductGrid items={items} dense />}
    </AccountLayout>
  );
}

export function AccountTickets() {
  const app = useApp();
  const { t, date } = app;
  const [list, setList] = useState<any[] | null>(null);
  const [open, setOpen] = useState(false);
  const form = useForm({ subject: "", order_number: "", message: "" });
  const load = () => api<{ tickets: any[] }>("/api/account/tickets").then((r) => setList(r.tickets)).catch((e) => app.toast(app.errorText(e), "err"));
  useEffect(() => { void load(); }, []);
  const submit = () => form.submit(async (v) => {
    await api("/api/account/tickets", { body: v });
    form.setValues({ subject: "", order_number: "", message: "" }); setOpen(false); app.toast(t("ticket.created")); await load();
  }, (e) => app.toast(app.errorText(e), "err"));
  return (
    <AccountLayout title={t("account.tickets")} action={<Button icon="plus" size="sm" onClick={() => setOpen(true)}>{t("ticket.new")}</Button>}>
      {!list ? <p className="text-muted">{t("c.loading")}</p> : !list.length ? (
        <Empty icon="chat" title={t("ticket.none")} text={t("ticket.none_text")}><Button icon="plus" onClick={() => setOpen(true)}>{t("ticket.new")}</Button></Empty>
      ) : (
        <ul className="card divide-y divide-line">
          {list.map((k) => (
            <li key={k.number}>
              <Link to={`/account/tickets/${k.number}`} className="flex items-center gap-3 p-4 hover:bg-surface-2">
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{k.subject}</span><span className="text-sm text-muted"><span dir="ltr">{k.number}</span> — {date(k.updated_at, true)}</span></span>
                <StatusBadge status={k.status} prefix="tstatus" /><Icon name="chev" size={18} className="text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={t("ticket.new")}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
          <Field label={t("contact.subject")} required error={form.errors.subject}><Input maxLength={160} {...form.bind("subject")} /></Field>
          <Field label={t("contact.order_no")} hint={t("c.optional")} error={form.errors.order_number}><Input dir="ltr" className="text-start uppercase" {...form.bind("order_number")} /></Field>
          <Field label={t("contact.message")} required error={form.errors.message}><Textarea rows={5} maxLength={4000} {...form.bind("message")} /></Field>
          <Button type="submit" className="w-full" busy={form.busy}>{t("contact.send")}</Button>
        </form>
      </Modal>
    </AccountLayout>
  );
}

export function AccountTicket() {
  const app = useApp();
  const { t, date } = app;
  const number = app.route.params.number!;
  const [res, setRes] = useState<{ ticket: any; messages: any[] } | null>(null);
  const [missing, setMissing] = useState(false);
  const form = useForm({ message: "" });
  const load = () => api<any>(`/api/account/tickets/${encodeURIComponent(number)}`).then(setRes).catch(() => setMissing(true));
  useEffect(() => { void load(); }, [number]);
  const send = () => form.submit(async (v) => {
    await api(`/api/account/tickets/${encodeURIComponent(number)}/messages`, { body: v });
    form.setValues({ message: "" }); await load();
  }, (e) => app.toast(app.errorText(e), "err"));
  return (
    <AccountLayout title={res?.ticket.subject ?? t("account.tickets")} action={res && <StatusBadge status={res.ticket.status} prefix="tstatus" />}>
      {missing ? <Empty icon="chat" title={t("nf.title")}><Link to="/account/tickets" className="btn btn-outline btn-md">{t("account.tickets")}</Link></Empty> : !res ? <p className="text-muted">{t("c.loading")}</p> : (
        <>
          <p className="mb-4 text-sm text-muted"><span dir="ltr">{res.ticket.number}</span>{res.ticket.order_number ? <> — {t("order.title")} <span dir="ltr">{res.ticket.order_number}</span></> : null}</p>
          <ol className="space-y-3">
            {res.messages.map((m, i) => (
              <li key={i} className={`max-w-[85%] rounded-md border p-3 ${m.author === "staff" ? "border-info/30 bg-info-soft" : "ms-auto border-line bg-surface"}`}>
                <p className="mb-1 text-xs font-semibold text-muted">{m.author === "staff" ? t("ticket.staff") : t("ticket.you")} — {date(m.created_at, true)}</p>
                <p className="whitespace-pre-line">{m.body}</p>
              </li>
            ))}
          </ol>
          {res.ticket.status === "closed" ? <p className="mt-5 rounded-md bg-surface-2 p-4 text-muted">{t("ticket.closed_note")}</p> : (
            <form className="card mt-5 space-y-3 p-4" onSubmit={(e) => { e.preventDefault(); void send(); }} noValidate>
              <Field label={t("ticket.reply")} error={form.errors.message}><Textarea rows={3} maxLength={4000} {...form.bind("message")} /></Field>
              <Button type="submit" busy={form.busy} icon="mail">{t("contact.send")}</Button>
            </form>
          )}
        </>
      )}
    </AccountLayout>
  );
}
