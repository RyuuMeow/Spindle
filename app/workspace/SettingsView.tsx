"use client";
import { APP_VERSION, REPOSITORY_URL } from "../version";
import { t as tr } from "../i18n/index.ts";

import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  FolderOpen,
  Info,
  Keyboard,
  RotateCcw,
  Save,
  Globe,
  ArchiveRestore,
  Plug,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { WindowSession, AppPreferences } from "./types";
import "./settings.css";
import { UpdateButton } from "./UpdateDialog";
import LanguageSettings from "./LanguageSettings";
import McpSettings from "../mcp/McpSettings";
import {
  settingSections,
  extraSettingLabels,
  type SettingsSection,
} from "./settings-registry";
export type { SettingsSection } from "./settings-registry";
import AppearanceSettings from "../appearance/AppearanceSettings";
import type { AppearancePatch } from "../appearance/model";

export type WorkspacePreferences = Pick<
  WindowSession,
  "readingSize" | "readingLineHeight" | "lineNumbers" | "zoom"
> & {
  readingWidth?: "standard" | "wide";
};
const sectionIcons = {
  BookOpen,
  Save,
  Globe,
  ArchiveRestore,
  Keyboard,
  Plug,
  Info,
};
const sections = settingSections.map((s) => ({
  ...s,
  icon: sectionIcons[s.icon],
}));

