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
import { resolvePresentation } from "../app/workspace/presentation-preferences";

type EditorWindow = { id: string; projectId: string; window: BrowserWindow };
type Record = {
  session: PlaySession;
  window: BrowserWindow;
  editor: EditorWindow;
  runtime: PlayProcess;
  busy: boolean;
};
const launchSchema = z
  .object({
    mode: z.enum(["default", "document", "line"]),
    defaultScene: z.string().trim().min(1).max(300),
  })
  .strict();
type Launch = z.infer<typeof launchSchema>;
const actionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.enum(["state", "next", "back", "stop", "latest", "restart"]),
    })
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
  const generations = new Map<string, number>();
  const pendingRuntimes = new Map<string, PlayProcess>();
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
    if (records.get(record.editor.id) !== record) return;
    records.delete(record.editor.id);
    if (!record.editor.window.isDestroyed())
      record.editor.window.webContents.send("play:status-changed", false);
    record.runtime.close();
    if (!record.editor.window.isDestroyed())
      record.editor.window.webContents.send("play:changed", null);
    if (!record.window.isDestroyed()) record.window.destroy();
  }
  async function snapshot(editor: EditorWindow, launch?: Launch) {
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
    const cursorScene = line
      ? nodes.find((n) => n.start <= line && n.end >= line)?.name
      : undefined;
    return {
      target,
      documents,
      scene:
        launch?.mode === "default"
          ? launch.defaultScene
          : launch?.mode === "document"
            ? nodes[0]?.name
            : cursorScene,
      location:
        launch?.mode === "line" && doc && line
          ? { documentId: doc.id, line }
          : undefined,
      resources: resources.read(project),
      projectName: project.name,
    };
  }
  async function open(editor: EditorWindow, launch?: Launch, generation = 0) {
    const existing = records.get(editor.id);
    if (existing && alive(existing)) {
      existing.window.show();
      existing.window.focus();
      return;
    }
    if (existing) dispose(existing);
    const data = await snapshot(editor, launch);
    if (launch?.mode !== "default" && launch && !data.scene)
      throw Error("PLAY_START_NOT_FOUND");
    if (launch?.mode === "line" && !data.location)
      throw Error("PLAY_LINE_NOT_EXECUTABLE");
    if (
      generations.get(editor.id) !== generation ||
      editor.window.isDestroyed()
    )
      throw Error("PLAY_LAUNCH_CANCELLED");
    const runtime = new PlayProcess(executable, (message) => {
      const record = records.get(editor.id);
      if (record?.runtime === runtime) {
        record.session.state.status = "error";
        record.session.state.events.push({
          id: -1,
          kind: "error",
          text: message,
        });
        send(record);
      }
    });
    pendingRuntimes.set(editor.id, runtime);
    let state;
    try {
      state = await runtime.request({
        action: "compile",
        documents: data.documents,
      });
      if (state.status === "ready" && data.scene)
        state = await runtime.request({
          action: "start",
          scene: data.scene,
          location: data.location,
        });
    } catch (error) {
      runtime.close();
      if (generations.get(editor.id) !== generation)
        throw Error("PLAY_LAUNCH_CANCELLED");
      throw error;
    } finally {
      if (pendingRuntimes.get(editor.id) === runtime)
        pendingRuntimes.delete(editor.id);
    }
    if (
      editor.window.isDestroyed() ||
      editor.projectId !== data.target.projectId ||
      generations.get(editor.id) !== generation
    ) {
      runtime.close();
      throw Error(
        generations.get(editor.id) !== generation
          ? "PLAY_LAUNCH_CANCELLED"
          : "EDITOR_SESSION_EXPIRED",
      );
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
        runId: randomUUID(),
        editorSessionId: data.target.editorSessionId,
        projectId: data.target.projectId,
        projectName: data.projectName,
        capturedAt: Date.now(),
        stale: false,
        startScene: data.scene,
        startLocation: data.location,
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
      if (records.get(editor.id) !== record) return;
      records.delete(editor.id);
      if (!editor.window.isDestroyed())
        editor.window.webContents.send("play:status-changed", false);
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
    try {
      await window.loadURL("workbench://app/");
    } catch (error) {
      dispose(record);
      if (generations.get(editor.id) !== generation)
        throw Error("PLAY_LAUNCH_CANCELLED");
      throw error;
    }
  }
  ipcMain.handle("play:open", (event, input) => {
    const editor = owner(event),
      launch = input === undefined ? undefined : launchSchema.parse(input);
    let request = opening.get(editor.id);
    if (!request) {
      const generation = (generations.get(editor.id) || 0) + 1;
      generations.set(editor.id, generation);
      editor.window.webContents.send("play:status-changed", true);
      request = open(editor, launch, generation).finally(() => {
        opening.delete(editor.id);
        if (!editor.window.isDestroyed())
          editor.window.webContents.send(
            "play:status-changed",
            records.has(editor.id),
          );
      });
      opening.set(editor.id, request);
    }
    return request;
  });
  ipcMain.handle("play:status", (event) => {
    const editor = owner(event);
    return records.has(editor.id) || opening.has(editor.id);
  });
  ipcMain.handle("play:close", async (event) => {
    const editor = owner(event);
    generations.set(editor.id, (generations.get(editor.id) || 0) + 1);
    pendingRuntimes.get(editor.id)?.close();
    const record = records.get(editor.id);
    if (record) dispose(record);
    try {
      await opening.get(editor.id);
    } catch {
      /* A cancelled launch is closed. */
    }
    if (!editor.window.isDestroyed())
      editor.window.webContents.send("play:status-changed", false);
  });
  ipcMain.handle("play:preferences", (event) => {
    get(event);
    return resolvePresentation(service.catalog.preferences).playPresentation;
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
        if (record.session.startLocation) {
          const id = record.session.startLocation.documentId;
          if (
            data.documents.find((d) => d.id === id)?.text !==
            record.session.documents.find((d) => d.id === id)?.text
          )
            throw Error("PLAY_START_SOURCE_CHANGED");
        }
        const state = await record.runtime.request({
          action: "compile",
          documents: data.documents,
        });
        Object.assign(record.session, {
          state,
          documents: data.documents,
          resources: data.resources,
          capturedAt: Date.now(),
          runId: randomUUID(),
          stale: false,
        });
        if (
          state.status === "ready" &&
          state.scenes.includes(record.session.startScene || "")
        )
          record.session.state = await record.runtime.request({
            action: "start",
            scene: record.session.startScene,
            location: record.session.startLocation,
          });
      } else {
        record.session.state = await record.runtime.request(
          action.action === "restart"
            ? {
                action: "start",
                scene: record.session.startScene,
                location: record.session.startLocation,
              }
            : action,
        );
        if (action.action === "restart") record.session.runId = randomUUID();
        if (action.action === "start") {
          record.session.startLocation = undefined;
          record.session.startScene = action.scene;
          record.session.runId = randomUUID();
        }
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
  let presentationStamp = "";
  function changed() {
    const presentation = resolvePresentation(
      service.catalog.preferences,
    ).playPresentation;
    const stamp = JSON.stringify(presentation);
    const preferencesChanged = stamp !== presentationStamp;
    presentationStamp = stamp;
    for (const record of records.values()) {
      if (!alive(record)) {
        dispose(record);
        continue;
      }
      const p = service.engine.project(record.session.projectId);
      if (preferencesChanged)
        record.window.webContents.send(
          "play:preferences-changed",
          presentation,
        );
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
      for (const runtime of pendingRuntimes.values()) runtime.close();
      for (const id of opening.keys())
        generations.set(id, (generations.get(id) || 0) + 1);
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
        diagnostics: s.state.diagnostics.slice(0, 200).map((d) => ({
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
