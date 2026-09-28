"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Project, AppPreferences } from "../workspace/types";
import { resolvePresentation } from "../workspace/presentation-preferences";
import { characterColor } from "./character-presentation";
import type { PlaySession, PreviewResources } from "./types";
import { mapPlaySource } from "./presentation";
const PreviewContext = createContext<{
  resources: PreviewResources | null;
  presentation: ReturnType<typeof resolvePresentation>["editorCharacters"];
  visited: { file: string; line: number; kind: string }[];
}>({
  resources: null,
  visited: [],
  presentation: resolvePresentation().editorCharacters,
});
export const usePreview = () => useContext(PreviewContext);
export function PreviewProvider({
  project,
  preferences,
  children,
}: {
  project: Project;
  preferences?: AppPreferences;
  children: ReactNode;
}) {
  const [resources, setResources] = useState<PreviewResources | null>(null),
    [session, setSession] = useState<PlaySession | null>(null);
  const { showPortraits, useNameColors, sourceNameColors } =
    resolvePresentation(preferences).editorCharacters;
  // A scroll updates the persisted tab view, not character presentation. Keep
  // semantic context values stable so consumers don't rebuild decorations.
  const presentation = useMemo(
    () => ({ showPortraits, useNameColors, sourceNameColors }),
    [showPortraits, useNameColors, sourceNameColors],
  );
  useEffect(() => {
    let cancelled = false;
    const read = () => {
      void window.yarnDesktop?.play
        .resources()
        .then((value) => {
          if (!cancelled) setResources(value);
        })
        .catch(() => {
          if (!cancelled) setResources(null);
        });
    };
    read();
    window.addEventListener("spindle-preview-changed", read);
    const off = window.yarnDesktop?.play.subscribe((value) =>
      setSession(value?.projectId === project.id ? value : null),
    );
    const offResources = window.yarnDesktop?.play.onResources(read);
    return () => {
      cancelled = true;
      off?.();
      offResources?.();
      window.removeEventListener("spindle-preview-changed", read);
    };
  }, [project.id]);
  const visited = useMemo(() => {
    if (session?.projectId !== project.id) return [];
    return session.state.events.flatMap((event) => {
      const source = event.source,
        before =
          source && session.documents.find((d) => d.id === source.documentId),
        current =
          source && project.documents.find((d) => d.id === source.documentId);
      if (!source || !before || !current) return [];
      const from = mapPlaySource(source, before.text, current.text);
      return from === null
        ? []
        : [
            {
              file: current.name,
              line: current.text.slice(0, from).split("\n").length,
              kind: event.kind,
            },
          ];
    });
  }, [session, project]);
  const value = useMemo(
    () => ({ resources, visited, presentation }),
    [resources, visited, presentation],
  );
  return <PreviewContext value={value}>{children}</PreviewContext>;
}
export function ReadingPortrait({ speaker }: { speaker: string }) {
  const { resources, presentation } = usePreview(),
    actor = resources?.config.characters.find((c) => c.name === speaker);
  if (!speaker || !presentation.showPortraits) return null;
  const image = actor?.portrait && resources?.images[actor.portrait];
  return (
    <span
      className="reading-portrait"
      aria-hidden="true"
      style={{
        backgroundColor: image ? undefined : characterColor(speaker, actor),
      }}
      contentEditable={false}
    >
      {image ? <img src={image} alt="" /> : null}
    </span>
  );
}
