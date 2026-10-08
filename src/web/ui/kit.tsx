import { useEffect, useId, useRef, useState, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { useApp } from "../lib/ctx";
import { ApiError } from "../lib/api";
import { Glyph, Icon } from "./Icon";

/** In-app link: `to` is a path without the language prefix ("/cart"). Falls back to a normal navigation for modified clicks. */
export function Link({ to, children, onClick, ...rest }: { to: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  const app = useApp();
  const href = app.href(to);
  return (
    <a href={href} {...rest} onClick={(e) => {
      onClick?.(e);
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target) return;
      e.preventDefault();
      void app.navigate(href);
    }}>{children}</a>
  );
}

type BtnVariant = "primary" | "outline" | "ghost" | "danger" | "dark";
export function Button({ variant = "primary", size = "md", busy, icon, children, className = "", ...rest }: { variant?: BtnVariant; size?: "sm" | "md" | "lg"; busy?: boolean; icon?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...rest} disabled={rest.disabled || busy} className={`btn btn-${variant} btn-${size} ${className}`}>
      {busy ? <span className="spinner" aria-hidden="true" /> : icon ? <Icon name={icon} size={size === "sm" ? 16 : 18} /> : null}
      {children}
    </button>
  );
}

export function Field({ label, error, hint, children, required, className = "" }: { label?: ReactNode; error?: string | null; hint?: ReactNode; children: ReactNode; required?: boolean; className?: string }) {
  const { t } = useApp();
  const msg = error ? (t(`v.${error}`) !== `v.${error}` ? t(`v.${error}`) : t("v.invalid")) : null;
  return (
    <label className={`block ${className}`}>
      {label && <span className="mb-1 block text-sm font-medium">{label}{required && <span className="text-danger"> *</span>}</span>}
      {children}
      {msg ? <span className="mt-1 block text-sm text-danger" role="alert">{msg}</span> : hint ? <span className="mt-1 block text-sm text-muted">{hint}</span> : null}
    </label>
  );
}

export function Input({ invalid, className = "", ...rest }: { invalid?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} aria-invalid={invalid || undefined} className={`input ${invalid ? "input-invalid" : ""} ${className}`} />;
}
export function Select({ invalid, className = "", children, ...rest }: { invalid?: boolean } & SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...rest} aria-invalid={invalid || undefined} className={`input ${invalid ? "input-invalid" : ""} ${className}`}>{children}</select>;
}
export function Textarea({ invalid, className = "", ...rest }: { invalid?: boolean } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={4} {...rest} aria-invalid={invalid || undefined} className={`input min-h-24 py-2 ${invalid ? "input-invalid" : ""} ${className}`} />;
}

/** Tiny form state helper: values, server-side field errors and a busy flag around the submit call. */
export function useForm<V extends Record<string, any>>(initial: V) {
  const [values, setValues] = useState<V>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = (name: keyof V, value: any) => { setValues((v) => ({ ...v, [name]: value })); setErrors((e) => (e[name as string] ? { ...e, [name as string]: "" } : e)); };
  return {
    values, errors, busy, set, setValues, setErrors,
    /** props for a text-like control */
    bind: (name: keyof V) => ({ value: values[name] ?? "", onChange: (e: { target: { value: string } }) => set(name, e.target.value), invalid: !!errors[name as string] }),
    async submit<R>(fn: (v: V) => Promise<R>, onError?: (e: unknown) => void): Promise<R | undefined> {
      setBusy(true); setErrors({});
      try { return await fn(values); }
      catch (e) { if (e instanceof ApiError) setErrors(e.fields); onError?.(e); return undefined; }
      finally { setBusy(false); }
    },
  };
}

export function Stars({ value, size = 14, className = "" }: { value: number; size?: number; className?: string }) {
  const { t } = useApp();
  return (
    <span className={`inline-flex items-center gap-px text-warn ${className}`} role="img" aria-label={t("p.rating_of", { n: value.toFixed(1) })}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
          <path d="m12 3 2.700 5.600 6.100.800-4.500 4.300 1.100 6.100L12 16.900 6.600 19.800l1.100-6.100L3.200 9.400l6.100-.800L12 3Z" fill={value >= i - 0.25 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.500" strokeLinejoin="round" opacity={value >= i - 0.25 ? 1 : 0.45} />
        </svg>
      ))}
    </span>
  );
}

export function Price({ price, list, size = "md" }: { price: number; list?: number; size?: "sm" | "md" | "lg" }) {
  const { money, t } = useApp();
  const cls = size === "lg" ? "text-3xl" : size === "sm" ? "text-base" : "text-lg";
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span className={`price ${cls}`}>{money(price)}</span>
      {list && list > price ? <s className="text-sm text-muted tabular-nums" aria-label={t("p.was", { price: money(list) })}>{money(list)}</s> : null}
    </span>
  );
}

