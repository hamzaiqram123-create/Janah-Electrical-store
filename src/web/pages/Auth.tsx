import { useState, type ComponentProps, type ReactNode } from "react";
import { api } from "../lib/api";
import { useApp } from "../lib/ctx";
import { Icon } from "../ui/Icon";
import { Button, Field, Input, Link, useForm } from "../ui/kit";

function AuthCard({ title, intro, children, footer }: { title: string; intro?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="container-x flex justify-center py-8 md:py-14">
      <div className="w-full max-w-md">
        <div className="card p-6 md:p-8">
          <h1 className="text-2xl font-bold">{title}</h1>
          {intro && <p className="mt-1 text-muted">{intro}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <p className="mt-4 text-center">{footer}</p>}
      </div>
    </div>
  );
}

function useNext() {
  const app = useApp();
  const next = app.query.get("next");
  const safe = next && /^\/(ar|en|ur)(\/[\w\-./?=&%]*)?$/.test(next) ? next : app.href("/account");
  return { next: safe, qs: next ? `?next=${encodeURIComponent(next)}` : "" };
}

function PasswordInput(props: ComponentProps<typeof Input>) {
  const { t } = useApp();
  const [show, setShow] = useState(false);
  return (
    <span className="relative block" dir="ltr">
      <Input {...props} type={show ? "text" : "password"} className="pe-11" />
      <button type="button" className="absolute end-0 top-0 grid h-11 w-11 place-items-center text-muted hover:text-fg" onClick={() => setShow((v) => !v)} aria-label={t(show ? "auth.hide_pw" : "auth.show_pw")} aria-pressed={show}><Icon name="eye" size={18} /></button>
    </span>
  );
}

