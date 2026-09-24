import {
  BrowserWindow,
  dialog,
  ipcMain,
  screen,
  type IpcMainInvokeEvent,
} from "electron";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { locale } from "../app/i18n";
import { parse } from "../app/parser";
import { mapPlaySource } from "../app/play/presentation";
import type { PlaySession, PlaySource } from "../app/play/types";
import type { AgentHost } from "./mcp/application";
import type { WorkspaceService } from "./workspace-service";
import { PreviewResourcesStore } from "./preview-resources";
import { PlayProcess } from "./play-process";
import { atomicWrite } from "./disk-io";

type EditorWindow = { id: string; projectId: string; window: BrowserWindow };
type Record = {
  session: PlaySession;
  window: BrowserWindow;
  editor: EditorWindow;
  runtime: PlayProcess;
  busy: boolean;
};
const actionSchema = z.discriminatedUnion("action", [
  z
    .object({ action: z.enum(["state", "next", "back", "stop", "latest"]) })
    .strict(),
  z
    .object({ action: z.literal("start"), scene: z.string().min(1).max(300) })
    .strict(),
  z
    .object({ action: z.literal("choose"), optionId: z.number().int().min(0) })
    .strict(),
  z
    .object({
      action: z.literal("setVariable"),
      name: z.string().min(1).max(300),
      value: z.union([z.string().max(10000), z.number().finite(), z.boolean()]),
    })
    .strict(),
]);
export function createPlayService(options: {
  service: WorkspaceService;
  host: AgentHost;
  owner(event: IpcMainInvokeEvent): EditorWindow;
  directory: string;
  profile: string;
  notifyResources(projectId: string): void;
}) {
  const { service, host, owner, directory, profile } = options;
  const records = new Map<string, Record>(),
    opening = new Map<string, Promise<void>>(),
    resources = new PreviewResourcesStore();
  const executable = path.join(
    directory.replace(/app\.asar(?=[\\/])/, "app.asar.unpacked"),
    "play-runtime",
    "Spindle.Play.exe",
  );
  const preferencesPath = path.join(profile, "play-window-v1.json");
  function alive(record: Record) {
    return (
      !record.editor.window.isDestroyed() &&
      record.editor.projectId === record.session.projectId &&
      host
        .list()
        .some((s) => s.editorSessionId === record.session.editorSessionId)
    );
  }
  function send(record: Record) {
    const update = {
      ...record.session,
      resources: { ...record.session.resources, images: {} },
    };
    if (!record.window.isDestroyed())
      record.window.webContents.send("play:changed", update);
    if (!record.editor.window.isDestroyed())
      record.editor.window.webContents.send("play:changed", update);
  }
  function get(event: IpcMainInvokeEvent) {
    const record = [...records.values()].find(
      (r) => r.window.webContents.id === event.sender.id,
    );
    if (
      !record ||
      !alive(record) ||
      !event.sender.getURL().startsWith("workbench://app/")
    )
      throw Error("PLAY_SESSION_EXPIRED");
    return record;
  }
  function dispose(record: Record) {
    records.delete(record.editor.id);
    record.runtime.close();
    if (!record.editor.window.isDestroyed())
      record.editor.window.webContents.send("play:changed", null);
    if (!record.window.isDestroyed()) record.window.destroy();
  }
  async function snapshot(editor: EditorWindow) {
    const target = host.list().find((s) => s.windowId === editor.id);
    if (!target) throw Error("EDITOR_SESSION_EXPIRED");
    const contexts = await Promise.all(
      host
        .list()
        .filter((s) => s.projectId === target.projectId)
        .map(async (s) => ({
          id: s.editorSessionId,
          context: await host.request(s.editorSessionId, { action: "capture" }),
        })),
    );
    if (
      editor.projectId !== target.projectId ||
      !host.list().some((s) => s.editorSessionId === target.editorSessionId)
    )
      throw Error("EDITOR_SESSION_EXPIRED");
    const project = service.engine.project(target.projectId);
    for (const { context } of contexts) {
      const doc = project.documents.find((d) => d.id === context.documentId);
      if (
        context.pendingDocumentIds.length ||
        context.capture?.composing ||
        context.capture?.blocked ||
        (doc && context.capture && doc.text !== context.capture.source)
      )
        throw Error("PLAY_INPUT_PENDING");
    }
    const context = contexts.find(
      (c) => c.id === target.editorSessionId,
    )!.context;
    const documents = project.documents
      .filter(
        (d) =>
          !project.excluded.includes(d.id) &&
          !project.excluded.includes(d.name),
      )
      .map((d) => ({
        id: d.id,
        name: d.name,
        version: d.version,
        text: d.text,
      }));
    const doc = documents.find((d) => d.id === context.documentId);
    const offset =
      context.capture?.selections[context.capture.primarySelection || 0]?.head;
    const line =
      doc && offset !== undefined
        ? doc.text.slice(0, offset).split("\n").length
        : undefined;
    const nodes = doc
      ? parse([{ ...doc, saved: doc.text }], project.commands).nodes
      : [];
    const scene = line
      ? nodes.find((n) => n.start <= line && n.end >= line)?.name
      : undefined;
    return {
      target,
      documents,
      scene,
      resources: resources.read(project),
      projectName: project.name,
    };
  }
  async function open(editor: EditorWindow) {
    const existing = records.get(editor.id);
    if (existing && alive(existing)) {
      existing.window.show();
      existing.window.focus();
      return;
    }
    if (existing) dispose(existing);
    const data = await snapshot(editor);
    const runtime = new PlayProcess(executable, (message) => {
      const record = records.get(editor.id);
      if (record) {
        record.session.state.status = "error";
        record.session.state.events.push({
          id: -1,
          kind: "error",
          text: message,
        });
        send(record);
      }
    });
    let state;
    try {
      state = await runtime.request({
        action: "compile",
        documents: data.documents,
      });
      if (state.status === "ready" && data.scene)
        state = await runtime.request({ action: "start", scene: data.scene });
    } catch (error) {
      runtime.close();
      throw error;
    }
    if (
      editor.window.isDestroyed() ||
      editor.projectId !== data.target.projectId
    ) {
      runtime.close();
      throw Error("EDITOR_SESSION_EXPIRED");
    }
    let saved: { width?: number; height?: number; x?: number; y?: number } = {};
    try {
      saved = JSON.parse(fs.readFileSync(preferencesPath, "utf8"));
    } catch {
      /* defaults */
    }
    const area = screen.getDisplayNearestPoint({
      x: Number(saved.x) || 0,
      y: Number(saved.y) || 0,
    }).workArea;
    const width = Math.min(
        area.width,
        Math.max(760, Math.min(1800, Number(saved.width) || 1200)),
      ),
      height = Math.min(
        area.height,
        Math.max(540, Math.min(1200, Number(saved.height) || 800)),
      );
    const window = new BrowserWindow({
      title: `${data.projectName} · Play`,
      width,
      height,
      x: Math.max(
        area.x,
        Math.min(Number(saved.x) || area.x + 40, area.x + area.width - width),
      ),
      y: Math.max(
        area.y,
        Math.min(Number(saved.y) || area.y + 40, area.y + area.height - height),
      ),
      minWidth: 760,
      minHeight: 540,
      backgroundColor: "#1c1c1c",
      show: false,
      autoHideMenuBar: true,
      icon: path.join(directory, "icon.png"),
      webPreferences: {
        preload: path.join(directory, "preload.cjs"),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        additionalArguments: [
          "--spindle-play=true",
          `--spindle-locale=${locale()}`,
        ],
      },
    });
    const record: Record = {
      runtime,
      window,
      editor,
      busy: false,
      session: {
        id: randomUUID(),
        editorSessionId: data.target.editorSessionId,
        projectId: data.target.projectId,
        projectName: data.projectName,
        capturedAt: Date.now(),
        stale: false,
        startScene: data.scene,
        documents: data.documents,
        resources: data.resources,
        state,
      },
    };
    records.set(editor.id, record);
    const value = record;
    const editorClosed = () => dispose(value);
    editor.window.once("closed", editorClosed);
    window.on("closed", () => {
      editor.window.removeListener("closed", editorClosed);
      records.delete(editor.id);
      runtime.close();
      if (!editor.window.isDestroyed())
        editor.window.webContents.send("play:changed", null);
    });
    window.on("close", () => {
      const bounds = window.getNormalBounds();
      try {
        atomicWrite(preferencesPath, JSON.stringify(bounds));
      } catch {
        /* A view preference must never prevent closing a disposable run. */
      }
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event) => event.preventDefault());
    window.once("ready-to-show", () => {
      window.show();
      send(value);
    });
    await window.loadURL("workbench://app/");
  }
  ipcMain.handle("play:open", (event) => {
    const editor = owner(event);
    let request = opening.get(editor.id);
    if (!request) {
      request = open(editor).finally(() => opening.delete(editor.id));
      opening.set(editor.id, request);
    }
    return request;
  });
  ipcMain.handle("play:action", async (event, input, revision) => {
    const record = get(event),
      action = actionSchema.parse(input);
    if (action.action === "state") return record.session;
    if (record.busy) throw Error("PLAY_BUSY");
    if (revision !== record.session.state.revision)
      throw Error("PLAY_VERSION_CONFLICT");
    record.busy = true;
    try {
      if (action.action === "latest") {
        const data = await snapshot(record.editor);
        const state = await record.runtime.request({
          action: "compile",
          documents: data.documents,
        });
        Object.assign(record.session, {
          state,
          documents: data.documents,
          resources: data.resources,
          capturedAt: Date.now(),
          stale: false,
        });
        if (
          state.status === "ready" &&
          state.scenes.includes(record.session.startScene || "")
        )
          record.session.state = await record.runtime.request({
            action: "start",
            scene: record.session.startScene,
          });
      } else {
        record.session.state = await record.runtime.request(action);
        if (action.action === "start") record.session.startScene = action.scene;
      }
      if (!alive(record)) throw Error("PLAY_SESSION_EXPIRED");
      send(record);
      return action.action === "latest"
        ? record.session
        : {
            ...record.session,
            resources: { ...record.session.resources, images: {} },
          };
    } finally {
      record.busy = false;
    }
  });
  ipcMain.handle("play:reveal", async (event, source: PlaySource) => {
    const record = get(event);
    const known = [
      ...record.session.state.events,
      ...record.session.state.options,
      ...record.session.state.variables,
      ...record.session.state.diagnostics,
    ].some(
      (e) => e.source && JSON.stringify(e.source) === JSON.stringify(source),
    );
    if (!known) throw Error("PLAY_SOURCE_UNKNOWN");
    const old = record.session.documents.find(
      (d) => d.id === source.documentId,
    );
    const current = service.engine
      .project(record.session.projectId)
      .documents.find((d) => d.id === source.documentId);
    if (!old) throw Error("PLAY_SOURCE_UNKNOWN");
    const offset = current
      ? mapPlaySource(source, old.text, current.text)
      : null;
    if (offset === null)
      return { snapshot: old.text, name: old.name, line: source.line };
    await host.request(record.session.editorSessionId, {
      action: "reveal",
      documentId: source.documentId,
      from: offset,
      to: offset,
    });
    host.focus(record.session.editorSessionId);
    return {};
  });
  ipcMain.handle("play:characters", (event) => {
    const record = get(event);
    record.editor.window.webContents.send("play:characters");
    host.focus(record.session.editorSessionId);
  });
  ipcMain.handle("preview:read", (event) =>
    resources.read(service.engine.project(owner(event).projectId)),
  );
  ipcMain.handle("preview:save", (event, config) => {
    const projectId = owner(event).projectId;
    const result = resources.save(service.engine.project(projectId), config);
    changed();
    options.notifyResources(projectId);
    return result;
  });
  ipcMain.handle("preview:import", async (event) => {
    const editor = owner(event),
      projectId = editor.projectId;
    const result = await dialog.showOpenDialog(editor.window, {
      properties: ["openFile"],
      filters: [
        {
          name: "PNG / JPEG / WebP",
          extensions: ["png", "jpg", "jpeg", "webp"],
        },
      ],
    });
    if (result.canceled) return null;
    if (editor.projectId !== projectId) throw Error("EDITOR_SESSION_EXPIRED");
    return resources.import(
      service.engine.project(projectId),
      result.filePaths[0],
    );
  });
  function changed() {
    for (const record of records.values()) {
      if (!alive(record)) {
        dispose(record);
        continue;
      }
      const p = service.engine.project(record.session.projectId);
      let stale =
        p.documents.filter(
          (d) => !p.excluded.includes(d.id) && !p.excluded.includes(d.name),
        ).length !== record.session.documents.length ||
        record.session.documents.some(
          (d) =>
            p.excluded.includes(d.id) ||
            p.excluded.includes(d.name) ||
            p.documents.find((current) => current.id === d.id)?.version !==
              d.version,
        ) ||
        JSON.stringify(p.commands) !==
          JSON.stringify(record.session.resources.commandDefinitions);
      try {
        stale ||=
          resources.config(p).revision !==
          record.session.resources.config.revision;
      } catch {
        stale = true;
      }
      if (stale !== record.session.stale) {
        record.session.stale = stale;
        send(record);
      }
    }
  }
  return {
    changed,
    close: () => {
      for (const record of records.values()) dispose(record);
    },
    list: (editorSessionId: string) =>
      [...records.values()]
        .filter(
          (r) => alive(r) && r.session.editorSessionId === editorSessionId,
        )
        .map((r) => ({
          playSessionId: r.session.id,
          editorSessionId,
          projectId: r.session.projectId,
          revision: r.session.state.revision,
          status: r.session.state.status,
          scene: r.session.state.scene,
          stale: r.session.stale,
        })),
    context: (editorSessionId: string, playSessionId: string) => {
      const record = [...records.values()].find(
        (r) =>
          alive(r) &&
          r.session.id === playSessionId &&
          r.session.editorSessionId === editorSessionId,
      );
      if (!record) throw Error("PLAY_SESSION_EXPIRED");
      const s = record.session;
      const bounded = (event: (typeof s.state.events)[number]) => ({
        ...event,
        text: event.text.slice(0, 4000),
        textTruncated: event.text.length > 4000,
      });
      const dialogue = s.state.events.findLast((e) => e.kind === "line");
      return {
        playSessionId: s.id,
        editorSessionId,
        capturedAt: Date.now(),
        programCapturedAt: s.capturedAt,
        stale: s.stale,
        versions: s.documents.map((d) => ({
          id: d.id,
          name: d.name,
          version: d.version,
        })),
        ...s.state,
        diagnostics: s.state.diagnostics
          .slice(0, 200)
          .map((d) => ({
            ...d,
            message: d.message.slice(0, 4000),
            messageTruncated: d.message.length > 4000,
          })),
        diagnosticsTruncated: s.state.diagnostics.length > 200,
        currentDialogue: dialogue ? bounded(dialogue) : null,
        events: s.state.events.slice(-100).map(bounded),
        eventsTruncated: s.state.events.length > 100,
        options: s.state.options.slice(0, 200).map((o) => ({
          ...o,
          text: o.text.slice(0, 4000),
          textTruncated: o.text.length > 4000,
        })),
        optionsTruncated: s.state.options.length > 200,
        variables: s.state.variables.slice(0, 500).map((v) => ({
          ...v,
          initial:
            typeof v.initial === "string"
              ? v.initial.slice(0, 4000)
              : v.initial,
          initialTruncated:
            typeof v.initial === "string" && v.initial.length > 4000,
          value: typeof v.value === "string" ? v.value.slice(0, 4000) : v.value,
          valueTruncated: typeof v.value === "string" && v.value.length > 4000,
        })),
        variablesTruncated: s.state.variables.length > 500,
      };
    },
  };
}
