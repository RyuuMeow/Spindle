import { useEffect, useLayoutEffect, useRef } from "react";
import { captureEditor, revealEditor } from "./editor-context";
import type { WorkspaceClient } from "../workspace/client";
import type { WindowSession } from "../workspace/types";
import type { ContextRequest, EditorContextSnapshot } from "./types";
const paint = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
export function useAgentContext(
  client: WorkspaceClient,
  session: WindowSession,
  navigate: (request: ContextRequest) => void,
) {
  const current = useRef({ session, navigate });
  const lastProject = useRef(session.projectId);
  const lastDocument = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    if (lastProject.current !== session.projectId) {
      lastDocument.current = undefined;
      lastProject.current = session.projectId;
    }
    current.current = { session, navigate };
    const tab = session.tabs.find((t) => t.id === session.activeId);
    if (tab && !tab.documentId.startsWith("@"))
      lastDocument.current = tab.documentId;
  });
  const tabSummary = JSON.stringify(
    session.tabs.map((t) => ({
      id: t.id,
      documentId: t.documentId,
      mode: t.mode,
    })),
  );
  const activeTab = session.tabs.find((t) => t.id === session.activeId);
  const activePage = activeTab?.documentId.startsWith("@")
    ? activeTab.documentId.slice(1)
    : activeTab
      ? "document"
      : "empty";
  const activeMode =
    activePage === "document"
      ? activeTab?.dialogueOnly
        ? "reader"
        : activeTab?.mode
      : undefined;
  useEffect(() => {
    window.yarnDesktop?.agent?.summary({
      projectId: session.projectId,
      activeTabId: session.activeId,
      activePage,
      activeMode,
      tabs: JSON.parse(tabSummary),
    });
  }, [session.projectId, session.activeId, tabSummary, activePage, activeMode]);
  useEffect(() => {
    const bridge = window.yarnDesktop?.agent;
    if (!bridge) return;
    let alive = true;
    const unsubscribe = bridge.onRequest(async (request) => {
      try {
        if (request.projectId !== current.current.session.projectId)
          throw Error("EDITOR_SESSION_EXPIRED");
        if (
          request.action === "reveal" ||
          (request.action === "activate" &&
            request.tabId &&
            request.tabId !== current.current.session.activeId)
        ) {
          const active = current.current.session.tabs.find(
            (t) => t.id === current.current.session.activeId,
          );
          const capture =
            active && !active.documentId.startsWith("@")
              ? captureEditor(active.dialogueOnly ? "reader" : active.mode)
              : null;
          if (
            client.pendingInputIds(request.projectId).length ||
            capture?.blocked ||
            capture?.composing
          )
            throw Error("INPUT_PENDING");
          current.current.navigate(request);
          await paint();
          if (request.action === "reveal") {
            const target = client
              .getSnapshot()
              .projects.find((p) => p.id === request.projectId)
              ?.documents.find((d) => d.id === request.documentId);
            if (!target) throw Error("DOCUMENT_NOT_FOUND");
            let revealed = false;
            for (let i = 0; i < 100 && alive; i++) {
              if (current.current.session.projectId !== request.projectId)
                throw Error("EDITOR_SESSION_EXPIRED");
              if (
                revealEditor(
                  "source",
                  target.name,
                  request.from ?? 0,
                  request.to ?? request.from ?? 0,
                )
              ) {
                revealed = true;
                break;
              }
              await new Promise((resolve) => setTimeout(resolve, 20));
            }
            if (!revealed) throw Error("EDITOR_CONTEXT_TIMEOUT");
          }
        }
        await client.flush(request.projectId);
        await client.refresh();
        await paint();
        const s = current.current.session;
        if (!alive || s.projectId !== request.projectId)
          throw Error("EDITOR_SESSION_EXPIRED");
        const p = client
          .getSnapshot()
          .projects.find((p) => p.id === s.projectId);
        const tab = s.tabs.find((t) => t.id === s.activeId);
        const documentId =
          tab && !tab.documentId.startsWith("@") ? tab.documentId : undefined;
        const mode = tab?.dialogueOnly ? "reader" : tab?.mode;
        const capture = documentId && mode ? captureEditor(mode) : null;
        const capturedDoc =
          capture && p?.documents.find((d) => d.name === capture.documentName);
        const pendingDocumentIds = client.pendingInputIds(s.projectId);
        if (
          capture?.blocked &&
          capturedDoc &&
          !pendingDocumentIds.includes(capturedDoc.id)
        )
          pendingDocumentIds.push(capturedDoc.id);
        const value: EditorContextSnapshot = {
          projectId: s.projectId,
          tabId: tab?.id,
          documentId: capturedDoc?.id || documentId,
          page: documentId ? "document" : tab?.documentId.slice(1) || "empty",
          mode,
          lastDocumentId: lastDocument.current,
          capture: capture || undefined,
          pendingDocumentIds,
        };
        bridge.respond(request.token, value);
      } catch (error) {
        bridge.respond(request.token, undefined, String(error));
      }
    });
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [client]);
}
