"use client";
import { useRef } from "react";
import { pt } from "./messages";

function hasTranscriptSelection(surface: HTMLElement) {
  const selection = window.getSelection();
  const content = surface.parentElement?.querySelector(
    ".play-transcript-content",
  );
  if (!selection || selection.isCollapsed || !content) return false;
  for (let i = 0; i < selection.rangeCount; i++) {
    if (selection.getRangeAt(i).intersectsNode(content)) return true;
  }
  return false;
}

/** The empty end of the transcript is a reading surface, not another toolbar. */
export function NovelAdvance({
  enabled,
  revealing,
  next,
}: {
  enabled: boolean;
  revealing: boolean;
  next(): void;
}) {
  const gesture = useRef<{ x: number; y: number; scroll: number } | null>(null);
  return (
    <div
      className="play-novel-advance"
      role="button"
      tabIndex={enabled ? 0 : -1}
      aria-disabled={!enabled}
      aria-label={revealing ? pt("revealPage") : pt("continueStory")}
      onPointerDown={(event) => {
        gesture.current =
          event.button === 0
            ? {
                x: event.clientX,
                y: event.clientY,
                scroll: event.currentTarget.parentElement?.scrollTop || 0,
              }
            : null;
      }}
      onPointerCancel={() => {
        gesture.current = null;
      }}
      onClick={(event) => {
        const start = gesture.current;
        gesture.current = null;
        if (
          !enabled ||
          hasTranscriptSelection(event.currentTarget) ||
          (event.detail !== 0 && !start) ||
          (start &&
            (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5 ||
              Math.abs(
                (event.currentTarget.parentElement?.scrollTop || 0) -
                  start.scroll,
              ) > 2))
        )
          return;
        next();
      }}
      onKeyDown={(event) => {
        if (
          !["Enter", " "].includes(event.key) ||
          event.repeat ||
          event.nativeEvent.isComposing
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        if (enabled && !hasTranscriptSelection(event.currentTarget)) next();
      }}
    >
      <span
        className="play-novel-advance-cue"
        aria-hidden="true"
        hidden={!enabled}
      >
        <svg width="12" height="8" viewBox="0 0 12 8">
          <path d="M1 1h10L6 7z" fill="currentColor" />
        </svg>
      </span>
    </div>
  );
}
