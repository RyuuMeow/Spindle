"use client";
import { useEffect, useRef } from "react";

/** The grip expands its own panel; Escape restores the size before this drag. */
export function PanelResizeHandle({
  side,
  value,
  min,
  max,
  onResize,
  label,
}: {
  side: "left" | "right" | "bottom";
  value: number;
  min: number;
  max: number;
  onResize: (value: number) => void;
  label: string;
}) {
  const drag = useRef<{
    coordinate: number;
    value: number;
    pointer: number;
    cursor: string;
  } | null>(null);
  const latest = useRef(onResize);
  useEffect(() => {
    latest.current = onResize;
  }, [onResize]);
  useEffect(
    () => () => {
      if (drag.current)
        document.documentElement.style.cursor = drag.current.cursor;
    },
    [],
  );
  const clamp = (size: number) =>
    Math.max(min, Math.min(max, Math.round(size)));
  function stop(cancel: boolean) {
    if (!drag.current) return;
    if (cancel) latest.current(drag.current.value);
    document.documentElement.style.cursor = drag.current.cursor;
    drag.current = null;
  }
  return (
    <div
      className={`panel-resize-handle resize-${side}`}
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={side === "bottom" ? "horizontal" : "vertical"}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          coordinate: side === "bottom" ? event.clientY : event.clientX,
          value,
          pointer: event.pointerId,
          cursor: document.documentElement.style.cursor,
        };
        document.documentElement.style.cursor =
          side === "bottom" ? "row-resize" : "col-resize";
      }}
      onPointerMove={(event) => {
        if (!drag.current || drag.current.pointer !== event.pointerId) return;
        const distance =
          (side === "bottom" ? event.clientY : event.clientX) -
          drag.current.coordinate;
        onResize(
          clamp(drag.current.value + distance * (side === "left" ? 1 : -1)),
        );
      }}
      onPointerUp={() => stop(false)}
      onPointerCancel={() => stop(true)}
      onLostPointerCapture={() => stop(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && drag.current) {
          event.preventDefault();
          stop(true);
          return;
        }
        const positive =
          side === "bottom"
            ? "ArrowUp"
            : side === "right"
              ? "ArrowLeft"
              : "ArrowRight";
        const negative =
          side === "bottom"
            ? "ArrowDown"
            : side === "right"
              ? "ArrowRight"
              : "ArrowLeft";
        if (![positive, negative, "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        onResize(
          event.key === "Home"
            ? min
            : event.key === "End"
              ? max
              : clamp(
                  value +
                    (event.key === positive ? 1 : -1) *
                      (event.shiftKey ? 32 : 8),
                ),
        );
      }}
    />
  );
}
