"use client";
import { useEffect, useState } from "react";
import type { UpdateState } from "../../desktop/update-service";
import { t as tr } from "../i18n/index.ts";
import { APP_VERSION } from "../version";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
function ReleaseNotes({ text }: { text?: string }) {
  return (
    <div
      className="release-notes"
      style={{ maxHeight: "40vh", overflow: "auto" }}
    >
      {(text || "")
        .split("\n")
        .map((line, index) =>
          line.startsWith("### ") ? (
            <h4 key={index}>{line.slice(4)}</h4>
          ) : line.startsWith("## ") ? (
            <h3 key={index}>{line.slice(3)}</h3>
          ) : line.startsWith("# ") ? (
            <h3 key={index}>{line.slice(2)}</h3>
          ) : line.startsWith("- ") ? (
            <p key={index}>• {line.slice(2)}</p>
          ) : (
            <p key={index}>{line || " "}</p>
          ),
        )}
    </div>
  );
}
export function UpdateButton() {
  const [status, setStatus] = useState<UpdateState>();
  return (
    <div>
      <Button
        variant="outline"
        onClick={() =>
          void window.yarnDesktop?.updates
            .action("check")
            .then(setStatus)
            .catch((e) => setStatus({ phase: "error", error: String(e) }))
        }
      >
        {tr("updates.check")}
      </Button>
      {status && (
        <p role="status">
          {status.phase === "current"
            ? tr("updates.current")
            : status.error || ""}
        </p>
      )}
    </div>
  );
}
export default function UpdateDialog() {
  const [state, setState] = useState<UpdateState>({ phase: "idle" }),
    [open, setOpen] = useState(false);
  useEffect(
    () =>
      window.yarnDesktop?.updates.subscribe((value) => {
        setState(value.state);
        if (value.prompt) setOpen(true);
      }),
    [],
  );
  async function action(name: "install" | "skip" | "cancel") {
    try {
      await window.yarnDesktop?.updates.action(name);
      if (name === "skip") setOpen(false);
    } catch (e) {
      setState((s) => ({ ...s, phase: "error", error: String(e) }));
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogTitle>{tr("updates.available")}</DialogTitle>
        <DialogDescription>
          {APP_VERSION} → {state.version}
        </DialogDescription>
        <ReleaseNotes text={state.notes || state.features} />
        <p className="setting-help">{tr("updates.unsigned")}</p>
        {state.phase === "downloading" && (
          <progress max={1} value={state.progress} />
        )}
        {state.error && <p role="alert">{state.error}</p>}
        <div className="setting-reset-actions">
          {state.phase === "downloading" ? (
            <Button onClick={() => void action("cancel")}>
              {tr("updates.cancel")}
            </Button>
          ) : (
            <>
              <Button onClick={() => void action("install")}>
                {tr("updates.install")}
              </Button>
              <Button variant="outline" onClick={() => void action("skip")}>
                {tr("updates.skip")}
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                {tr("updates.later")}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
