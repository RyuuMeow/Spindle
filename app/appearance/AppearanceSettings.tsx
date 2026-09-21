"use client";
import { useId, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CompactSelect } from "@/components/CompactSelect";
import { SegmentedControl } from "@/components/SegmentedControl";
import {
  modes,
  normalizeAppearance,
  resolveAppearance,
  fontStack,
  validStyle,
  type Typography,
  type AppearancePatch,
  type EditorAppearance,
  type AppearanceMode,
  syntaxDefaults,
} from "./model";
import "./settings.css";
const labels: Record<keyof Typography, string> = {
  fontFamily: "字型",
  fontSize: "文字大小",
  lineHeight: "行距",
  foreground: "文字顏色",
  background: "背景顏色",
  selection: "文字選取底色",
  matches: "選取文字的其他相符處",
  symbols: "游標符號關聯顏色",
  highlightMatches: "高亮選取文字的其他相符處",
  highlightSymbols: "高亮游標符號關聯",
  search: "其他搜尋結果",
  searchCurrent: "目前搜尋結果",
  cursor: "游標顏色",
  activeLine: "目前行底色",
  highlightLine: "高亮目前行",
};
const modeLabels = {
  source: "純文字",
  rendered: "閱讀編輯",
  reader: "閱讀模式",
  graph: "圖表",
};
const syntaxLabels: Record<keyof typeof syntaxDefaults, string> = {
  comment: "註解",
  "keyword.header": "標頭",
  "type.identifier": "場景／角色名稱",
  keyword: "內建指令",
  function: "自訂指令",
  variable: "變數",
  "keyword.option": "選項",
  string: "字串",
  number: "數字",
  "delimiter.node": "場景分隔符",
  tag: "標籤",
};
let fontRequest: Promise<string[]> | undefined;
function FontInput({
  value,
  onChange,
  id,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  id: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [fonts, setFonts] = useState<string[]>([]),
    [error, setError] = useState("");
  const [query, setQuery] = useState<string | null>(null),
    [index, setIndex] = useState(0);
  const presets = [
    { value: "system-sans", label: "系統無襯線" },
    { value: "system-mono", label: "系統等寬" },
  ];
  const name = presets.find((f) => f.value === value)?.label || value;
  const choices = [...presets, ...fonts.map((f) => ({ value: f, label: f }))]
    .filter(
      (f) =>
        !query ||
        f.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
    )
    .slice(0, 100);
  const commit = (v: string) => {
    if (validStyle("fontFamily", v)) {
      onChange(v.trim());
      setQuery(null);
      setOpen(false);
      setError("");
    } else setError("請輸入有效字型名稱。");
  };
  return (
    <div
      className="appearance-font"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={id + "-fonts"}
        aria-autocomplete="list"
        aria-activedescendant={
          open && choices[index] ? id + "-font-" + index : undefined
        }
        disabled={disabled}
        value={query ?? name}
        placeholder="搜尋或輸入字型"
        onChange={(e) => {
          setQuery(e.target.value);
          setIndex(0);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          if (!fontRequest)
            fontRequest =
              window.yarnDesktop?.fonts().catch((e) => {
                fontRequest = undefined;
                throw e;
              }) ||
              Promise.resolve([
                "Consolas",
                "Segoe UI",
                "Microsoft JhengHei",
                "Arial",
              ]);
          void fontRequest
            .then(setFonts)
            .catch(() => setError("字型清單無法讀取，仍可輸入字型名稱。"));
        }}
        onBlur={() => {
          if (query?.trim()) commit(query);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            setQuery(null);
          }
          if (["ArrowDown", "ArrowUp"].includes(e.key)) {
            e.preventDefault();
            setOpen(true);
            setIndex((i) =>
              Math.max(
                0,
                Math.min(
                  choices.length - 1,
                  i + (e.key === "ArrowDown" ? 1 : -1),
                ),
              ),
            );
          }
          if (e.key === "Enter") {
            e.preventDefault();
            commit(
              open && choices[index] ? choices[index].value : query || value,
            );
          }
        }}
      />
      {open && !disabled && (
        <div
          id={id + "-fonts"}
          role="listbox"
          aria-label="字型"
          className="appearance-font-list"
        >
          {choices.map((f, i) => (
            <button
              id={id + "-font-" + i}
              key={f.value}
              type="button"
              role="option"
              aria-selected={i === index}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(f.value)}
            >
              <span>{f.label}</span>
              <span style={{ fontFamily: fontStack(f.value) }}>文字 Aa</span>
            </button>
          ))}
        </div>
      )}
      {error && <small role="status">{error}</small>}
    </div>
  );
}
function OpacityInput({
  value,
  disabled,
  label,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  label: string;
  onChange: (v: string) => void;
}) {
  const percent = Math.round(
    ((value.length === 9 ? parseInt(value.slice(7), 16) : 255) / 255) * 100,
  );
  const [draft, setDraft] = useState<string | null>(null);
  const invalid =
    draft !== null &&
    (!draft.trim() ||
      !Number.isInteger(Number(draft)) ||
      Number(draft) < 0 ||
      Number(draft) > 100);
  const change = (n: number) =>
    onChange(
      value.slice(0, 7) +
        Math.round((n * 255) / 100)
          .toString(16)
          .padStart(2, "0"),
    );
  const commit = () => {
    if (draft !== null && !invalid) {
      change(Number(draft));
      setDraft(null);
    }
  };
  return (
    <div className="appearance-opacity">
      <span>不透明度</span>
      <div className="appearance-opacity-controls">
        <div className="appearance-opacity-track">
          <div
            className="appearance-opacity-paint"
            style={{
              backgroundImage: `linear-gradient(to right, ${value.slice(0, 7)}00, ${value.slice(0, 7)})`,
            }}
          />
          <input
            type="range"
            aria-label={label + "不透明度"}
            min={0}
            max={100}
            step={1}
            value={percent}
            disabled={disabled}
            onChange={(e) => {
              change(Number(e.target.value));
              setDraft(null);
            }}
          />
        </div>
        <input
          type="number"
          aria-label={label + "不透明度百分比"}
          min={0}
          max={100}
          step={1}
          value={draft ?? percent}
          disabled={disabled}
          aria-invalid={invalid}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") setDraft(null);
          }}
        />
        <span>%</span>
      </div>
      {invalid && <small role="alert">請輸入 0–100 的整數。</small>}
    </div>
  );
}

