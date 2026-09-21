"use client";

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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { WindowSession, AppPreferences } from "./types";
import "./settings.css";
import McpSettings from "../mcp/McpSettings";
import { Plug } from "lucide-react";
import AppearanceSettings from "../appearance/AppearanceSettings";
import type { AppearancePatch } from "../appearance/model";

export type WorkspacePreferences = Pick<
  WindowSession,
  "readingSize" | "readingLineHeight" | "lineNumbers" | "zoom"
> & {
  readingWidth?: "standard" | "wide";
};
export type SettingsSection = "reading" | "saving" | "shortcuts" | "about" | "mcp";

const sections = [
  { id: "reading", label: "編輯器風格", icon: BookOpen },
  { id: "saving", label: "編輯與保存", icon: Save },
  { id: "shortcuts", label: "快捷鍵", icon: Keyboard },
  { id: "mcp", label: "MCP／Agent 整合", icon: Plug },
  { id: "about", label: "關於", icon: Info },
] as const;

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
      setError(`請輸入 ${min} 至 ${max} 的整數。`);
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
  version,
  initialSection = "reading",
  focusOnMount = true,
  returnLabel = "返回編輯",
  appPreferences,
  onAppPreferences,
  onAppearance,
}: {
  onAppearance?: (patch: AppearancePatch) => void;
  workspaceSettings?: boolean;
  appPreferences?: AppPreferences;
  onAppPreferences?: (reopen: boolean) => void;
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
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
  }, [focusOnMount]);
  const change = (patch: Partial<WorkspacePreferences>) =>
    onChange({ ...preferences, ...patch });
  return (
    <section className="settings-workspace" aria-label="設定">
      <div className="settings-layout">
        <nav className="settings-navigation" aria-label="設定分類">
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
              {category === "mcp" && <McpSettings />}
              {category === "reading" && (
                <>
                  {onAppearance && (
                    <AppearanceSettings
                      value={appPreferences?.editorAppearance}
                      onChange={onAppearance}
                    />
                  )}
                  <section className="settings-group" aria-label="工作區顯示">
                    <h3>工作區</h3>
                    {onOpenData && (
                      <NumericSetting
                        key={`zoom-${zoomResetVersion}`}
                        label="App 縮放"
                        description="調整整個介面的大小"
                        value={Math.round(preferences.zoom * 100)}
                        min={60}
                        max={200}
                        unit="%"
                        onCommit={(zoom) => change({ zoom: zoom / 100 })}
                      />
                    )}
                    <div className="setting-reset-actions">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onResetLayout}
                      >
                        <RotateCcw size={14} />
                        重設工作區布局
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
                          縮放回到 100%
                        </Button>
                      )}
                    </div>
                    <p className="setting-help">
                      重設布局會恢復面板位置與寬度，閱讀樣式不受影響。
                    </p>
                  </section>
                </>
              )}
              {category === "saving" && (
                <>
                  {onAppPreferences && (
                    <section className="settings-group">
                      <h3>啟動</h3>
                      <label className="settings-check">
                        <Checkbox
                          checked={!!appPreferences?.reopenLastProject}
                          onCheckedChange={(value) =>
                            onAppPreferences(value === true)
                          }
                        />
                        啟動時開啟上次專案
                      </label>
                      <p className="setting-help">
                        關閉專案後，下次啟動仍會顯示專案列表。
                      </p>
                    </section>
                  )}
                  <section className="settings-group">
                    <h3>保存方式</h3>
                    <dl className="settings-description-list">
                      <div>
                        <dt>
                          <Check size={15} />
                          {onOpenData ? "磁碟專案" : "本機工作區"}
                        </dt>
                        <dd>
                          {onOpenData
                            ? "停止輸入後自動寫回原檔。Ctrl+S 立即保存，離開工作區前會確認保存完成。"
                            : "編輯內容保留在此瀏覽器的工作區。使用匯出功能下載劇本或專案備份。"}
                        </dd>
                      </div>
                      <div>
                        <dt>本機草稿</dt>
                        <dd>
                          {onOpenData
                            ? "舊草稿保留在初始畫面的「待移轉草稿」，可預覽後轉存為正式專案。"
                            : "草稿保留在本機工作區，匯出後可在其他工具開啟。"}
                        </dd>
                      </div>
                      <div>
                        <dt>版本歷史</dt>
                        <dd>
                          {onOpenData &&
                            "有變更時定期建立快照。專案歷史與垃圾桶保存在專案資料夾；單檔歷史保存在應用程式資料目錄。"}
                          每份劇本保留最近 50 份快照，最近刪除保留 30 天。
                        </dd>
                      </div>
                    </dl>
                    <p className="setting-help">
                      指令定義需按「套用定義」才更新補全與檢查；未套用的內容會保留為草稿。
                    </p>
                  </section>
                </>
              )}
              {category === "shortcuts" && (
                <section className="settings-group">
                  <p className="setting-help">
                    快捷鍵使用目前所在的文件或工作區。
                  </p>
                  <dl className="settings-shortcuts">
                    {[
                      ["快速開啟劇本", "Ctrl + P"],
                      ["搜尋整個專案", "Ctrl + Shift + F"],
                      ["立即保存", "Ctrl + S"],
                      ...(!onOpenData
                        ? [["保存全部", "Ctrl + Shift + S"]]
                        : []),
                      ["新增分頁", "Ctrl + T"],
                      ["關閉目前分頁", "Ctrl + W"],
                      ["重開關閉的分頁", "Ctrl + Shift + T"],
                      ["切換到下一個分頁", "Ctrl + Tab"],
                      ["復原編輯", "Ctrl + Z"],
                      ["重做編輯", "Ctrl + Shift + Z"],
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
                    <p className="settings-version">{version || "Web"}</p>
                    <p>本機 Yarn 劇本編輯器</p>
                    <p className="setting-help">
                      純文字、閱讀編輯與流程圖共用同一份劇本。雙擊流程圖節點可直接編輯；拖動節點只調整版面。
                    </p>
                    {onOpenData && (
                      <Button variant="outline" size="sm" onClick={onOpenData}>
                        <FolderOpen size={15} />
                        開啟資料與記錄位置
                      </Button>
                    )}
                  </section>
                  <section className="settings-group">
                    <h3>版本記錄</h3>
                    <p>
                      0.9.0：新增初始畫面與專案列表、獨立單檔編輯、專案內歷史與垃圾桶，並保存復原頁狀態。
                    </p>
                    <p className="setting-help">
                      結構檢查協助找出劇本問題，不會執行遊戲命令。
                    </p>
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
