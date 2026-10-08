import { useEffect, useState } from "react";
import { useApp } from "../lib/ctx";
import { pref, useInstall, useOnline } from "../lib/pwa";
import { Icon } from "../ui/Icon";
import { Button, Modal } from "../ui/kit";

/**
 * One install action for every device: the browser's own dialog where it exists (Android, Windows, macOS,
 * ChromeOS), the Share → Add to Home Screen steps on iPhone/iPad, and short menu instructions elsewhere.
 */
export function useInstallAction() {
  const inst = useInstall();
  const [help, setHelp] = useState<"ios" | "other" | null>(null);
  const visible = inst.ready && !inst.standalone && !inst.installed;
  const run = async () => {
    if (inst.canPrompt) { await inst.prompt(); return; }
    setHelp(inst.ios ? "ios" : "other");
  };
  const modal = <InstallHelp kind={help} onClose={() => setHelp(null)} />;
  return { inst, visible, run, modal };
}

function InstallHelp({ kind, onClose }: { kind: "ios" | "other" | null; onClose: () => void }) {
  const { t } = useApp();
  return (
    <Modal open={!!kind} onClose={onClose} title={kind === "ios" ? t("app.ios_title") : t("app.other_title")}>
      {kind === "ios" ? (
        <ol className="space-y-4">
          {[["share", "app.ios_step1"], ["plus_square", "app.ios_step2"], ["check", "app.ios_step3"]].map(([icon, key], i) => (
            <li key={key} className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft font-bold text-accent tabular-nums">{i + 1}</span>
              <span className="flex flex-1 items-start gap-2 pt-1.5"><Icon name={icon!} size={20} className="mt-0.5 shrink-0 text-info" />{t(key!)}</span>
            </li>
          ))}
        </ol>
      ) : <p className="leading-relaxed">{t("app.other_text")}</p>}
      <div className="mt-6 flex justify-end"><Button onClick={onClose}>{t("c.close")}</Button></div>
    </Modal>
  );
}

const DISMISS_KEY = "app-banner-dismissed";
let navigations = 0;

/** Phone-only invitation above the bottom navigation. Appears after the visitor has looked around, never during checkout. */
export function InstallBanner() {
  const app = useApp();
  const { t } = app;
  const { inst, visible, run, modal } = useInstallAction();
  const [engaged, setEngaged] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    const at = Number(pref.get(DISMISS_KEY) ?? 0);
    setDismissed(Date.now() - at < 30 * 86400_000);
    const timer = setTimeout(() => setEngaged(true), 20_000);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => { if (++navigations > 1) setEngaged(true); }, [app.route.path]);
  // not while buying (and not over the product page's sticky add-to-cart bar)
  const busyPage = ["checkout", "cart", "product", "invoice", "login", "register", "forgot", "reset"].includes(app.route.name);
  const show = visible && (inst.canPrompt || inst.ios) && engaged && !dismissed && !busyPage;
  useEffect(() => {
    document.documentElement.style.setProperty("--app-banner", show ? "76px" : "0px");
    return () => { document.documentElement.style.setProperty("--app-banner", "0px"); };
  }, [show]);
  const dismiss = () => { pref.set(DISMISS_KEY, String(Date.now())); setDismissed(true); };
  return (
    <>
      {show && (
        <div className="no-print fixed inset-x-2 bottom-[calc(64px+env(safe-area-inset-bottom))] z-40 md:hidden" role="region" aria-label={t("app.get_app")}>
          <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-2.5 shadow-lg">
            <img src="/icons/icon-192.png" alt="" width="44" height="44" className="size-11 shrink-0 rounded-[10px]" />
            <div className="min-w-0 flex-1 leading-snug">
              <p className="line-clamp-2 text-sm font-bold">{t("app.banner")}</p>
              <p className="line-clamp-1 text-xs text-muted">{t("app.banner_sub")}</p>
            </div>
            <Button size="sm" className="shrink-0" onClick={() => void run()}>{t("app.install_short")}</Button>
            <button type="button" className="icon-btn -me-1 size-9 text-muted" onClick={dismiss} aria-label={t("app.not_now")}><Icon name="x" size={18} /></button>
          </div>
        </div>
      )}
      {modal}
    </>
  );
}

/** Footer block offering the app on every device. */
export function GetTheApp() {
  const { t } = useApp();
  const { visible, run, modal } = useInstallAction();
  if (!visible) return null;
  return (
    <div className="mt-6 flex max-w-sm items-start gap-3 rounded-md border border-header-line p-3">
      <img src="/icons/icon-192.png" alt="" width="40" height="40" className="size-10 shrink-0 rounded-[9px]" />
      <div className="min-w-0">
        <p className="font-bold">{t("app.get_app")}</p>
        <p className="mt-0.5 text-sm opacity-80">{t("app.get_app_text")}</p>
        <button type="button" onClick={() => void run()} className="mt-2.5 inline-flex h-9 items-center gap-2 rounded-md bg-[#e39a5b] px-3 text-sm font-bold text-[#17202a] hover:bg-[#eaa96f]">
          <Icon name="device" size={17} />{t("app.install")}
        </button>
      </div>
      {modal}
    </div>
  );
}

/** Menu row (mobile drawer). */
export function InstallMenuItem() {
  const { t } = useApp();
  const { visible, run, modal } = useInstallAction();
  if (!visible) return null;
  return (
    <>
      <button type="button" onClick={() => void run()} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-start font-semibold text-accent hover:bg-surface-2">
        <Icon name="device" />{t("app.install")}
      </button>
      {modal}
    </>
  );
}

/** Thin notice while the device has no connection. */
export function OfflineBar() {
  const { t } = useApp();
  const online = useOnline();
  if (online) return null;
  return (
    <div className="no-print sticky top-0 z-50 flex items-center justify-center gap-2 bg-warn px-4 py-1.5 text-center text-sm font-semibold text-[#17202a]" role="status">
      <Icon name="wifi_off" size={16} />{t("app.offline")}
    </div>
  );
}
