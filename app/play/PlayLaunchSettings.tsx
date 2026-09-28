import { useEffect, useRef, useState } from "react";
import { validPlaySceneName } from "../workspace/presentation-preferences";
import { pt } from "./messages";
export default function PlayLaunchSettings({
  value,
  change,
}: {
  value: string;
  change?: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current && draft === value) setDraft(null);
  }, [value, draft]);
  const text = draft ?? value;
  const valid = validPlaySceneName(text);
  return (
    <div className="setting-field" data-setting="playLaunch.defaultScene">
      <div className="setting-row">
        <label htmlFor="play-default-scene">
          {pt("defaultScene")}
          <small>{pt("defaultSceneHelp")}</small>
        </label>
        <input
          id="play-default-scene"
          value={text}
          disabled={!change}
          spellCheck={false}
          maxLength={160}
          aria-invalid={!valid}
          aria-describedby={!valid ? "play-default-scene-error" : undefined}
          onFocus={() => {
            focused.current = true;
            setDraft((current) => current ?? value);
          }}
          onBlur={() => {
            focused.current = false;
            if (valid && text === value) setDraft(null);
          }}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            if (
              validPlaySceneName(next) &&
              !(event.nativeEvent as InputEvent).isComposing
            )
              change?.(next);
          }}
          onCompositionEnd={(event) => {
            const next = event.currentTarget.value;
            if (validPlaySceneName(next)) change?.(next);
          }}
        />
      </div>
      {!valid && (
        <p className="setting-error" id="play-default-scene-error" role="alert">
          {pt("invalidStartScene")}
        </p>
      )}
    </div>
  );
}
