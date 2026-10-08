/**
 * Installed-app support on the client: service-worker registration, the browser's install prompt
 * (Android, Windows, macOS, ChromeOS via Chrome/Edge/Samsung Internet), iOS detection for the manual
 * "Add to Home Screen" steps, standalone (installed) mode and connectivity.
 */
import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }
let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

/** Call once, as early as possible: the install prompt event can fire right after load. */
export function initPwa() {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as InstallPromptEvent; emit(); });
  window.addEventListener("appinstalled", () => { deferred = null; installed = true; emit(); });
  const secure = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if ("serviceWorker" in navigator && secure) {
    window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => {}); });
  }
}

export const isStandalone = () =>
  typeof window !== "undefined" && (matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true);
export const isIOS = () =>
  typeof navigator !== "undefined" && (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

export interface InstallState {
  ready: boolean;        // false during server render / before mount — render nothing install-related then
  standalone: boolean;   // running as the installed app
  canPrompt: boolean;    // the browser offers its own install dialog
  ios: boolean;          // iPhone / iPad: install is manual (Share → Add to Home Screen)
  installed: boolean;
  prompt(): Promise<"accepted" | "dismissed" | "unavailable">;
}

export function useInstall(): InstallState {
  const [, tick] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    listeners.add(f); setReady(true);
    return () => { listeners.delete(f); };
  }, []);
  return {
    ready,
    standalone: ready && isStandalone(),
    canPrompt: ready && !!deferred,
    ios: ready && isIOS(),
    installed: installed,
    async prompt() {
      if (!deferred) return "unavailable";
      const ev = deferred;
      await ev.prompt();
      const { outcome } = await ev.userChoice;
      deferred = null; emit();
      return outcome;
    },
  };
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return online;
}

/** On sign-out: drop pages the service worker kept for offline use (they can show the customer's name and cart count). */
export function clearCachedPages() {
  try { navigator.serviceWorker?.controller?.postMessage("clear-pages"); } catch { /* no service worker */ }
}

/** Small persistent preference (banner dismissed); storage may be unavailable in private mode. */
export const pref = {
  get(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } },
  set(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* ignore */ } },
};
