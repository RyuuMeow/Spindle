"use client";
import { t as tr } from "../i18n/index.ts";

import { useState, useSyncExternalStore } from "react";
import type { WorkspaceClient } from "./client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
export default function RescueSettings({
  client,
}: {
  client: WorkspaceClient;
}) {
  const snapshot = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot,
  );
  const drafts = snapshot.projects.filter(
    (p) => !p.root && p.kind !== "standalone",
  );
  const [selected, setSelected] = useState<string>(),
    [name, setName] = useState(""),
    [parent, setParent] = useState(""),
    [remove, setRemove] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const draft = drafts.find((p) => p.id === selected);
  async function run(action: Parameters<WorkspaceClient["action"]>[0]) {
    setError("");
    setBusy(true);
    try {
      return await client.action(action);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="settings-group">
      <p>{tr("mc4f3b3105823")}</p>
      {!drafts.length && <p>{tr("mf6ff78a98c34")}</p>}
      {drafts.map((p) => (
        <Button
          key={p.id}
          variant="outline"
          onClick={() => {
            setSelected(p.id);
            setName(p.name);
            setParent("");
          }}
        >
          {p.name}
        </Button>
      ))}
      {draft && (
        <>
          <h3>{draft.name}</h3>
          {draft.documents.map((d) => (
            <details key={d.id}>
              <summary>{d.name}</summary>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  maxHeight: 300,
                  overflow: "auto",
                }}
              >
                {d.text}
              </pre>
            </details>
          ))}
          <label>
            {tr("mc4f17fe66069")}
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <p>{parent}</p>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run({ type: "chooseProjectParent" }).then((r) => {
                if (r?.path) setParent(r.path);
              })
            }
          >
            {tr("m897f00cbe49d")}
          </Button>
          <Button
            disabled={busy || !parent || !name.trim()}
            onClick={() =>
              void run({
                type: "migrateDraft",
                background: true,
                projectId: draft.id,
                name,
                root: parent,
              })
            }
          >
            {tr("m937064a2b058")}
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setRemove(true)}
          >
            {tr("m24909c88a39a")}
          </Button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <AlertDialog open={remove} onOpenChange={setRemove}>
        <AlertDialogContent>
          <AlertDialogTitle>{tr("m24909c88a39a")}</AlertDialogTitle>
          <AlertDialogDescription>
            {tr("meb84f9c1e0f9")}
            {draft?.name}
            {tr("m1a719be7e3a3")}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("m2cd0f3be8738")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => {
                if (draft)
                  void run({ type: "deleteDraft", projectId: draft.id });
              }}
            >
              {tr("m3c8f5b363ab3")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
