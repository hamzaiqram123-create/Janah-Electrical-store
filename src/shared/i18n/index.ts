import type { Lang } from "../constants";
import { ar } from "./ar";
import { en } from "./en";
import { ur } from "./ur";
import { fill, type Dict } from "./format";

export { fill, makeT, type Dict, type T } from "./format";

export const dicts: Record<Lang, Dict> = { ar, en, ur };

/** Server-side translate: `lang` → English → key. */
export function tr(lang: Lang, key: string, vars?: Record<string, string | number | null | undefined>): string {
  return fill(dicts[lang]?.[key] ?? dicts.en[key] ?? key, vars);
}
export const hasKey = (lang: Lang, key: string) => key in dicts[lang];
export const allKeys = (lang: Lang) => Object.keys(dicts[lang]);
