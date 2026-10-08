import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { sar, toHalalas } from "../shared/constants";
import { api, download } from "../web/lib/api";
import { useApp } from "../web/lib/ctx";
import { Icon } from "../web/ui/Icon";
import { Button, Input, Modal } from "../web/ui/kit";

export interface Me { id: number; name: string; email: string; role: string | null; permissions: string[] }
export interface AdminCtx {
  me: Me;
  can(perm: string): boolean;
  path: string;
  query: URLSearchParams;
  go(to: string, replace?: boolean): void;
  unread: number;
  setUnread(n: number): void;
}
/** A record's name in the language the admin is using; Arabic is always filled in, so it is the fallback. */
export const nm = (r: any): string => { const l = typeof document !== "undefined" ? document.documentElement.lang : "ar"; return (r && (r[`name_${l}`] || r.name_ar)) || ""; };
export const AdminContext = createContext<AdminCtx | null>(null);
export const useAdmin = () => useContext(AdminContext)!;

/** GET helper with loading / error state; `reload()` refetches. Pass null to skip. */
export function useFetch<T = any>(url: string | null) {
  const app = useApp();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!url);
  const seq = useRef(0);
  const reload = useCallback(async () => {
    if (!url) return;
    const my = ++seq.current;
    setLoading(true);
    try { const d = await api<T>(url); if (my === seq.current) setData(d); }
    catch (e) { if (my === seq.current) app.toast(app.errorText(e), "err"); }
    finally { if (my === seq.current) setLoading(false); }
  }, [url]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, loading, reload, setData };
}

/** Runs an API mutation with a busy flag and error toast. Returns true on success. */
export function useAction() {
  const app = useApp();
  const [busy, setBusy] = useState<string>("");
  const run = async (name: string, fn: () => Promise<unknown>, okText?: string): Promise<boolean> => {
    setBusy(name);
    try { await fn(); if (okText) app.toast(okText); return true; }
    catch (e) { app.toast(app.errorText(e), "err"); return false; }
    finally { setBusy(""); }
  };
  return { busy, run };
}

