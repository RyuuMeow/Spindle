"use client";
import { useState, useSyncExternalStore } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  FolderOpen,
  FolderPlus,
  Search,
  Settings2,
  Trash2,
  Pencil,
  ArchiveRestore,
} from "lucide-react";
import { ChromeButton } from "@/components/ChromeButton";
import ActionMenu, { type MenuState } from "./ActionMenu";
import SettingsView from "./SettingsView";
import type { WorkspaceClient } from "./client";
import {
  defaultSession,
  type ProjectCatalogEntry,
  type WorkspaceAction,
} from "./types";
import "./launcher.css";

export default function ProjectLauncher({
  client,
  onNavigate,
  initialCreate = false,
}: {
  client: WorkspaceClient;
  onNavigate: (action: WorkspaceAction) => Promise<void>;
  initialCreate?: boolean;
}) {
  const snapshot = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot,
  );
  const [page, setPage] = useState(initialCreate ? "create" : "projects"),
    [query, setQuery] = useState("");
  const [name, setName] = useState(""),
    [parent, setParent] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [rename, setRename] = useState<{
      id: string;
      name: string;
      error?: string;
    } | null>(null),
    [menu, setMenu] = useState<MenuState | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState(() => defaultSession(client.windowId, ""));
  const entries = (snapshot.catalog || []).filter((e) =>
    (e.name + " " + e.root)
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
  const drafts = snapshot.projects.filter(
    (p) => !p.root && p.kind !== "standalone",
  );
  const draft = drafts.find((p) => p.id === draftId);
  async function run(action: WorkspaceAction, navigate = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (navigate) await onNavigate(action);
      else return await client.action(action);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  function itemMenu(event: React.MouseEvent, entry: ProjectCatalogEntry) {
    event.preventDefault();
    setMenu({
      x: event.clientX,
      y: event.clientY,
      origin: event.currentTarget as HTMLElement,
      actions: [
        {
          label: "在檔案總管開啟",
          icon: <FolderOpen size={15} />,
          disabled: !!entry.unavailable,
          run: () =>
            void run({ type: "catalog", operation: "reveal", id: entry.id }),
        },
        {
          label: "改名",
          icon: <Pencil size={15} />,
          disabled: !!entry.unavailable,
          run: () => setRename({ id: entry.id, name: entry.name }),
        },
        null,
        {
          label: "從列表中移除",
          icon: <Trash2 size={15} />,
          run: () =>
            void run({ type: "catalog", operation: "remove", id: entry.id }),
        },
      ],
    });
  }
  const back = () => {
    setPage("projects");
    setDraftId(null);
    setError("");
  };
  return (
    <main
      className={
        "workbench project-launcher dark" +
        (window.yarnDesktop?.titleBarOverlay ? " desktop-overlay" : "")
      }
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        void run(
          {
            type: "openFiles",
            paths: window.yarnDesktop!.paths([...e.dataTransfer.files]),
          },
          true,
        );
      }}
    >
      <header className="workspace-header launcher-titlebar">
        <span>Spindle</span>
      </header>
      {page === "settings" ? (
        <SettingsView
          preferences={prefs}
          onChange={(next) => setPrefs((p) => ({ ...p, ...next }))}
          appPreferences={snapshot.preferences}
          onAppPreferences={(value) =>
            void run({ type: "preferences", reopenLastProject: value })
          }
          onResetLayout={() => setPrefs(defaultSession(client.windowId, ""))}
          onClose={back}
          returnLabel="返回專案列表"
          onOpenData={() => void window.yarnDesktop?.openLogs()}
          version={window.yarnDesktop?.version}
        />
      ) : (
        <div className="launcher-scroll">
          <div className="launcher-content">
            <div className="launcher-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/spindle.svg" alt="" width={48} height={48} />
              <h1>Spindle</h1>
              <ChromeButton title="設定" onClick={() => setPage("settings")}>
                <Settings2 size={19} />
              </ChromeButton>
            </div>
            {page === "projects" ? (
              <>
                <div className="launcher-actions">
                  <button
                    className="launcher-primary"
                    disabled={busy}
                    onClick={() => void run({ type: "openFolder" }, true)}
                  >
                    <FolderOpen size={19} />
                    開啟專案資料夾
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      setPage("create");
                      setName("");
                    }}
                  >
                    <FolderPlus size={19} />
                    建立專案
                  </button>
                </div>
                <div className="launcher-list-heading">
                  <h2>專案</h2>
                  <label className="launcher-search">
                    <Search size={15} />
                    <input
                      aria-label="搜尋專案"
                      placeholder="搜尋名稱或路徑"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                </div>
                <div className="launcher-projects" aria-label="專案列表">
                  {entries.map((entry) => (
                    <div
                      className={
                        "launcher-project" +
                        (entry.unavailable ? " unavailable" : "")
                      }
                      key={entry.id}
                      onContextMenu={(e) => itemMenu(e, entry)}
                    >
                      {rename?.id === entry.id ? (
                        <div className="launcher-rename">
                          <input
                            autoFocus
                            aria-label="專案名稱"
                            value={rename.name}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) =>
                              setRename({ ...rename, name: e.target.value })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Escape") setRename(null);
                              if (
                                e.key === "Enter" &&
                                !e.nativeEvent.isComposing
                              ) {
                                e.preventDefault();
                                void client
                                  .action({
                                    type: "catalog",
                                    operation: "rename",
                                    id: entry.id,
                                    name: rename.name,
                                  })
                                  .then(() => setRename(null))
                                  .catch((e) =>
                                    setRename({ ...rename, error: String(e) }),
                                  );
                              }
                            }}
                          />
                          {rename.error && (
                            <small role="alert">{rename.error}</small>
                          )}
                        </div>
                      ) : (
                        <button
                          disabled={busy || !!entry.unavailable}
                          onClick={() =>
                            void run(
                              { type: "openFolder", root: entry.root },
                              true,
                            )
                          }
                        >
                          <FolderOpen size={19} />
                          <span>
                            <strong>{entry.name}</strong>
                            <small title={entry.root}>{entry.root}</small>
                          </span>
                          {entry.unavailable && (
                            <AlertTriangle
                              size={17}
                              aria-label={entry.unavailable}
                            />
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {!entries.length && (
                  <p className="launcher-empty">
                    {query
                      ? "沒有符合的專案"
                      : "開啟資料夾，或建立你的第一個專案。"}
                  </p>
                )}
                {!!drafts.length && (
                  <button
                    className="launcher-drafts"
                    onClick={() => setPage("drafts")}
                  >
                    <ArchiveRestore size={16} />
                    待移轉草稿<span>{drafts.length}</span>
                  </button>
                )}
                <button
                  className="launcher-open-file"
                  disabled={busy}
                  onClick={() => void run({ type: "openFiles" }, true)}
                >
                  開啟單一劇本…
                </button>
              </>
            ) : page === "drafts" ? (
              <>
                <div className="launcher-section-title">
                  <ChromeButton title="返回專案列表" onClick={back}>
                    <ArrowLeft size={17} />
                  </ChromeButton>
                  <h2>待移轉草稿</h2>
                </div>
                {draft ? (
                  <>
                    <h3>{draft.name}</h3>
                    {draft.documents.map((d) => (
                      <section className="launcher-draft-preview" key={d.id}>
                        <strong>{d.name}</strong>
                        <pre>{d.text}</pre>
                      </section>
                    ))}
                    <button
                      className="launcher-primary"
                      onClick={() => {
                        setName(draft.name);
                        setPage("create");
                      }}
                    >
                      轉存為專案
                    </button>
                  </>
                ) : (
                  drafts.map((p) => (
                    <button
                      className="launcher-draft-row"
                      key={p.id}
                      onClick={() => setDraftId(p.id)}
                    >
                      <ArchiveRestore size={17} />
                      {p.name}
                      <small>{p.documents.length} 個劇本</small>
                    </button>
                  ))
                )}
              </>
            ) : (
              <>
                <div className="launcher-section-title">
                  <ChromeButton title="返回專案列表" onClick={back}>
                    <ArrowLeft size={17} />
                  </ChromeButton>
                  <h2>{draft ? "轉存為專案" : "建立專案"}</h2>
                </div>
                <form
                  className="launcher-create"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (parent)
                      void run(
                        draft
                          ? {
                              type: "migrateDraft",
                              projectId: draft.id,
                              name,
                              root: parent,
                            }
                          : { type: "createProject", name, root: parent },
                        true,
                      );
                  }}
                >
                  <label>
                    專案名稱
                    <input
                      autoFocus
                      aria-label="新專案名稱"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="我的故事"
                    />
                  </label>
                  <label>
                    位置
                    <div className="launcher-location">
                      <input
                        aria-label="專案父資料夾"
                        value={parent}
                        readOnly
                        placeholder="選擇存放專案的資料夾"
                      />
                      <button
                        type="button"
                        aria-label="選擇父資料夾"
                        onClick={() =>
                          void run({ type: "chooseProjectParent" }).then(
                            (r) => {
                              if (r?.path) setParent(r.path);
                            },
                          )
                        }
                      >
                        <FolderOpen size={18} />
                      </button>
                    </div>
                  </label>
                  {parent && name && (
                    <p className="launcher-path">
                      {parent.replace(/[\\/]$/, "")}\{name}
                    </p>
                  )}
                  <button
                    className="launcher-primary"
                    type="submit"
                    disabled={busy || !name.trim() || !parent}
                  >
                    <FolderPlus size={17} />
                    {draft ? "轉存專案" : "建立專案"}
                  </button>
                </form>
              </>
            )}
            {error && (
              <p className="launcher-error" role="alert">
                <AlertTriangle size={16} />
                {error}
              </p>
            )}
            {snapshot.notices.map((n, i) => (
              <p className="launcher-error" role="alert" key={i}>
                {n}
              </p>
            ))}
          </div>
        </div>
      )}
      <ActionMenu menu={menu} onClose={() => setMenu(null)} />
    </main>
  );
}
