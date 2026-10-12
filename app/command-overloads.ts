import type { Command, Param } from "./parser";
import { t } from "./i18n/index.ts";

type Definition = Omit<Command, "params"> & {
  params: (Omit<Param, "type"> & { type: string })[];
  dynamicProperties?: boolean;
};
export type Arguments = string[] | { name: string; value: string }[];

/** A signature includes restrictions, but never presentation or default values. */
export function commandKey(command: Definition): string {
  let params = command.params.map((p) => [
    command.inline ? p.name : "",
    p.type,
    p.required,
    p.allowList?.length ? [...new Set(p.allowList)].sort() : null,
    p.min ?? null,
    p.max ?? null,
    p.integer === true,
  ]);
  if (command.inline)
    params = params.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return JSON.stringify([
    command.name,
    !!command.inline,
    command.markupMode,
    params,
  ]);
}

export function parameterLimits(p: Definition["params"][number]): string {
  return [
    p.allowList?.length
      ? p.allowList.map((v) => JSON.stringify(v)).join(" | ")
      : "",
    p.min !== undefined ? `≥ ${p.min}` : "",
    p.max !== undefined ? `≤ ${p.max}` : "",
    p.integer ? t("command.integer") : "",
  ]
    .filter(Boolean)
    .join(", ");
}
export function signature(c: Definition): string {
  return `${c.name}(${c.params.map((p) => `${p.name}${p.required ? "" : "?"}: ${p.type}${parameterLimits(p) ? ` [${parameterLimits(p)}]` : ""}`).join(", ")})`;
}
export function literal(value: string): string | number | boolean | undefined {
  if (value.startsWith("$") || value.startsWith("{")) return undefined;
  if (/^true$/i.test(value)) return true;
  if (/^false$/i.test(value)) return false;
  if (/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return Number(value);
  if (value.startsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  return value;
}
export function accepts(
  p: Definition["params"][number],
  value: string,
): boolean {
  const v = literal(value);
  if (v === undefined) return true;
  if (typeof v !== p.type) return false;
  if (typeof v === "string" && p.allowList?.length && !p.allowList.includes(v))
    return false;
  if (
    typeof v === "number" &&
    (!Number.isFinite(v) ||
      (p.min !== undefined && v < p.min) ||
      (p.max !== undefined && v > p.max) ||
      (p.integer && !Number.isInteger(v)))
  )
    return false;
  return true;
}
export function constraintError(p: Param): string | null {
  if (
    p.allowList !== undefined &&
    (p.type !== "string" ||
      !Array.isArray(p.allowList) ||
      p.allowList.some((v) => typeof v !== "string") ||
      new Set(p.allowList).size !== p.allowList.length)
  )
    return t("command.invalidLimits");
  if (
    (p.min !== undefined || p.max !== undefined || p.integer !== undefined) &&
    p.type !== "number"
  )
    return t("command.invalidLimits");
  if (
    (p.min !== undefined && !Number.isFinite(p.min)) ||
    (p.max !== undefined && !Number.isFinite(p.max)) ||
    (p.integer !== undefined && typeof p.integer !== "boolean") ||
    (p.min !== undefined &&
      p.max !== undefined &&
      (p.min > p.max || (p.integer && Math.ceil(p.min) > Math.floor(p.max))))
  )
    return t("command.invalidLimits");
  if (p.defaultValue && !accepts(p, p.defaultValue))
    return t("command.invalidDefault");
  return null;
}
/** A quick fix must not insert a value rejected by the same definition. */
export function parameterDefault(
  p: Definition["params"][number],
): string | undefined {
  if (
    p.defaultValue &&
    literal(p.defaultValue) !== undefined &&
    accepts(p, p.defaultValue)
  )
    return p.defaultValue;
  let value: string;
  if (p.type === "string") value = JSON.stringify(p.allowList?.[0] ?? "");
  else if (p.type === "boolean") value = "true";
  else if (p.type === "number") {
    const min = p.integer && p.min !== undefined ? Math.ceil(p.min) : p.min;
    const max = p.integer && p.max !== undefined ? Math.floor(p.max) : p.max;
    value = String(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, 0)));
  } else return undefined;
  return accepts(p, value) ? value : undefined;
}
export function mismatch(
  c: Definition,
  args: Arguments,
  partial = false,
  expressionType?: (value: string) => string | null,
): number {
  let errors = 0;
  c.params.forEach((p, i) => {
    const value = c.inline
      ? (args as { name: string; value: string }[]).find(
          (a) => a.name === p.name,
        )?.value
      : (args[i] as string | undefined);
    if (value === undefined) {
      if (p.required && !partial) errors++;
    } else if (c.dynamicProperties && c.name === "select" && p.name === "value")
      return;
    else if (value.startsWith("$") || value.startsWith("{")) {
      const type = expressionType?.(value);
      if (type && type !== "expression" && type !== p.type) errors++;
    } else if (!accepts(p, value)) errors++;
  });
  if (c.inline)
    errors += (args as { name: string; value: string }[]).filter(
      (a) =>
        a.name !== "trimwhitespace" &&
        !c.dynamicProperties &&
        !c.params.some((p) => p.name === a.name),
    ).length;
  else errors += Math.max(0, args.length - c.params.length);
  return errors;
}
export function bestOverload<T extends Definition>(
  definitions: T[],
  args: Arguments,
  partial = false,
  expressionType?: (value: string) => string | null,
): T | undefined {
  return definitions
    .map((c) => ({ c, score: mismatch(c, args, partial, expressionType) }))
    .sort((a, b) => a.score - b.score)[0]?.c;
}
