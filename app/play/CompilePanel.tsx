"use client";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { t } from "../i18n";
import type { PlayState, PlaySource } from "./types";
import { pt } from "./messages";
export function CompilePanel({
  diagnostics,
  height,
  onHeight,
  onClose,
  sourceButton,
}: {
  diagnostics: PlayState["diagnostics"];
  height: number;
  onHeight(value: number): void;
  onClose(): void;
  sourceButton(source?: PlaySource): ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [available, setAvailable] = useState(600);
  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(() =>
      setAvailable(parent.clientHeight),
    );
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);
  const overlay = available < 310;
  const max = Math.max(120, available - (overlay ? 16 : 186));
  const size = Math.max(120, Math.min(max, height));
  const clamp = (value: number) => Math.max(120, Math.min(max, value));
  return (
    <section
      ref={ref}
      className={`play-compile-panel ${overlay ? "is-overlay" : ""}`}
      style={{ height: size }}
      aria-label={t("play.compileResults")}
    >
      <div
        role="separator"
        className="play-compile-resize"
        tabIndex={0}
        aria-label={t("play.resizeCompile")}
        aria-orientation="horizontal"
        aria-valuemin={120}
        aria-valuemax={max}
        aria-valuenow={size}
        onKeyDown={(event) => {
          if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          event.stopPropagation();
          onHeight(
            event.key === "Home"
              ? 120
              : event.key === "End"
                ? max
                : clamp(size + (event.key === "ArrowUp" ? 16 : -16)),
          );
        }}
        onPointerDown={(event) => {
          if (event.button === 0)
            event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            onHeight(
              clamp(
                ref.current!.getBoundingClientRect().bottom - event.clientY,
              ),
            );
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      />
      <header>
        <h3>
          {t("play.compileResults")} <span>{diagnostics.length}</span>
        </h3>
        <button aria-label={pt("close")} title={pt("close")} onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <div className="play-compile-list">
        {!diagnostics.length && <p>{t("play.noCompileResults")}</p>}
        {diagnostics.map((diagnostic, index) => (
          <p
            key={index}
            className={
              diagnostic.severity.toLowerCase() === "warning"
                ? "warning"
                : "error"
            }
          >
            <span>{diagnostic.message}</span>
            {sourceButton(diagnostic.source)}
          </p>
        ))}
      </div>
    </section>
  );
}
