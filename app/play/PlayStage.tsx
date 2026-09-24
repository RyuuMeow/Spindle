"use client";
import { ChevronDown, ChevronRight, History, Pause, Play } from "lucide-react";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { Stage } from "./presentation";
import type { PlaySession } from "./types";
import { pt } from "./messages";
import "./vn-game.css";

/** Game presentation deliberately contains no editor/source navigation controls. */
export function PlayStage({
  session,
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
  onUserScrollAway,
}: {
  session: PlaySession | null;
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
  onUserScrollAway(): void;
}) {
  const textArea = useRef<HTMLParagraphElement>(null);
  const follow = useRef(true);
  const previousLine = useRef("");
  const gesture = useRef<{ x: number; y: number; scroll: number } | null>(null);
  useLayoutEffect(() => {
    const el = textArea.current;
    if (!el) return;
    if (previousLine.current !== lineKey) {
      previousLine.current = lineKey;
      follow.current = true;
      el.scrollTop = 0;
    } else if (follow.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [lineKey, text]);
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
      <div className="play-scene-caption">
        {session?.state.scene || session?.projectName}
      </div>
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
            className={`play-vn-dialogue ${canAdvance ? "can-advance" : ""}`}
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
                !start ||
                !canAdvance ||
                event.detail > 1 ||
                (event.target as HTMLElement).closest(
                  "button,a,input,select",
                ) ||
                Math.hypot(event.clientX - start.x, event.clientY - start.y) >
                  5 ||
                Math.abs((textArea.current?.scrollTop || 0) - start.scroll) >
                  2 ||
                window.getSelection()?.toString()
              )
                return;
              next();
            }}
          >
            {speaker && (
              <div className="play-nameplate">
                <span
                  className="play-character-mark"
                  style={{ background: character?.color }}
                />
                <strong>{character?.displayName || speaker}</strong>
              </div>
            )}
            <p
              ref={textArea}
              className="play-vn-text"
              aria-hidden="true"
              onScroll={() => {
                const el = textArea.current!;
                follow.current =
                  el.scrollHeight - el.scrollTop - el.clientHeight < 24;
                if (!follow.current) onUserScrollAway();
              }}
            >
              {text}
            </p>
            <span className="sr-only">{fullText}</span>
            <div className="play-vn-quick" aria-label={pt("play")}>
              <button
                aria-pressed={auto}
                disabled={!auto && !canAdvance}
                onClick={onAuto}
              >
                {auto ? <Pause size={12} /> : <Play size={12} />}
                {pt("auto")}
              </button>
              <button onClick={onBacklog}>
                <History size={13} />
                {pt("backlog")}
              </button>
            </div>
            {["line", "options"].includes(session?.state.status || "") && (
              <button
                className="play-vn-advance"
                aria-label={revealing ? pt("revealLine") : pt("continueStory")}
                disabled={!canAdvance}
                onClick={next}
              >
                <span>
                  {canAdvance
                    ? revealing
                      ? pt("revealLine")
                      : pt("continueStory")
                    : pt("chooseOption")}
                </span>
                {canAdvance ? (
                  <ChevronRight size={18} />
                ) : (
                  <ChevronDown size={18} />
                )}
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
