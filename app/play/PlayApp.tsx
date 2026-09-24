"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Play,
  Pause,
  PanelRight,
  Users,
  Pin,
  ExternalLink,
  Square,
  X,
  Maximize2,
  Minimize2,
  ChevronDown,
  PanelBottom,
} from "lucide-react";
import { pt } from "./messages";
import { t as tr } from "../i18n";
import { CompactSelect } from "@/components/CompactSelect";
import { CompilePanel } from "./CompilePanel";
import { resolvePresentation } from "../workspace/presentation-preferences";
import { characterColor } from "./character-presentation";
import {
  commandArguments,
  dialogueText,
  previewStage,
  type Stage,
} from "./presentation";
import type { PlayAction, PlayEvent, PlaySession, PlaySource } from "./types";
import "./play.css";
import { Portrait } from "./Portrait";
import { PlayStage } from "./PlayStage";
import { NovelAdvance } from "./NovelAdvance";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

function subscribeViewport(callback: () => void) {
  window.addEventListener("resize", callback);
  return () => window.removeEventListener("resize", callback);
}
function subscribeMotion(callback: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
function stored<T>(key: string, fallback: T): T {
  try {
    return (
      JSON.parse(localStorage.getItem("spindle.play." + key) || "null") ??
      fallback
    );
  } catch {
    return fallback;
  }
}
export default function PlayApp() {
  const bridge = window.yarnDesktop!.play;
  const [presentation, setPresentation] = useState(
    () => resolvePresentation().playPresentation,
  );
  const [compileOpen, setCompileOpen] = useState(() =>
    stored("compileOpen", false),
  );
  const [compileHeight, setCompileHeight] = useState(() =>
    stored("compileHeight", 200),
  );
  const compileSeen = useRef("");
  const compileToggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let alive = true,
      generation = 0;
    const off = bridge.onPreferences((value) => {
      generation++;
      if (alive) setPresentation(value);
    });
    const ticket = generation;
    void bridge
      .preferences()
      .then((value) => {
        if (alive && ticket === generation) setPresentation(value);
      })
      .catch((error) =>
        console.error("Play presentation unavailable", String(error)),
      );
    return () => {
      alive = false;
      off();
    };
  }, [bridge]);
  const [session, setSession] = useState<PlaySession | null>(null),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [auto, setAuto] = useState(false);
  const actionPending = useRef(false);
  const [mode, setMode] = useState<"novel" | "vn">(() =>
    stored("mode", "novel"),
  );
  const viewportWidth = useSyncExternalStore(
    subscribeViewport,
    () => window.innerWidth,
  );
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [backlog, setBacklog] = useState(false);
  const [narrowPanel, setNarrowPanel] = useState(false);
  const enterGame = useRef<HTMLButtonElement>(null),
    exitGame = useRef<HTMLButtonElement>(null);
  const [immersive, setImmersive] = useState(false);
  const [away, setAway] = useState(false);
  const [panel, setPanel] = useState(() => stored("panel", true)),
    [width, setWidth] = useState(() => stored("width", 300));
  const narrow = viewportWidth < 980 && mode === "vn";
  const panelVisible = !immersive && (narrow ? narrowPanel : panel);
  const maxWidth = Math.max(
    240,
    Math.min(520, Math.floor(viewportWidth * 0.42)),
  );
  const panelWidth = Math.min(width, maxWidth);
  function leaveGame() {
    setImmersive(false);
    requestAnimationFrame(() => enterGame.current?.focus());
  }
  useEffect(() => {
    if (immersive) exitGame.current?.focus();
  }, [immersive]);
  const [typewriter, setTypewriter] = useState(() =>
      stored("typewriter", true),
    ),
    [speed, setSpeed] = useState(() => stored("speed", 40));
  const [progress, setProgress] = useState({ key: "", count: 0 }),
    [query, setQuery] = useState(""),
    [pins, setPins] = useState<string[]>([]);
  const [snapshot, setSnapshot] = useState<{
    snapshot?: string;
    name?: string;
    line?: number;
  } | null>(null);
  const transcript = useRef<HTMLDivElement>(null),
    follow = useRef(true),
    current = useRef(session);
  function accept(value: PlaySession) {
    setSession((previous) =>
      previous?.capturedAt === value.capturedAt
        ? {
            ...value,
            resources: {
              ...value.resources,
              images: {
                ...previous.resources.images,
                ...value.resources.images,
              },
            },
          }
        : value,
    );
    if (!["line", "options"].includes(value.state.status)) setAuto(false);
    const compileKey = value.runId + ":" + value.capturedAt;
    if (
      value.state.diagnostics.some(
        (d) => d.severity.toLowerCase() === "error",
      ) &&
      compileSeen.current !== compileKey
    ) {
      compileSeen.current = compileKey;
      setCompileOpen(true);
    }
  }
  useEffect(() => {
    current.current = session;
  }, [session]);
  useEffect(() => {
    const off = bridge.subscribe((value) => {
      if (value) accept(value);
    });
    void bridge
      .action({ action: "state" })
      .then(accept)
      .catch((e) => setError(String(e)));
    return off;
  }, [bridge]);
  useEffect(() => {
    for (const [key, value] of Object.entries({
      mode,
      panel,
      width,
      typewriter,
      speed,
      compileOpen,
      compileHeight,
    }))
      localStorage.setItem("spindle.play." + key, JSON.stringify(value));
  }, [mode, panel, width, typewriter, speed, compileOpen, compileHeight]);
  const state = session?.state,
    events = state?.events || [],
    lastLine = [...events].reverse().find((e) => e.kind === "line");
  const portraitExpressions = useMemo(() => {
    const result = new Map<PlayEvent["id"], string | undefined>();
    if (!session) return result;
    const stage = previewStage([], session.resources.config);
    for (const event of session.state.events) {
      previewStage([event], session.resources.config, stage);
      if (event.kind === "line")
        result.set(
          event.id,
          stage.expressions[dialogueText(event.text).speaker],
        );
    }
    return result;
  }, [session]);
  const line = dialogueText(lastLine?.text || ""),
    segments = [
      ...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
        line.text,
      ),
    ].map((s) => s.segment);
  const segmentCount = segments.length;
  const lineKey = session?.runId + ":" + lastLine?.id + ":" + lastLine?.text;
  const [pagination, setPagination] = useState({ key: "", ends: [0] });
  const [pageAnchor, setPageAnchor] = useState({ key: "", offset: 0 });
  const measurePages = useCallback((key: string, ends: number[]) => {
    setPagination((previous) =>
      previous.key === key && previous.ends.join() === ends.join()
        ? previous
        : { key, ends },
    );
  }, []);
  const pageEnds =
    pagination.key === lineKey ? pagination.ends : [segmentCount];
  const pageIndex = Math.max(
    0,
    pageEnds.findIndex(
      (end) => end > (pageAnchor.key === lineKey ? pageAnchor.offset : 0),
    ),
  );
  const pageStart =
    mode === "vn" && pageIndex > 0 ? pageEnds[pageIndex - 1] : 0;
  const pageEnd = mode === "vn" ? pageEnds[pageIndex] : segmentCount;
  const pageReady = mode !== "vn" || pagination.key === lineKey;
  const animateText = typewriter && !reducedMotion;
  const shown = animateText
    ? progress.key === lineKey
      ? Math.max(pageStart, Math.min(pageEnd, progress.count))
      : pageStart
    : pageEnd;
  const canAdvancePresentation =
    pageReady &&
    !busy &&
    (state?.status === "line" ||
      (state?.status === "options" &&
        (shown < pageEnd || (mode === "vn" && pageEnd < segmentCount))));
  useEffect(() => {
    if (!animateText || !pageReady) return;
    const timer = setInterval(
      () =>
        setProgress((p) =>
          p.key === lineKey && p.count >= pageEnd
            ? p
            : {
                key: lineKey,
                count: Math.min(
                  pageEnd,
                  Math.max(pageStart, p.key === lineKey ? p.count : 0) + 1,
                ),
              },
        ),
      1000 / Math.max(5, speed),
    );
    return () => clearInterval(timer);
  }, [lineKey, animateText, speed, pageStart, pageEnd, pageReady]);
  useEffect(() => {
    if (mode === "novel" && follow.current && transcript.current)
      transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [events.length, shown, mode]);
  async function act(action: PlayAction) {
    const s = current.current;
    if (!s || actionPending.current) return;
    actionPending.current = true;
    setBusy(true);
    setError("");
    try {
      accept(await bridge.action(action, s.state.revision));
    } catch (e) {
      setError(String(e));
      setAuto(false);
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }
  function next() {
    if (!canAdvancePresentation) return;
    if (shown < pageEnd) setProgress({ key: lineKey, count: pageEnd });
    else if (mode === "vn" && pageEnd < segmentCount) {
      setPageAnchor({ key: lineKey, offset: pageEnd });
      setProgress({ key: lineKey, count: pageEnd });
    } else if (state?.status === "line") void act({ action: "next" });
  }
  useEffect(() => {
    if (
      !auto ||
      busy ||
      snapshot ||
      backlog ||
      (mode === "novel" && away) ||
      state?.status !== "line"
    )
      return;
    if (!pageReady || shown < pageEnd) return;
    const timer = setTimeout(
      () => {
        next();
      },
      Math.max(900, Math.min(5000, (pageEnd - pageStart) * 35)),
    );
    return () => clearTimeout(timer);
  });
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229)
        return;
      if (
        event.key === "Escape" &&
        immersive &&
        !snapshot &&
        !backlog &&
        !(event.target as HTMLElement).closest(
          "input,textarea,select,[role=listbox],[role=combobox],[role=dialog]",
        )
      ) {
        leaveGame();
        return;
      }
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      if (
        (event.target as HTMLElement).closest(
          "input,select,textarea,button,summary,[role=dialog],[role=separator],[role=listbox],[role=option],[role=combobox],[contenteditable=true]",
        ) ||
        snapshot ||
        backlog
      )
        return;
      if (event.code === "Space" || event.key === "ArrowRight") {
        event.preventDefault();
        next();
      }
      if (event.key === "ArrowLeft" && state?.canBack) {
        event.preventDefault();
        setAuto(false);
        void act({ action: "back" });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  async function reveal(source?: PlaySource | null) {
    if (!source) return;
    setAuto(false);
    try {
      const value = await bridge.reveal(source);
      if (value.snapshot !== undefined) setSnapshot(value);
    } catch (e) {
      setError(String(e));
    }
  }
  const sourceButton = (source?: PlaySource | null) =>
    source && (
      <button
        className="play-icon"
        title={pt("source")}
        aria-label={pt("source")}
        onClick={() => void reveal(source)}
      >
        <ExternalLink size={15} />
      </button>
    );
  const displayName = (speaker: string) =>
    session?.resources.config.characters.find((c) => c.name === speaker)
      ?.displayName || speaker;
  const color = (speaker: string) =>
    presentation.useNameColors
      ? characterColor(
          speaker,
          session?.resources.config.characters.find((c) => c.name === speaker),
        )
      : "#cbbb9d";
  const renderEvent = (event: PlayEvent, previous?: PlayEvent) => {
    if (event.kind === "line") {
      const text = dialogueText(event.text),
        joined =
          previous?.kind === "line" &&
          dialogueText(previous.text).speaker === text.speaker;
      return (
        <article
          key={event.id}
          className={`play-line ${joined && presentation.showPortraits && text.speaker ? "joined" : ""} ${event.id === lastLine?.id ? "current" : ""}`}
        >
          {!joined && session && text.speaker && presentation.showPortraits && (
            <Portrait
              name={text.speaker}
              session={session}
              expression={portraitExpressions.get(event.id)}
            />
          )}
          <div>
            {!joined && text.speaker && (
              <strong style={{ color: color(text.speaker) }}>
                {displayName(text.speaker)}
              </strong>
            )}
            <p>
              {event.id === lastLine?.id
                ? segments.slice(0, shown).join("")
                : text.text}
            </p>
          </div>
          {sourceButton(event.source)}
        </article>
      );
    }
    if (event.kind === "command") {
      const [name, ...args] = commandArguments(event.text),
        definition = session?.resources.commandDefinitions.find(
          (c) => c.name === name,
        );
      return (
        <details className="play-command" key={event.id}>
          <summary>
            <span>
              {pt("command")} · <b>{name}</b>{" "}
              {args
                .map(
                  (arg, i) =>
                    (definition?.params[i]?.name
                      ? definition.params[i].name + ": "
                      : "") + arg,
                )
                .join(" · ")}
            </span>
            {sourceButton(event.source)}
          </summary>
          <code>{event.text}</code>
        </details>
      );
    }
    if (event.kind === "choice")
      return (
        <p className="play-choice-log" key={event.id}>
          ↳ {event.text} {sourceButton(event.source)}
        </p>
      );
    return null;
  };
  const choices = state?.status === "options" && (
    <div className="play-options">
      {state.options.map((option) => (
        <div key={option.id}>
          <button
            disabled={busy || !option.available}
            title={!option.available ? pt("unavailable") : undefined}
            onClick={() => void act({ action: "choose", optionId: option.id })}
          >
            {option.text}
          </button>
          {mode === "novel" && sourceButton(option.source)}
        </div>
      ))}
    </div>
  );
  const stage: Stage = session
    ? previewStage(events, session.resources.config)
    : { cast: {}, exits: {}, expressions: {} };
  return (
    <main className={`play-app mode-${mode} ${immersive ? "immersive" : ""}`}>
      <header className="play-toolbar" aria-label={pt("play")}>
        <label>
          <span>{pt("start")}</span>
          <CompactSelect
            label={pt("start")}
            placeholder={pt("chooseStart")}
            value={session?.startScene || ""}
            disabled={busy || !state?.scenes.length}
            options={(state?.scenes || []).map((scene) => ({
              value: scene,
              label: scene,
            }))}
            onChange={(scene) => {
              setAuto(false);
              void act({ action: "start", scene });
            }}
          />
        </label>
        <button
          title={pt("rerun")}
          aria-label={pt("rerun")}
          disabled={busy || !session?.startScene}
          onClick={() => {
            setAuto(false);
            void act({ action: "start", scene: session!.startScene! });
          }}
        >
          <RotateCcw size={18} />
        </button>
        <button
          title={pt("back")}
          aria-label={pt("back")}
          disabled={busy || !state?.canBack}
          onClick={() => {
            setAuto(false);
            void act({ action: "back" });
          }}
        >
          <ArrowLeft size={18} />
        </button>
        <button
          title={pt("next")}
          aria-label={pt("next")}
          disabled={!canAdvancePresentation}
          onClick={next}
        >
          <ArrowRight size={18} />
        </button>
        <button
          aria-pressed={auto}
          disabled={!["line", "options"].includes(state?.status || "")}
          onClick={() => setAuto(!auto)}
        >
          {auto ? <Pause size={16} /> : <Play size={16} />}
          {pt("auto")}
        </button>
        <button
          title={pt("stop")}
          aria-label={pt("stop")}
          disabled={
            busy ||
            !state ||
            ["ready", "stopped", "completed"].includes(state.status)
          }
          onClick={() => {
            setAuto(false);
            void act({ action: "stop" });
          }}
        >
          <Square size={16} />
        </button>
        <span className="play-separator" />
        <div
          className="play-mode-switch"
          role="group"
          aria-label={pt("presentation")}
        >
          <button
            aria-pressed={mode === "novel"}
            onClick={() => {
              setMode("novel");
              setImmersive(false);
            }}
          >
            {pt("novel")}
          </button>
          <button aria-pressed={mode === "vn"} onClick={() => setMode("vn")}>
            {pt("vn")}
          </button>
        </div>
        {mode === "vn" && (
          <button
            title={pt("immersive")}
            aria-label={pt("immersive")}
            ref={enterGame}
            onClick={() => setImmersive(true)}
          >
            <Maximize2 size={17} />
          </button>
        )}
        <button
          className="play-push"
          title={pt("characters")}
          aria-label={pt("characters")}
          onClick={() =>
            void bridge.characters().catch((e) => setError(String(e)))
          }
        >
          <Users size={18} />
        </button>
        <button
          title={pt("panel")}
          aria-label={pt("panel")}
          aria-pressed={panelVisible}
          onClick={() =>
            narrow ? setNarrowPanel(!narrowPanel) : setPanel(!panel)
          }
        >
          <PanelRight size={18} />
        </button>
        <button
          ref={compileToggle}
          title={tr("play.compileResults")}
          aria-label={tr("play.compileResults")}
          aria-pressed={compileOpen}
          onClick={() => setCompileOpen(!compileOpen)}
        >
          <PanelBottom size={18} />
        </button>
      </header>
      {immersive && (
        <button
          className="play-exit-immersive"
          ref={exitGame}
          aria-label={pt("exitImmersive")}
          title={pt("exitImmersive")}
          onClick={leaveGame}
        >
          <Minimize2 size={17} />
          <span>{pt("exitImmersive")}</span>
        </button>
      )}
      {session?.stale && (
        <div className="play-notice">
          {pt("stale")}
          <button
            disabled={busy}
            onClick={() => {
              setAuto(false);
              void act({ action: "latest" });
            }}
          >
            {pt("latest")}
          </button>
        </div>
      )}
      {error && (
        <div className="play-notice error" role="alert">
          {error}
        </div>
      )}
      <div className="play-body">
        <section className={`play-story ${mode}`}>
          {!session && <p>{pt("loading")}</p>}
          <div
            className="play-transcript"
            hidden={mode !== "novel"}
            ref={transcript}
            onScroll={() => {
              if (mode !== "novel") return;
              const el = transcript.current!;
              follow.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < 64;
              setAway(!follow.current);
              if (!follow.current) setAuto(false);
            }}
          >
            <div className="play-transcript-content">
              {events.map((event, i) => {
                if (
                  event.kind === "command" &&
                  events[i - 1]?.kind === "command"
                )
                  return null;
                if (
                  event.kind === "command" &&
                  events[i + 1]?.kind === "command"
                ) {
                  let end = i + 1;
                  while (events[end]?.kind === "command") end++;
                  return (
                    <details className="play-command" key={event.id}>
                      <summary>
                        {pt("command")} · {end - i}
                      </summary>
                      {events.slice(i, end).map((e) => renderEvent(e))}
                    </details>
                  );
                }
                return renderEvent(event, events[i - 1]);
              })}
              {choices}
            </div>
            <NovelAdvance
              enabled={canAdvancePresentation && !away && !backlog && !snapshot}
              revealing={shown < pageEnd}
              next={next}
            />
          </div>
          {mode === "vn" && (
            <PlayStage
              session={session}
              presentation={presentation}
              lineKey={lineKey}
              auto={auto}
              onMeasure={measurePages}
              page={pageIndex + 1}
              pageCount={pageEnds.length}
              onAuto={() => setAuto(!auto)}
              onBacklog={() => {
                setAuto(false);
                setBacklog(true);
              }}
              stage={stage}
              speaker={line.speaker}
              text={segments.slice(pageStart, shown).join("")}
              fullText={line.text}
              hasLine={!!lastLine}
              revealing={shown < pageEnd}
              canAdvance={canAdvancePresentation}
              next={next}
              choices={choices}
            />
          )}
          {mode === "novel" && away && (
            <button
              className="play-return-latest"
              onClick={() => {
                follow.current = true;
                setAway(false);
                transcript.current?.scrollTo({
                  top: transcript.current.scrollHeight,
                  behavior: "instant",
                });
              }}
            >
              <ChevronDown size={15} />
              {pt("returnLatest")}
            </button>
          )}
          {state?.status === "ready" && (
            <div className="play-status">
              {pt(state.scenes.length ? "chooseStart" : "noScenes")}
            </div>
          )}
          {state &&
            ["completed", "stopped", "error"].includes(state.status) && (
              <div className="play-status">
                {pt(state.status as "completed" | "stopped" | "error")}
                {state.status === "error" && (
                  <p>{events.findLast((e) => e.kind === "error")?.text}</p>
                )}
                {session?.startScene && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      setAuto(false);
                      void act({ action: "start", scene: session.startScene! });
                    }}
                  >
                    {pt("rerun")}
                  </button>
                )}
                {immersive && (
                  <button onClick={leaveGame}>{pt("exitImmersive")}</button>
                )}
              </div>
            )}
          {!immersive && compileOpen && (
            <CompilePanel
              diagnostics={state?.diagnostics || []}
              height={compileHeight}
              onHeight={setCompileHeight}
              onClose={() => {
                setCompileOpen(false);
                compileToggle.current?.focus();
              }}
              sourceButton={sourceButton}
            />
          )}
          {immersive && !!state?.diagnostics?.length && (
            <button
              className="play-view-compile"
              onClick={() => {
                leaveGame();
                setCompileOpen(true);
              }}
            >
              {tr("play.viewCompileResults")}
            </button>
          )}
        </section>
        {panelVisible && (
          <>
            <div
              className="play-resize"
              role="separator"
              aria-label={pt("panel")}
              aria-orientation="vertical"
              aria-valuemin={240}
              aria-valuemax={maxWidth}
              aria-valuenow={panelWidth}
              tabIndex={0}
              onKeyDown={(e) => {
                if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
                e.preventDefault();
                e.stopPropagation();
                setWidth(
                  Math.max(
                    240,
                    Math.min(
                      maxWidth,
                      panelWidth + (e.key === "ArrowLeft" ? 16 : -16),
                    ),
                  ),
                );
              }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (e.currentTarget.hasPointerCapture(e.pointerId))
                  setWidth(
                    Math.max(
                      240,
                      Math.min(maxWidth, window.innerWidth - e.clientX),
                    ),
                  );
              }}
            />
            <aside className="play-debug" style={{ width: panelWidth }}>
              <button
                className="play-close-debug"
                aria-label={pt("close")}
                onClick={() => setNarrowPanel(false)}
              >
                <X size={16} />
              </button>
              <section className="play-debug-current">
                <h2>{pt("currentLine")}</h2>
                <div className="play-current-location">
                  <span>
                    {pt("scene")}: {state?.scene || "—"}
                  </span>
                  {lastLine?.source && (
                    <span>
                      {pt("lastLineSource")}:{" "}
                      {
                        session?.documents.find(
                          (d) => d.id === lastLine.source?.documentId,
                        )?.name
                      }{" "}
                      · {lastLine.source.line}
                    </span>
                  )}
                </div>
                <p>{line.text || "—"}</p>
                {sourceButton(lastLine?.source)}
              </section>
              {state?.status === "options" && (
                <section>
                  <h2>{pt("options")}</h2>
                  {state.options.map((o) => (
                    <div className="play-event" key={o.id}>
                      <span>
                        {o.text}
                        {!o.available && <small>{pt("unavailable")}</small>}
                      </span>
                      {sourceButton(o.source)}
                    </div>
                  ))}
                </section>
              )}
              <section>
                <h2>{pt("variables")}</h2>
                <input
                  aria-label={pt("search")}
                  placeholder={pt("search")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {!state?.variables.some((v) =>
                  v.name.toLowerCase().includes(query.toLowerCase()),
                ) && <p>{pt("noVariables")}</p>}
                {[...(state?.variables || [])]
                  .filter((v) =>
                    v.name.toLowerCase().includes(query.toLowerCase()),
                  )
                  .sort(
                    (a, b) =>
                      Number(pins.includes(b.name)) -
                      Number(pins.includes(a.name)),
                  )
                  .map((v) => (
                    <div className="play-variable" key={v.name}>
                      <div>
                        <button
                          title={pt("pin")}
                          aria-label={pt("pin")}
                          aria-pressed={pins.includes(v.name)}
                          onClick={() =>
                            setPins((p) =>
                              p.includes(v.name)
                                ? p.filter((n) => n !== v.name)
                                : [...p, v.name],
                            )
                          }
                        >
                          <Pin size={13} />
                        </button>
                        <strong>{v.name}</strong>
                        {sourceButton(v.source)}
                      </div>
                      <small>
                        {v.type} · {pt("initial")}: {String(v.initial)}
                      </small>
                      {events.findLast(
                        (e) =>
                          ["variable", "override"].includes(e.kind) &&
                          e.text.startsWith(v.name + ": "),
                      ) && (
                        <small>
                          {
                            events.findLast(
                              (e) =>
                                ["variable", "override"].includes(e.kind) &&
                                e.text.startsWith(v.name + ": "),
                            )!.text
                          }
                        </small>
                      )}
                      <VariableInput
                        key={v.name + ":" + String(v.value)}
                        value={v.value}
                        disabled={
                          busy ||
                          !v.editable ||
                          !["line", "options"].includes(state!.status)
                        }
                        onChange={(value) =>
                          void act({
                            action: "setVariable",
                            name: v.name,
                            value,
                          })
                        }
                      />
                    </div>
                  ))}
              </section>
              <section>
                <h2>{pt("events")}</h2>
                {events
                  .filter((e) => e.kind !== "line" && e.kind !== "options")
                  .slice(-100)
                  .reverse()
                  .map((e) => (
                    <div className={`play-event ${e.kind}`} key={e.id}>
                      <small>{pt(e.kind)}</small>
                      <span>{e.text}</span>
                      {sourceButton(e.source)}
                    </div>
                  ))}
              </section>
              <section className="play-prefs">
                <label>
                  <input
                    type="checkbox"
                    checked={typewriter}
                    onChange={(e) => setTypewriter(e.target.checked)}
                  />
                  {pt("typewriter")}
                </label>
                <label>
                  {pt("speed")}
                  <input
                    type="range"
                    min="5"
                    max="100"
                    value={speed}
                    onChange={(e) => setSpeed(Number(e.target.value))}
                  />
                  <output>{speed}</output>
                </label>
              </section>
            </aside>
          </>
        )}
      </div>
      <span
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span key={lineKey + ":" + pageStart}>
          {session?.runId && lastLine && pageReady
            ? displayName(line.speaker) +
              ": " +
              segments.slice(pageStart, pageEnd).join("")
            : ""}
        </span>
      </span>
      {backlog && (
        <Dialog open onOpenChange={setBacklog}>
          <DialogContent className="play-backlog" aria-describedby={undefined}>
            <DialogTitle>{pt("backlog")}</DialogTitle>
            <div>
              {events
                .filter((e) => e.kind === "line" || e.kind === "choice")
                .map((e) => (
                  <p key={e.id}>{e.text}</p>
                ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
      {snapshot && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setSnapshot(null);
          }}
        >
          <DialogContent
            className="play-snapshot"
            showCloseButton={false}
            aria-describedby={undefined}
            style={{
              inset: 30,
              transform: "none",
              width: "auto",
              maxWidth: "none",
              maxHeight: "none",
              zIndex: 51,
            }}
          >
            <header>
              <div>
                <DialogTitle>{pt("snapshot")}</DialogTitle>
                <p>
                  {snapshot.name} · {snapshot.line}
                </p>
              </div>
              <button
                aria-label={pt("close")}
                onClick={() => setSnapshot(null)}
              >
                <X size={18} />
              </button>
            </header>
            <pre>
              {snapshot.snapshot?.split("\n").map((text, i) => (
                <div
                  key={i}
                  className={i + 1 === snapshot.line ? "target" : ""}
                >
                  <span>{i + 1}</span>
                  {text}
                </div>
              ))}
            </pre>
          </DialogContent>
        </Dialog>
      )}
    </main>
  );
}
function VariableInput({
  value,
  disabled,
  onChange,
}: {
  value: string | number | boolean;
  disabled: boolean;
  onChange(value: string | number | boolean): void;
}) {
  const [draft, setDraft] = useState(String(value));
  if (typeof value === "boolean")
    return (
      <CompactSelect
        label={pt("override")}
        value={String(value)}
        disabled={disabled}
        options={[
          { value: "true", label: "true" },
          { value: "false", label: "false" },
        ]}
        onChange={(value) => onChange(value === "true")}
      />
    );
  const submit = () => {
    if (draft === String(value)) return;
    if (typeof value === "number") {
      if (draft.trim() && Number.isFinite(Number(draft)))
        onChange(Number(draft));
      else setDraft(String(value));
    } else onChange(draft);
  };
  return (
    <input
      aria-label={pt("override")}
      type={typeof value === "number" ? "number" : "text"}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={submit}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
        if (e.key === "Enter") {
          e.stopPropagation();
          e.currentTarget.blur();
        }
        if (e.key === "Escape") {
          e.stopPropagation();
          setDraft(String(value));
        }
      }}
    />
  );
}
