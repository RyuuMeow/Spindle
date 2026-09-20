"use client";
import {
  useEffect,
  useEffectEvent,
  useState,
  useSyncExternalStore,
} from "react";
import Workbench from "./Workbench";
import ProjectLauncher from "./ProjectLauncher";
import type { WorkspaceClient } from "./client";
import {
  defaultSession,
  type ActionResult,
  type WindowSession,
  type WorkspaceAction,
} from "./types";
import { navigateSession } from "./navigation";
import { restoreSession } from "./storage";

export default function DesktopWorkspace({
  client,
  initialSession,
}: {
  client: WorkspaceClient;
  initialSession: WindowSession | null;
}) {
  const snapshot = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot,
  );
  const [session, setSession] = useState<WindowSession>(
    () =>
      initialSession || {
        ...defaultSession(client.windowId, ""),
        screen: "home",
      },
  );
  const [create, setCreate] = useState(false),
    [error, setError] = useState("");
  const editor =
    session.screen !== "home" &&
    snapshot.projects.some((p) => p.id === session.projectId);
  async function adopt(result: ActionResult) {
    if (result.cancelled || !result.projectId) return;
    await client.refresh();
    const saved = await window.yarnDesktop!.session.project(result.projectId);
    const legacy = localStorage.getItem(
      "yarn-project-view-" + result.projectId,
    );
    let next: WindowSession = defaultSession(client.windowId, result.projectId);
    try {
      next =
        restoreSession(
          saved || (legacy ? JSON.parse(legacy) : null),
          client.windowId,
          result.projectId,
        ) || next;
    } catch {
      setError("先前視圖無法讀取；已保留原始資料。");
    }
    next = {
      ...next,
      id: client.windowId,
      projectId: result.projectId,
      screen: "editor",
    };
    const p = client
      .getSnapshot()
      .projects.find((p) => p.id === result.projectId)!;
    const valid = new Set(p.documents.map((d) => d.id));
    next.tabs = next.tabs.filter(
      (t) => valid.has(t.documentId) || t.documentId.startsWith("@"),
    );
    const documentId =
      result.documentId || (!next.tabs.length ? p.documents[0]?.id : undefined);
    if (documentId) {
      const tab = next.tabs.find((t) => t.documentId === documentId);
      if (tab) next.activeId = tab.id;
      else next = navigateSession(next, documentId, {}, crypto.randomUUID());
    }
    await client.saveSession(next);
    setSession(next);
    setCreate(false);
  }
  async function navigate(action: WorkspaceAction | "home" | "create") {
    if (typeof action === "string") {
      const home = {
        ...defaultSession(client.windowId, ""),
        screen: "home" as const,
      };
      await client.saveSession(home);
      setSession(home);
      setCreate(action === "create");
      return;
    }
    await adopt(await client.action(action));
  }
  const opened = useEffectEvent(
    (r: ActionResult) => void adopt(r).catch((e) => setError(String(e))),
  );
  useEffect(() => {
    if (editor) return;
    const bridge = window.yarnDesktop!;
    const open = bridge.onOpened((r) => opened(r));
    const close = bridge.onPrepareClose(
      (token) =>
        void client
          .saveSession({ ...session, screen: "home", projectId: "" })
          .then(() => bridge.closePrepared(token))
          .catch((e) => bridge.closePrepared(token, String(e))),
    );
    void bridge.ready();
    return () => {
      open();
      close();
    };
  }, [editor, client, session]);
  if (editor)
    return (
      <Workbench
        key={session.projectId}
        client={client}
        initialSession={session}
        onNavigate={navigate}
      />
    );
  return (
    <>
      {error && (
        <div role="alert" className="workspace-notice">
          {error}
        </div>
      )}
      <ProjectLauncher
        key={String(create)}
        client={client}
        initialCreate={create}
        onNavigate={navigate}
      />
    </>
  );
}
