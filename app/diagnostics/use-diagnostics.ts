"use client";
import {
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import type { Issue } from "../parser";
import type { Project } from "../workspace/types";
import { DiagnosticPresentation } from "./presentation";
let current: DiagnosticPresentation | undefined;
export const quietDiagnostic = (file: string, line: number) =>
  current?.quiet(file, line) ?? false;
export const diagnosticCursor = (file: string, line: number) =>
  window.dispatchEvent(
    new CustomEvent("spindle:diagnostic-caret", { detail: { file, line } }),
  );
export const requestDiagnostics = () =>
  window.dispatchEvent(new Event("spindle:diagnostics-now"));
export function useDiagnostics(
  project: Project | undefined,
  issues: Issue[],
  documentId?: string,
  line?: number,
) {
  const state = useRef<{ id?: string; value: DiagnosticPresentation }>({
    value: new DiagnosticPresentation(),
  });
  const [display, setDisplay] = useState<{
    visible: Issue[];
    published: Issue[];
  }>({ visible: [], published: [] });
  const render = useCallback(
    () =>
      setDisplay({
        visible: state.current.value.visible,
        published: state.current.value.published,
      }),
    [],
  );
  useLayoutEffect(() => {
    if (state.current.id !== project?.id)
      state.current = { id: project?.id, value: new DiagnosticPresentation() };
    current = state.current.value;
    current.update(
      project?.documents || [],
      issues,
      Date.now(),
      documentId && line ? { id: documentId, line } : undefined,
    );
    render();
  }, [project, issues, documentId, line, render]);
  useEffect(() => {
    if (documentId && line) {
      state.current.value.leave(documentId, line);
      render();
    }
  }, [documentId, line, render]);
  useEffect(() => {
    const timer = setInterval(() => {
      const c = state.current.value;
      if (c.pending.size) {
        const visible = c.visible, published = c.published, pending = c.pending.size;
        c.publish(Date.now());
        if (visible !== c.visible || published !== c.published || pending !== c.pending.size) render();
      }
    }, 40);
    const publish = () => {
      state.current.value.publish(Date.now(), true);
      render();
    };
    const caret = (event: Event) => {
      const { file, line } = (
        event as CustomEvent<{ file: string; line: number }>
      ).detail;
      const c = state.current.value;
      const doc = [...c.documents.values()].find((d) => d.name === file);
      if (doc) {
        c.leave(doc.id, line);
        render();
      }
    };
    window.addEventListener("spindle:diagnostic-caret", caret);
    const key = (event: KeyboardEvent) => {
      if (event.altKey && event.key === "Enter" && !event.isComposing)
        publish();
    };
    window.addEventListener("spindle:diagnostics-now", publish);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("spindle:diagnostic-caret", caret);
      clearInterval(timer);
      window.removeEventListener("spindle:diagnostics-now", publish);
      window.removeEventListener("keydown", key, true);
      if (current === state.current.value) current = undefined;
    };
  }, [render]);
  return display;
}
