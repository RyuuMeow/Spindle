"use client";
import AgentInstallations from "./AgentInstallations";
import { copyText } from "@/app/clipboard";
import { useEffect, useState } from "react";
import { Copy, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/SegmentedControl";
import type { McpSettings as Settings } from "./types";
export default function McpSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [installRevision, setInstallRevision] = useState(0);
  const [port, setPort] = useState<string | null>(null);
  const bridge =
    typeof window === "undefined" ? undefined : window.yarnDesktop?.agent;
  useEffect(() => {
    if (!bridge) return;
    let alive = true;
    const refresh = () => {
      void bridge
        .settings()
        .then((value) => {
          if (alive) setSettings(value);
        })
        .catch((error) => {
          if (alive) setError(String(error));
        });
    };
    refresh();
    const unsubscribe = window.yarnDesktop?.subscribe(refresh);
    window.addEventListener("focus", refresh);
    return () => {
      alive = false;
      unsubscribe?.();
      window.removeEventListener("focus", refresh);
    };
  }, [bridge]);
  async function change(
    patch: Parameters<NonNullable<typeof bridge>["configure"]>[0],
  ) {
    if (!bridge) return;
    try {
      setSettings(await bridge.configure(patch));
      setInstallRevision((value) => value + 1);
      setError("");
      setMessage("");
      return true;
    } catch (error) {
      setError(String(error));
      return false;
    }
  }
  async function copyConnection(format: "codex" | "claude" | "http" = "http") {
    if (!bridge) return;
    try {
      await copyText(await bridge.connectionFormat(format));
      setError("");
      setMessage("已複製連線資料，包含此電腦的存取憑證。");
    } catch (error) {
      setError(String(error));
    }
  }
  if (!bridge)
    return (
      <p className="setting-help">
        MCP 與 Agent 安裝適用於 Windows 桌面版。接入指南：Spindle 原始碼的
        docs/mcp.md。
      </p>
    );
  return (
    <>
      <section className="settings-group" aria-label="MCP 連線">
        <h3>本機 Agent 存取</h3>
        <p className="setting-help">
          讓同一台電腦上的 agent 取得編輯情境、檢查專案及執行語義操作。Spindle
          必須保持開啟。
        </p>
        <div className="setting-field">
          <div className="setting-row">
            <span>存取模式</span>
            <SegmentedControl
              label="MCP 存取模式"
              value={settings?.mode || "disabled"}
              onChange={(mode) =>
                void change({ mode: mode as Settings["mode"] })
              }
              options={[
                { value: "disabled", label: "停用" },
                { value: "read", label: "唯讀" },
                { value: "write", label: "允許修改" },
              ]}
            />
          </div>
          <p className="setting-help">
            允許修改時，agent 的文字變更可撤銷；指令定義可從專案復原頁還原版本。
          </p>
        </div>
        <div className="setting-row">
          <span>連線狀態</span>
          <span>
            {settings?.running
              ? "執行中"
              : settings?.mode === "disabled"
                ? "已停用"
                : "未連線"}
          </span>
        </div>
        <div className="setting-row">
          <label htmlFor="mcp-port">
            連接埠<small>0 表示自動配置並記住可用連接埠</small>
          </label>
          <div className="setting-number">
            <input
              id="mcp-port"
              type="number"
              min={0}
              max={65535}
              value={port ?? String(settings?.port || 0)}
              onChange={(e) => setPort(e.target.value)}
              onBlur={() => {
                if (port === null) return;
                const value = Number(port);
                if (
                  !port.trim() ||
                  !Number.isInteger(value) ||
                  value < 0 ||
                  value > 65535
                ) {
                  setError("連接埠須為 0–65535 的整數。");
                  return;
                }
                void change({ port: value }).then((ok) => {
                  if (ok) setPort(null);
                });
              }}
            />
          </div>
        </div>
        <div className="setting-row">
          <span>連線網址</span>
          <code style={{ overflowWrap: "anywhere" }}>
            {settings?.port ? settings.url : "尚未配置"}
          </code>
        </div>
        <div className="setting-reset-actions">
          <Button
            variant="outline"
            size="sm"
            disabled={!settings?.running}
            onClick={() => void copyConnection()}
          >
            <Copy size={14} />
            複製 MCP 連線資料
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!settings?.running}
            onClick={() => void copyConnection("codex")}
          >
            <Copy size={14} />
            複製 Codex 設定
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!settings?.running}
            onClick={() => void copyConnection("claude")}
          >
            <Copy size={14} />
            複製 Claude Code 設定
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void change({ resetToken: true })}
          >
            <RotateCcw size={14} />
            重設憑證
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void change({})}>
            <RefreshCw size={14} />
            重試連線
          </Button>
        </div>
        {(error || settings?.error) && (
          <p className="setting-error" role="alert">
            {error || settings?.error}
          </p>
        )}
        {message && (
          <p className="setting-help" role="status">
            {message}
          </p>
        )}
      </section>
      <AgentInstallations
        bridge={bridge}
        enabled={!!settings?.running}
        revision={installRevision + JSON.stringify(settings)}
      />
      <section className="settings-group">
        <h3>最近操作</h3>
        <p className="setting-help">
          僅記錄本次啟動的工具名稱與結果，不記錄劇本文字。
        </p>
        {settings?.operations.length ? (
          <dl className="settings-description-list">
            {[...settings.operations]
              .reverse()
              .slice(0, 20)
              .map((item, index) => (
                <div key={index}>
                  <dt>{item.tool}</dt>
                  <dd>
                    {new Date(item.at).toLocaleTimeString()} ·{" "}
                    {item.outcome === "ok" ? "完成" : "未完成"}
                  </dd>
                </div>
              ))}
          </dl>
        ) : (
          <p className="setting-help">尚無操作</p>
        )}
      </section>
    </>
  );
}
