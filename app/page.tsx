"use client";
import { t as tr } from "./i18n/index.ts";

import { useEffect, useState } from "react";
import { WorkspaceClient } from "./workspace/client";
import UpdateDialog from "./workspace/UpdateDialog";
import DesktopWorkspace from "./workspace/DesktopWorkspace";
import Workbench from "./workspace/Workbench";
import type { WindowSession } from "./workspace/types";

export default function Home() {
  const [ready, setReady] = useState<{
      client: WorkspaceClient;
      session: WindowSession | null;
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const client = new WorkspaceClient();
    void client
      .initialize()
      .then(async () => {
        const session = await client.loadSession();
        if (active) setReady({ client, session });
      })
      .catch((error) => {
        if (active) setError(String(error));
      });
    return () => {
      active = false;
      client.dispose();
    };
  }, []);
  if (error)
    return (
      <main className="workbench">
        <div className="empty-editor">
          <h2>{tr("md77230a81e2a")}</h2>
          <p role="alert">{error}</p>
          <p>{tr("me5e9272bbc24")}</p>
          <button onClick={() => location.reload()}>
            {tr("m7e59d0f16293")}
          </button>
          {window.yarnDesktop && (
            <button onClick={() => void window.yarnDesktop?.openLogs()}>
              {tr("m9476f18bd20d")}
            </button>
          )}
        </div>
      </main>
    );
  if (!ready)
    return (
      <main className="workbench">
        <div className="empty-editor">Spindle…</div>
      </main>
    );
  return window.yarnDesktop ? (
    <>
      <UpdateDialog />
      <DesktopWorkspace client={ready.client} initialSession={ready.session} />
    </>
  ) : (
    <Workbench client={ready.client} initialSession={ready.session} />
  );
}
