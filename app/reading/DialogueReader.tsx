"use client";
import { t as tr } from "../i18n/index.ts";

import { useEditorContext } from "../mcp/editor-context";
import { readerRuns, readerSelection } from "../mcp/reader-context";
import { sourceOffset } from "../workspace/engine";
import type { SourceSelection } from "../mcp/types";
import { useAppearance, appearanceVariables } from "../appearance/context";
import { useEffect, useMemo, useRef } from "react";
import { CornerDownRight } from "lucide-react";
import { readingStructure } from "./structure";
import "./dialogue-reader.css";
import { ReadingPortrait, usePreview } from "../play/context";
import {
  characterColor,
  colorSurface,
  speakerSpan,
} from "../play/character-presentation";

/** A source-linked reading surface. It never evaluates branches or edits the script. */
export default function DialogueReader({
  text,
  name,
  line,
  goTo,
}: {
  text: string;
  name: string;
  line: number;
  goTo?: { file: string; line: number; nonce: number } | null;
  fontSize?: number;
  lineHeight?: number;
  width?: "standard" | "wide";
}) {
  const { style, appearance } = useAppearance("reader");
  const { resources, presentation } = usePreview();
  const host = useRef<HTMLDivElement>(null);
  const initialLine = useRef(line);
  const selection = useRef<SourceSelection | null>(null);
  useEffect(() => {
    selection.current = null;
    const update = () => {
      if (host.current)
        selection.current = readerSelection(host.current) || selection.current;
    };
    document.addEventListener("selectionchange", update);
    return () => document.removeEventListener("selectionchange", update);
  }, [name, text]);
  useEditorContext("reader", () => {
    if (!host.current) return null;
    const bounds = host.current.getBoundingClientRect();
    const visible = [
      ...host.current.querySelectorAll<HTMLElement>("[data-source-from]"),
    ].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom >= bounds.top && r.top <= bounds.bottom;
    });
    return {
      documentName: name,
      source: text,
      selections: selection.current ? [selection.current] : [],
      visibleRanges: visible.map((el) => ({
        from: Number(el.dataset.sourceFrom),
        to: Number(el.dataset.sourceTo),
      })),
    };
  });
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
      aria-label={tr("m2a5dc861fb26")}
      style={
        {
          ...appearanceVariables(style),
          "--reader-size": style.fontSize + "px",
          "--reader-line": style.fontSize * style.lineHeight + "px",
          "--reader-width":
            appearance.widths.reader === "wide" ? "900px" : "760px",
        } as React.CSSProperties
      }
    >
      <article>
        {content.map((l) => {
          const speaker = l.kind === "dialogue" ? speakerSpan(l.text) : null;
          const actor =
            speaker &&
            resources?.config.characters.find((c) => c.name === speaker.name);
          const spans = readerRuns(l.text, l.kind).map((run) => {
            const Tag = run.strong ? "strong" : "span";
            return (
              <Tag
                key={run.from}
                style={
                  run.strong && speaker && presentation.useNameColors
                    ? {
                        color: characterColor(
                          speaker.name,
                          actor || undefined,
                          colorSurface(style.background),
                        ),
                      }
                    : undefined
                }
                data-source-from={sourceOffset(text, l.from + run.from)}
                data-source-to={sourceOffset(text, l.from + run.to)}
              >
                {run.text}
              </Tag>
            );
          });
          if (l.kind === "title")
            return (
              <h2 key={l.line} data-line={l.line}>
                {spans}
              </h2>
            );
          if (l.kind === "blank")
            return (
              <div key={l.line} className="reader-blank" aria-hidden="true" />
            );
          return (
            <p
              key={l.line}
              data-line={l.line}
              className={l.kind === "option" ? "reader-option" : undefined}
            >
              {l.kind === "option" && <CornerDownRight size={16} />}
              {l.kind === "dialogue" && (
                <ReadingPortrait speaker={speaker?.name || ""} />
              )}
              <span>{spans}</span>
            </p>
          );
        })}
      </article>
    </div>
  );
}