function ValueInput({
  id,
  field,
  value,
  onCommit,
  disabled,
  syntax = false,
}: {
  id: string;
  field: keyof Typography;
  value: Typography[keyof Typography];
  onCommit: (v: unknown) => void;
  disabled?: boolean;
  syntax?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null),
    [error, setError] = useState("");
  if (field === "fontFamily")
    return (
      <FontInput
        id={id}
        value={String(value)}
        disabled={disabled}
        onChange={onCommit}
      />
    );
  if (["highlightLine", "highlightMatches", "highlightSymbols"].includes(field))
    return (
      <Checkbox
        id={id}
        checked={!!value}
        disabled={disabled}
        onCheckedChange={(v) => onCommit(v === true)}
      />
    );
  const numeric = field === "fontSize" || field === "lineHeight";
  const commit = () => {
    if (draft === null) return;
    const next = numeric
      ? Number(draft)
      : draft + (syntax ? "" : String(value).slice(7));
    if (
      !draft.trim() ||
      !validStyle(field, next) ||
      (!numeric && !/^#[0-9a-f]{6}$/i.test(draft))
    ) {
      setError(
        numeric
          ? field === "fontSize"
            ? "請輸入 10–40 的整數。"
            : "請輸入 1.0–2.5。"
          : "請輸入 #RRGGBB。",
      );
      return;
    }
    onCommit(next);
    setDraft(null);
    setError("");
  };
  return (
    <div className="appearance-value">
      <div className="appearance-input-row">
        {!numeric && (
          <span className="appearance-color-preview">
            <span
              className="appearance-color-paint"
              style={{ backgroundColor: String(value) }}
            />
            <input
              className="appearance-swatch"
              type="color"
              aria-label={labels[field] + "色票"}
              disabled={disabled}
              value={String(value).slice(0, 7)}
              onChange={(e) => {
                onCommit(e.target.value + String(value).slice(7));
                setDraft(null);
                setError("");
              }}
            />
          </span>
        )}
        <input
          id={id}
          type={numeric ? "number" : "text"}
          disabled={disabled}
          value={
            disabled
              ? numeric
                ? String(value)
                : String(value).slice(0, 7)
              : (draft ?? (numeric ? String(value) : String(value).slice(0, 7)))
          }
          min={field === "fontSize" ? 10 : 1}
          max={field === "fontSize" ? 40 : 2.5}
          step={field === "fontSize" ? 1 : 0.05}
          aria-invalid={!!error}
          aria-describedby={error ? id + "-error" : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            setError("");
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              setDraft(null);
              setError("");
            }
          }}
        />
        {numeric && <span>{field === "fontSize" ? "px" : "倍"}</span>}
      </div>
      {!numeric && !syntax && (
        <OpacityInput
          value={String(value)}
          disabled={disabled}
          label={labels[field]}
          onChange={onCommit}
        />
      )}
      {error && !disabled && (
        <small id={id + "-error"} role="alert" className="setting-error">
          {error}
        </small>
      )}
    </div>
  );
}
function StyleFields({
  appearance,
  mode,
  onChange,
}: {
  appearance: EditorAppearance;
  mode?: AppearanceMode;
  onChange: (p: AppearancePatch) => void;
}) {
  const prefix = useId(),
    style = mode ? resolveAppearance(appearance, mode) : appearance.global;
  return (
    <>
      {(Object.keys(labels) as (keyof Typography)[])
        .filter(
          (key) =>
            mode !== "reader" ||
            ![
              "cursor",
              "activeLine",
              "highlightLine",
              "matches",
              "symbols",
              "highlightMatches",
              "highlightSymbols",
              "search",
              "searchCurrent",
            ].includes(key),
        )
        .map((key) => {
          const inherited = !!mode && appearance.modes[mode][key] === undefined;
          return (
            <div className="appearance-field" key={key}>
              <label htmlFor={prefix + key}>
                {labels[key]}
                {key === "lineHeight" && (
                  <small>
                    {Math.round(style.fontSize * style.lineHeight * 10) / 10}px
                    行高
                  </small>
                )}
              </label>
              <div className="appearance-controls">
                {mode && (
                  <CompactSelect
                    label={labels[key] + "來源"}
                    value={inherited ? "inherit" : "custom"}
                    options={[
                      { value: "inherit", label: "跟隨全局" },
                      { value: "custom", label: "自訂" },
                    ]}
                    onChange={(v) =>
                      onChange({
                        modes: {
                          [mode]: {
                            [key]: v === "inherit" ? null : style[key],
                          },
                        },
                      })
                    }
                  />
                )}
                <ValueInput
                  id={prefix + key}
                  field={key}
                  value={style[key]}
                  disabled={inherited}
                  onCommit={(v) =>
                    onChange(
                      mode
                        ? ({
                            modes: { [mode]: { [key]: v } },
                          } as AppearancePatch)
                        : ({ global: { [key]: v } } as AppearancePatch),
                    )
                  }
                />
              </div>
            </div>
          );
        })}
    </>
  );
}
function Preview({
  appearance,
  mode,
}: {
  appearance: EditorAppearance;
  mode: AppearanceMode;
}) {
  const s = resolveAppearance(appearance, mode);
  return (
    <div
      className={"appearance-preview " + mode}
      aria-label={modeLabels[mode] + "樣式預覽"}
      style={{
        fontFamily: fontStack(s.fontFamily),
        fontSize: s.fontSize,
        lineHeight: s.lineHeight,
        color: s.foreground,
        background: s.background,
        maxWidth:
          (mode === "rendered" || mode === "reader") &&
          appearance.widths[mode] === "standard"
            ? 440
            : "100%",
      }}
    >
      {mode === "graph" ? (
        <>
          <div className="appearance-preview-node">
            <strong>Start</strong>
            <p>Mira: 沿著小路前往燈塔。</p>
          </div>
          <div className="appearance-preview-branch">↳ 前往燈塔</div>
        </>
      ) : (
        <>
          {mode === "source" && (
            <>
              <p>
                <span style={{ color: appearance.syntax["keyword.header"] }}>
                  title:
                </span>{" "}
                <strong style={{ color: appearance.syntax["type.identifier"] }}>
                  Start
                </strong>{" "}
                <span style={{ color: appearance.syntax.tag }}>#harbor</span>
              </p>
              <p
                style={{
                  color: appearance.syntax.comment,
                  fontStyle: "italic",
                }}
              >
                {"// 燈塔的風聲"}
              </p>
              <p>
                <span style={{ color: appearance.syntax.keyword }}>
                  {"<<set "}
                </span>
                <span style={{ color: appearance.syntax.variable }}>$wind</span>{" "}
                = <span style={{ color: appearance.syntax.number }}>1</span>
                {">>"}
              </p>
            </>
          )}
          <p>
            <strong
              style={{
                color:
                  mode === "source"
                    ? appearance.syntax["type.identifier"]
                    : undefined,
              }}
            >
              Mira:
            </strong>{" "}
            沿著
            <span style={{ background: s.selection }}>小路</span>前往燈塔。
          </p>
          {mode !== "reader" && (
            <p
              style={{ background: s.highlightLine ? s.activeLine : undefined }}
            >
              <span
                style={{
                  color:
                    mode === "source" ? appearance.syntax.function : undefined,
                }}
              >
                {"<<play_sound "}
              </span>
              <span
                style={{
                  color:
                    mode === "source" ? appearance.syntax.string : undefined,
                }}
              >
                {'"wind"'}
              </span>
              {">>"}
              <span
                aria-hidden="true"
                style={{ borderLeft: `2px solid ${s.cursor}`, marginLeft: 2 }}
              >
                &nbsp;
              </span>
            </p>
          )}
          <p>
            <span
              style={{
                background: mode === "reader" ? undefined : s.searchCurrent,
              }}
            >
              燈塔
            </span>
            就在前方，
            <span
              style={{ background: mode === "reader" ? undefined : s.search }}
            >
              燈塔
            </span>
            仍亮著。
          </p>
          {mode === "source" && (
            <>
              <p style={{ color: appearance.syntax["keyword.option"] }}>
                → 前往燈塔
              </p>
              <p style={{ color: appearance.syntax["delimiter.node"] }}>===</p>
            </>
          )}
        </>
      )}
    </div>
  );
}
export default function AppearanceSettings({
  value,
  onChange,
}: {
  value?: EditorAppearance;
  onChange: (p: AppearancePatch) => void;
}) {
  const appearance = normalizeAppearance(value),
    [mode, setMode] = useState<AppearanceMode>("source"),
    id = useId();
  const [resetKeys, setResetKeys] = useState<Record<string, number>>({});
  const reset = (scope: string, patch: AppearancePatch) => {
    onChange(patch);
    setResetKeys((keys) => ({ ...keys, [scope]: (keys[scope] || 0) + 1 }));
  };
  const container = useRef<HTMLDivElement>(null);
  const scrolls = useRef<Partial<Record<AppearanceMode, number>>>({});
  const changeMode = (value: string) => {
    const scroll = container.current?.closest(".settings-scroll");
    if (scroll) scrolls.current[mode] = scroll.scrollTop;
    setMode(value as AppearanceMode);
    requestAnimationFrame(() => {
      if (scroll)
        scroll.scrollTop = scrolls.current[value as AppearanceMode] ?? 0;
    });
  };
  return (
    <div className="appearance-settings" ref={container}>
      <details className="settings-group appearance-global" open>
        <summary>全局預設</summary>
        <StyleFields
          key={resetKeys.global || 0}
          appearance={appearance}
          onChange={onChange}
        />
        <Button
          variant="ghost"
          onClick={() => reset("global", { reset: "global" })}
        >
          <RotateCcw size={14} />
          重設全局預設
        </Button>
      </details>
      <SegmentedControl
        label="風格模式"
        value={mode}
        onChange={changeMode}
        options={modes.map((value) => ({ value, label: modeLabels[value] }))}
      />
      {modes.map((m) => (
        <section
          key={m + (resetKeys[m] || 0)}
          className="appearance-mode settings-group"
          hidden={mode !== m}
          aria-label={modeLabels[m] + "風格"}
        >
          <Preview appearance={appearance} mode={m} />
          <StyleFields appearance={appearance} mode={m} onChange={onChange} />
          {(m === "reader" || m === "rendered") && (
            <div className="setting-row">
              <span>閱讀寬度</span>
              <SegmentedControl
                label={modeLabels[m] + "閱讀寬度"}
                value={appearance.widths[m]}
                options={[
                  { value: "standard", label: "標準" },
                  { value: "wide", label: "寬版" },
                ]}
                onChange={(v) =>
                  onChange({ widths: { [m]: v } } as AppearancePatch)
                }
              />
            </div>
          )}
          {m === "source" && (
            <>
              <h3>編輯輔助</h3>
              {(
                [
                  ["lineNumbers", "行號"],
                  ["wordWrap", "自動換行"],
                  ["insertSpaces", "Tab 插入空格"],
                  ["indentGuides", "縮排參考線"],
                ] as const
              ).map(([key, label]) => (
                <div className="setting-row" key={key}>
                  <label htmlFor={id + key}>{label}</label>
                  <Checkbox
                    id={id + key}
                    checked={appearance.source[key]}
                    onCheckedChange={(v) =>
                      onChange({ source: { [key]: v === true } })
                    }
                  />
                </div>
              ))}
              <div className="setting-row">
                <span>縮排寬度</span>
                <CompactSelect
                  label="縮排寬度"
                  value={String(appearance.source.tabSize)}
                  options={[2, 4, 8].map((n) => ({
                    value: String(n),
                    label: String(n),
                  }))}
                  onChange={(v) =>
                    onChange({ source: { tabSize: Number(v) as 2 | 4 | 8 } })
                  }
                />
              </div>
              <div className="setting-row">
                <span>空白字元</span>
                <CompactSelect
                  label="空白字元"
                  value={appearance.source.whitespace}
                  options={[
                    { value: "none", label: "隱藏" },
                    { value: "selection", label: "選取時" },
                    { value: "all", label: "全部" },
                  ]}
                  onChange={(v) =>
                    onChange({
                      source: { whitespace: v as "none" | "selection" | "all" },
                    })
                  }
                />
              </div>
              <details>
                <summary>語法配色</summary>
                {(
                  Object.keys(syntaxLabels) as (keyof typeof syntaxDefaults)[]
                ).map((key) => (
                  <div className="appearance-field" key={key}>
                    <label htmlFor={id + key}>{syntaxLabels[key]}</label>
                    <ValueInput
                      id={id + key}
                      field="foreground"
                      syntax
                      value={appearance.syntax[key]}
                      onCommit={(v) =>
                        onChange({ syntax: { [key]: v } } as AppearancePatch)
                      }
                    />
                  </div>
                ))}
              </details>
            </>
          )}
          <div className="setting-reset-actions">
            <Button
              variant="ghost"
              onClick={() => reset(m, { modes: { [m]: null } })}
            >
              全部跟隨全局
            </Button>
            <Button variant="ghost" onClick={() => reset(m, { reset: m })}>
              <RotateCcw size={14} />
              恢復此模式預設
            </Button>
          </div>
        </section>
      ))}
    </div>
  );
}
