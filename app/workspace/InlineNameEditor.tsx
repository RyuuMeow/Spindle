import { t as tr } from "../i18n/index.ts";
import { useEffect, useLayoutEffect, useRef } from "react";
import { FileText, Folder } from "lucide-react";
import "./inline-name.css";
export type InlineDraft = {
  kind:
    | "new-document"
    | "rename-document"
    | "new-scene"
    | "rename-scene"
    | "new-folder"
    | "rename-folder";
  value: string;
  folder?: string;
  originalFolder?: string;
  documentId?: string;
  sceneName?: string;
  version?: number;
  newTab?: boolean;
  provisional?: boolean;
  error?: string;
  busy?: boolean;
  createdId?: string;
};
export function InlineNameEditor({
  draft,
  onChange,
  onSubmit,
  onCancel,
  onComposition,
}: {
  draft: InlineDraft;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onComposition?: (active: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null),
    composing = useRef(false),
    cancelled = useRef(false);
  const initialDraft = useRef(draft);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const submit = useRef(onSubmit);
  useLayoutEffect(() => {
    submit.current = onSubmit;
  }, [onSubmit]);
  useEffect(() => () => clearTimeout(blurTimer.current), []);
  function commitAfterBlur() {
    clearTimeout(blurTimer.current);
    // Let a close/cancel click dispose of the draft before committing it.
    blurTimer.current = setTimeout(() => {
      if (
        !composing.current &&
        !cancelled.current &&
        !draft.busy &&
        document.activeElement !== input.current
      )
        submit.current();
    }, 0);
  }
  useLayoutEffect(() => {
    const draft = initialDraft.current;
    input.current?.scrollIntoView({ block: "nearest" });
    input.current?.focus();
    if (input.current) {
      const length =
        draft.kind.includes("document") && draft.value.endsWith(".yarn")
          ? draft.value.length - 5
          : draft.value.length;
      input.current.setSelectionRange(0, length);
    }
  }, []);
  useEffect(() => {
    if (draft.error) input.current?.focus();
  }, [draft.error]);
  return (
    <div
      className="inline-name-editor"
      role="group"
      aria-label={
        draft.kind.includes("folder")
          ? tr("m095040309cbc")
          : draft.kind.includes("scene")
            ? tr("m574c8a360824")
            : tr("mf55e96bf758d")
      }
    >
      <div className="inline-name-row">
        {draft.kind.includes("folder") ? (
          <Folder size={14} />
        ) : (
          <FileText size={14} />
        )}
        <input
          ref={input}
          value={draft.value}
          readOnly={draft.busy}
          aria-busy={!!draft.busy}
          aria-label={
            draft.kind.includes("folder")
              ? tr("m0f42e972656c")
              : draft.kind.includes("scene")
                ? tr("m594983ea025e")
                : tr("madcee7b9afd1")
          }
          aria-invalid={!!draft.error}
          aria-describedby={draft.error ? "inline-name-error" : undefined}
          onChange={(e) => onChange(e.target.value)}
          onCompositionStart={() => {
            composing.current = true;
            onComposition?.(true);
          }}
          onCompositionEnd={() => {
            composing.current = false;
            onComposition?.(false);
            if (document.activeElement !== input.current) commitAfterBlur();
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (
              composing.current ||
              e.nativeEvent.isComposing ||
              e.keyCode === 229
            )
              return;
            if (e.key === "Escape") {
              e.preventDefault();
              cancelled.current = true;
              onCancel();
            }
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmit();
            }
          }}
          onBlur={() => {
            if (!composing.current) commitAfterBlur();
          }}
        />
      </div>
      {draft.error && (
        <p id="inline-name-error" role="alert">
          {draft.error}
        </p>
      )}
    </div>
  );
}
