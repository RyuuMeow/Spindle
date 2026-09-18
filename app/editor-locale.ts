let localeReady: Promise<void> | undefined;

/** Monaco 0.56's language bundle is a plain script, not an AMD module. */
export function loadEditorLocale(): Promise<void> {
  if (localeReady) return localeReady;
  localeReady = new Promise(resolve => {
    const script = document.createElement('script');
    script.src = '/monaco/vs/nls/lang/zh-tw.js';
    const finish = (loaded: boolean) => {
      window.clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      if (!loaded) {
        script.remove();
        console.warn('無法載入編輯器繁體中文語系，改用預設語系。');
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
