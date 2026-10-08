import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { dirOf, isLang, LANG_NAMES, LANGS, type Lang } from "../shared/constants";
import { makeT, type Dict } from "../shared/i18n/format";
import { api, ApiError, currentLang } from "../web/lib/api";
import { Ctx, formatDate, formatMoney, useApp, type AppCtx, type Toast } from "../web/lib/ctx";
import { Icon } from "../web/ui/Icon";
import { Button, Field, Input, useForm } from "../web/ui/kit";
import { AdminContext, type AdminCtx, type Me } from "./core";
import { RESOURCES, ResourcePage } from "./resource";
import Dashboard from "./pages/Dashboard";
import { OrderDetail, OrdersList } from "./pages/Orders";
import Pos from "./pages/Pos";
import { ProductForm, ProductsList } from "./pages/Products";
import { InventoryHistory, InventoryPage, LabelsPage } from "./pages/Inventory";
import { CustomerDetail, CustomersList, TicketsPage, UsersPage } from "./pages/People";
import { InvoicesPage, PaymentsPage, ReturnsPage, ReviewsPage } from "./pages/Sales";
import Reports from "./pages/Reports";
import { LogsPage, NotificationsPage, SettingsPage } from "./pages/Settings";

interface RouteDef { re: RegExp; page: ComponentType<{ params: string[] }>; perm?: string }
const res = (key: string): ComponentType<{ params: string[] }> => function Res() { const { t } = useApp(); return <ResourcePage def={useMemo(() => RESOURCES[key]!(t), [t])} />; };
const ROUTES: RouteDef[] = [
  { re: /^\/admin$/, page: Dashboard, perm: "dashboard.view" },
  { re: /^\/admin\/orders$/, page: OrdersList, perm: "orders.view" },
  { re: /^\/admin\/orders\/(\d+)$/, page: OrderDetail, perm: "orders.view" },
  { re: /^\/admin\/pos$/, page: Pos, perm: "pos.use" },
  { re: /^\/admin\/products$/, page: ProductsList, perm: "products.view" },
  { re: /^\/admin\/products\/(new|\d+)$/, page: ProductForm, perm: "products.view" },
  { re: /^\/admin\/categories$/, page: res("categories"), perm: "products.view" },
  { re: /^\/admin\/brands$/, page: res("brands"), perm: "products.view" },
  { re: /^\/admin\/inventory$/, page: InventoryPage, perm: "inventory.view" },
  { re: /^\/admin\/inventory\/history$/, page: InventoryHistory, perm: "inventory.view" },
  { re: /^\/admin\/labels$/, page: LabelsPage, perm: "products.view" },
  { re: /^\/admin\/customers$/, page: CustomersList, perm: "customers.view" },
  { re: /^\/admin\/customers\/(\d+)$/, page: CustomerDetail, perm: "customers.view" },
  { re: /^\/admin\/coupons$/, page: res("coupons"), perm: "promotions.manage" },
  { re: /^\/admin\/discounts$/, page: res("discounts"), perm: "promotions.manage" },
  { re: /^\/admin\/reviews$/, page: ReviewsPage, perm: "reviews.manage" },
  { re: /^\/admin\/payments$/, page: PaymentsPage, perm: "payments.view" },
  { re: /^\/admin\/shipping$/, page: res("shipping_methods"), perm: "shipping.manage" },
  { re: /^\/admin\/shipping\/rates$/, page: res("shipping_rates"), perm: "shipping.manage" },
  { re: /^\/admin\/shipping\/cities$/, page: res("cities"), perm: "shipping.manage" },
  { re: /^\/admin\/returns$/, page: ReturnsPage, perm: "returns.manage" },
  { re: /^\/admin\/invoices$/, page: InvoicesPage, perm: "invoices.view" },
  { re: /^\/admin\/reports$/, page: Reports, perm: "reports.view" },
  { re: /^\/admin\/settings$/, page: SettingsPage, perm: "settings.manage" },
  { re: /^\/admin\/banners$/, page: res("banners"), perm: "content.manage" },
  { re: /^\/admin\/homepage$/, page: res("homepage"), perm: "content.manage" },
  { re: /^\/admin\/pages$/, page: res("pages"), perm: "content.manage" },
  { re: /^\/admin\/faqs$/, page: res("faqs"), perm: "content.manage" },
  { re: /^\/admin\/users$/, page: UsersPage, perm: "users.manage" },
  { re: /^\/admin\/roles$/, page: res("roles"), perm: "users.manage" },
  { re: /^\/admin\/logs$/, page: LogsPage, perm: "logs.view" },
  { re: /^\/admin\/notifications$/, page: NotificationsPage, perm: "dashboard.view" },
  { re: /^\/admin\/tickets$/, page: TicketsPage, perm: "tickets.manage" },
];

