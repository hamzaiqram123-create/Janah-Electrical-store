/** Dictionary helpers with no dictionary imports, safe to include in browser bundles. */
export type Dict = Record<string, string>;
export type T = (key: string, vars?: Record<string, string | number | null | undefined>) => string;

export function fill(s: string, vars?: Record<string, string | number | null | undefined>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
}

/** Build a translator over one or more dictionaries (first hit wins); unknown keys fall back to the key itself. */
export function makeT(...sources: Dict[]): T {
  return (key, vars) => {
    for (const d of sources) if (d[key] !== undefined) return fill(d[key]!, vars);
    return key;
  };
}
