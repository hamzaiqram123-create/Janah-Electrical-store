import { config } from "./config";

const levels = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof levels;
const min = levels[config.LOG_LEVEL];

function write(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (levels[level] < min) return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...meta });
  (level === "error" || level === "warn" ? console.error : console.log)(line);
}

/** Structured JSON logger (one line per event, ready for any log collector). */
export const log = {
  debug: (msg: string, meta?: Record<string, unknown>) => write("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => write("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => write("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write("error", msg, meta),
};

export function errMeta(e: unknown): Record<string, unknown> {
  if (e instanceof Error) return { error: e.message, stack: e.stack?.split("\n").slice(0, 6).join("\n") };
  return { error: String(e) };
}
