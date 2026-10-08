import { useEffect, useId, useRef, useState } from "react";
import { LANG_NAMES, LANGS } from "../../shared/constants";
import { api } from "../lib/api";
import { useApp } from "../lib/ctx";
import { Glyph, Icon } from "../ui/Icon";
import { Link, ProductImage } from "../ui/kit";
import { useInstall } from "../lib/pwa";
import { GetTheApp, InstallMenuItem } from "../parts/InstallApp";

export function Logo({ onDark = true }: { onDark?: boolean }) {
  const { shell } = useApp();
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <svg viewBox="0 0 32 32" width="36" height="36" aria-hidden="true" className="shrink-0">
        <rect width="32" height="32" rx="5" fill="#e39a5b" />
        <path d="M18 4 8 18h7l-2 10 11-15h-7z" fill="#17202a" />
      </svg>
      <span className="min-w-0 leading-tight">
        <span className={`block truncate text-lg font-bold ${onDark ? "text-header-fg" : "text-fg"}`}>{shell.settings.store.name}</span>
      </span>
    </span>
  );
}

function SearchBox({ autoFocus }: { autoFocus?: boolean }) {
  const app = useApp();
  const { t } = app;
  const [q, setQ] = useState(app.route.name === "search" ? app.query.get("q") ?? "" : "");
  const [open, setOpen] = useState(false);
  const [res, setRes] = useState<{ products: any[]; categories: any[]; brands: any[] } | null>(null);
  const box = useRef<HTMLFormElement>(null);
  const uid = useId();

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRes(null); return; }
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      api(`/api/search/suggest?q=${encodeURIComponent(term)}`, { signal: ctl.signal }).then(setRes).catch(() => {});
    }, 180);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);
  useEffect(() => setOpen(false), [app.route.path, app.route.search]);

  const go = (to: string) => { setOpen(false); void app.navigate(app.href(to)); };
  const has = res && (res.products.length || res.categories.length || res.brands.length);

  return (
    <form ref={box} role="search" className="relative w-full" onSubmit={(e) => { e.preventDefault(); if (q.trim()) go(`/search?q=${encodeURIComponent(q.trim())}`); }}>
      <label className="sr-only" htmlFor={`${uid}q`}>{t("search.label")}</label>
      <input id={`${uid}q`} type="search" autoFocus={autoFocus} autoComplete="off" value={q} placeholder={t("search.placeholder")}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === "Escape") setOpen(false); }}
        className="h-11 w-full rounded-md border-0 bg-white ps-4 pe-12 text-[#17202a] placeholder:text-[#6b7580] focus:outline-2 focus:outline-offset-0 focus:outline-[#e39a5b]"
        role="combobox" aria-expanded={!!(open && has)} aria-controls={`${uid}s`} aria-autocomplete="list" />
      <button type="submit" className="absolute end-0 top-0 grid h-11 w-12 place-items-center rounded-e-md bg-accent text-accent-fg hover:bg-accent-hover" aria-label={t("search.submit")}>
        <Icon name="search" />
      </button>
      {open && q.trim().length >= 2 && res && (
        <div id={`${uid}s`} className="absolute inset-x-0 top-full z-50 mt-1 max-h-[70dvh] overflow-y-auto rounded-md border border-line bg-surface text-fg shadow-xl">
          {!has && <p className="p-4 text-sm text-muted">{t("search.no_suggest", { q: q.trim() })}</p>}
          {res.categories.length + res.brands.length > 0 && (
            <div className="flex flex-wrap gap-2 border-b border-line p-3">
              {res.categories.map((c) => <button type="button" key={`c${c.slug}`} className="badge badge-muted h-8 px-3 text-sm hover:text-fg" onClick={() => go(`/c/${c.slug}`)}><Icon name="grid" size={14} />{c.name}</button>)}
              {res.brands.map((b) => <button type="button" key={`b${b.slug}`} className="badge badge-muted h-8 px-3 text-sm hover:text-fg" onClick={() => go(`/brand/${b.slug}`)}><Icon name="tag" size={14} />{b.name}</button>)}
            </div>
          )}
          <ul>
            {res.products.map((p) => (
              <li key={p.id}>
                <button type="button" className="flex w-full items-center gap-3 px-3 py-2 text-start hover:bg-surface-2" onClick={() => go(`/p/${p.slug}`)}>
                  <span className="size-12 shrink-0 overflow-hidden rounded border border-line bg-white"><ProductImage src={p.image} alt="" glyph={p.glyph} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 font-medium">{p.name}</span>
                    <span className="text-xs text-muted">{p.sku}</span>
                  </span>
                  <span className="price shrink-0 text-sm">{app.money(p.price)}</span>
                </button>
              </li>
            ))}
          </ul>
          {has ? (
            <button type="submit" className="flex w-full items-center justify-center gap-2 border-t border-line p-3 text-sm font-semibold text-accent hover:bg-surface-2">
              {t("search.see_all", { q: q.trim() })}<Icon name="arrow" size={16} />
            </button>
          ) : null}
        </div>
      )}
    </form>
  );
}

