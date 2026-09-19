"use client";
import { useEffect, useMemo, useRef } from "react";
import { CornerDownRight } from "lucide-react";
import { readingStructure } from "./structure";
import "./dialogue-reader.css";

/** A source-linked reading surface. It never evaluates branches or edits the script. */
export default function DialogueReader({
  text,
  name,
  line,
  goTo,
  fontSize,
  lineHeight,
  width,
}: {
  text: string;
  name: string;
  line: number;
  goTo?: { file: string; line: number; nonce: number } | null;
  fontSize: number;
  lineHeight: number;
  width?: "standard" | "wide";
}) {
  const host = useRef<HTMLDivElement>(null);
  const initialLine = useRef(line);
  const lines = useMemo(
    () => readingStructure(text.replace(/\r\n/g, "\n")),
    [text],
  );
  useEffect(() => {
    const target = goTo?.file === name ? goTo.line : initialLine.current;
    const items = [
      ...(host.current?.querySelectorAll<HTMLElement>("[data-line]") || []),
    ];
    const item =
      items.find((e) => Number(e.dataset.line) >= target) || items.at(-1);
    item?.scrollIntoView({ block: "center" });
  }, [goTo, name]); // Cursor updates in the editor do not move this independent reader.
  const content = lines.filter((l) =>
    ["title", "dialogue", "option", "blank"].includes(l.kind),
  );
  return (
    <div
      ref={host}
      className="dialogue-reader"
      tabIndex={0}
      aria-label="純閱讀模式"
      style={
        {
          "--reader-size": fontSize + "px",
          "--reader-line": lineHeight + "px",
          "--reader-width": width === "wide" ? "900px" : "760px",
        } as React.CSSProperties
      }
    >
      <article>
        {content.map((l) => {
          const value = l.text
            .trim()
            .replace(/<<[^>]*>>/g, "")
            .replace(/\s+#\S+/g, "")
            .trim();
          if (l.kind === "title")
            return (
              <h2 key={l.line} data-line={l.line}>
                {value.replace(/^title\s*:\s*/, "")}
              </h2>
            );
          if (l.kind === "blank")
            return (
              <div key={l.line} className="reader-blank" aria-hidden="true" />
            );
          if (l.kind === "option")
            return (
              <p key={l.line} data-line={l.line} className="reader-option">
                <CornerDownRight size={16} />
                <span>{value.replace(/^->\s*/, "")}</span>
              </p>
            );
          const role = value.match(/^([^:<>]+):\s*(.*)$/);
          return (
            <p key={l.line} data-line={l.line}>
              {role ? (
                <>
                  <strong>{role[1]}:</strong> {role[2]}
                </>
              ) : (
                value
              )}
            </p>
          );
        })}
      </article>
    </div>
  );
}
