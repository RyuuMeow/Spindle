export const modes = ["source", "rendered", "reader", "graph"] as const;
export type AppearanceMode = (typeof modes)[number];
export type Typography = {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  foreground: string;
  background: string;
  selection: string;
  matches: string;
  symbols: string;
  highlightMatches: boolean;
  highlightSymbols: boolean;
  search: string;
  searchCurrent: string;
  cursor: string;
  activeLine: string;
  highlightLine: boolean;
};
export const globalDefaults: Typography = {
  fontFamily: "system-sans",
  fontSize: 16,
  lineHeight: 1.8,
  foreground: "#cdcdcd",
  background: "#1c1c1c",
  selection: "#464646",
  matches: "#65758c55",
  symbols: "#8eaac9aa",
  highlightMatches: true,
  highlightSymbols: true,
  search: "#bba65b44",
  searchCurrent: "#bba65b88",
  cursor: "#cccccc",
  activeLine: "#282828",
  highlightLine: false,
};
export const syntaxDefaults = {
  comment: "#969696",
  "keyword.header": "#8eaac9",
  "type.identifier": "#cbbb9d",
  keyword: "#b8a1ca",
  function: "#99bdb5",
  variable: "#b8aaca",
  "keyword.option": "#96adc8",
  string: "#aec09d",
  number: "#c6af96",
  "delimiter.node": "#999999",
  tag: "#aaaaaa",
};
export type SourceOptions = {
  lineNumbers: boolean;
  wordWrap: boolean;
  tabSize: 2 | 4 | 8;
  insertSpaces: boolean;
  whitespace: "none" | "selection" | "all";
  indentGuides: boolean;
};
export type EditorAppearance = {
  version: 1;
  global: Typography;
  modes: Record<AppearanceMode, Partial<Typography>>;
  source: SourceOptions;
  syntax: typeof syntaxDefaults;
  widths: Record<"rendered" | "reader", "standard" | "wide">;
};
type Nullable<T> = { [K in keyof T]?: T[K] | null };
export type AppearancePatch = {
  global?: Partial<Typography>;
  modes?: Partial<Record<AppearanceMode, Nullable<Typography> | null>>;
  source?: Partial<SourceOptions>;
  syntax?: Partial<typeof syntaxDefaults>;
  widths?: Partial<EditorAppearance["widths"]>;
  reset?: "global" | AppearanceMode;
};
export function defaultAppearance(): EditorAppearance {
  return {
    version: 1,
    global: { ...globalDefaults },
    modes: {
      source: { fontFamily: "system-mono" },
      rendered: {},
      reader: {},
      graph: { fontSize: 14 },
    },
    source: {
      lineNumbers: false,
      wordWrap: true,
      tabSize: 4,
      insertSpaces: true,
      whitespace: "none",
      indentGuides: false,
    },
    syntax: { ...syntaxDefaults },
    widths: { rendered: "standard", reader: "standard" },
  };
}
export function validStyle(key: string, value: unknown): boolean {
  if (key === "fontFamily")
    return (
      typeof value === "string" &&
      !!value.trim() &&
      value.length <= 150 &&
      !/[;{}<>\r\n]/.test(value)
    );
  if (key === "fontSize")
    return (
      Number.isInteger(value) && Number(value) >= 10 && Number(value) <= 40
    );
  if (key === "lineHeight")
    return (
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 1 &&
      value <= 2.5
    );
  if (["highlightLine", "highlightMatches", "highlightSymbols"].includes(key))
    return typeof value === "boolean";
  return (
    Object.hasOwn(globalDefaults, key) &&
    typeof value === "string" &&
    /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)
  );
}
const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
/** Tolerant persisted-data reader; invalid individual fields fall back, never spread unknown keys. */
export function normalizeAppearance(raw: unknown): EditorAppearance {
  const next = defaultAppearance();
  if (!isRecord(raw) || raw.version !== 1) return next;
  if (isRecord(raw.global))
    for (const key of Object.keys(globalDefaults) as (keyof Typography)[]) {
      const value = raw.global[key];
      if (validStyle(key, value)) Object.assign(next.global, { [key]: value });
    }
  if (isRecord(raw.modes))
    for (const mode of modes) {
      const values = raw.modes[mode];
      if (isRecord(values)) {
        next.modes[mode] = {};
        for (const key of Object.keys(globalDefaults))
          if (validStyle(key, values[key]))
            Object.assign(next.modes[mode], { [key]: values[key] });
      }
    }
  if (isRecord(raw.source))
    for (const key of Object.keys(next.source) as (keyof SourceOptions)[]) {
      const value = raw.source[key];
      if (validSource(key, value)) Object.assign(next.source, { [key]: value });
    }
  if (isRecord(raw.syntax))
    for (const key of Object.keys(syntaxDefaults)) {
      const value = raw.syntax[key];
      if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value))
        Object.assign(next.syntax, { [key]: value });
    }
  if (isRecord(raw.widths))
    for (const mode of ["reader", "rendered"] as const)
      if (["standard", "wide"].includes(String(raw.widths[mode])))
        next.widths[mode] = raw.widths[mode] as "standard" | "wide";
  return next;
}
function validSource(key: string, value: unknown) {
  if (key === "tabSize")
    return [2, 4, 8].includes(Number(value)) && typeof value === "number";
  if (key === "whitespace")
    return ["none", "selection", "all"].includes(String(value));
  return (
    ["lineNumbers", "wordWrap", "insertSpaces", "indentGuides"].includes(key) &&
    typeof value === "boolean"
  );
}
/** Patches are merged against authoritative current state, not a renderer snapshot. */
export function patchAppearance(
  current: unknown,
  patch: AppearancePatch,
): EditorAppearance {
  const next = normalizeAppearance(current),
    defaults = defaultAppearance();
  if (patch.reset === "global") next.global = defaults.global;
  else if (patch.reset && modes.includes(patch.reset)) {
    next.modes[patch.reset] = defaults.modes[patch.reset];
    if (patch.reset === "source") {
      next.source = defaults.source;
      next.syntax = defaults.syntax;
    }
    if (patch.reset === "rendered" || patch.reset === "reader")
      next.widths[patch.reset] = "standard";
  }
  for (const [key, value] of Object.entries(patch.global || {})) {
    if (!validStyle(key, value)) throw Error("風格設定值無效：" + key);
    Object.assign(next.global, { [key]: value });
  }
  for (const mode of modes)
    if (patch.modes && mode in patch.modes) {
      const values = patch.modes[mode];
      if (values === null) next.modes[mode] = {};
      else
        for (const [key, value] of Object.entries(values || {})) {
          if (
            !Object.hasOwn(globalDefaults, key) ||
            (value !== null && !validStyle(key, value))
          )
            throw Error("風格設定值無效：" + key);
          if (value === null) delete next.modes[mode][key as keyof Typography];
          else Object.assign(next.modes[mode], { [key]: value });
        }
    }
  for (const [key, value] of Object.entries(patch.source || {})) {
    if (!validSource(key, value)) throw Error("編輯設定值無效：" + key);
    Object.assign(next.source, { [key]: value });
  }
  for (const [key, value] of Object.entries(patch.syntax || {})) {
    if (
      !Object.hasOwn(syntaxDefaults, key) ||
      !/^#[0-9a-f]{6}$/i.test(String(value))
    )
      throw Error("語法顏色無效");
    Object.assign(next.syntax, { [key]: value });
  }
  for (const mode of ["rendered", "reader"] as const)
    if (patch.widths?.[mode] !== undefined) {
      const value = patch.widths[mode];
      if (value !== "standard" && value !== "wide") throw Error("閱讀寬度無效");
      next.widths[mode] = value;
    }
  return next;
}
export function resolveAppearance(
  value: EditorAppearance,
  mode: AppearanceMode,
): Typography {
  return { ...value.global, ...value.modes[mode] };
}
export function fontStack(font: string): string {
  if (font === "system-sans")
    return '"Segoe UI", "Microsoft JhengHei", sans-serif';
  if (font === "system-mono")
    return 'Consolas, "SFMono-Regular", "Microsoft JhengHei", monospace';
  return `${JSON.stringify(font)}, "Segoe UI", "Microsoft JhengHei", sans-serif`;
}
export function migrateAppearance(session?: {
  readingSize?: number;
  readingLineHeight?: number;
  readingWidth?: "standard" | "wide";
  lineNumbers?: boolean;
}): EditorAppearance {
  const next = defaultAppearance();
  if (!session) return next;
  const size = validStyle("fontSize", session.readingSize)
    ? session.readingSize!
    : 16;
  const line = Math.max(
    1,
    Math.min(2.5, (session.readingLineHeight || 29) / size),
  );
  for (const mode of ["rendered", "reader"] as const) {
    next.modes[mode] = {
      fontSize: size,
      lineHeight: Math.round(line * 1000) / 1000,
    };
    next.widths[mode] = session.readingWidth === "wide" ? "wide" : "standard";
  }
  next.source.lineNumbers = session.lineNumbers === true;
  return next;
}