export function LangSwitch({ className = "" }: { className?: string }) {
  const app = useApp();
  const rest = app.route.path.replace(/^\/(ar|en|ur)/, "") + app.route.search;
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} role="group" aria-label={app.t("c.language")}>
      {LANGS.map((l) => (
        <a key={l} href={`/${l}${rest}`} lang={l} hrefLang={l} aria-current={l === app.lang ? "true" : undefined}
          className={`rounded px-2 py-1 text-[13px] ${l === app.lang ? "bg-white/15 font-semibold" : "opacity-80 hover:opacity-100"}`}>{LANG_NAMES[l]}</a>
      ))}
    </span>
  );
}

export function Header() {
  const app = useApp();
  const { t, shell } = app;
  const [cats, setCats] = useState(false);
  const [menu, setMenu] = useState(false);
  const catRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setCats(false); setMenu(false); }, [app.route.path, app.route.search]);
  useEffect(() => {
    if (!cats) return;
    const onDown = (e: MouseEvent) => { if (!catRef.current?.contains(e.target as Node)) setCats(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setCats(false); };
    document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [cats]);
  const store = shell.settings.store;
  const { standalone } = useInstall();

  return (
    <header className="no-print sticky top-0 z-40 bg-header pt-[env(safe-area-inset-top)] text-header-fg md:static">
      <div className="hidden border-b border-header-line text-[13px] md:block">
        <div className="container-x flex h-9 items-center justify-between gap-4">
          <p className="flex items-center gap-4 opacity-85">
            <span className="flex items-center gap-1.5"><Icon name="truck" size={15} />{t("top.delivery")}</span>
            {store.phone && <a href={`tel:${store.phone}`} className="flex items-center gap-1.5 hover:opacity-100" dir="ltr"><Icon name="phone" size={14} />{store.phone}</a>}
          </p>
          <div className="flex items-center gap-3">
            <Link to="/track" className="opacity-85 hover:opacity-100">{t("nav.track")}</Link>
            <Link to="/contact" className="opacity-85 hover:opacity-100">{t("nav.contact")}</Link>
            <span className="h-4 w-px bg-header-line" />
            <LangSwitch />
            <button type="button" className="grid size-7 place-items-center rounded hover:bg-white/10" onClick={app.toggleTheme} aria-label={t(app.theme === "dark" ? "c.theme_light" : "c.theme_dark")}>
              <Icon name={app.theme === "dark" ? "sun" : "moon"} size={16} />
            </button>
          </div>
        </div>
      </div>

      <div className="container-x flex h-14 items-center gap-3 md:h-[72px] md:gap-6">
        {/* the installed app has no browser back button */}
        {standalone && app.route.name !== "home" && (
          <button type="button" className="icon-btn -ms-2 md:hidden" onClick={() => (history.length > 1 ? history.back() : void app.navigate(app.href("/")))} aria-label={t("c.back")}>
            <Icon name="chev" size={24} className="rotate-180" />
          </button>
        )}
        <button type="button" className={`icon-btn md:hidden ${standalone && app.route.name !== "home" ? "" : "-ms-2"}`} onClick={() => setMenu(true)} aria-label={t("nav.menu")}><Icon name="menu" size={24} /></button>
        <Link to="/" aria-label={store.name} className="min-w-0 shrink"><Logo /></Link>
        <div className="hidden flex-1 md:block"><SearchBox /></div>
        <nav className="ms-auto flex items-center md:ms-0 md:gap-1" aria-label={t("nav.account_nav")}>
          <Link to={shell.user ? "/account" : "/login"} className="hidden h-11 items-center gap-2 rounded-md px-3 hover:bg-white/10 md:flex">
            <Icon name="user" />
            <span className="max-w-32 truncate text-sm leading-tight">{shell.user ? (shell.user.name || t("nav.account")) : t("nav.login")}</span>
          </Link>
          <Link to="/account/wishlist" className={`icon-btn hover:bg-white/10 ${standalone && app.route.name !== "home" ? "max-md:hidden" : ""}`} aria-label={t("nav.wishlist")}><Icon name="heart" /></Link>
          <Link to="/cart" className="relative flex h-11 items-center gap-2 rounded-md px-2.5 hover:bg-white/10" aria-label={t("nav.cart_n", { n: shell.cart_count })}>
            <Icon name="cart" size={22} />
            <span className="hidden text-sm md:inline">{t("nav.cart")}</span>
            {shell.cart_count > 0 && <span className="absolute start-5 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#e39a5b] px-1 text-[11px] font-bold text-[#17202a] tabular-nums md:static">{shell.cart_count}</span>}
          </Link>
        </nav>
      </div>
      <div className="container-x pb-2.5 md:hidden"><SearchBox /></div>
      <div className="wire-stripe" aria-hidden="true" />

      <div className="hidden border-b border-line bg-surface text-fg md:block">
        <div className="container-x relative flex h-12 items-center gap-1" ref={catRef}>
          <button type="button" className="flex h-12 items-center gap-2 border-e border-line pe-4 font-semibold hover:text-accent" aria-expanded={cats} aria-controls="all-cats" onClick={() => setCats((v) => !v)}>
            <Icon name="grid" size={18} />{t("nav.all_categories")}<Icon name="down" size={14} className={cats ? "rotate-180" : ""} />
          </button>
          <nav className="flex min-w-0 flex-1 items-center overflow-hidden" aria-label={t("nav.categories")}>
            {shell.categories.slice(0, 8).map((c) => (
              <Link key={c.id} to={`/c/${c.slug}`} className="shrink-0 px-3 py-3 text-sm whitespace-nowrap hover:text-accent">{c.name}</Link>
            ))}
          </nav>
          <Link to="/products?flag=deals" className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-accent"><Icon name="percent" size={16} />{t("nav.deals")}</Link>
          {cats && (
            <div id="all-cats" className="absolute inset-x-4 top-full z-40 grid max-h-[70dvh] grid-cols-3 gap-x-6 gap-y-1 overflow-y-auto rounded-b-md border border-t-0 border-line bg-surface p-4 shadow-xl lg:grid-cols-4">
              {shell.categories.map((c) => (
                <div key={c.id} className="py-1.5">
                  <Link to={`/c/${c.slug}`} className="flex items-center gap-2.5 font-semibold hover:text-accent">
                    <span className="grid size-9 place-items-center rounded bg-plate text-fg/70"><Glyph name={c.icon} size={22} /></span>{c.name}
                  </Link>
                  {c.children.length > 0 && (
                    <ul className="ms-[46px] mt-1 space-y-1 text-sm text-muted">
                      {c.children.map((ch) => <li key={ch.id}><Link to={`/c/${ch.slug}`} className="hover:text-accent">{ch.name}</Link></li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {menu && (
        <div className="fixed inset-0 z-[60] bg-black/55 md:hidden" onClick={(e) => { if (e.target === e.currentTarget) setMenu(false); }}>
          <div className="flex h-full w-[86%] max-w-sm flex-col overflow-y-auto bg-surface text-fg" role="dialog" aria-modal="true" aria-label={t("nav.menu")}>
            <div className="flex items-center justify-between bg-header px-4 py-3 text-header-fg">
              <Logo />
              <button type="button" className="icon-btn" onClick={() => setMenu(false)} aria-label={t("c.close")}><Icon name="x" /></button>
            </div>
            <div className="wire-stripe" aria-hidden="true" />
            <nav className="flex-1 p-2">
              <Link to={shell.user ? "/account" : "/login"} className="flex items-center gap-3 rounded-md px-3 py-3 font-semibold hover:bg-surface-2"><Icon name="user" />{shell.user ? shell.user.name || t("nav.account") : t("nav.login")}</Link>
              <Link to="/products" className="flex items-center gap-3 rounded-md px-3 py-3 hover:bg-surface-2"><Icon name="box" />{t("nav.all_products")}</Link>
              <Link to="/products?flag=deals" className="flex items-center gap-3 rounded-md px-3 py-3 text-accent hover:bg-surface-2"><Icon name="percent" />{t("nav.deals")}</Link>
              <p className="px-3 pt-4 pb-1 text-sm font-semibold text-muted">{t("nav.categories")}</p>
              {shell.categories.map((c) => (
                <Link key={c.id} to={`/c/${c.slug}`} className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-surface-2"><Glyph name={c.icon} size={22} className="text-muted" />{c.name}</Link>
              ))}
              <p className="px-3 pt-4 pb-1 text-sm font-semibold text-muted">{t("foot.service")}</p>
              <Link to="/track" className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-surface-2"><Icon name="truck" />{t("nav.track")}</Link>
              <Link to="/contact" className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-surface-2"><Icon name="chat" />{t("nav.contact")}</Link>
              <Link to="/faq" className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-surface-2"><Icon name="help" />{t("nav.faq")}</Link>
              <InstallMenuItem />
            </nav>
            <div className="flex items-center justify-between border-t border-line bg-header p-3 text-header-fg">
              <LangSwitch />
              <button type="button" className="icon-btn" onClick={app.toggleTheme} aria-label={t(app.theme === "dark" ? "c.theme_light" : "c.theme_dark")}><Icon name={app.theme === "dark" ? "sun" : "moon"} /></button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

/** Sticky bottom navigation on phones. */
export function MobileNav() {
  const app = useApp();
  const { t, shell, route } = app;
  const items: { to: string; icon: string; label: string; on: boolean; count?: number }[] = [
    { to: "/", icon: "home", label: t("nav.home"), on: route.name === "home" },
    { to: "/categories", icon: "grid", label: t("nav.categories"), on: ["categories", "category", "listing"].includes(route.name) },
    { to: "/cart", icon: "cart", label: t("nav.cart"), on: route.name === "cart" || route.name === "checkout", count: shell.cart_count },
    { to: shell.user ? "/account/orders" : "/track", icon: "box", label: t("nav.orders"), on: route.name === "account_orders" || route.name === "track" || route.name === "order" },
    { to: shell.user ? "/account" : "/login", icon: "user", label: shell.user ? t("nav.account") : t("nav.login"), on: ["account", "login", "register"].includes(route.name) },
  ];
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden" aria-label={t("nav.mobile")}>
      <ul className="grid grid-cols-5">
        {items.map((it) => (
          <li key={it.icon}>
            <Link to={it.to} aria-current={it.on ? "page" : undefined} className={`relative flex h-[58px] flex-col items-center justify-center gap-0.5 text-[11px] ${it.on ? "font-semibold text-accent" : "text-muted"}`}>
              {it.on && <span className="absolute inset-x-5 top-0 h-0.5 rounded-b bg-accent" />}
              <span className="relative">
                <Icon name={it.icon} size={22} />
                {!!it.count && <span className="absolute -end-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-fg tabular-nums">{it.count}</span>}
              </span>
              <span className="max-w-full truncate px-1">{it.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function WhatsAppButton() {
  const { shell, t } = useApp();
  const n = shell.settings.store.whatsapp.replace(/[^\d]/g, "");
  if (!n) return null;
  return (
    <a href={`https://wa.me/${n}`} target="_blank" rel="noopener noreferrer" aria-label={t("c.whatsapp")}
      className="no-print fixed end-4 bottom-[calc(76px+env(safe-area-inset-bottom)+var(--app-banner,0px))] z-30 grid size-12 place-items-center rounded-full bg-[#1f8a4c] text-white shadow-lg hover:bg-[#19733f] md:bottom-6">
      <Icon name="whatsapp" size={26} />
    </a>
  );
}

export function Footer() {
  const { t, shell } = useApp();
  const s = shell.settings.store;
  const pay = [t("pay.cod"), ...(shell.settings.online_payment ? ["mada", "Visa", "Mastercard", "Apple Pay", "STC Pay"] : [])];
  return (
    <footer className="no-print mt-12 bg-header pb-20 text-header-fg md:pb-0">
      <div className="wire-stripe" aria-hidden="true" />
      <div className="container-x grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm opacity-80">{s.tagline}</p>
          <dl className="mt-4 space-y-1 text-sm opacity-80">
            {s.vat_number && <div className="flex gap-2"><dt>{t("foot.vat_no")}</dt><dd dir="ltr" className="tabular-nums">{s.vat_number}</dd></div>}
            {s.cr_number && <div className="flex gap-2"><dt>{t("foot.cr_no")}</dt><dd dir="ltr" className="tabular-nums">{s.cr_number}</dd></div>}
          </dl>
          <GetTheApp />
        </div>
        <nav aria-label={t("foot.shop")}>
          <h2 className="mb-3 font-bold">{t("foot.shop")}</h2>
          <ul className="space-y-2 text-sm opacity-85">
            {shell.categories.slice(0, 6).map((c) => <li key={c.id}><Link to={`/c/${c.slug}`} className="hover:underline">{c.name}</Link></li>)}
            <li><Link to="/categories" className="font-semibold hover:underline">{t("nav.all_categories")}</Link></li>
          </ul>
        </nav>
        <nav aria-label={t("foot.service")}>
          <h2 className="mb-3 font-bold">{t("foot.service")}</h2>
          <ul className="space-y-2 text-sm opacity-85">
            <li><Link to="/track" className="hover:underline">{t("nav.track")}</Link></li>
            <li><Link to="/contact" className="hover:underline">{t("nav.contact")}</Link></li>
            <li><Link to="/faq" className="hover:underline">{t("nav.faq")}</Link></li>
            <li><Link to="/page/shipping" className="hover:underline">{t("foot.shipping")}</Link></li>
            <li><Link to="/page/returns" className="hover:underline">{t("foot.returns")}</Link></li>
            <li><Link to="/page/vat" className="hover:underline">{t("foot.vat")}</Link></li>
            <li><Link to="/page/privacy" className="hover:underline">{t("foot.privacy")}</Link></li>
            <li><Link to="/page/terms" className="hover:underline">{t("foot.terms")}</Link></li>
          </ul>
        </nav>
        <div>
          <h2 className="mb-3 font-bold">{t("foot.contact")}</h2>
          <ul className="space-y-2.5 text-sm opacity-85">
            {s.phone && <li><a href={`tel:${s.phone}`} className="flex items-center gap-2 hover:underline"><Icon name="phone" size={16} /><span dir="ltr">{s.phone}</span></a></li>}
            {s.email && <li><a href={`mailto:${s.email}`} className="flex items-center gap-2 hover:underline"><Icon name="mail" size={16} /><span dir="ltr">{s.email}</span></a></li>}
            {s.address && <li className="flex items-start gap-2"><Icon name="pin" size={16} className="mt-1" />{s.address}</li>}
            {s.working_hours && <li className="flex items-start gap-2"><Icon name="clock" size={16} className="mt-1" />{s.working_hours}</li>}
            {!s.phone && !s.email && <li><Link to="/contact" className="hover:underline">{t("foot.contact_form")}</Link></li>}
          </ul>
        </div>
      </div>
      <div className="border-t border-header-line">
        <div className="container-x flex flex-col items-start justify-between gap-3 py-4 text-[13px] sm:flex-row sm:items-center">
          <p className="opacity-75">© {new Date().getFullYear()} {s.legal_name || s.name_ar}. {t("foot.rights")}</p>
          <ul className="flex flex-wrap items-center gap-1.5" aria-label={t("foot.payment_methods")}>
            {pay.map((p) => <li key={p} className="rounded border border-header-line px-2 py-0.5 text-xs">{p}</li>)}
          </ul>
        </div>
      </div>
    </footer>
  );
}
