"use client";
import { useEffect, useState } from "react";
import { pt } from "./messages";
import type { PreviewConfig } from "./types";
export default function CommandPreviewBinding({
  command,
  disabled,
}: {
  command: string;
  disabled: boolean;
}) {
  const [config, setConfig] = useState<PreviewConfig | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [binding, setBinding] = useState<
    PreviewConfig["bindings"][number] | null
  >(null);
  useEffect(() => {
    let cancelled = false;
    void window.yarnDesktop?.play
      .resources()
      .then((r) => {
        if (!cancelled) {
          setConfig(r.config);
          setBinding(
            r.config.bindings.find((b) => b.command === command) || null,
          );
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [command]);
  async function save() {
    if (!config || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await window.yarnDesktop!.play.save({
        ...config,
        bindings: [
          ...config.bindings.filter((b) => b.command !== command),
          ...(binding ? [binding] : []),
        ],
      });
      setConfig(result.config);
      window.dispatchEvent(new Event("spindle-preview-changed"));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset
      className="preview-binding"
      disabled={disabled || !config || busy}
    >
      <legend>{pt("effects")}</legend>
      <p>{pt("effectHelp")}</p>
      <label>
        {pt("effect")}
        <select
          value={binding?.effect || "none"}
          onChange={(e) =>
            setBinding(
              e.target.value === "none"
                ? null
                : {
                    command,
                    effect: e.target.value as "background",
                    assetArgument: e.target.value === "background" ? 0 : 1,
                    characterArgument: 0,
                    position: "center",
                    fade: true,
                  },
            )
          }
        >
          <option value="none">—</option>
          {(["background", "show", "hide", "expression"] as const).map(
            (kind) => (
              <option key={kind} value={kind}>
                {pt(kind)}
              </option>
            ),
          )}
        </select>
      </label>
      {binding && (
        <>
          <label>
            {pt("characterArg")}
            <input
              type="number"
              min={0}
              max={31}
              value={binding.characterArgument}
              onChange={(e) =>
                setBinding({
                  ...binding,
                  characterArgument: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            {pt("assetArg")}
            <input
              type="number"
              min={0}
              max={31}
              value={binding.assetArgument}
              onChange={(e) =>
                setBinding({
                  ...binding,
                  assetArgument: Number(e.target.value),
                })
              }
            />
          </label>
          <label>
            {pt("position")}
            <select
              value={binding.position}
              onChange={(e) =>
                setBinding({ ...binding, position: e.target.value as "center" })
              }
            >
              {(["left", "center", "right"] as const).map((position) => (
                <option key={position} value={position}>
                  {pt(position)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={binding.fade}
              onChange={(e) =>
                setBinding({ ...binding, fade: e.target.checked })
              }
            />
            {pt("fade")}
          </label>
        </>
      )}
      <button type="button" onClick={() => void save()}>
        {pt("save")}
      </button>
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