function NumericSetting({
  label,
  description,
  value,
  min,
  max,
  unit,
  onCommit,
}: {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onCommit: (value: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<{ value: number; text: string } | null>(
    null,
  );
  const [error, setError] = useState("");
  const text = draft?.value === value ? draft.text : String(value);
  function commit() {
    const next = Number(text);
    if (
      !text.trim() ||
      !Number.isFinite(next) ||
      !Number.isInteger(next) ||
      next < min ||
      next > max
    ) {
      setError(tr("mf28dc4952b9c", [min, max]));
      return;
    }
    setError("");
    setDraft(null);
    if (next !== value) onCommit(next);
  }
  return (
    <div className="setting-field">
      <div className="setting-row">
        <label htmlFor={id}>
          {label}
          {description && <small>{description}</small>}
        </label>
        <div className="setting-number">
          <input
            id={id}
            aria-label={label}
            type="number"
            min={min}
            max={max}
            step={1}
            value={text}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(event) => {
              setDraft({ value, text: event.target.value });
              setError("");
            }}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setDraft(null);
                setError("");
              }
            }}
          />
          <span>{unit}</span>
        </div>
      </div>
      {error && (
        <p id={`${id}-error`} className="setting-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export default function SettingsView({
  preferences,
  onChange,
  onResetLayout,
  onOpenData,
  onClose,

  initialSection = "reading",
  focusOnMount = true,
  returnLabel = tr("m9f2b484bc113"),
  appPreferences,
  onAppPreferences,
  onAppearance,
  navigation,
  rescue,
}: {
  navigation?: { section: SettingsSection; field?: string; nonce: number };
  rescue?: React.ReactNode;
  onAppearance?: (patch: AppearancePatch) => void;
  workspaceSettings?: boolean;
  appPreferences?: AppPreferences;
  onAppPreferences?: (patch: Partial<AppPreferences>) => void;
  returnLabel?: string;
  preferences: WorkspacePreferences;
  onChange: (next: WorkspacePreferences) => void;
  onResetLayout: () => void;
  onOpenData?: () => void;
  onClose?: () => void;
  version?: string;
  initialSection?: SettingsSection;
  focusOnMount?: boolean;
}) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [zoomResetVersion, setZoomResetVersion] = useState(0);
  const workspaceRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
  }, [focusOnMount]);
  useEffect(() => {
    if (!navigation) return;
    let focusFrame = 0;
    const frame = requestAnimationFrame(() => {
      setSection(navigation.section);
      const focusField = (attempt = 0) => {
        if (!navigation.field) return;
        const field = workspaceRef.current?.querySelector<HTMLElement>(
          `[data-setting="${navigation.field}"]`,
        );
        for (
          let parent = field?.parentElement;
          parent;
          parent = parent.parentElement
        )
          if (parent instanceof HTMLDetailsElement) parent.open = true;
        const control = [
          ...(field?.querySelectorAll<HTMLElement>(
            'input:not([type="hidden"]),button,select,[tabindex="0"]',
          ) || []),
        ].find(
          (el) =>
            el.getClientRects().length > 0 && !el.hasAttribute("disabled"),
        );
        if (field?.getClientRects().length && control) {
          field.scrollIntoView({ block: "center" });
          control.focus();
          if (field.contains(document.activeElement)) return;
        }
        if (attempt < 30)
          focusFrame = requestAnimationFrame(() => focusField(attempt + 1));
      };
      focusFrame = requestAnimationFrame(() => focusField());
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(focusFrame);
    };
  }, [navigation]);
  const change = (patch: Partial<WorkspacePreferences>) =>
    onChange({ ...preferences, ...patch });
  return (
    <section
      ref={workspaceRef}
      className="settings-workspace"
      aria-label={tr("m0d8619aae051")}
    >
      <div className="settings-layout">
        <nav className="settings-navigation" aria-label={tr("m55ce2decbed0")}>
          {sections.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              aria-current={section === id ? "page" : undefined}
              onClick={() => setSection(id)}
            >
              <Icon size={16} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        {sections.map(({ id: category, label: title }) => (
          <div
            className="settings-scroll"
            key={category}
            hidden={section !== category}
          >
            <div className="settings-content">
              <div className="settings-section-heading">
                <h2
                  ref={section === category ? headingRef : undefined}
                  tabIndex={-1}
                >
                  {title}
                </h2>
                {onClose && (
                  <Button variant="ghost" size="sm" onClick={onClose}>
                    <ArrowLeft size={15} />
                    {returnLabel}
                  </Button>
                )}
              </div>
              {category === "rescue" && rescue}
              {category === "mcp" && <McpSettings />}
              {category === "reading" && (
                <>
                  {onAppearance && (
                    <AppearanceSettings
                      navigation={navigation}
                      value={appPreferences?.editorAppearance}
                      onChange={onAppearance}
                    />
                  )}
                  <section
                    className="settings-group"
                    aria-label={tr("mabef6dc9562f")}
                  >
                    <h3>{tr("m1c5ab76e581d")}</h3>
                    {onOpenData && (
                      <div data-setting="zoom">
                        <NumericSetting
                          key={`zoom-${zoomResetVersion}`}
                          label={extraSettingLabels.zoom}
                          description={tr("m322b9bdcd691")}
                          value={Math.round(preferences.zoom * 100)}
                          min={60}
                          max={200}
                          unit="%"
                          onCommit={(zoom) => change({ zoom: zoom / 100 })}
                        />
                      </div>
                    )}
                    <div className="setting-reset-actions">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onResetLayout}
                      >
                        <RotateCcw size={14} />
                        {tr("m5832dd659949")}
                      </Button>
                      {onOpenData && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            change({ zoom: 1 });
                            setZoomResetVersion((current) => current + 1);
                          }}
                        >
                          {tr("m858d2ba39ac8")}
                        </Button>
                      )}
                    </div>
                    <p className="setting-help">{tr("m878f3c18f46a")}</p>
                  </section>
                </>
              )}
              {category === "language" && (
                <LanguageSettings
                  preferences={appPreferences}
                  onChange={onAppPreferences}
                />
              )}
              {category === "saving" && (
                <>
                  {onAppPreferences && (
                    <section className="settings-group">
                      <h3>{tr("mb9a3e0cf4dfa")}</h3>
                      <label
                        className="settings-check"
                        data-setting="reopenLastProject"
                      >
                        <Checkbox
                          checked={!!appPreferences?.reopenLastProject}
                          onCheckedChange={(value) =>
                            onAppPreferences({
                              reopenLastProject: value === true,
                            })
                          }
                        />
                        {extraSettingLabels.reopenLastProject}
                      </label>
                      <p className="setting-help">{tr("m3ab17ab20e9c")}</p>
                    </section>
                  )}
                  <section className="settings-group">
                    <h3>{tr("m8b8df20098d7")}</h3>
                    <dl className="settings-description-list">
                      <div>
                        <dt>
                          <Check size={15} />
                          {onOpenData
                            ? tr("m6394530076ea")
                            : tr("m31c69543d4ff")}
                        </dt>
                        <dd>
                          {onOpenData
                            ? tr("mf09a394fa505")
                            : tr("me9f66d84f809")}
                        </dd>
                      </div>
                      <div>
                        <dt>{tr("m562beac0934b")}</dt>
                        <dd>
                          {onOpenData
                            ? tr("ma2f20cbc50f2")
                            : tr("m162c9cfc9e49")}
                        </dd>
                      </div>
                      <div>
                        <dt>{tr("m4c3cec274391")}</dt>
                        <dd>
                          {onOpenData && tr("madecbb44f20d")}
                          {tr("m98949af2f60c")}
                        </dd>
                      </div>
                    </dl>
                    <p className="setting-help">{tr("me18763e86988")}</p>
                  </section>
                </>
              )}
              {category === "shortcuts" && (
                <section className="settings-group">
                  <p className="setting-help">{tr("mc7a2019bbac8")}</p>
                  <dl className="settings-shortcuts">
                    {[
                      [tr("mb5dda496487b"), "Ctrl + P"],
                      [tr("mc78fb5b77467"), "Ctrl + Shift + F"],
                      [tr("ma92349e52eea"), "Ctrl + S"],
                      ...(!onOpenData
                        ? [[tr("m10f830160cfd"), "Ctrl + Shift + S"]]
                        : []),
                      [tr("ma38d62ae74d4"), "Ctrl + T"],
                      [tr("ma54d38ec178f"), "Ctrl + W"],
                      [tr("m05623a8025fb"), "Ctrl + Shift + T"],
                      [tr("m816858cda6c6"), "Ctrl + Tab"],
                      [tr("ma62d4d9aada4"), "Ctrl + Z"],
                      [tr("mcbbcc58cefd5"), "Ctrl + Shift + Z"],
                    ].map(([label, shortcut]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>
                          <kbd>{shortcut}</kbd>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}
              {category === "about" && (
                <>
                  <section className="settings-group settings-about">
                    {/* Bundled SVG: desktop renders without an image optimization server. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/brand/spindle.svg"
                      alt=""
                      width={56}
                      height={56}
                    />
                    <h3>Spindle</h3>
                    <p className="settings-version">{APP_VERSION}</p>
                    <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
                      GitHub
                    </a>
                    <a
                      href={
                        REPOSITORY_URL + "/blob/main/THIRD_PARTY_NOTICES.md"
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      {tr("licenses.thirdParty")}
                    </a>
                    {typeof window !== "undefined" && window.yarnDesktop && (
                      <UpdateButton />
                    )}
                    <p>{tr("m53587a1d8151")}</p>
                    <p className="setting-help">{tr("m0bf3516b70a7")}</p>
                    {onOpenData && (
                      <Button variant="outline" size="sm" onClick={onOpenData}>
                        <FolderOpen size={15} />
                        {tr("m9b7d8b1e1c6e")}
                      </Button>
                    )}
                  </section>
                  <section className="settings-group">
                    <h3>{tr("m7aa63904a20a")}</h3>
                    <a
                      href={REPOSITORY_URL + "/releases"}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {tr("m7aa63904a20a")}
                    </a>
                    <p className="setting-help">{tr("m09f25e462ae2")}</p>
                  </section>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
