import { t as tr, locale } from "./i18n/index.ts";
let localeReady: Promise<void> | undefined;

/** Monaco 0.56's language bundle is a plain script, not an AMD module. */
export function loadEditorLocale(): Promise<void> {
  if (localeReady) return localeReady;
  localeReady = new Promise((resolve) => {
    const script = document.createElement("script");
    if (locale() === "en") {
      resolve();
      return;
    }
    script.src =
      "/monaco/vs/nls/lang/" +
      (locale() === "zh-TW" ? "zh-tw" : "zh-cn") +
      ".js";
    const finish = (loaded: boolean) => {
      window.clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      if (!loaded) {
        script.remove();
        console.warn(tr("mbe12f3fcb5e0"));
      }
      resolve();
    };
    const timeout = window.setTimeout(() => finish(false), 10000);
    script.onload = () => finish(true);
    script.onerror = () => finish(false);
    document.head.appendChild(script);
  });
  return localeReady;
}
