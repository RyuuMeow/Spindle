"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Project } from "../workspace/types";
import type { PlaySession, PreviewResources } from "./types";
import { mapPlaySource } from "./presentation";
const PreviewContext = createContext<{
  resources: PreviewResources | null;
  visited: { file: string; line: number; kind: string }[];
}>({ resources: null, visited: [] });
export const usePreview = () => useContext(PreviewContext);
export function PreviewProvider({
  project,
  children,
}: {
  project: Project;
  children: ReactNode;
}) {
  const [resources, setResources] = useState<PreviewResources | null>(null),
    [session, setSession] = useState<PlaySession | null>(null);
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
  return (
    <PreviewContext value={{ resources, visited }}>{children}</PreviewContext>
  );
}
export function ReadingPortrait({ speaker }: { speaker: string }) {
  const { resources } = usePreview(),
    actor = resources?.config.characters.find((c) => c.name === speaker);
  if (!speaker) return null;
  const image = actor?.portrait && resources?.images[actor.portrait];
  return (
    <span
      className="reading-portrait"
      aria-hidden="true"
      style={{ borderColor: actor?.color }}
      contentEditable={false}
    >
      {image ? (
        <img src={image} alt="" />
      ) : (
        [...(actor?.displayName || speaker)].slice(0, 2).join("")
      )}
    </span>
  );
}
