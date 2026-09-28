"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Check, Pause, Play } from "lucide-react";
import { DropdownMenu as Primitive } from "radix-ui";
import { ChromeButton } from "@/components/ChromeButton";
import { restoreControlFocus } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PresentationPreferences } from "../workspace/presentation-preferences";
import { resolvePresentation } from "../workspace/presentation-preferences";
import { pt } from "./messages";

export default function PlayLaunchButton({
  preferences,
  change,
  notify,
}: {
  preferences?: PresentationPreferences;
  change: (patch: PresentationPreferences) => void;
  notify: (message: string) => void;
}) {
  const launch = resolvePresentation(preferences).playLaunch;
  const [active, setActive] = useState(false);
  const [pending, setPending] = useState<"open" | "close" | null>(null);
  const [menu, setMenu] = useState({ x: 0, y: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const inFlight = useRef<"open" | "close" | null>(null);
  const launchButton = useRef<HTMLButtonElement>(null);
  const operation = useRef(0);
  const reportStatusError = useEffectEvent((error: unknown) =>
    notify(String(error)),
  );
  useEffect(() => {
    const bridge = window.yarnDesktop?.play;
    if (!bridge) return;
    let alive = true,
      changed = false;
    const unsubscribe = bridge.onStatus((value) => {
      changed = true;
      setActive(value);
    });
    void bridge
      .status()
      .then((value) => {
        if (alive && !changed) setActive(value);
      })
      .catch((error) => {
        if (alive) reportStatusError(error);
      });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  async function toggle() {
    if (inFlight.current === "close") return;
    const close = active || inFlight.current === "open";
    const generation = ++operation.current;
    inFlight.current = close ? "close" : "open";
    setPending(inFlight.current);
    try {
      if (close) await window.yarnDesktop!.play.close();
      else await window.yarnDesktop!.play.open(launch);
    } catch (error) {
      const message = String(error);
      if (!message.includes("PLAY_LAUNCH_CANCELLED")) {
        const translated = message.includes("PLAY_INPUT_PENDING")
          ? pt("pending")
          : message.includes("PLAY_START_NOT_FOUND")
            ? pt("documentStartNotFound")
            : message.includes("SCENE_NOT_FOUND")
              ? pt("startNotFound")
              : message.includes("PLAY_LINE_NOT_EXECUTABLE")
                ? pt("lineNotExecutable")
                : message.includes("PLAY_START_SOURCE_CHANGED")
                  ? pt("startSourceChanged")
                  : message;
        notify(translated);
      }
    } finally {
      if (operation.current === generation) {
        inFlight.current = null;
        setPending(null);
      }
    }
  }
  const labels = {
    default: pt("launchDefault"),
    document: pt("launchDocument"),
    line: pt("launchLine"),
  };
  const title = pending
    ? pt(pending === "open" ? "startingPlay" : "closingPlay")
    : active
      ? pt("closePlay")
      : launch.mode === "line"
        ? pt("launchLineHint")
        : `${pt("start")} · ${labels[launch.mode]}${launch.mode === "default" ? `: ${launch.defaultScene}` : ""}`;
  return (
    <>
      <ChromeButton
        ref={launchButton}
        title={title}
        className="play-launch-button"
        data-play-launch
        aria-pressed={active || pending === "open"}
        aria-busy={!!pending}
        disabled={pending === "close"}
        onClick={() => void toggle()}
        onContextMenu={(event) => {
          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY });
          setMenuOpen(true);
        }}
        onKeyDown={(event) => {
          if (
            event.key === "ContextMenu" ||
            (event.shiftKey && event.key === "F10")
          ) {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            setMenu({ x: rect.left, y: rect.bottom });
            setMenuOpen(true);
          }
        }}
      >
        {active || pending === "open" ? (
          <Pause size={17} aria-hidden="true" />
        ) : (
          <Play size={17} aria-hidden="true" />
        )}
        <span>{labels[launch.mode]}</span>
      </ChromeButton>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          className="context-menu-anchor"
          tabIndex={-1}
          aria-label={pt("start")}
          style={{ left: menu.x, top: menu.y }}
        />
        <DropdownMenuContent
          className="desktop-menu"
          align="start"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreControlFocus(launchButton.current);
          }}
        >
          <Primitive.RadioGroup
            value={launch.mode}
            onValueChange={(mode) =>
              change({ playLaunch: { mode: mode as typeof launch.mode } })
            }
          >
            {(["default", "document", "line"] as const).map((mode) => (
              <Primitive.RadioItem
                key={mode}
                value={mode}
                data-slot="dropdown-menu-item"
                className="play-launch-menu-item"
              >
                <span className="action-menu-icon" aria-hidden="true">
                  <Primitive.ItemIndicator>
                    <Check size={16} />
                  </Primitive.ItemIndicator>
                </span>
                {labels[mode]}
              </Primitive.RadioItem>
            ))}
          </Primitive.RadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
