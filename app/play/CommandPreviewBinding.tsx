"use client";
import { CompactSelect } from "@/components/CompactSelect";
import { usePreviewAutosave } from "./use-preview-autosave";
import { pt } from "./messages";
import type { PreviewConfig } from "./types";
export default function CommandPreviewBinding({
  command,
  disabled,
  projectId,
}: {
  command: string;
  projectId: string;
  disabled: boolean;
}) {
  const {
    draft: config,
    error,
    busy,
    controller,
  } = usePreviewAutosave(projectId);
  const binding = config?.bindings.find((b) => b.command === command) || null;
  const setBinding = (value: PreviewConfig["bindings"][number] | null) =>
    controller?.update((c) => {
      c.bindings = [
        ...c.bindings.filter((b) => b.command !== command),
        ...(value ? [value] : []),
      ];
    });
  return (
    <fieldset
      className="preview-binding"
      disabled={disabled || !config}
      onCompositionStart={() => controller?.composition(true)}
      onCompositionEnd={() => controller?.composition(false)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget))
          void controller?.flush();
      }}
    >
      <legend>{pt("effects")}</legend>
      <p>{pt("effectHelp")}</p>
      <label>
        {pt("effect")}
        <CompactSelect
          value={binding?.effect || "none"}
          label={pt("effect")}
          disabled={disabled || !config}
          options={[
            { value: "none", label: "—" },
            ...(["background", "show", "hide", "expression"] as const).map(
              (kind) => ({ value: kind, label: pt(kind) }),
            ),
          ]}
          onChange={(value) =>
            setBinding(
              value === "none"
                ? null
                : {
                    command,
                    effect: value as "background",
                    assetArgument: value === "background" ? 0 : 1,
                    characterArgument: 0,
                    position: "center",
                    fade: true,
                  },
            )
          }
        />
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
            <CompactSelect
              value={binding.position}
              label={pt("position")}
              disabled={disabled || !config}
              options={(["left", "center", "right"] as const).map((value) => ({
                value,
                label: pt(value),
              }))}
              onChange={(value) =>
                setBinding({ ...binding, position: value as "center" })
              }
            />
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
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void controller?.flush()}
          >
            {pt("retry")}
          </button>
          {error.includes("PREVIEW_FIELD_CONFLICT") && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void controller?.resubmit()}
            >
              {pt("resubmitChanges")}
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void controller?.reload()}
          >
            {pt("reloadSaved")}
          </button>
        </div>
      )}
    </fieldset>
  );
}
