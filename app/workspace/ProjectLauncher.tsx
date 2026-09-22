"use client";
import { t as tr } from "../i18n/index.ts";

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
} from "lucide-react";
import { ChromeButton } from "@/components/ChromeButton";
import ActionMenu, { type MenuState } from "./ActionMenu";
import SettingsView from "./SettingsView";
import RescueSettings from "./RescueSettings";
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
  const [prefs, setPrefs] = useState(() => defaultSession(client.windowId, ""));
  const entries = (snapshot.catalog || []).filter((e) =>
    (e.name + " " + e.root)
      .toLocaleLowerCase()
      .includes(query.toLocaleLowerCase()),
  );
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
          label: tr("mb89391aa4985"),
          icon: <FolderOpen size={15} />,
          disabled: !!entry.unavailable,
          run: () =>
            void run({ type: "catalog", operation: "reveal", id: entry.id }),
        },
        {
          label: tr("m83c37e8a4a5f"),
          icon: <Pencil size={15} />,
          disabled: !!entry.unavailable,
          run: () => setRename({ id: entry.id, name: entry.name }),
        },
        null,
        {
          label: tr("m15208b078628"),
          icon: <Trash2 size={15} />,
          run: () =>
            void run({ type: "catalog", operation: "remove", id: entry.id }),
        },
      ],
    });
  }
  const back = () => {
    setPage("projects");
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
          rescue={<RescueSettings client={client} />}
          workspaceSettings={false}
          preferences={prefs}
          onChange={(next) => setPrefs((p) => ({ ...p, ...next }))}
          appPreferences={snapshot.preferences}
          onAppearance={(patch) => void run({ type: "appearance", patch })}
          onAppPreferences={(value) =>
            void run({ type: "preferences", ...value })
          }
          onResetLayout={() => setPrefs(defaultSession(client.windowId, ""))}
          onClose={back}
          returnLabel={tr("me9683346265e")}
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
              <ChromeButton
                title={tr("m0d8619aae051")}
                onClick={() => setPage("settings")}
              >
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
                    {tr("m5a25c4bc6162")}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      setPage("create");
                      setName("");
                    }}
                  >
                    <FolderPlus size={19} />
                    {tr("m181ad3312ed1")}
                  </button>
                </div>
                <div className="launcher-list-heading">
                  <h2>{tr("me564b916b12e")}</h2>
                  <label className="launcher-search">
                    <Search size={15} />
                    <input
                      aria-label={tr("me95721a5d4df")}
                      placeholder={tr("mdde02704467f")}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                </div>
                <div
                  className="launcher-projects"
                  aria-label={tr("m2c8bbce7227b")}
                >
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
                            aria-label={tr("mc4f17fe66069")}
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
                    {query ? tr("mefff54056571") : tr("m38e407780643")}
                  </p>
                )}
                <button
                  className="launcher-open-file"
                  disabled={busy}
                  onClick={() => void run({ type: "openFiles" }, true)}
                >
                  {tr("me14a2fccc945")}
                </button>
              </>
            ) : (
              <>
                <div className="launcher-section-title">
                  <ChromeButton title={tr("me9683346265e")} onClick={back}>
                    <ArrowLeft size={17} />
                  </ChromeButton>
                  <h2>{tr("m181ad3312ed1")}</h2>
                </div>
                <form
                  className="launcher-create"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (parent)
                      void run(
                        { type: "createProject", name, root: parent },
                        true,
                      );
                  }}
                >
                  <label>
                    {tr("mc4f17fe66069")}
                    <input
                      autoFocus
                      aria-label={tr("m1abd8fe62114")}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder={tr("md70df31e32d2")}
                    />
                  </label>
                  <label>
                    {tr("m1fb4d574da92")}
                    <div className="launcher-location">
                      <input
                        aria-label={tr("m04a1bf33332d")}
                        value={parent}
                        readOnly
                        placeholder={tr("m54f1ba1de5c0")}
                      />
                      <button
                        type="button"
                        aria-label={tr("m897f00cbe49d")}
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
                    {tr("m181ad3312ed1")}
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
