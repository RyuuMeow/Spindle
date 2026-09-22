"use client";
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
  missing: "未安裝",
  installed: "已安裝",
  outdated: "需要更新",
  conflict: "設定衝突",
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
          if (alive) setError("無法讀取安裝狀態；請檢查設定目錄。");
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
        [client]: e instanceof Error ? e.message : "操作未完成",
      }));
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="settings-group" aria-label="Agent 安裝">
      <h3>Agent 安裝</h3>
      <p className="setting-help">
        安裝 MCP 連線與 Spindle Skill 至目前使用者，所有專案共用。存取憑證會寫入
        Agent 本機設定。Spindle 必須保持開啟。
      </p>
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
            item.client === "codex" ? "Codex 安裝" : "Claude Code 安裝"
          }
        >
          <h4>{item.client === "codex" ? "Codex" : "Claude Code"}</h4>
          <div className="agent-install-path">
            <div>
              <strong>MCP · {labels[item.mcp]}</strong>
              <code>{item.configPath}</code>
              <small>伺服器：{item.serverName}</small>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={!!busy}
              onClick={() => void run(item.client, "config")}
              aria-label="選擇 MCP 設定檔"
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
              aria-label="選擇 Skill 上層目錄"
            >
              <FolderOpen size={16} />
            </Button>
          </div>
          {item.pending && (
            <p className="setting-error">上次操作部分完成，可重試。</p>
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
                ? "安裝 MCP＋Skill"
                : "更新安裝"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!!busy || !enabled || item.mcp !== "installed"}
              onClick={() => void run(item.client, "test")}
            >
              <Plug size={14} />
              檢查連線
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
              移除
            </Button>
          </div>
          {messages[item.client] && (
            <p className="setting-help" role="status">
              {messages[item.client]}
            </p>
          )}
        </article>
      ))}
      {!enabled && (
        <p className="setting-help">
          請先啟用 MCP 唯讀或允許修改，並確認服務執行中。
        </p>
      )}
      <p className="setting-help">
        設定已寫入不代表 Agent 已載入。安裝後請重新載入 Agent 或開啟新工作階段。
      </p>
    </section>
  );
}
