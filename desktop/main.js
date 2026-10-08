// شركة جناح الريادة — Windows app. Opens the online store (or the back office) in its own window.
const { app, BrowserWindow, Menu, shell, session } = require("electron");
const path = require("path");
const { url: SITE } = require("./config.json");

const ORIGIN = new URL(SITE).origin;
// Links to these open in the customer's own apps / browser instead of inside the store window.
const EXTERNAL = /^(mailto:|tel:|sms:|whatsapp:)|^https:\/\/(wa\.me|api\.whatsapp\.com|maps\.google\.|www\.google\.com\/maps|goo\.gl\/maps|www\.instagram\.com|x\.com|twitter\.com|www\.tiktok\.com|www\.snapchat\.com)/i;

app.setAppUserModelId("sa.janah.store");
if (!app.requestSingleInstanceLock()) app.quit();

const lang = () => {
  const l = (app.getLocale() || "ar").slice(0, 2).toLowerCase();
  return ["ar", "en", "ur"].includes(l) ? l : "ar";
};
const startUrl = (admin) => (admin ? `${ORIGIN}/admin` : `${ORIGIN}/${lang()}?source=windows`);
const t = (ar, en) => (lang() === "en" ? en : ar);

let win = null;

function open(target) {
  if (!win) return;
  // a branded loading screen stays up while the store loads (a sleeping free-plan server can take a minute)
  win.loadFile(path.join(__dirname, "loading.html"), { query: { u: target } });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 360, minHeight: 560,
    backgroundColor: "#17202a",
    title: t("جناح الريادة", "Janah Al Riyada"),
    icon: path.join(__dirname, "icon.png"),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });

  const wc = win.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(ORIGIN)) return { action: "allow", overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: path.join(__dirname, "icon.png") } }; // e.g. printable invoice
    if (/^(https?|mailto|tel|sms|whatsapp):/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  wc.on("will-navigate", (e, url) => {
    if (url.startsWith("file:") || url.startsWith(ORIGIN)) return;
    if (EXTERNAL.test(url) || !url.startsWith("https:")) { e.preventDefault(); if (/^(https?|mailto|tel|sms|whatsapp):/i.test(url)) shell.openExternal(url); }
    // other https pages (the payment provider's checkout) open in the window and return to the store
  });
  wc.on("did-fail-load", (_e, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* aborted by a new navigation */) return;
    win.loadFile(path.join(__dirname, "offline.html"), { query: { u: url && url.startsWith(ORIGIN) ? url : startUrl(false), lang: lang() } });
  });
  wc.on("page-title-updated", (e) => { e.preventDefault(); win.setTitle(t("جناح الريادة", "Janah Al Riyada")); });

  open(startUrl(process.argv.includes("--admin")));
}

function buildMenu() {
  const nav = (fn) => () => win && fn(win.webContents);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: t("المتجر", "Store"), submenu: [
      { label: t("الرئيسية", "Home"), accelerator: "Alt+Home", click: () => open(startUrl(false)) },
      { label: t("لوحة الإدارة", "Back office"), click: () => open(startUrl(true)) },
      { type: "separator" },
      { role: "quit", label: t("خروج", "Quit") },
    ] },
    { label: t("عرض", "View"), submenu: [
      { label: t("رجوع", "Back"), accelerator: "Alt+Left", click: nav((wc) => wc.navigationHistory.canGoBack() && wc.navigationHistory.goBack()) },
      { label: t("تقدّم", "Forward"), accelerator: "Alt+Right", click: nav((wc) => wc.navigationHistory.canGoForward() && wc.navigationHistory.goForward()) },
      { label: t("تحديث", "Reload"), accelerator: "F5", click: nav((wc) => wc.reload()) },
      { type: "separator" },
      { role: "zoomIn", label: t("تكبير", "Zoom in") }, { role: "zoomOut", label: t("تصغير", "Zoom out") }, { role: "resetZoom", label: t("الحجم الأصلي", "Actual size") },
      { type: "separator" },
      { role: "togglefullscreen", label: t("ملء الشاشة", "Full screen") },
    ] },
  ]));
}

app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

app.whenReady().then(() => {
  // only what the store uses: clipboard for copy buttons; camera for barcode scanning in the back office
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
    const fromStore = wc.getURL().startsWith(ORIGIN);
    cb(fromStore && ["clipboard-sanitized-write", "media", "fullscreen"].includes(permission));
  });
  buildMenu();
  createWindow();
});

app.on("window-all-closed", () => app.quit());
