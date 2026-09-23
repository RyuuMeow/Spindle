"use client";
import { t as tr } from "../i18n/index.ts";

import { useEffect, useState } from "react";
import { Download, RefreshCw, Trash2, FolderOpen, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AgentBridge } from "./types";
import type {
  AgentInstallation,
  AgentClient,
  InstallAction,
} from "./install-types";
const labels = {
  missing: tr("m684afa253fb4"),
  installed: tr("m1e8b9769df70"),
  outdated: tr("m3e9c10186e66"),
  conflict: tr("m9ba917e1ec80"),
};
export default function AgentInstallations({
  bridge,
  enabled,
  revision,
}: {
  bridge: AgentBridge;
  enabled: boolean;
  revision: string;
}) {
  const [items, setItems] = useState<AgentInstallation[]>([]);
  const [busy, setBusy] = useState<AgentClient | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void bridge
        .installations()
        .then((result) => {
          if (alive) {
            setItems(result);
            setError("");
          }
        })
        .catch(() => {
          if (alive) setError(tr("mdebffca5123e"));
        });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      alive = false;
      window.removeEventListener("focus", refresh);
    };
  }, [bridge, revision]);
  async function run(
    client: AgentClient,
    action: InstallAction | "config" | "skill",
  ) {
    setBusy(client);
    try {
      if (action === "config" || action === "skill") {
        await bridge.selectInstallPath(client, action);
      } else {
        const result = await bridge.installAction(client, action);
        setMessages((old) => ({ ...old, [client]: result.message }));
      }
      setItems(await bridge.installations());
    } catch (e) {
      setMessages((old) => ({
        ...old,
        [client]: e instanceof Error ? e.message : tr("m79be13bdf0c5"),
      }));
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="settings-group" aria-label={tr("me4801a5a4b6d")}>
      <h3>{tr("me4801a5a4b6d")}</h3>
      <p className="setting-help">{tr("m96b7626a3304")}</p>
      {error && (
        <p className="setting-error" role="alert">
          {error}
        </p>
      )}
      {items.map((item) => (
        <article
          key={item.client}
          className="agent-install-card"
          aria-label={
            item.client === "codex" ? tr("mb3476ff04164") : tr("mcc8fb20b3b72")
          }
        >
          <h4>{item.client === "codex" ? "Codex" : "Claude Code"}</h4>
          <div className="agent-install-path">
            <div>
              <strong>MCP · {labels[item.mcp]}</strong>
              <code>{item.configPath}</code>
              <small>
                {tr("maee4ef8c2b91")}
                {item.serverName}
              </small>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={!!busy}
              onClick={() => void run(item.client, "config")}
              aria-label={tr("m09f2bebcab20")}
            >
              <FolderOpen size={16} />
            </Button>
          </div>
          <div className="agent-install-path">
            <div>
              <strong>Skill · {labels[item.skill]}</strong>
              <code>{item.skillPath}</code>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={!!busy}
              onClick={() => void run(item.client, "skill")}
              aria-label={tr("m198f258524a1")}
            >
              <FolderOpen size={16} />
            </Button>
          </div>
          {item.pending && (
            <p className="setting-error">{tr("m53e61660cf70")}</p>
          )}
          {item.error && <p className="setting-error">{item.error}</p>}
          <div className="setting-reset-actions">
            <Button
              variant="outline"
              size="sm"
              disabled={
                !!busy ||
                !enabled ||
                item.mcp === "conflict" ||
                item.skill === "conflict"
              }
              onClick={() => void run(item.client, "install")}
            >
              {item.mcp === "missing" && item.skill === "missing" ? (
                <Download size={14} />
              ) : (
                <RefreshCw size={14} />
              )}
              {item.mcp === "missing" && item.skill === "missing"
                ? tr("m9ab89b17e1be")
                : tr("mcebf46bcd808")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!!busy || !enabled || item.mcp !== "installed"}
              onClick={() => void run(item.client, "test")}
            >
              <Plug size={14} />
              {tr("m4c0422810aeb")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={
                !!busy ||
                (item.mcp === "missing" &&
                  item.skill === "missing" &&
                  !item.pending)
              }
              onClick={() => void run(item.client, "remove")}
            >
              <Trash2 size={14} />
              {tr("m6135d4159e89")}
            </Button>
          </div>
          {messages[item.client] && (
            <p className="setting-help" role="status">
              {messages[item.client]}
            </p>
          )}
        </article>
      ))}
      {!enabled && <p className="setting-help">{tr("m0c1a9e072617")}</p>}
      <p className="setting-help">{tr("mbfefe9bcb299")}</p>
    </section>
  );
}