const NAV: { group: string; items: [to: string, icon: string, label: string, perm: string][] }[] = [
  { group: "a.g.sales", items: [["", "chart", "a.nav.dashboard", "dashboard.view"], ["/orders", "box", "a.nav.orders", "orders.view"], ["/pos", "barcode", "a.nav.pos", "pos.use"], ["/returns", "undo", "a.nav.returns", "returns.manage"], ["/payments", "card", "a.nav.payments", "payments.view"], ["/invoices", "receipt", "a.nav.invoices", "invoices.view"]] },
  { group: "a.g.catalog", items: [["/products", "tag", "a.nav.products", "products.view"], ["/categories", "grid", "a.nav.categories", "products.view"], ["/brands", "layers", "a.nav.brands", "products.view"], ["/inventory", "list", "a.nav.inventory", "inventory.view"], ["/labels", "print", "a.nav.labels", "products.view"]] },
  { group: "a.g.customers", items: [["/customers", "users", "a.nav.customers", "customers.view"], ["/reviews", "star", "a.nav.reviews", "reviews.manage"], ["/tickets", "chat", "a.nav.tickets", "tickets.manage"]] },
  { group: "a.g.marketing", items: [["/coupons", "percent", "a.nav.coupons", "promotions.manage"], ["/discounts", "tag", "a.nav.discounts", "promotions.manage"], ["/banners", "image", "a.nav.banners", "content.manage"], ["/homepage", "home", "a.nav.homepage", "content.manage"], ["/pages", "file", "a.nav.pages", "content.manage"], ["/faqs", "help", "a.nav.faqs", "content.manage"]] },
  { group: "a.g.system", items: [["/reports", "chart", "a.nav.reports", "reports.view"], ["/shipping", "truck", "a.nav.shipping", "shipping.manage"], ["/settings", "cog", "a.nav.settings", "settings.manage"], ["/users", "lock", "a.nav.users", "users.manage"], ["/logs", "clock", "a.nav.logs", "logs.view"]] },
];

function Login({ onDone }: { onDone: () => void }) {
  const app = useApp();
  const { t } = app;
  const form = useForm({ email: "", password: "" });
  const [denied, setDenied] = useState(false);
  const submit = () => form.submit(async (v) => {
    const r = await api<{ user: any }>("/api/auth/login", { body: v });
    if (r.user?.kind !== "admin") { setDenied(true); await api("/api/auth/logout", { body: {} }).catch(() => {}); return; }
    onDone();
  }, (e) => app.toast(app.errorText(e), "err"));
  return (
    <div className="grid min-h-dvh place-items-center bg-bg p-4">
      <div className="w-full max-w-sm">
        <div className="card overflow-hidden">
          <div className="bg-header px-6 py-5 text-header-fg"><p className="text-lg font-bold">{t("brand.name")}</p><p className="text-sm opacity-80">{t("admin.title")}</p></div>
          <div className="wire-stripe" />
          <form className="space-y-4 p-6" onSubmit={(e) => { e.preventDefault(); setDenied(false); void submit(); }} noValidate>
            {denied && <p className="rounded-md bg-danger-soft p-3 text-sm" role="alert">{t("a.not_staff")}</p>}
            <Field label={t("f.email")} error={form.errors.email}><Input type="email" dir="ltr" className="text-start" autoComplete="username" autoFocus {...form.bind("email")} /></Field>
            <Field label={t("f.password")} error={form.errors.password}><Input type="password" dir="ltr" className="text-start" autoComplete="current-password" {...form.bind("password")} /></Field>
            <Button type="submit" size="lg" className="w-full" busy={form.busy}>{t("auth.login")}</Button>
          </form>
        </div>
        <p className="mt-4 text-center text-sm"><a href={`/${app.lang}`} className="text-accent hover:underline">{t("a.back_to_store")}</a></p>
      </div>
    </div>
  );
}

