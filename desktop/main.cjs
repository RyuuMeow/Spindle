const {
  app,
  BrowserWindow,
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
const {
  WorkspaceService,
  atomicWrite,
  restoreSession,
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
const origin = "workbench://app";
const windows = new Map();
let service,
  sessionFile,
  sessions = {},
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
function createWindow(id = randomUUID(), initial) {
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
      ],
    },
  });
  let signalReady;
  const ready = new Promise((resolve) => {
    signalReady = resolve;
  });
  windows.set(id, { id, window, ready, signalReady });
  if (initial) sessions[id] = { ...sessions[id], session: initial };
  window.removeMenu();
  let shown = false;
  function showInitialWindow() {
    if (shown || window.isDestroyed()) return;
    shown = true;
    if (remembered?.maximized) window.maximize();
    window.show();
  }
  window.once("ready-to-show", showInitialWindow);
  // A hidden secondary process can finish its workspace without a first paint.
  // The validated renderer handshake is also sufficient to show it, once only.
  void ready.then(showInitialWindow);
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
    const finish = async (error) => {
      clearTimeout(timer);
      ipcMain.removeListener("workspace:close-prepared", acknowledged);
      if (window.isDestroyed()) return;
      if (error) {
        window.webContents.send("workspace:close-cancelled");
        await dialog.showMessageBox(window, {
          type: "warning",
          title: "尚未完成保存",
          message: "視窗已保留，請重試保存後再關閉。",
          detail: error,
          buttons: ["繼續編輯"],
        });
        closePending = false;
        return;
      }
      try {
        completeClose();
      } catch (error) {
        closePending = false;
        window.webContents.send("workspace:close-cancelled");
        await dialog.showMessageBox(window, {
          type: "error",
          message: "保存未完成，視窗已保留。",
          detail: String(error),
          buttons: ["繼續編輯"],
        });
      }
    };
    const acknowledged = (reply, value) => {
      if (reply.sender.id !== window.webContents.id || value?.token !== token)
        return;
      void finish(typeof value.error === "string" ? value.error : undefined);
    };
    const timer = setTimeout(
      () => void finish("編輯器尚未回應，未關閉視窗以保留內容。"),
      15000,
    );
    ipcMain.on("workspace:close-prepared", acknowledged);
    window.webContents.send("workspace:prepare-close", token);
  });
  function completeClose() {
    const failures = service.flush();
    if (failures.length || service.profileError) {
      const choice = dialog.showMessageBoxSync(window, {
        type: "warning",
        title: "部分文件尚未寫入磁碟",
        message: "自動保存未完成",
        detail:
          failures
            .map((d) => d.name + "：" + (d.error || "輸入尚未完成"))
            .join("\n") +
          (service.profileError
            ? "\n" +
              service.profileError +
              "\n復原草稿尚未保存，關閉可能遺失資料。請先重試或另存。"
            : "\n復原草稿會保留。"),
        buttons: [
          "繼續編輯",
          service.profileError ? "仍然關閉" : "保留草稿並關閉",
        ],
        defaultId: 0,
        cancelId: 0,
      });
      if (choice === 0) {
        closePending = false;
        window.webContents.send("workspace:close-cancelled");
        return;
      }
    }
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
      console.error("視窗布局保存失敗", error);
    }
    closeApproved = true;
    window.close();
  }
  window.on("closed", () => {
    windows.delete(id);
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
    dialog.showErrorBox("Spindle 無法啟動", error.message);
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
    throw Error("分頁已不存在");
  if (targetId === source.id) return;
  let target = targetId ? windows.get(targetId) : null;
  if (targetId && !target) throw Error("目標視窗已關閉");
  if (target) {
    const session = sessions[targetId]?.session;
    if (session && session.projectId !== projectId)
      throw Error("只能移至相同專案的視窗");
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
        () => reject(Error("新視窗開啟逾時；原分頁已保留")),
        20000,
      );
      target.ready.then(() => {
        clearTimeout(timeout);
        resolve();
      });
      window.webContents.once("did-fail-load", () => {
        clearTimeout(timeout);
        reject(Error("新視窗無法載入；原分頁已保留"));
      });
      window.once("closed", () => {
        clearTimeout(timeout);
        reject(Error("新視窗已關閉；原分頁已保留"));
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
function wire() {
  ipcMain.handle("workspace:ready", (event) => {
    owner(event).signalReady();
  });
  ipcMain.handle("workspace:request", async (event, action) => {
    owner(event);
    return service.request(action);
  });
  ipcMain.handle(
    "workspace:session-load",
    (event) => sessions[owner(event).id]?.session || null,
  );
  ipcMain.handle("workspace:session-save", (event, value) => {
    const { id } = owner(event);
    if (value.id !== id || !Array.isArray(value.tabs))
      throw Error("工作階段格式錯誤");
    sessions[id] = { ...sessions[id], session: value };
    saveSessions();
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
        (a.endsWith(".yarn") ||
          (fs.existsSync(a) && fs.statSync(a).isDirectory())),
    );
    if (service && files.length)
      service
        .request({ type: "openFiles", paths: files })
        .then((r) => {
          focused()?.webContents.send("workspace:opened", r);
          focused()?.show();
          focused()?.focus();
        })
        .catch((error) => dialog.showErrorBox("無法開啟", error.message));
    else {
      focused()?.restore();
      focused()?.show();
      focused()?.focus();
    }
  });
  app
    .whenReady()
    .then(() => {
      app.setAppUserModelId("com.yarnworkbench.desktop");
      const profile = app.getPath("userData");
      sessionFile = path.join(profile, "windows-v2.json");
      if (fs.existsSync(sessionFile))
        try {
          sessions = JSON.parse(fs.readFileSync(sessionFile, "utf8"));
          if (
            !sessions ||
            typeof sessions !== "object" ||
            Array.isArray(sessions)
          )
            throw Error("視窗工作階段格式無效");
          for (const [id, entry] of Object.entries(sessions)) {
            if (!entry || typeof entry !== "object")
              throw Error("視窗工作階段格式無效");
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
              throw Error("視窗位置損毀");
          }
        } catch (error) {
          fs.copyFileSync(sessionFile, sessionFile + ".damaged-" + Date.now());
          sessions = {};
          console.error(error);
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
      wire();
      const restored = Object.keys(sessions).filter(
        (id) => sessions[id]?.session?.tabs?.length,
      );
      if (restored.length) restored.forEach((id) => createWindow(id));
      else createWindow();
      const files = process.argv.filter((a) => a.endsWith(".yarn"));
      if (files.length)
        service
          .request({ type: "openFiles", paths: files })
          .then((r) => {
            const target = [...windows.values()].find(
              (item) => item.window === focused(),
            );
            if (target)
              void target.ready.then(() => {
                if (!target.window.isDestroyed())
                  target.window.webContents.send("workspace:opened", r);
              });
          })
          .catch(console.error);
      app.on("activate", () => {
        if (!windows.size) createWindow();
      });
    })
    .catch((error) => {
      dialog.showErrorBox("啟動失敗", error.message);
      app.quit();
    });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("will-quit", () => {
    quitting = true;
    service?.dispose();
  });
}