export function Qty({ value, max, min = 1, onChange, disabled, small }: { value: number; max: number; min?: number; onChange: (n: number) => void; disabled?: boolean; small?: boolean }) {
  const { t } = useApp();
  const clamp = (n: number) => Math.max(min, Math.min(max, Math.floor(n) || min));
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const h = small ? "h-9" : "h-11";
  return (
    <div className={`inline-flex items-stretch rounded-md border border-line bg-surface ${h}`}>
      <button type="button" className="qty-btn" disabled={disabled || value <= min} onClick={() => onChange(clamp(value - 1))} aria-label={t("p.qty_less")}><Icon name="minus" size={16} /></button>
      <input className="w-11 bg-transparent text-center font-semibold tabular-nums outline-none" inputMode="numeric" value={text} disabled={disabled} aria-label={t("p.qty")}
        onChange={(e) => setText(e.target.value.replace(/[^\d]/g, "").slice(0, 5))}
        onBlur={() => { const n = clamp(Number(text)); setText(String(n)); if (n !== value) onChange(n); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
      <button type="button" className="qty-btn" disabled={disabled || value >= max} onClick={() => onChange(clamp(value + 1))} aria-label={t("p.qty_more")}><Icon name="plus" size={16} /></button>
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  pending: "warn", confirmed: "info", processing: "info", ready_for_shipment: "info", shipped: "info", out_for_delivery: "info", delivered: "ok",
  cancelled: "danger", returned: "muted", refunded: "muted", paid: "ok", unpaid: "muted", failed: "danger", partially_refunded: "muted",
  requested: "warn", approved: "info", rejected: "danger", received: "info", open: "warn", resolved: "ok", closed: "muted", active: "ok", draft: "muted", archived: "muted",
  sent: "ok", queued: "warn", skipped: "muted", disabled: "danger", not_submitted: "muted", reported: "ok", cleared: "ok", warning: "warn", error: "danger",
};
export function Badge({ tone = "muted", children }: { tone?: string; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}
export function StatusBadge({ status, prefix = "status" }: { status: string; prefix?: string }) {
  const { t } = useApp();
  return <Badge tone={STATUS_TONE[status] ?? "muted"}>{t(`${prefix}.${status}`)}</Badge>;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  const { t } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  // Callers usually pass a fresh arrow function each render. Keeping it in a ref means the effect below runs only
  // when the dialog opens or closes, so typing inside it never moves focus away from the field.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    if (!ref.current?.contains(document.activeElement)) ref.current?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; prev?.focus?.(); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={id}
        className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-xl bg-surface shadow-xl outline-none sm:rounded-lg ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line bg-surface px-5 py-3">
          <h2 id={id} className="text-lg font-bold">{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t("c.close")}><Icon name="x" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ icon = "box", title, text, children }: { icon?: string; title: ReactNode; text?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-14 text-center">
      <span className="mb-4 grid size-16 place-items-center rounded-full bg-surface-2 text-muted"><Icon name={icon} size={30} /></span>
      <h2 className="text-xl font-bold">{title}</h2>
      {text && <p className="mt-2 text-muted">{text}</p>}
      {children && <div className="mt-5 flex flex-wrap justify-center gap-3">{children}</div>}
    </div>
  );
}

/** Product photo, or the category line drawing on an enclosure-grey plate when no photo has been uploaded. */
export function ProductImage({ src, alt, glyph, className = "", eager }: { src?: string | null; alt: string; glyph?: string | null; className?: string; eager?: boolean }) {
  if (src) return <img src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" className={`size-full object-contain ${className}`} />;
  return (
    <span className={`plate-ph grid size-full place-items-center ${className}`} role="img" aria-label={alt}>
      <Glyph name={glyph} size="46%" strokeWidth={1.1} />
    </span>
  );
}

export function Breadcrumbs({ items }: { items: { name: string; to?: string }[] }) {
  const { t } = useApp();
  return (
    <nav aria-label={t("c.breadcrumb")} className="mb-4 text-sm text-muted">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <li><Link to="/" className="hover:text-accent">{t("nav.home")}</Link></li>
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <Icon name="chev" size={13} className="opacity-60" />
            {it.to && i < items.length - 1 ? <Link to={it.to} className="hover:text-accent">{it.name}</Link> : <span className="text-fg" aria-current="page">{it.name}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  const { t } = useApp();
  if (pages <= 1) return null;
  const nums: (number | "…")[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  return (
    <nav className="mt-8 flex flex-wrap items-center justify-center gap-1.5" aria-label={t("c.pagination")}>
      <button type="button" className="page-btn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t("c.prev")}><Icon name="chev" size={16} className="rotate-180" /></button>
      {nums.map((n, i) => n === "…" ? <span key={`e${i}`} className="px-1 text-muted">…</span> : (
        <button type="button" key={n} className={`page-btn ${n === page ? "page-btn-on" : ""}`} aria-current={n === page ? "page" : undefined} onClick={() => onPage(n)}>{n}</button>
      ))}
      <button type="button" className="page-btn" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t("c.next")}><Icon name="chev" size={16} /></button>
    </nav>
  );
}