function Shell({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const app = useApp();
  const { t } = app;
  const [loc, setLoc] = useState({ path: location.pathname.replace(/\/+$/, "") || "/admin", search: location.search });
  const [unread, setUnread] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const go = useCallback((to: string, replace = false) => {
    const url = new URL(to, location.origin);
    if (!url.pathname.startsWith("/admin")) { location.href = url.href; return; }
    if (replace) history.replaceState({}, "", url.pathname + url.search); else history.pushState({}, "", url.pathname + url.search);
    setLoc({ path: url.pathname.replace(/\/+$/, "") || "/admin", search: url.search });
    if (!replace) { window.scrollTo(0, 0); setDrawer(false); }
  }, []);
  useEffect(() => {
    const onPop = () => setLoc({ path: location.pathname.replace(/\/+$/, "") || "/admin", search: location.search });
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const can = useCallback((perm: string) => me.permissions.includes("*") || me.permissions.includes(perm), [me]);
  useEffect(() => {
    if (!can("dashboard.view")) return;
    const load = () => api<{ unread: number }>("/api/admin/notifications?per=1").then((r) => setUnread(r.unread)).catch(() => {});
    void load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [can]);

  const admin = useMemo<AdminCtx>(() => ({ me, can, path: loc.path, query: new URLSearchParams(loc.search), go, unread, setUnread }), [me, can, loc, go, unread]);
  // the shared UI kit navigates through the app context; point it at the admin router
  const appForAdmin = useMemo<AppCtx>(() => ({ ...app, href: (p) => `/admin${p === "/" ? "" : p}`, navigate: async (to) => go(to), query: new URLSearchParams(loc.search) }), [app, go, loc.search]);

  const match = ROUTES.map((r) => ({ r, m: r.re.exec(loc.path) })).find((x) => x.m);
  const Page = match?.r.page;
  const allowed = !match?.r.perm || can(match.r.perm);
  const firstAllowed = NAV.flatMap((g) => g.items).find((i) => can(i[3]));

  const nav = (
    <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label={t("admin.title")}>
      {NAV.map((g) => {
        const items = g.items.filter((i) => can(i[3]));
        if (!items.length) return null;
        return (
          <div key={g.group} className="mb-3">
            <p className="px-3 pb-1 text-xs font-semibold opacity-55">{t(g.group)}</p>
            {items.map(([to, icon, label]) => {
              const href = `/admin${to}`;
              const on = to === "" ? loc.path === "/admin" : loc.path === href || loc.path.startsWith(`${href}/`);
              return (
                <a key={to} href={href} aria-current={on ? "page" : undefined} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.preventDefault(); go(href); }}
                  className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm ${on ? "bg-white/12 font-semibold text-white" : "opacity-80 hover:bg-white/8 hover:opacity-100"}`}>
                  <Icon name={icon} size={18} />{t(label)}
                </a>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  return (
    <AdminContext.Provider value={admin}>
      <Ctx.Provider value={appForAdmin}>
        <div className="flex min-h-dvh bg-bg">
          <aside className="no-print sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-header text-header-fg lg:flex">
            <div className="px-5 py-4"><p className="font-bold">{t("brand.name")}</p><p className="text-xs opacity-70">{t("admin.title")}</p></div>
            <div className="wire-stripe" />
            {nav}
          </aside>
          {drawer && (
            <div className="fixed inset-0 z-50 bg-black/55 lg:hidden" onClick={(e) => { if (e.target === e.currentTarget) setDrawer(false); }}>
              <aside className="flex h-full w-64 flex-col bg-header text-header-fg">
                <div className="flex items-center justify-between px-5 py-3"><p className="font-bold">{t("admin.title")}</p><button type="button" className="icon-btn" onClick={() => setDrawer(false)} aria-label={t("c.close")}><Icon name="x" /></button></div>
                <div className="wire-stripe" />
                {nav}
              </aside>
            </div>
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-surface px-3 md:px-5">
              <button type="button" className="icon-btn lg:hidden" onClick={() => setDrawer(true)} aria-label={t("nav.menu")}><Icon name="menu" /></button>
              <a href={`/${app.lang}`} target="_blank" rel="noopener" className="hidden items-center gap-1.5 text-sm text-muted hover:text-fg sm:flex"><Icon name="store" size={16} />{t("a.view_store")}</a>
              <span className="ms-auto flex items-center gap-1">
                <select className="h-9 rounded-md border border-line bg-surface px-2 text-sm" value={app.lang} aria-label={t("c.language")}
                  onChange={(e) => { document.cookie = `lang=${e.target.value}; Path=/; Max-Age=31536000; SameSite=Lax`; location.reload(); }}>
                  {LANGS.map((l) => <option key={l} value={l}>{LANG_NAMES[l]}</option>)}
                </select>
                <button type="button" className="icon-btn" onClick={app.toggleTheme} aria-label={t(app.theme === "dark" ? "c.theme_light" : "c.theme_dark")}><Icon name={app.theme === "dark" ? "sun" : "moon"} size={18} /></button>
                {can("dashboard.view") && (
                  <a href="/admin/notifications" onClick={(e) => { e.preventDefault(); go("/admin/notifications"); }} className="icon-btn relative" aria-label={t("a.nav.notifications")}>
                    <Icon name="bell" size={18} />{unread > 0 && <span className="absolute end-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
                  </a>
                )}
                <span className="mx-1 hidden text-end text-xs leading-tight sm:block"><b className="block">{me.name}</b><span className="text-muted">{me.role}</span></span>
                <button type="button" className="icon-btn" onClick={onLogout} aria-label={t("account.logout")} title={t("account.logout")}><Icon name="logout" size={18} /></button>
              </span>
            </header>
            <main className="flex-1 p-3 md:p-6">
              {!Page ? <p className="py-16 text-center text-muted">{t("nf.title")}</p>
                : !allowed ? (
                  <div className="py-16 text-center"><p className="text-lg font-bold">{t("err.missing_permission")}</p>
                    {firstAllowed && <Button className="mt-4" onClick={() => go(`/admin${firstAllowed[0]}`)}>{t(firstAllowed[2])}</Button>}</div>
                ) : <Page key={loc.path} params={match!.m!.slice(1)} />}
            </main>
          </div>
        </div>
      </Ctx.Provider>
    </AdminContext.Provider>
  );
}

function AdminApp({ dict, lang }: { dict: Dict[]; lang: Lang }) {
  const t = useMemo(() => makeT(...dict), [dict]);
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [theme, setTheme] = useState<"light" | "dark">(document.documentElement.classList.contains("dark") ? "dark" : "light");
  const toast = useCallback((text: string, kind: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4500);
  }, []);
  const loadMe = useCallback(() => api<{ user: any }>("/api/auth/me").then((r) => setMe(r.user?.kind === "admin" ? r.user : null)).catch(() => setMe(null)), []);
  useEffect(() => { void loadMe(); }, [loadMe]);

  const app = useMemo<AppCtx>(() => ({
    lang, dir: dirOf(lang), t, route: { name: "not_found", params: {}, path: "/admin", search: "" }, query: new URLSearchParams(), data: {}, pending: false, theme,
    shell: { lang, categories: [], cart_count: 0, user: null, settings: { store: { name: t("brand.name"), name_ar: "", tagline: "", legal_name: "", vat_number: "", cr_number: "", phone: "", whatsapp: "", email: "", address: "", working_hours: "", social: {} }, vat_rate_bp: 1500, guest_checkout: true, online_payment: false } },
    href: (p) => `/admin${p === "/" ? "" : p}`, navigate: async (to) => { location.href = to; }, reload: async () => {}, setCartCount: () => {}, setUser: () => {},
    toggleTheme: () => {
      const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
      document.documentElement.classList.toggle("dark", next === "dark");
      document.cookie = `theme=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
      setTheme(next);
    },
    toast,
    errorText: (e) => {
      if (e instanceof ApiError) {
        if (e.code === "network") return t("err.network");
        if (e.status === 401) { setMe(null); return t("err.unauthorized"); }
        if (e.code === "validation") { const first = Object.values(e.fields)[0]; const k = first ? `v.${first}` : ""; return k && t(k) !== k ? t(k) : t("err.validation"); }
        return e.message || t("err.internal");
      }
      return t("err.internal");
    },
    money: (h) => formatMoney(lang, h), date: (v, withTime) => formatDate(lang, v, withTime),
  }), [lang, t, theme, toast]);

  const logout = async () => { await api("/api/auth/logout", { body: {} }).catch(() => {}); setMe(null); };

  return (
    <Ctx.Provider value={app}>
      {me === undefined ? <p className="p-10 text-center text-muted">{t("c.loading")}</p> : me === null ? <Login onDone={loadMe} /> : <Shell me={me} onLogout={logout} />}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[70] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((x) => <div key={x.id} role="status" className={`toast ${x.kind === "err" ? "toast-err" : ""}`}>{x.text}</div>)}
      </div>
    </Ctx.Provider>
  );
}

const langAttr = currentLang();
const lang: Lang = isLang(langAttr) ? langAttr : "ar";
const base = { ar: () => import("../shared/i18n/ar").then((m) => m.ar), en: () => import("../shared/i18n/en").then((m) => m.en), ur: () => import("../shared/i18n/ur").then((m) => m.ur) };
const adminDict = { ar: () => import("../shared/i18n/admin/ar").then((m) => m.ar), en: () => import("../shared/i18n/admin/en").then((m) => m.en), ur: () => import("../shared/i18n/admin/ur").then((m) => m.ur) };
const [d1, d2] = await Promise.all([adminDict[lang](), base[lang]()]);
createRoot(document.getElementById("admin-root")!).render(<AdminApp dict={[d1, d2]} lang={lang} />);
