"use client";
import { t as tr } from "../i18n/index.ts";

import { useId, useRef, useState, useEffect } from "react";
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
import {
  appearanceLabels as labels,
  syntaxLabels,
  sourceLabels,
  extraSettingLabels,
} from "../workspace/settings-registry";
const modeLabels = {
  source: tr("m9982ffc60be9"),
  rendered: tr("m34e439ce0fb9"),
  reader: tr("m879debc5bf65"),
  graph: tr("maf3ddd6db884"),
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
    { value: "system-sans", label: tr("me7ba17b07087") },
    { value: "system-mono", label: tr("ma8e071b7260d") },
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
    } else setError(tr("mb17242efdc9a"));
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
        placeholder={tr("m70f3b3a23840")}
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
            .catch(() => setError(tr("m0c5c7fb5bf04")));
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
          aria-label={tr("m689553e16764")}
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
              <span style={{ fontFamily: fontStack(f.value) }}>
                {tr("mb6f117726429")}
              </span>
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
      <span>{tr("m04405e4a9ffd")}</span>
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
            aria-label={label + tr("m04405e4a9ffd")}
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
          aria-label={label + tr("m76f14db0d4e3")}
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
      {invalid && <small role="alert">{tr("mc0d10e34d54a")}</small>}
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
  if (field === "symbolStyle")
    return (
      <CompactSelect
        id={id}
        label={labels[field]}
        value={String(value)}
        disabled={disabled}
        options={[
          { value: "underline", label: tr("m7d2a5822d438") },
          { value: "background", label: tr("m56ac16c1e4dd") },
        ]}
        onChange={onCommit}
      />
    );
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
            ? tr("mb64586f1a4b0")
            : tr("m8e4128674def")
          : tr("me2a8b0dd69ff"),
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
        {!numeric && !syntax && (
          <span className="appearance-color-label">{tr("m394ed4a8db28")}</span>
        )}
        {!numeric && (
          <span className="appearance-color-preview">
            <span
              className="appearance-color-paint"
              style={{ backgroundColor: String(value) }}
            />
            <input
              className="appearance-swatch"
              type="color"
              aria-label={labels[field] + tr("m437e63a9eab4")}
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
        {numeric && (
          <span>{field === "fontSize" ? "px" : tr("m16729fb40af5")}</span>
        )}
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
              "symbolStyle",
              "highlightMatches",
              "highlightSymbols",
              "search",
              "searchCurrent",
            ].includes(key),
        )
        .map((key) => {
          const inherited = !!mode && appearance.modes[mode][key] === undefined;
          return (
            <div
              className={
                "appearance-field" +
                (String(style[key]).startsWith("#")
                  ? " appearance-field--group"
                  : "")
              }
              key={key}
              data-setting={key}
            >
              <label htmlFor={prefix + key}>
                {labels[key]}
                {key === "lineHeight" && (
                  <small>
                    {Math.round(style.fontSize * style.lineHeight * 10) / 10}
                    {tr("m9411e9645d7d")}
                  </small>
                )}
              </label>
              <div className="appearance-controls">
                {mode && (
                  <CompactSelect
                    label={labels[key] + tr("mc21db84c0653")}
                    value={inherited ? "inherit" : "custom"}
                    options={[
                      { value: "inherit", label: tr("m8e4ff0db8f0b") },
                      { value: "custom", label: tr("m1fe9883907ba") },
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
      aria-label={modeLabels[mode] + tr("m2d2c07600775")}
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
            <p>{tr("mc58f8b833df8")}</p>
          </div>
          <div className="appearance-preview-branch">{tr("mba3cbb6b8ea3")}</div>
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
                {tr("me3b3fe76351f")}
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
            {tr("me32fbfb229a5")}
            <span style={{ background: s.selection }}>
              {tr("m3ce5ec0f909f")}
            </span>
            {tr("m0f27ea819392")}
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
              {tr("m87340b39c251")}
            </span>
            {tr("m3b4b85d769f3")}
            <span
              style={{ background: mode === "reader" ? undefined : s.search }}
            >
              {tr("m87340b39c251")}
            </span>
            {tr("m147687fdefd1")}
          </p>
          {mode === "source" && (
            <>
              <p style={{ color: appearance.syntax["keyword.option"] }}>
                {tr("me9fb790f514d")}
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
  navigation,
}: {
  navigation?: { field?: string; nonce: number };
  value?: EditorAppearance;
  onChange: (p: AppearancePatch) => void;
}) {
  const appearance = normalizeAppearance(value),
    [mode, setMode] = useState<AppearanceMode>("source"),
    id = useId();
  useEffect(() => {
    if (!navigation?.field) return;
    const frame = requestAnimationFrame(() => {
      if (/^(source|syntax)\./.test(navigation.field!)) setMode("source");
      if (navigation.field === "reader.width") setMode("reader");
      if (navigation.field === "rendered.width") setMode("rendered");
    });
    return () => cancelAnimationFrame(frame);
  }, [navigation]);
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
        <summary>{tr("m657bc98f63bc")}</summary>
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
          {tr("mec67cf5f796e")}
        </Button>
      </details>
      <SegmentedControl
        label={tr("m4bef1debc49b")}
        value={mode}
        onChange={changeMode}
        options={modes.map((value) => ({ value, label: modeLabels[value] }))}
      />
      {modes.map((m) => (
        <section
          key={m + (resetKeys[m] || 0)}
          className="appearance-mode settings-group"
          hidden={mode !== m}
          aria-label={modeLabels[m] + tr("mbdb95b9c7610")}
        >
          <Preview appearance={appearance} mode={m} />
          <StyleFields appearance={appearance} mode={m} onChange={onChange} />
          {(m === "reader" || m === "rendered") && (
            <div className="setting-row" data-setting={m + ".width"}>
              <span>{extraSettingLabels["width"]}</span>
              <SegmentedControl
                label={modeLabels[m] + extraSettingLabels["width"]}
                value={appearance.widths[m]}
                options={[
                  { value: "standard", label: tr("m6f5de510e11d") },
                  { value: "wide", label: tr("me51c4ee1d2d0") },
                ]}
                onChange={(v) =>
                  onChange({ widths: { [m]: v } } as AppearancePatch)
                }
              />
            </div>
          )}
          {m === "source" && (
            <>
              <h3>{tr("m3016f1d3f357")}</h3>
              {(
                Object.entries(sourceLabels) as [
                  keyof typeof sourceLabels,
                  string,
                ][]
              ).map(([key, label]) => (
                <div
                  className="setting-row"
                  key={key}
                  data-setting={"source." + key}
                >
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
              <div className="setting-row" data-setting="source.tabSize">
                <span>{extraSettingLabels["source.tabSize"]}</span>
                <CompactSelect
                  label={extraSettingLabels["source.tabSize"]}
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
              <div className="setting-row" data-setting="source.whitespace">
                <span>{extraSettingLabels["source.whitespace"]}</span>
                <CompactSelect
                  label={extraSettingLabels["source.whitespace"]}
                  value={appearance.source.whitespace}
                  options={[
                    { value: "none", label: tr("m0c19fe121207") },
                    { value: "selection", label: tr("me41ba2c276c5") },
                    { value: "all", label: tr("m5c55a67935af") },
                  ]}
                  onChange={(v) =>
                    onChange({
                      source: { whitespace: v as "none" | "selection" | "all" },
                    })
                  }
                />
              </div>
              <details>
                <summary>{tr("m30f6bba092e4")}</summary>
                {(
                  Object.keys(syntaxLabels) as (keyof typeof syntaxDefaults)[]
                ).map((key) => (
                  <div
                    className="appearance-field"
                    key={key}
                    data-setting={"syntax." + key}
                  >
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
              {tr("md4f76aff66b6")}
            </Button>
            <Button variant="ghost" onClick={() => reset(m, { reset: m })}>
              <RotateCcw size={14} />
              {tr("me7d67cb45c21")}
            </Button>
          </div>
        </section>
      ))}
    </div>
  );
}
