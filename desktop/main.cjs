const { t: tr, locale } = require("./i18n.cjs");
const {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  net,
  protocol,
  session,
  shell,
  screen,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { randomUUID } = require("node:crypto");
try {
  const dir =
    app.commandLine.getSwitchValue("user-data-dir") ||
    path.join(app.getPath("appData"), "Yarn Workbench");
  const prefs = JSON.parse(
    fs.readFileSync(path.join(dir, "project-catalog-v1.json"), "utf8"),
  );
  process.env.SPINDLE_LOCALE = prefs.preferences?.language || "system";
} catch (error) {
  if (error.code !== "ENOENT")
    console.warn("Unable to load language preference");
}

const {
  WorkspaceService,
  atomicWrite,
  restoreSession,
  navigateSession,
} = require("./workspace-service.cjs");

protocol.registerSchemesAsPrivileged([
  {
    scheme: "workbench",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
// Preserve the established profile and installation identity during rebranding.
// Explicit test/portable --user-data-dir always takes precedence.
if (!app.commandLine.hasSwitch("user-data-dir"))
  app.setPath("userData", path.join(app.getPath("appData"), "Yarn Workbench"));
app.setName("Spindle");
const {
  synchronizeBindings,
  flushWindow,
  initialSession,
} = require("./window-lifecycle.cjs");
const origin = "workbench://app";
const windows = new Map();
let agentHost, mcpRuntime;
let service,
  sessionFile,
  sessions = {},
  projectViews = {},
  projectViewsFile,
  drag = null,
  quitting = false;
const focused = () =>
  BrowserWindow.getFocusedWindow() || windows.values().next().value?.window;
function broadcast() {
  for (const { window } of windows.values())
    if (!window.isDestroyed()) window.webContents.send("workspace:changed");
}
function saveSessions() {
  atomicWrite(sessionFile, JSON.stringify(sessions));
}
function owner(event) {
  const item = [...windows.values()].find(
    (w) => w.window.webContents.id === event.sender.id,
  );
  if (!item || !event.sender.getURL().startsWith(origin + "/"))
    throw Error("Unknown workspace window");
  return item;
}
function openExternal(url) {
  if (url.startsWith("https://")) shell.openExternal(url).catch(console.error);
}
function createWindow(id = randomUUID(), initial, foreground = true) {
  const remembered = sessions[id],
    bounds = remembered?.bounds;
  const display = screen.getDisplayMatching(
    bounds || screen.getPrimaryDisplay().workArea,
  ).workArea;
  const width = Math.min(Math.max(bounds?.width || 1440, 800), display.width),
    height = Math.min(Math.max(bounds?.height || 960, 600), display.height);
  const window = new BrowserWindow({
    title: "Spindle",
    icon: path.join(__dirname, "icon.png"),
    width,
    height,
    x: Math.max(
      display.x,
      Math.min(bounds?.x ?? display.x + 40, display.x + display.width - width),
    ),
    y: Math.max(
      display.y,
      Math.min(
        bounds?.y ?? display.y + 40,
        display.y + display.height - height,
      ),
    ),
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#1c1c1c",
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === "win32"
      ? {
          titleBarStyle: "hidden",
          titleBarOverlay: {
            color: "#202020",
            symbolColor: "#cccccc",
            height: 44,
          },
        }
      : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, "preload.cjs"),
      additionalArguments: [
        `--yarn-window-id=${id}`,
        `--yarn-version=${app.getVersion()}`,
        `--spindle-locale=${locale()}`,
      ],
    },
  });
  let signalReady;
  const ready = new Promise((resolve) => {
    signalReady = resolve;
  });
  const binding = initial || sessions[id]?.session;
  windows.set(id, {
    id,
    window,
    ready,
    signalReady,
    projectId: binding?.screen === "home" ? "" : binding?.projectId || "",
  });
  agentHost?.created(windows.get(id));
  if (initial) sessions[id] = { ...sessions[id], session: initial };
  synchronizeBindings(service, windows);
  window.removeMenu();
  let shown = false;
  function showInitialWindow() {
    if (shown || window.isDestroyed()) return;
    shown = true;
    if (remembered?.maximized) window.maximize();
    if (foreground) window.show();
    else window.showInactive();
  }
  window.once("ready-to-show", showInitialWindow);
  // A hidden secondary process can finish its workspace without a first paint.
  // The validated renderer handshake is also sufficient to show it, once only.
  void ready.then(() => {
    showInitialWindow();
    const updateToken = app.commandLine.getSwitchValue("spindle-update-token");
    if (/^[a-f0-9-]{36}$/.test(updateToken))
      atomicWrite(
        path.join(app.getPath("userData"), "updates", updateToken + ".ready"),
        "ready",
      );
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== origin + "/" && url !== origin + "/index.html") {
      event.preventDefault();
      openExternal(url);
    }
  });
  let closeApproved = false,
    closePending = false;
  window.on("close", (event) => {
    if (quitting || closeApproved) return;
    event.preventDefault();
    if (closePending) return;
    closePending = true;
    const token = randomUUID();
    const closingProject = windows.get(id)?.projectId;
    const finish = async (error) => {
      clearTimeout(timer);
      ipcMain.removeListener("workspace:close-prepared", acknowledged);
      if (window.isDestroyed()) return;
      if (error) {
        window.webContents.send("workspace:close-cancelled");
        const choice = await dialog.showMessageBox(window, {
          type: "warning",
          title: tr("mc1f4025e9e8c"),
          message: tr("m750fd727b6ef"),
          detail: error,
          buttons: [tr("m7a824d822e96"), tr("m9f2b484bc113")],
          defaultId: 1,
          cancelId: 1,
        });
        closePending = false;
        if (choice.response === 0) window.close();
        return;
      }
      try {
        if (windows.get(id)?.projectId !== closingProject)
          throw Error(tr("m127eac08d660"));
        completeClose();
      } catch (error) {
        closePending = false;
        window.webContents.send("workspace:close-cancelled");
        await dialog.showMessageBox(window, {
          type: "error",
          message: tr("m0af3bb06c0b7"),
          detail: String(error),
          buttons: [tr("m24a05e3c2c3b")],
        });
      }
    };
    const acknowledged = (reply, value) => {
      if (reply.sender.id !== window.webContents.id || value?.token !== token)
        return;
      void finish(typeof value.error === "string" ? value.error : undefined);
    };
    const timer = setTimeout(() => void finish(tr("m4df91e6f12f8")), 15000);
    ipcMain.on("workspace:close-prepared", acknowledged);
    window.webContents.send("workspace:prepare-close", token);
  });
  function completeClose() {
    flushWindow(service, windows.get(id));
    if (windows.size > 1) delete sessions[id];
    else
      sessions[id] = {
        ...sessions[id],
        bounds: window.getNormalBounds(),
        maximized: window.isMaximized(),
      };
    try {
      saveSessions();
    } catch (error) {
      console.error(tr("m056e496b1d04"), error);
    }
    closeApproved = true;
    window.close();
  }
  window.on("closed", () => {
    windows.delete(id);
    synchronizeBindings(service, windows);
  });
  let geometryTimer;
  for (const event of ["move", "resize", "maximize", "unmaximize"])
    window.on(event, () => {
      clearTimeout(geometryTimer);
      geometryTimer = setTimeout(() => {
        if (window.isDestroyed()) return;
        sessions[id] = {
          ...sessions[id],
          bounds: window.getNormalBounds(),
          maximized: window.isMaximized(),
        };
        try {
          saveSessions();
        } catch (error) {
          console.error(error);
        }
      }, 150);
    });
  window.on("closed", () => clearTimeout(geometryTimer));
  window.loadURL(origin + "/").catch((error) => {
    dialog.showErrorBox(tr("mf22f4a180ebd"), error.message);
    window.destroy();
  });
  return window;
}
async function moveTab(source, tab, projectId, targetId, point) {
  if (
    !tab ||
    typeof tab.id !== "string" ||
    (!service.engine
      .project(projectId)
      .documents.some((d) => d.id === tab.documentId) &&
      !["@commands", "@settings", "@recovery"].includes(tab.documentId))
  )
    throw Error(tr("m0eaf2d6c6027"));
  if (targetId === source.id) return;
  let target = targetId ? windows.get(targetId) : null;
  if (targetId && !target) throw Error(tr("m0513fd07e28c"));
  if (target) {
    const session = sessions[targetId]?.session;
    if (session && session.projectId !== projectId)
      throw Error(tr("m6d2882ef5c49"));
  }
  if (!target) {
    const id = randomUUID();
    const initial = {
      id,
      projectId,
      tabs: [tab],
      activeId: tab.id,
      closedTabs: [],
      left: true,
      lineNumbers: false,
      sidebarWidth: 240,
      readingSize: 16,
      readingLineHeight: 29,
      zoom: 1,
    };
    const window = createWindow(id, initial);
    if (point) {
      const area = screen.getDisplayNearestPoint(point).workArea;
      window.setPosition(
        Math.max(area.x, Math.min(point.x, area.x + area.width - 800)),
        Math.max(area.y, Math.min(point.y, area.y + area.height - 600)),
      );
    }
    target = windows.get(id);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(Error(tr("mfff359bdcb3a"))),
        20000,
      );
      target.ready.then(() => {
        clearTimeout(timeout);
        resolve();
      });
      window.webContents.once("did-fail-load", () => {
        clearTimeout(timeout);
        reject(Error(tr("m09f33af50a93")));
      });
      window.once("closed", () => {
        clearTimeout(timeout);
        reject(Error(tr("m7c0187638a14")));
      });
    });
  } else {
    const existing = sessions[target.id]?.session;
    if (existing) {
      existing.tabs = existing.tabs.filter((t) => t.id !== tab.id).concat(tab);
      existing.activeId = tab.id;
      saveSessions();
    }
    target.window.webContents.send("workspace:transfer", { tab, projectId });
  }
  target.window.show();
  target.window.focus();
  source.window.webContents.send("workspace:transferred", { tabId: tab.id });
}
function saveProjectView(value) {
  if (value.projectId && value.screen !== "home") {
    projectViews[value.projectId] = { ...value, screen: "editor" };
    atomicWrite(projectViewsFile, JSON.stringify(projectViews));
  }
}
function sessionForResult(id, result) {
  const p = service.engine.project(result.projectId);
  let value = initialSession(id, p.id, projectViews[p.id]);
  const documentId =
    result.documentId || (!value.tabs.length ? p.documents[0]?.id : undefined);
  if (documentId) {
    const existing = value.tabs.find((t) => t.documentId === documentId);
    if (existing) value.activeId = existing.id;
    else value = navigateSession(value, documentId, {}, randomUUID());
  }
  return value;
}
async function openPaths(paths, source) {
  for (const file of paths) {
    const result = await service.request({ type: "openFiles", paths: [file] });
    if (!result.projectId) continue;
    const existing = [...windows.values()].find(
      (w) => w.projectId === result.projectId,
    );
    if (existing) {
      await existing.ready;
      existing.window.webContents.send("workspace:opened", result);
      existing.window.restore();
      existing.window.show();
      existing.window.focus();
    } else if (source && !source.projectId) {
      source.projectId = result.projectId;
      sessions[source.id] = {
        ...sessions[source.id],
        session: sessionForResult(source.id, result),
      };
      await source.ready;
      source.window.webContents.send("workspace:opened", result);
    } else {
      const id = randomUUID();
      createWindow(id, sessionForResult(id, result));
    }
  }
  synchronizeBindings(service, windows);
}
function wire() {
  ipcMain.handle("workspace:fonts", (event) => {
    owner(event);
    return require("./system-fonts.cjs")();
  });
  ipcMain.handle("workspace:ready", (event) => {
    owner(event).signalReady();
  });
  ipcMain.handle("workspace:request", async (event, action) => {
    const item = owner(event);
    if (action.type === "openFiles") {
      const paths =
        action.paths ||
        (
          await dialog.showOpenDialog(item.window, {
            properties: ["openFile", "multiSelections"],
            filters: [{ name: "Yarn", extensions: ["yarn"] }],
          })
        ).filePaths;
      if (paths.length) await openPaths(paths, item);
      return { snapshot: service.snapshot(), cancelled: true };
    }
    if (action.type === "closeProject" && item.projectId !== action.projectId)
      throw Error(tr("mb4a9a54e4de3"));
    if (
      action.type === "save" &&
      (!item.projectId || item.projectId !== action.projectId)
    )
      throw Error(tr("m48316baa104b"));
    if (
      ["openFolder", "createProject", "migrateDraft"].includes(action.type) &&
      !action.background &&
      item.projectId
    )
      flushWindow(service, item);
    const result = await service.request(action);
    if (
      ["openFolder", "createProject", "migrateDraft"].includes(action.type) &&
      !action.background &&
      result.projectId
    ) {
      const existing = [...windows.values()].find(
        (w) => w.id !== item.id && w.projectId === result.projectId,
      );
      if (existing) {
        await existing.ready;
        existing.window.webContents.send("workspace:opened", result);
        existing.window.restore();
        existing.window.show();
        existing.window.focus();
        return { ...result, cancelled: true };
      }
    }
    if (
      ["openFolder", "createProject", "migrateDraft"].includes(action.type) &&
      !action.background &&
      result.projectId &&
      !result.cancelled
    )
      item.pendingProjectId = result.projectId;
    if (action.type === "closeProject") item.pendingProjectId = "";
    return result;
  });
  ipcMain.handle("workspace:project-view", (event, projectId) => {
    owner(event);
    return projectViews[projectId] || null;
  });
  ipcMain.handle(
    "workspace:session-load",
    (event) => sessions[owner(event).id]?.session || null,
  );
  ipcMain.handle("workspace:session-save", (event, value) => {
    const { id } = owner(event);
    if (value.id !== id || !Array.isArray(value.tabs))
      throw Error(tr("m0b455487ece5"));
    const item = windows.get(id),
      nextProjectId = value.screen === "home" ? "" : value.projectId;
    if (
      nextProjectId !== item.projectId &&
      item.pendingProjectId !== nextProjectId
    )
      throw Error(tr("m699f9e580006"));
    saveProjectView(value);
    sessions[id] = { ...sessions[id], session: value };
    if (item.pendingProjectId === nextProjectId) delete item.pendingProjectId;
    windows.get(id).projectId = value.screen === "home" ? "" : value.projectId;
    saveSessions();
    agentHost?.rebound(windows.get(id));
    synchronizeBindings(service, windows);
  });
  ipcMain.handle("workspace:windows", (event) => {
    owner(event);
    return [...windows.values()].map((w) => ({
      id: w.id,
      title: w.window.getTitle(),
      projectId: sessions[w.id]?.session?.projectId,
    }));
  });
  ipcMain.handle(
    "workspace:move",
    (event, { tab, projectId, targetId, point }) =>
      moveTab(owner(event), tab, projectId, targetId, point),
  );
  ipcMain.handle("workspace:drag", (event, { tab, projectId }) => {
    drag = { source: owner(event), tab, projectId };
    return true;
  });
  ipcMain.handle("workspace:drop", async (event, { targetIndex }) => {
    const target = owner(event);
    if (!drag) return;
    const pending = drag;
    drag = null;
    if (target.id !== pending.source.id)
      await moveTab(pending.source, pending.tab, pending.projectId, target.id);
    target.window.webContents.send("workspace:drop-index", {
      tabId: pending.tab.id,
      targetIndex,
    });
  });
  ipcMain.handle("workspace:drag-end", (event, { cancelled, point }) => {
    const source = owner(event);
    if (!drag || drag.source.id !== source.id) return;
    const pending = drag;
    drag = null;
    if (cancelled) return;
    const inside = [...windows.values()].some((w) => {
      const b = w.window.getBounds();
      return (
        point.x >= b.x &&
        point.x < b.x + b.width &&
        point.y >= b.y &&
        point.y < b.y + b.height
      );
    });
    if (!inside)
      return moveTab(source, pending.tab, pending.projectId, undefined, point);
  });
  ipcMain.handle("workspace:logs", (event) => {
    owner(event);
    return shell.openPath(app.getPath("userData"));
  });
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", (_event, argv) => {
    const files = argv.filter(
      (a) =>
        !a.startsWith("-") &&
        (a.toLowerCase().endsWith(".yarn") ||
          (fs.existsSync(a) && fs.statSync(a).isDirectory())),
    );
    if (service && files.length)
      openPaths(
        files,
        [...windows.values()].find((w) => w.window === focused()),
      ).catch((error) =>
        dialog.showErrorBox(tr("m0ca495c92bd3"), error.message),
      );
    else {
      focused()?.restore();
      focused()?.show();
      focused()?.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      app.setAppUserModelId("com.yarnworkbench.desktop");
      const profile = app.getPath("userData");
      sessionFile = path.join(profile, "windows-v2.json");
      projectViewsFile = path.join(profile, "project-views-v1.json");
      if (fs.existsSync(projectViewsFile))
        try {
          projectViews = JSON.parse(fs.readFileSync(projectViewsFile, "utf8"));
          if (
            !projectViews ||
            Array.isArray(projectViews) ||
            typeof projectViews !== "object"
          )
            throw Error(tr("mca662fbaaad9"));
        } catch (error) {
          fs.copyFileSync(
            projectViewsFile,
            projectViewsFile + ".damaged-" + Date.now(),
          );
          projectViews = {};
          console.error(error);
        }
      if (fs.existsSync(sessionFile))
        try {
          sessions = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
          if (
            !sessions ||
            typeof sessions !== "object" ||
            Array.isArray(sessions)
          )
            throw Error(tr("m6ba6296e7d99"));
          for (const [id, entry] of Object.entries(sessions)) {
            if (!entry || typeof entry !== "object")
              throw Error(tr("m6ba6296e7d99"));
            if (entry.session)
              entry.session = restoreSession(
                entry.session,
                id,
                entry.session.projectId,
              );
            if (
              entry.bounds &&
              (!["x", "y", "width", "height"].every((key) =>
                Number.isFinite(entry.bounds[key]),
              ) ||
                entry.bounds.width <= 0 ||
                entry.bounds.height <= 0)
            )
              throw Error(tr("mc628bc940385"));
          }
        } catch (error) {
          fs.copyFileSync(sessionFile, sessionFile + ".damaged-" + Date.now());
          sessions = {};
          console.error(error);
        }
      if (!fs.existsSync(projectViewsFile)) {
        for (const value of Object.values(sessions))
          if (value?.session?.projectId)
            projectViews[value.session.projectId] = value.session;
        atomicWrite(projectViewsFile, JSON.stringify(projectViews));
      }
      service = new WorkspaceService(profile, {
        chooseFolder: async () => {
          const r = await dialog.showOpenDialog(focused(), {
            properties: ["openDirectory", "createDirectory"],
          });
          return r.canceled ? null : r.filePaths[0];
        },
        chooseFiles: async () => {
          const r = await dialog.showOpenDialog(focused(), {
            properties: ["openFile", "multiSelections"],
            filters: [{ name: "Yarn", extensions: ["yarn"] }],
          });
          return r.canceled ? [] : r.filePaths;
        },
        saveDialog: async (name) => {
          const r = await dialog.showSaveDialog(focused(), {
            defaultPath: name,
          });
          return r.canceled ? null : r.filePath;
        },
        trash: (file) => shell.trashItem(file),
        reveal: (file) =>
          fs.statSync(file).isDirectory()
            ? shell.openPath(file)
            : shell.showItemInFolder(file),
        changed: broadcast,
      });
      const rendererRoot = path.resolve(__dirname, "../dist-desktop/renderer");
      protocol.handle("workbench", (request) => {
        const url = new URL(request.url);
        if (url.host !== "app")
          return new Response("Forbidden", { status: 403 });
        let pathname;
        try {
          pathname = decodeURIComponent(url.pathname);
        } catch {
          return new Response("Bad request", { status: 400 });
        }
        const file = path.resolve(
            rendererRoot,
            "." + (pathname === "/" ? "/index.html" : pathname),
          ),
          relative = path.relative(rendererRoot, file);
        if (relative.startsWith("..") || path.isAbsolute(relative))
          return new Response("Forbidden", { status: 403 });
        return net.fetch(pathToFileURL(file).toString());
      });
      session.defaultSession.setPermissionRequestHandler((_c, _p, callback) =>
        callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      agentHost = require("./mcp-windows.cjs")({
        windows,
        sessions: () => sessions,
        service,
        ipcMain,
        owner,
        createWindow,
        sessionForResult,
      });
      mcpRuntime = require("./mcp-runtime.cjs").createMcpRuntime(
        profile,
        service,
        agentHost,
      );
      ipcMain.handle("agent:settings", (event) => {
        owner(event);
        return mcpRuntime.settings();
      });
      ipcMain.handle("agent:configure", (event, patch) => {
        owner(event);
        return mcpRuntime.configure(patch).then((value) => {
          broadcast();
          return value;
        });
      });
      ipcMain.handle("workspace:copy-text", (event, text) => {
        owner(event);
        if (typeof text !== "string") throw new Error("Invalid clipboard text");
        clipboard.writeText(text);
      });
      ipcMain.handle("agent:connection", (event) => {
        owner(event);
        return mcpRuntime.connection();
      });
      const { AgentInstaller } = require("./mcp-runtime.cjs");
      const installer = new AgentInstaller(profile, {
        defaultProfile: path.join(app.getPath("appData"), "Yarn Workbench"),
        skillSource: path.join(__dirname, "../skills/spindle/SKILL.md"),
        connection: () => mcpRuntime.connection(),
        enabled: () =>
          mcpRuntime.settings().running &&
          mcpRuntime.settings().mode !== "disabled",
      });
      const checkClient = (client) => {
        if (!["codex", "claude"].includes(client))
          throw new Error(tr("m5f4e4dd4c7f9"));
      };
      ipcMain.handle("agent:installations", (event) => {
        owner(event);
        return [installer.inspect("codex"), installer.inspect("claude")];
      });
      ipcMain.handle("agent:install-action", async (event, client, action) => {
        owner(event);
        checkClient(client);
        if (!["install", "remove", "test"].includes(action))
          throw new Error(tr("m7f021dc1db14"));
        return installer[action](client);
      });
      ipcMain.handle("agent:install-path", async (event, client, part) => {
        owner(event);
        checkClient(client);
        if (!["config", "skill"].includes(part))
          throw new Error(tr("mfc160e5a873f"));
        const window = BrowserWindow.fromWebContents(event.sender);
        const target = installer.target(client);
        const selected =
          part === "config"
            ? await dialog.showSaveDialog(window, {
                title: tr("m49902ed261bf"),
                defaultPath: target.configPath,
                properties: ["showHiddenFiles", "dontAddToRecent"],
                buttonLabel: tr("me182a105f6b0"),
              })
            : await dialog.showOpenDialog(window, {
                title: tr("m17f5c44204a2"),
                defaultPath: path.dirname(target.skillPath),
                properties: [
                  "openDirectory",
                  "createDirectory",
                  "showHiddenFiles",
                  "dontAddToRecent",
                ],
              });
        const chosen =
          part === "config" ? selected.filePath : selected.filePaths?.[0];
        if (!selected.canceled && chosen)
          return installer.setTarget(client, part, chosen);
        return installer.inspect(client);
      });
      ipcMain.handle("agent:connection-format", (event, format) => {
        owner(event);
        if (!["codex", "claude", "http"].includes(format))
          throw new Error(tr("m2c5751f2debd"));
        return installer.format(format);
      });
      await mcpRuntime.start();
      wire();
      const restartFile = path.join(profile, "restart-once-v1.json");
      const restart = require("./restart.cjs").createRestartCoordinator({
        windows,
        ipcMain,
        flush: (item) => flushWindow(service, item),
        record: (items) => {
          for (const item of items)
            sessions[item.id] = {
              ...sessions[item.id],
              bounds: item.window.getNormalBounds(),
              maximized: item.window.isMaximized(),
            };
          saveSessions();
          atomicWrite(
            restartFile,
            JSON.stringify({
              created: Date.now(),
              ids: items.map((i) => i.id),
              workspaces: items
                .filter((i) => i.projectId)
                .map((i) => {
                  const p = service.engine.project(i.projectId);
                  return {
                    id: p.id,
                    root: p.root,
                    files:
                      p.kind === "standalone"
                        ? p.documents.map((d) => d.path).filter(Boolean)
                        : [],
                  };
                }),
            }),
          );
        },
        commit: async () => {
          if (process.env.PORTABLE_EXECUTABLE_FILE) {
            const directory = path.join(profile, "updates");
            fs.mkdirSync(directory, { recursive: true });
            const helper = path.join(directory, "installed-restart.ps1");
            fs.copyFileSync(
              path.join(__dirname, "installed-restart.ps1"),
              helper,
            );
            const job = path.join(directory, randomUUID() + ".json");
            fs.writeFileSync(
              job,
              JSON.stringify({
                target: process.env.PORTABLE_EXECUTABLE_FILE,
                profile,
                pid: process.pid,
                version: app.getVersion(),
                arguments: process.argv
                  .slice(1)
                  .filter((a) =>
                    /^--(inspect=|remote-debugging-port=)/.test(a),
                  ),
              }),
              { flag: "wx" },
            );
            await require("./update-service.cjs").launchHelper(helper, job);
          } else app.relaunch();
          quitting = true;
          app.quit();
        },
      });
      const updates = new (require("./update-service.cjs").UpdateService)({
        profile,
        locale: locale(),
        portable: process.env.PORTABLE_EXECUTABLE_FILE,
        executable: process.execPath,
        resources: __dirname,
        preferences: () => service.catalog.preferences,
        skip: (version) => {
          service.catalog.preferences.skippedVersion = version;
          service.catalog.persist();
          broadcast();
        },
        changed: (state, prompt) => {
          for (const item of windows.values())
            if (!item.window.isDestroyed())
              item.window.webContents.send("app:update-state", {
                state,
                prompt: prompt && item.window === focused(),
              });
        },
        prepare: (commit) =>
          restart(async () => {
            quitting = true;
            try {
              await commit();
            } catch (e) {
              quitting = false;
              throw e;
            }
          }),
        failedInstall: () => {
          quitting = false;
          if (fs.existsSync(restartFile)) fs.unlinkSync(restartFile);
          for (const item of windows.values())
            if (!item.window.isDestroyed())
              item.window.webContents.send("workspace:close-cancelled");
        },
        exit: () => {
          quitting = true;
          app.quit();
        },
      });
      ipcMain.handle("app:update", (event, action) => {
        owner(event);
        if (action === "state") return updates.state;
        if (action === "check") return updates.check(true);
        if (action === "skip") return updates.skip();
        if (action === "cancel") return updates.cancel();
        if (action === "install") return updates.install();
        throw Error("Unknown update action");
      });
      const updateTimer = setTimeout(() => {
        if (service.catalog.preferences.autoCheckUpdates !== false)
          void updates.check(false);
      }, 10000);
      updateTimer.unref();
      ipcMain.handle("app:restart", (event) => {
        owner(event);
        return restart();
      });
      ipcMain.handle("app:command-draft", async (event) => {
        const item = owner(event);
        const answer = await dialog.showMessageBox(item.window, {
          type: "question",
          message: tr("drafts.close"),
          buttons: [
            tr("drafts.apply"),
            tr("drafts.discard"),
            tr("common.cancel"),
          ],
          defaultId: 2,
          cancelId: 2,
        });
        return ["apply", "discard", "cancel"][answer.response];
      });
      const files = process.argv.filter(
        (a) => !a.startsWith("-") && a.toLowerCase().endsWith(".yarn"),
      );
      void (async () => {
        if (files.length) {
          await openPaths(files);
          return;
        }
        if (fs.existsSync(restartFile)) {
          const restartState = JSON.parse(fs.readFileSync(restartFile, "utf8"));
          fs.unlinkSync(restartFile);
          if (
            Date.now() - restartState.created < 10 * 60 * 1000 &&
            Array.isArray(restartState.ids)
          ) {
            for (const id of restartState.ids) {
              const saved = sessions[id]?.session;
              if (!saved) continue;
              const entry = service.catalog.entries.find(
                (e) => e.id === saved.projectId,
              );
              if (entry)
                await service.request({ type: "openFolder", root: entry.root });
              else if (
                restartState.workspaces?.find((p) => p.id === saved.projectId)
                  ?.files?.length
              )
                await service.request({
                  type: "openFiles",
                  paths: restartState.workspaces.find(
                    (p) => p.id === saved.projectId,
                  ).files,
                });
              else if (
                saved.projectId &&
                !service
                  .snapshot()
                  .projects.some((p) => p.id === saved.projectId)
              )
                continue;
              createWindow(id, saved);
            }
            if (windows.size) return;
          }
        }
        const last =
          service.catalog.preferences.reopenLastProject &&
          service.catalog.entries.find(
            (e) => e.id === service.catalog.preferences.lastProjectId,
          );
        if (last) {
          try {
            const r = await service.request({
              type: "openFolder",
              root: last.root,
            });
            const id = randomUUID();
            createWindow(id, sessionForResult(id, r));
            return;
          } catch (error) {
            service.notices.push(tr("m150437435c45") + String(error));
          }
        }
        const id = Object.keys(sessions).at(-1) || randomUUID();
        createWindow(id, initialSession(id));
      })().catch((error) => {
        dialog.showErrorBox(tr("m0ca495c92bd3"), error.message);
        const id = randomUUID();
        createWindow(id, initialSession(id));
      });
      app.on("activate", () => {
        if (!windows.size) {
          const id = randomUUID();
          createWindow(id, initialSession(id));
        }
      });
    })
    .catch((error) => {
      dialog.showErrorBox(tr("md428150d1df6"), error.message);
      app.quit();
    });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("will-quit", () => {
    void mcpRuntime?.stop();
    quitting = true;
    service?.dispose();
  });
}
