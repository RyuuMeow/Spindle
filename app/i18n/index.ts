import en from "./en.json" with { type: "json" };
import tw from "./zh-TW.json" with { type: "json" };
import cn from "./zh-CN.json" with { type: "json" };
export type Locale = "en" | "zh-TW" | "zh-CN";
export type LanguagePreference = Locale | "system";
export type MessageKey = keyof typeof en;
let active: Locale | undefined;
export function resolveLocale(language: string): Locale {
  if (/^zh(?:-|$)/i.test(language))
    return /(?:Hant|TW|HK|MO)/i.test(language) ? "zh-TW" : "zh-CN";
  return "en";
}
export function validLanguage(value: unknown): LanguagePreference {
  return value === "en" || value === "zh-TW" || value === "zh-CN"
    ? value
    : "system";
}
export function locale(): Locale {
  if (active) return active;
  let requested: string | undefined;
  if (typeof window !== "undefined") {
    requested = window.yarnDesktop?.locale;
    if (!requested)
      try {
        requested = JSON.parse(
          localStorage.getItem("spindle.preferences.v1") || "null",
        )?.language;
      } catch {
        /* Recovery is handled by the preferences service. */
      }
  } else if (typeof process !== "undefined")
    requested = process.env.SPINDLE_LOCALE;
  active = resolveLocale(
    requested && requested !== "system"
      ? requested
      : typeof navigator !== "undefined"
        ? navigator.language
        : Intl.DateTimeFormat().resolvedOptions().locale,
  );
  return active;
}
export function t(key: MessageKey, args: readonly unknown[] = []): string {
  const dict = locale() === "zh-TW" ? tw : locale() === "zh-CN" ? cn : en;
  return (dict[key] ?? en[key]).replace(/\{(\d+)\}/g, (_, index) =>
    String(args[Number(index)] ?? ""),
  );
}
export function number(value: number) {
  return new Intl.NumberFormat(locale()).format(value);
}
export function date(value: number) {
  return new Intl.DateTimeFormat(locale(), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}
export type LocalizedMessage = {
  code: MessageKey;
  args?: readonly (string | number)[];
};
export function message(value: LocalizedMessage) {
  return t(value.code, value.args);
}