export function Login() {
  const app = useApp();
  const { t } = app;
  const { next, qs } = useNext();
  const form = useForm({ email: "", password: "" });
  const submit = () => form.submit(async (v) => {
    const r = await api<{ user: any }>("/api/auth/login", { body: v });
    app.toast(t("auth.welcome", { name: r.user?.name ?? "" }));
    // staff accounts go straight to the admin panel unless a destination was requested
    if (r.user?.kind === "admin" && !app.query.get("next")) { window.location.href = "/admin"; return; }
    await app.navigate(next);
  }, (e) => app.toast(app.errorText(e), "err"));
  return (
    <AuthCard title={t("auth.login")} intro={t("auth.login_intro")} footer={<>{t("auth.no_account")} <Link to={`/register${qs}`} className="font-semibold text-accent hover:underline">{t("auth.register")}</Link></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
        <Field label={t("f.email")} error={form.errors.email}><Input type="email" autoComplete="email" dir="ltr" className="text-start" required {...form.bind("email")} /></Field>
        <Field label={t("f.password")} error={form.errors.password}><PasswordInput autoComplete="current-password" required {...form.bind("password")} /></Field>
        <div className="text-end"><Link to="/forgot-password" className="text-sm font-semibold text-accent hover:underline">{t("auth.forgot")}</Link></div>
        <Button type="submit" size="lg" className="w-full" busy={form.busy}>{t("auth.login")}</Button>
      </form>
    </AuthCard>
  );
}

export function Register() {
  const app = useApp();
  const { t } = app;
  const { next, qs } = useNext();
  const form = useForm({ name: "", email: "", phone: "", password: "", marketing_opt_in: false, terms: false });
  const submit = () => {
    if (!form.values.terms) { form.setErrors({ terms: "terms_required" }); return; }
    return form.submit(async ({ terms: _t, ...v }) => {
      await api("/api/auth/register", { body: v });
      app.toast(t("auth.registered"));
      await app.navigate(next);
    }, (e) => app.toast(app.errorText(e), "err"));
  };
  return (
    <AuthCard title={t("auth.register")} intro={t("auth.register_intro")} footer={<>{t("auth.have_account")} <Link to={`/login${qs}`} className="font-semibold text-accent hover:underline">{t("auth.login")}</Link></>}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
        <Field label={t("f.name")} error={form.errors.name} required><Input autoComplete="name" {...form.bind("name")} /></Field>
        <Field label={t("f.email")} error={form.errors.email} required><Input type="email" autoComplete="email" dir="ltr" className="text-start" {...form.bind("email")} /></Field>
        <Field label={t("f.phone")} error={form.errors.phone} hint={t("f.phone_hint")} required><Input type="tel" autoComplete="tel" dir="ltr" className="text-start" placeholder="05XXXXXXXX" {...form.bind("phone")} /></Field>
        <Field label={t("f.password")} error={form.errors.password} hint={t("auth.pw_hint")} required><PasswordInput autoComplete="new-password" {...form.bind("password")} /></Field>
        <label className="flex items-start gap-2.5 text-sm"><input type="checkbox" className="check mt-0.5" checked={form.values.marketing_opt_in} onChange={(e) => form.set("marketing_opt_in", e.target.checked)} />{t("auth.marketing")}</label>
        <div>
          <label className="flex items-start gap-2.5 text-sm"><input type="checkbox" className="check mt-0.5" checked={form.values.terms} onChange={(e) => form.set("terms", e.target.checked)} />
            <span>{t("checkout.accept")} <a href={app.href("/page/terms")} target="_blank" rel="noopener" className="font-semibold text-accent underline">{t("foot.terms")}</a> {t("checkout.and")} <a href={app.href("/page/privacy")} target="_blank" rel="noopener" className="font-semibold text-accent underline">{t("foot.privacy")}</a></span></label>
          {form.errors.terms && <p className="mt-1 text-sm text-danger" role="alert">{t("v.terms_required")}</p>}
        </div>
        <Button type="submit" size="lg" className="w-full" busy={form.busy}>{t("auth.create_account")}</Button>
      </form>
    </AuthCard>
  );
}

export function Forgot() {
  const app = useApp();
  const { t } = app;
  const form = useForm({ email: "" });
  const [sent, setSent] = useState(false);
  const submit = () => form.submit(async (v) => { await api("/api/auth/forgot-password", { body: v }); setSent(true); }, (e) => app.toast(app.errorText(e), "err"));
  return (
    <AuthCard title={t("auth.forgot_title")} intro={sent ? undefined : t("auth.forgot_intro")} footer={<Link to="/login" className="font-semibold text-accent hover:underline">{t("auth.back_to_login")}</Link>}>
      {sent ? (
        <p className="flex items-start gap-3 rounded-md bg-ok-soft p-4" role="status"><Icon name="mail" className="mt-0.5 text-ok" />{t("auth.forgot_sent", { email: form.values.email })}</p>
      ) : (
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
          <Field label={t("f.email")} error={form.errors.email}><Input type="email" autoComplete="email" dir="ltr" className="text-start" {...form.bind("email")} /></Field>
          <Button type="submit" size="lg" className="w-full" busy={form.busy}>{t("auth.send_link")}</Button>
        </form>
      )}
    </AuthCard>
  );
}

export function Reset() {
  const app = useApp();
  const { t } = app;
  const token = app.query.get("token") ?? "";
  const form = useForm({ password: "", confirm: "" });
  const submit = () => {
    if (form.values.password !== form.values.confirm) { form.setErrors({ confirm: "password_mismatch" }); return; }
    return form.submit(async (v) => {
      await api("/api/auth/reset-password", { body: { token, password: v.password } });
      app.toast(t("auth.reset_done"));
      await app.navigate(app.href("/login"));
    }, (e) => app.toast(app.errorText(e), "err"));
  };
  if (token.length < 20) {
    return <AuthCard title={t("auth.reset_title")}><p className="rounded-md bg-danger-soft p-4">{t("err.reset_token_invalid")}</p><Link to="/forgot-password" className="btn btn-outline btn-md mt-4 w-full">{t("auth.send_link")}</Link></AuthCard>;
  }
  return (
    <AuthCard title={t("auth.reset_title")} intro={t("auth.reset_intro")}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
        <Field label={t("auth.new_password")} error={form.errors.password} hint={t("auth.pw_hint")}><PasswordInput autoComplete="new-password" {...form.bind("password")} /></Field>
        <Field label={t("auth.confirm_password")} error={form.errors.confirm}><PasswordInput autoComplete="new-password" {...form.bind("confirm")} /></Field>
        <Button type="submit" size="lg" className="w-full" busy={form.busy}>{t("auth.save_password")}</Button>
      </form>
    </AuthCard>
  );
}
