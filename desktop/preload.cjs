const { contextBridge, ipcRenderer, webUtils, webFrame } = require("electron");
const subscribe = (channel, callback) => {
  const handler = (_event, value) => callback(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};
contextBridge.exposeInMainWorld("yarnDesktop", {
  locale: process.argv
    .find((a) => a.startsWith("--spindle-locale="))
    ?.split("=")[1],
  commandDraftDecision: () => ipcRenderer.invoke("app:command-draft"),
  updates: {
    action: (action) => ipcRenderer.invoke("app:update", action),
    subscribe: (callback) => subscribe("app:update-state", callback),
  },
  restart: () => ipcRenderer.invoke("app:restart"),
  platform: process.platform,
  titleBarOverlay: process.platform === "win32",
  windowId: process.argv
    .find((a) => a.startsWith("--yarn-window-id="))
    ?.split("=")[1],
  version: process.argv
    .find((a) => a.startsWith("--yarn-version="))
    ?.split("=")[1],
  request: (action) => ipcRenderer.invoke("workspace:request", action),
  agent: {
    installations: () => ipcRenderer.invoke("agent:installations"),
    installAction: (client, action) =>
      ipcRenderer.invoke("agent:install-action", client, action),
    selectInstallPath: (client, part) =>
      ipcRenderer.invoke("agent:install-path", client, part),
    connectionFormat: (format) =>
      ipcRenderer.invoke("agent:connection-format", format),
    onRequest: (callback) => subscribe("agent:request", callback),
    respond: (token, context, error) =>
      ipcRenderer.send("agent:response", { token, context, error }),
    summary: (value) => ipcRenderer.send("agent:summary", value),
    settings: () => ipcRenderer.invoke("agent:settings"),
    configure: (patch) => ipcRenderer.invoke("agent:configure", patch),
    connection: () => ipcRenderer.invoke("agent:connection"),
  },
  copyText: (text) => ipcRenderer.invoke("workspace:copy-text", text),
  fonts: () => ipcRenderer.invoke("workspace:fonts"),
  ready: () => ipcRenderer.invoke("workspace:ready"),
  subscribe: (callback) => subscribe("workspace:changed", callback),
  session: {
    project: (projectId) =>
      ipcRenderer.invoke("workspace:project-view", projectId),
    load: () => ipcRenderer.invoke("workspace:session-load"),
    save: (value) => ipcRenderer.invoke("workspace:session-save", value),
  },
  windows: {
    list: () => ipcRenderer.invoke("workspace:windows"),
    move: (tab, projectId, targetId, point) =>
      ipcRenderer.invoke("workspace:move", { tab, projectId, targetId, point }),
    onTransfer: (callback) =>
      subscribe("workspace:transfer", ({ tab, projectId }) =>
        callback(tab, projectId),
      ),
    drag: (tab, projectId) =>
      ipcRenderer.invoke("workspace:drag", { tab, projectId }),
    drop: (targetIndex) =>
      ipcRenderer.invoke("workspace:drop", { targetIndex }),
    cancelDrag: () =>
      ipcRenderer.invoke("workspace:drag-end", { cancelled: true }),
    endDrag: (point, cancelled) =>
      ipcRenderer.invoke("workspace:drag-end", { point, cancelled }),
    onRemoved: (callback) =>
      subscribe("workspace:transferred", ({ tabId }) => callback(tabId)),
    onDropIndex: (callback) => subscribe("workspace:drop-index", callback),
  },
  onPrepareClose: (callback) => subscribe("workspace:prepare-close", callback),
  onCloseCancelled: (callback) =>
    subscribe("workspace:close-cancelled", callback),
  closePrepared: (token, error) =>
    ipcRenderer.send("workspace:close-prepared", { token, error }),
  onOpened: (callback) => subscribe("workspace:opened", callback),
  paths: (files) => files.map((f) => webUtils.getPathForFile(f)),
  zoom: (factor) => webFrame.setZoomFactor(factor),
  openLogs: () => ipcRenderer.invoke("workspace:logs"),
});