export function PageHead({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-bold">{title}</h1>{sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}</div>
      {children && <div className="no-print flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export interface Column<R = any> { key: string; label: ReactNode; render?: (row: R) => ReactNode; className?: string }

export function DataTable<R extends Record<string, any>>({ columns, rows, onRow, empty, loading, rowKey = "id" }: { columns: Column<R>[]; rows: R[] | null | undefined; onRow?: (r: R) => void; empty?: ReactNode; loading?: boolean; rowKey?: string }) {
  const { t } = useApp();
  return (
    <div className="card overflow-x-auto">
      <table className="table-x">
        <thead><tr>{columns.map((c) => <th key={c.key} className={c.className}>{c.label}</th>)}</tr></thead>
        <tbody>
          {!rows?.length ? (
            <tr><td colSpan={columns.length} className="py-10 text-center text-muted">{loading || !rows ? t("c.loading") : empty ?? t("a.no_rows")}</td></tr>
          ) : rows.map((r, i) => (
            <tr key={r[rowKey] ?? i} className={onRow ? "cursor-pointer hover:bg-surface-2" : undefined} onClick={onRow ? (e) => { if (!(e.target as HTMLElement).closest("a,button,input,select,label")) onRow(r); } : undefined}>
              {columns.map((c) => <td key={c.key} className={c.className}>{c.render ? c.render(r) : r[c.key] ?? "—"}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const { t } = useApp();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => { const id = setTimeout(() => { if (text !== value) onChange(text); }, 300); return () => clearTimeout(id); }, [text]);
  return (
    <span className="relative block w-full sm:w-64">
      <Icon name="search" size={16} className="pointer-events-none absolute start-3 top-3 text-muted" />
      <Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder ?? t("a.search")} className="h-10 ps-9" aria-label={placeholder ?? t("a.search")} />
    </span>
  );
}

/** CSV / Excel download plus print (the browser's "Save as PDF" gives the PDF copy). */
export function ExportButtons({ url }: { url: string }) {
  const { t } = useApp();
  const join = url.includes("?") ? "&" : "?";
  return (
    <>
      <Button variant="outline" size="sm" icon="download" onClick={() => download(`${url}${join}format=xlsx`)}>Excel</Button>
      <Button variant="outline" size="sm" icon="download" onClick={() => download(`${url}${join}format=csv`)}>CSV</Button>
      <Button variant="outline" size="sm" icon="print" onClick={() => window.print()}>{t("a.print_pdf")}</Button>
    </>
  );
}

export function Confirm({ open, title, text, danger, busy, onYes, onNo, yes }: { open: boolean; title: string; text?: ReactNode; danger?: boolean; busy?: boolean; onYes: () => void; onNo: () => void; yes?: string }) {
  const { t } = useApp();
  return (
    <Modal open={open} onClose={onNo} title={title}>
      {text && <p className="mb-5 text-muted">{text}</p>}
      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={onNo}>{t("c.cancel")}</Button>
        <Button variant={danger ? "danger" : "primary"} busy={busy} onClick={onYes}>{yes ?? t("a.confirm")}</Button>
      </div>
    </Modal>
  );
}

/** SAR amount input bound to an integer halalas value (null = empty). */
export function MoneyInput({ value, onChange, invalid, placeholder }: { value: number | null | undefined; onChange: (h: number | null) => void; invalid?: boolean; placeholder?: string }) {
  const fmt = (h: number | null | undefined) => (h === null || h === undefined ? "" : (h / 100).toFixed(2));
  const [text, setText] = useState(fmt(value));
  const last = useRef(value);
  useEffect(() => { if (value !== last.current) { last.current = value; setText(fmt(value)); } }, [value]);
  return (
    <span className="relative block" dir="ltr">
      <Input inputMode="decimal" className="pe-12 tabular-nums" value={text} invalid={invalid} placeholder={placeholder ?? "0.00"}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d.٠-٩٫]/g, "");
          setText(raw);
          const h = raw.trim() === "" ? null : toHalalas(raw);
          const next = h === null || Number.isNaN(h) ? null : h;
          last.current = next; onChange(next);
        }}
        onBlur={() => setText(fmt(last.current))} />
      <span className="pointer-events-none absolute end-3 top-2.5 text-sm text-muted">SAR</span>
    </span>
  );
}

export const moneyPlain = (h: number | null | undefined) => sar(h);

/** Stat tile used on the dashboard and report summaries. */
export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "ok" | "danger" | "warn" }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tone === "danger" ? "text-danger" : tone === "ok" ? "text-ok" : ""}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

declare global { interface Window { BarcodeDetector?: any } }

/**
 * Barcode entry: works with USB / Bluetooth scanners (they type the code and press Enter) and, where the browser
 * supports the BarcodeDetector API (Chrome and Edge on Android, Samsung Internet), with the phone camera.
 */
export function ScanInput({ onCode, placeholder, autoFocus }: { onCode: (code: string) => void; placeholder?: string; autoFocus?: boolean }) {
  const { t } = useApp();
  const [text, setText] = useState("");
  const [cam, setCam] = useState(false);
  const [supported, setSupported] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setSupported(typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia), []);
  const submit = (code: string) => { const c = code.trim(); if (c) onCode(c); setText(""); ref.current?.focus(); };
  return (
    <>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); submit(text); }}>
        <span className="relative block flex-1">
          <Icon name="barcode" size={18} className="pointer-events-none absolute start-3 top-3 text-muted" />
          <input ref={ref} className="input ps-10" dir="ltr" autoFocus={autoFocus} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder ?? t("a.scan_ph")} aria-label={placeholder ?? t("a.scan_ph")} autoComplete="off" />
        </span>
        <Button type="submit" variant="outline">{t("a.find")}</Button>
        {supported && <Button variant="dark" icon="camera" onClick={() => setCam(true)}>{t("a.camera")}</Button>}
      </form>
      {!supported && <p className="mt-1 text-xs text-muted">{t("a.camera_unsupported")}</p>}
      <Modal open={cam} onClose={() => setCam(false)} title={t("a.camera_scan")}>
        {cam && <CameraScanner onCode={(c) => { setCam(false); submit(c); }} />}
      </Modal>
    </>
  );
}

function CameraScanner({ onCode }: { onCode: (code: string) => void }) {
  const { t } = useApp();
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (stop) { stream.getTracks().forEach((x) => x.stop()); return; }
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "itf", "qr_code"] });
        const tick = async () => {
          if (stop) return;
          try {
            const codes = await detector.detect(v);
            if (codes.length && codes[0].rawValue) { onCode(String(codes[0].rawValue)); return; }
          } catch { /* frame not ready */ }
          setTimeout(tick, 180);
        };
        void tick();
      } catch { setError(t("a.camera_denied")); }
    })();
    return () => { stop = true; stream?.getTracks().forEach((x) => x.stop()); };
  }, []);
  return error ? <p className="rounded-md bg-danger-soft p-4">{error}</p> : (
    <div>
      <div className="relative overflow-hidden rounded-md bg-black">
        <video ref={video} playsInline muted className="aspect-[4/3] w-full object-cover" />
        <span className="absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-danger/80" aria-hidden="true" />
      </div>
      <p className="mt-3 text-center text-sm text-muted">{t("a.camera_hint")}</p>
    </div>
  );
}

/** Keeps list filters in the URL query string so views can be bookmarked and survive reloads. */
export function useQueryState() {
  const admin = useAdmin();
  const set = (patch: Record<string, string | null>, keepPage = false) => {
    const q = new URLSearchParams(admin.query);
    if (!keepPage) q.delete("page");
    for (const [k, v] of Object.entries(patch)) { if (v === null || v === "") q.delete(k); else q.set(k, v); }
    const qs = q.toString();
    admin.go(`${admin.path}${qs ? `?${qs}` : ""}`, true);
  };
  return { q: admin.query, get: (k: string) => admin.query.get(k) ?? "", set, qs: admin.query.toString() };
}
