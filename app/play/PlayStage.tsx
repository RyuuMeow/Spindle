"use client";
import { characterColor } from "./character-presentation";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { Stage } from "./presentation";
import type { PlaySession } from "./types";
import { pt } from "./messages";
import { measureDialoguePages } from "./dialogue-pages";
import "./vn-game.css";

/** Game presentation deliberately contains no editor/source navigation controls. */
export function PlayStage({
  session,
  presentation,
  stage,
  speaker,
  text,
  fullText,
  hasLine,
  revealing,
  canAdvance,
  next,
  choices,
  lineKey,
  auto,
  onAuto,
  onBacklog,
  onMeasure,
  page,
  pageCount,
}: {
  session: PlaySession | null;
  presentation: { showPortraits: boolean; useNameColors: boolean };
  stage: Stage;
  speaker: string;
  text: string;
  fullText: string;
  hasLine: boolean;
  revealing: boolean;
  canAdvance: boolean;
  next(): void;
  choices: ReactNode;
  lineKey: string;
  auto: boolean;
  onAuto(): void;
  onBacklog(): void;
  onMeasure(key: string, ends: number[]): void;
  page: number;
  pageCount: number;
}) {
  const textArea = useRef<HTMLParagraphElement>(null);
  const gesture = useRef<{ x: number; y: number; scroll: number } | null>(null);
  useLayoutEffect(() => {
    const el = textArea.current;
    if (!el) return;
    let active = true;
    const measure = () => {
      if (active && el.clientWidth > 0)
        onMeasure(lineKey, measureDialoguePages(el, fullText));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    void document.fonts.ready.then(measure);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [lineKey, fullText, onMeasure, hasLine]);
  const character = session?.resources.config.characters.find(
    (c) => c.name === speaker,
  );
  const background =
    stage.background && session?.resources.images[stage.background];
  return (
    <div
      className={`play-stage ${background ? "has-background" : "ambient-background"}`}
    >
      {background && (
        <img
          key={stage.background}
          className={`play-background ${stage.backgroundFade ? "fade" : ""}`}
          src={background}
          alt=""
        />
      )}
      <div className="play-stage-shade" aria-hidden="true" />
      <div className="play-cast" aria-hidden="true">
        {session &&
          Object.entries({ ...stage.exits, ...stage.cast }).map(
            ([position, actor]) => {
              const definition = session.resources.config.characters.find(
                (c) => c.name === actor.character,
              );
              const image = definition?.sprites[actor.expression];
              return (
                <div
                  key={
                    position +
                    actor.character +
                    actor.expression +
                    ("hidden" in actor ? "exit" : "")
                  }
                  className={`play-actor play-actor-${position} ${"hidden" in actor ? "fade-out" : actor.fade ? "fade" : ""} ${speaker && speaker !== actor.character ? "dim" : ""}`}
                >
                  {image && session.resources.images[image] ? (
                    <img src={session.resources.images[image]} alt="" />
                  ) : (
                    <div className="play-actor-fallback">
                      <span>{definition?.displayName || actor.character}</span>
                    </div>
                  )}
                </div>
              );
            },
          )}
      </div>
      <div className="play-game-content">
        <div className="play-vn-choices">{choices}</div>
        {hasLine && (
          <section
            className={`play-vn-dialogue play-vn-page ${canAdvance ? "can-advance" : ""}`}
            data-page={page}
            data-page-count={pageCount}
            aria-label={pt("line")}
            onPointerDown={(event) => {
              gesture.current =
                event.button === 0
                  ? {
                      x: event.clientX,
                      y: event.clientY,
                      scroll: textArea.current?.scrollTop || 0,
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
                (event.detail !== 0 && !start) ||
                !canAdvance ||
                (event.target as HTMLElement).closest(
                  "button,a,input,select",
                ) ||
                Math.hypot(
                  event.clientX - (start?.x ?? event.clientX),
                  event.clientY - (start?.y ?? event.clientY),
                ) > 5 ||
                Math.abs(
                  (textArea.current?.scrollTop || 0) - (start?.scroll ?? 0),
                ) > 2
              )
                return;
              next();
            }}
          >
            <div
              className="play-vn-advance-area"
              role="button"
              tabIndex={0}
              aria-disabled={!canAdvance}
              aria-label={revealing ? pt("revealPage") : pt("continueStory")}
              onKeyDown={(event) => {
                if (
                  !["Enter", " "].includes(event.key) ||
                  event.repeat ||
                  event.nativeEvent.isComposing
                )
                  return;
                event.preventDefault();
                event.stopPropagation();
                if (canAdvance) next();
              }}
            >
              <div
                className={`play-nameplate ${speaker ? "" : "is-narration"}`}
                aria-hidden={!speaker}
              >
                <strong
                  style={{
                    color:
                      presentation.useNameColors && speaker
                        ? characterColor(speaker, character)
                        : undefined,
                  }}
                  title={character?.displayName || speaker}
                >
                  {character?.displayName || speaker}
                </strong>
              </div>
              <p ref={textArea} className="play-vn-text" aria-hidden="true">
                {text}
              </p>
              <span
                className="play-vn-advance"
                aria-hidden="true"
                style={{
                  visibility: canAdvance && !revealing ? "visible" : "hidden",
                }}
              >
                <svg width="12" height="8" viewBox="0 0 12 8">
                  <path d="M1 1h10L6 7z" fill="currentColor" />
                </svg>
              </span>
            </div>
            <div className="play-vn-quick" aria-label={pt("play")}>
              <button
                aria-label={pt("auto")}
                aria-pressed={auto}
                disabled={
                  !["line", "options"].includes(session?.state.status || "")
                }
                onClick={onAuto}
              >
                {pt("auto")}
                <span className="play-vn-auto-state" aria-hidden="true">
                  {auto ? "ON" : "OFF"}
                </span>
              </button>
              <button onClick={onBacklog}>{pt("backlog")}</button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
