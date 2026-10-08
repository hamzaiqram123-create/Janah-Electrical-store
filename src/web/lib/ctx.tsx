import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { dirOf, sar, type Lang } from "../../shared/constants";
import { makeT, type Dict, type T } from "../../shared/i18n/format";
import type { PageMeta, RouteName } from "../../shared/routes";
import { api, ApiError } from "./api";

export interface ShellUser { id: number; name: string; email: string; phone: string | null; kind: "customer" | "admin"; is_admin: boolean }
export interface CategoryNode { id: number; parent_id: number | null; slug: string; name: string; icon: string | null; image_url: string | null; product_count: number; children: CategoryNode[] }
export interface Shell {
  lang: Lang;
  categories: CategoryNode[];
  settings: {
    store: { name: string; name_ar: string; tagline: string; legal_name: string; vat_number: string; cr_number: string; phone: string; whatsapp: string; email: string; address: string; working_hours: string; social: Record<string, string> };
    vat_rate_bp: number; guest_checkout: boolean; online_payment: boolean; email_enabled: boolean;
  };
  cart_count: number;
  user: ShellUser | null;
}
export interface Payload {
  route: { name: RouteName; params: Record<string, string>; path: string; search: string };
  data: any;
  meta: PageMeta;
  shell: Shell;
}
export interface Toast { id: number; text: string; kind: "ok" | "err" }

export interface AppCtx {
  lang: Lang;
  dir: "rtl" | "ltr";
  t: T;
  route: Payload["route"];
  query: URLSearchParams;
  data: any;
  shell: Shell;
  pending: boolean;
  theme: "light" | "dark";
  /** Language-prefixed href for an in-app path such as "/cart". */
  href(path: string): string;
  navigate(to: string, opts?: { replace?: boolean; keepScroll?: boolean }): Promise<void>;
  reload(): Promise<void>;
  setCartCount(n: number): void;
  setUser(u: ShellUser | null): void;
  toggleTheme(): void;
  toast(text: string, kind?: "ok" | "err"): void;
  /** Human message for a thrown ApiError. */
  errorText(e: unknown): string;
  money(halalas: number | null | undefined): string;
  date(v: string | Date | null | undefined, withTime?: boolean): string;
}

/** Exported so the admin app can supply the same context and reuse the shared UI kit. */
export const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("AppProvider missing");
  return c;
};

const LOCALE: Record<Lang, string> = { ar: "ar-SA-u-nu-latn-ca-gregory", en: "en-GB", ur: "ur-PK-u-nu-latn" };
const CURRENCY: Record<Lang, string> = { ar: "ر.س", en: "SAR", ur: "ریال" };

export function formatMoney(lang: Lang, h: number | null | undefined): string {
  return lang === "en" ? `${CURRENCY.en} ${sar(h)}` : `${sar(h)} ${CURRENCY[lang]}`;
}
export function formatDate(lang: Lang, v: string | Date | null | undefined, withTime = false): string {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat(LOCALE[lang], { dateStyle: "medium", ...(withTime ? { timeStyle: "short" } : {}), timeZone: "Asia/Riyadh" }).format(d);
  } catch {
    return d.toISOString().slice(0, withTime ? 16 : 10).replace("T", " ");
  }
}

export function AppProvider({ initial, dict, children }: { initial: Payload; dict: Dict; children: ReactNode }) {
  const [payload, setPayload] = useState(initial);
  const [shell, setShell] = useState(initial.shell);
  const [pending, setPending] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const lang = shell.lang;
  const t = useMemo(() => makeT(dict), [dict]);
  const seq = useRef(0);

  useEffect(() => { setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light"); }, []);

  const toast = useCallback((text: string, kind: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((ts) => [...ts.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 4200);
  }, []);

  const load = useCallback(async (to: string, mode: "push" | "replace" | "none", keepScroll = false) => {
    const url = new URL(to, window.location.origin);
    if (url.origin !== window.location.origin) { window.location.href = to; return; }
    const seg = url.pathname.split("/")[1];
    // other apps (admin, API downloads) and language switches need a full document load
    if (seg !== lang) { window.location.href = url.href; return; }
    const my = ++seq.current;
    setPending(true);
    try {
      const res = await api<any>(`/__data?path=${encodeURIComponent(url.pathname + url.search)}`);
      if (my !== seq.current) return;
      if (res.redirect) { await load(res.redirect, mode === "none" ? "replace" : mode, keepScroll); return; }
      if (mode === "push") history.pushState({}, "", url.pathname + url.search + url.hash);
      else if (mode === "replace") history.replaceState({}, "", url.pathname + url.search + url.hash);
      setPayload((p) => ({ ...p, route: res.route, data: res.data, meta: res.meta }));
      setShell((s) => ({ ...s, user: res.shell.user, cart_count: res.shell.cart_count }));
      document.title = res.meta.title || document.title;
      if (!keepScroll) window.scrollTo(0, 0);
    } catch {
      if (my === seq.current) window.location.href = url.href;
    } finally {
      if (my === seq.current) setPending(false);
    }
  }, [lang]);

  useEffect(() => {
    const onPop = () => { void load(location.pathname + location.search, "none", true); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [load]);

  const value = useMemo<AppCtx>(() => ({
    lang, dir: dirOf(lang), t, route: payload.route, query: new URLSearchParams(payload.route.search), data: payload.data, shell, pending, theme,
    href: (path) => (path.startsWith("/") ? `/${lang}${path === "/" ? "" : path}` : path),
    navigate: (to, o) => load(to, o?.replace ? "replace" : "push", o?.keepScroll),
    reload: () => load(location.pathname + location.search, "none", true),
    setCartCount: (n) => setShell((s) => ({ ...s, cart_count: n })),
    setUser: (u) => setShell((s) => ({ ...s, user: u })),
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
        if (e.code === "validation") {
          const first = Object.values(e.fields)[0];
          const k = first ? `v.${first}` : "";
          return k && t(k) !== k ? t(k) : t("err.validation");
        }
        return e.message || t("err.internal");
      }
      return t("err.internal");
    },
    money: (h) => formatMoney(lang, h),
    date: (v, withTime) => formatDate(lang, v, withTime),
  }), [lang, t, payload, shell, pending, theme, load, toast]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[70] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
        {toasts.map((x) => (
          <div key={x.id} role="status" className={`toast ${x.kind === "err" ? "toast-err" : ""}`}>{x.text}</div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
