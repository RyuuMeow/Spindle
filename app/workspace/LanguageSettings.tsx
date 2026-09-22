"use client";
import { useState } from "react";
import { t as tr, validLanguage } from "../i18n/index.ts";
import type { AppPreferences } from "./types";
import { Button } from "@/components/ui/button";
import { CompactSelect } from "@/components/CompactSelect";
import { Checkbox } from "@/components/ui/checkbox";
export default function LanguageSettings({
  preferences,
  onChange,
}: {
  preferences?: AppPreferences;
  onChange?: (patch: Partial<AppPreferences>) => void;
}) {
  const [initial] = useState(() => validLanguage(preferences?.language));
  const [error, setError] = useState("");
  const language = validLanguage(preferences?.language);
  async function restart() {
    try {
      setError("");
      if (window.yarnDesktop) await window.yarnDesktop.restart();
      else {
        await new Promise<void>((resolve, reject) =>
          window.dispatchEvent(
            new CustomEvent("spindle:prepare-reload", {
              detail: { resolve, reject },
            }),
          ),
        );
        location.reload();
      }
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <section className="settings-group">
      <div className="setting-row" data-setting="language">
        <label htmlFor="app-language">{tr("language.label")}</label>
        <CompactSelect
          label={tr("language.label")}
          value={language}
          options={[
            { value: "system", label: tr("language.system") },
            { value: "en", label: "English" },
            { value: "zh-TW", label: "繁體中文" },
            { value: "zh-CN", label: "简体中文" },
          ]}
          onChange={(value) => onChange?.({ language: validLanguage(value) })}
        />
      </div>
      <p className="setting-help">{tr("language.help")}</p>
      {language !== initial && (
        <Button variant="outline" onClick={() => void restart()}>
          {tr("language.restart")}
        </Button>
      )}
      <label className="settings-check" data-setting="autoCheckUpdates">
        <Checkbox
          checked={preferences?.autoCheckUpdates !== false}
          onCheckedChange={(v) => onChange?.({ autoCheckUpdates: v === true })}
        />
        {tr("updates.automatic")}
      </label>
      <p className="setting-help">{tr("updates.automaticHelp")}</p>
      {error && (
        <p role="alert" className="setting-error">
          {error}
        </p>
      )}
    </section>
  );
}
