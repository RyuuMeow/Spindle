import { useEffect, useLayoutEffect, useRef } from "react";
import { FileText, LoaderCircle } from "lucide-react";
import "./inline-name.css";
export type InlineDraft = {
  kind: "new-document" | "rename-document" | "new-scene" | "rename-scene";
  value: string;
  folder?: string;
  documentId?: string;
  sceneName?: string;
  version?: number;
  newTab?: boolean;
  error?: string;
  busy?: boolean;
  createdId?: string;
};
export function InlineNameEditor({
  draft,
  onChange,
  onSubmit,
  onCancel,
}: {
  draft: InlineDraft;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const input = useRef<HTMLInputElement>(null),
    composing = useRef(false),
    cancelled = useRef(false);
  const initialDraft = useRef(draft);
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
        draft.kind.includes("scene") ? "場景名稱編輯" : "劇本名稱編輯"
      }
    >
      <div className="inline-name-row">
        <FileText size={14} />
        <input
          ref={input}
          value={draft.value}
          disabled={draft.busy}
          aria-label={draft.kind.includes("scene") ? "場景名稱" : "劇本名稱"}
          aria-invalid={!!draft.error}
          aria-describedby={draft.error ? "inline-name-error" : undefined}
          onChange={(e) => onChange(e.target.value)}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
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
            if (!composing.current && !cancelled.current && !draft.busy)
              onSubmit();
          }}
        />
        {draft.busy && <LoaderCircle className="save-spinner" size={13} />}
      </div>
      {draft.error && (
        <p id="inline-name-error" role="alert">
          {draft.error}
        </p>
      )}
    </div>
  );
}
