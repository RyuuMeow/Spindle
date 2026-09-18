"use client";
import { useEffect, useState } from "react";
import { WorkspaceClient } from "./workspace/client";
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
          <h2>工作區尚未開啟</h2>
          <p role="alert">{error}</p>
          <p>原始資料會保留，請重新啟動或開啟應用程式資料目錄取得救援副本。</p>
          <button onClick={() => location.reload()}>重試</button>
          {window.yarnDesktop && (
            <button onClick={() => void window.yarnDesktop?.openLogs()}>
              開啟資料目錄
            </button>
          )}
        </div>
      </main>
    );
  if (!ready)
    return (
      <main className="workbench">
        <div className="empty-editor">正在開啟本機工作區…</div>
      </main>
    );
  return <Workbench client={ready.client} initialSession={ready.session} />;
}
