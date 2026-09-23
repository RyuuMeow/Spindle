"use client";
import { extraSettingLabels } from "../workspace/settings-registry";
import { t as tr, locale } from "../i18n/index.ts";

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
      setMessage(tr("m66772dd0e3c2"));
    } catch (error) {
      setError(String(error));
    }
  }
  if (!bridge) return <p className="setting-help">{tr("mf07df1a3d22d")}</p>;
  return (
    <>
      <section className="settings-group" aria-label={tr("m2f7028ef99b4")}>
        <h3>{tr("mf23153ab64a8")}</h3>
        <p className="setting-help">{tr("m1e4b5bf24a3c")}</p>
        <div className="setting-field" data-setting="mcp.mode">
          <div className="setting-row">
            <span>{extraSettingLabels["mcp.mode"]}</span>
            <SegmentedControl
              label={tr("m41d52025e3db")}
              value={settings?.mode || "disabled"}
              onChange={(mode) =>
                void change({ mode: mode as Settings["mode"] })
              }
              options={[
                { value: "disabled", label: tr("m4e6fd0e28c55") },
                { value: "read", label: tr("m258b221f71b4") },
                { value: "write", label: tr("m82e5e2d9df43") },
              ]}
            />
          </div>
          <p className="setting-help">{tr("m57fee38c2881")}</p>
        </div>
        <div className="setting-row">
          <span>{tr("m1c2b2d825ce3")}</span>
          <span>
            {settings?.running
              ? tr("mf51b8fa9a805")
              : settings?.mode === "disabled"
                ? tr("ma8c3698b5b8c")
                : tr("m72c69bc884ab")}
          </span>
        </div>
        <div className="setting-row" data-setting="mcp.port">
          <label htmlFor="mcp-port">
            {extraSettingLabels["mcp.port"]}
            <small>{tr("mfc0f06d66c30")}</small>
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
                  setError(tr("mfff30976ea12"));
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
          <span>{tr("meca60b93eaa1")}</span>
          <code style={{ overflowWrap: "anywhere" }}>
            {settings?.port ? settings.url : tr("mf51bc1439591")}
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
            {tr("m6b23aab7922f")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!settings?.running}
            onClick={() => void copyConnection("codex")}
          >
            <Copy size={14} />
            {tr("mbed9d3ed3c67")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!settings?.running}
            onClick={() => void copyConnection("claude")}
          >
            <Copy size={14} />
            {tr("me76c83ef5fc7")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void change({ resetToken: true })}
          >
            <RotateCcw size={14} />
            {tr("m787c2e03063e")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void change({})}>
            <RefreshCw size={14} />
            {tr("m4b2fc19b47ed")}
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
        <h3>{tr("m7047b8672ca4")}</h3>
        <p className="setting-help">{tr("maf0d429542fa")}</p>
        {settings?.operations.length ? (
          <dl className="settings-description-list">
            {[...settings.operations]
              .reverse()
              .slice(0, 20)
              .map((item, index) => (
                <div key={index}>
                  <dt>{item.tool}</dt>
                  <dd>
                    {new Date(item.at).toLocaleTimeString(locale())} ·{" "}
                    {item.outcome === "ok"
                      ? tr("mc0b3fbff51cc")
                      : tr("m6707de42c29d")}
                  </dd>
                </div>
              ))}
          </dl>
        ) : (
          <p className="setting-help">{tr("m83ffac9ff8e5")}</p>
        )}
      </section>
    </>
  );
}
