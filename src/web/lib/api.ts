/** Browser-side API client: JSON in/out, CSRF header, language header, typed errors. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: any) {
    super(message);
  }
  /** Per-field validation codes (422 responses). */
  get fields(): Record<string, string> {
    return (this.details?.fields ?? {}) as Record<string, string>;
  }
}

export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

export function currentLang(): string {
  return typeof document === "undefined" ? "ar" : document.documentElement.dataset.lang || "ar";
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal } = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET");
  const headers: Record<string, string> = { accept: "application/json", "x-lang": currentLang() };
  if (method !== "GET") headers["x-csrf-token"] = readCookie("csrf") ?? "";
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined), credentials: "same-origin", signal: opts.signal });
  } catch (e) {
    if ((e as any)?.name === "AbortError") throw e;
    throw new ApiError(0, "network", "network");
  }
  const type = res.headers.get("content-type") ?? "";
  const data = type.includes("application/json") ? await res.json().catch(() => ({})) : null;
  if (!res.ok) {
    const err = (data as any)?.error ?? {};
    throw new ApiError(res.status, err.code ?? "internal", err.message ?? "Request failed", err.details);
  }
  return data as T;
}

/** Download a file from an authenticated endpoint (CSV / XLSX exports). */
export function download(path: string) {
  const a = document.createElement("a");
  a.href = path;
  a.rel = "noopener";
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
