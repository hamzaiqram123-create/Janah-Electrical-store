import { hydrateRoot } from "react-dom/client";
import { App } from "./App";
import type { Payload } from "./lib/ctx";

const payload = JSON.parse(document.getElementById("__DATA__")!.textContent!) as Payload;
// Only the active language's dictionary is downloaded.
const dictionaries = {
  ar: () => import("../shared/i18n/ar").then((m) => m.ar),
  en: () => import("../shared/i18n/en").then((m) => m.en),
  ur: () => import("../shared/i18n/ur").then((m) => m.ur),
};
const dict = await dictionaries[payload.shell.lang]();
hydrateRoot(document.getElementById("root")!, <App initial={payload} dict={dict} />);
