const { contextBridge, ipcRenderer, webUtils, webFrame } = require("electron");
const subscribe = (channel, callback) => {
  const handler = (_event, value) => callback(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
};
contextBridge.exposeInMainWorld("yarnDesktop", {
  platform: process.platform,
  titleBarOverlay: process.platform === "win32",
  windowId: process.argv
    .find((a) => a.startsWith("--yarn-window-id="))
    ?.split("=")[1],
  version: process.argv
    .find((a) => a.startsWith("--yarn-version="))
    ?.split("=")[1],
  request: (action) => ipcRenderer.invoke("workspace:request", action),
  ready: () => ipcRenderer.invoke("workspace:ready"),
  subscribe: (callback) => subscribe("workspace:changed", callback),
  session: {
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
