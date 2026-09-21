const { randomUUID } = require("node:crypto");
/** Runtime identities deliberately do not reuse persisted window/session IDs. */
module.exports = function agentWindows({
  windows,
  sessions,
  service,
  ipcMain,
  owner,
  createWindow,
  sessionForResult,
}) {
  const bindings = new Map(),
    pending = new Map(),
    opening = new Map();
  function binding(item) {
    let value = bindings.get(item.id);
    if (!value || value.projectId !== item.projectId) {
      value = {
        editorSessionId: randomUUID(),
        projectId: item.projectId,
        lastFocusedAt: 0,
      };
      bindings.set(item.id, value);
    }
    return value;
  }
  function list() {
    return [...windows.values()]
      .filter((w) => !w.window.isDestroyed() && w.projectId)
      .map((w) => {
        const b = binding(w),
          s = sessions()[w.id]?.session,
          p = service.engine.project(w.projectId);
        return {
          ...b,
          windowId: w.id,
          projectId: p.id,
          projectName: p.name,
          root: p.root,
          kind: p.kind || "project",
          focused: w.window.isFocused(),
          activeTabId: b.activeTabId || s?.activeId,
          tabs: (b.tabs || s?.tabs || []).map((t) => ({
            id: t.id,
            documentId: t.documentId,
            name:
              p.documents.find((d) => d.id === t.documentId)?.name ||
              t.documentId,
            mode: t.mode,
          })),
        };
      });
  }
  function resolve(id) {
    const found = list().find((s) => s.editorSessionId === id);
    if (!found) throw Error("EDITOR_SESSION_EXPIRED");
    return windows.get(found.windowId);
  }
  function created(item) {
    binding(item);
    item.window.on("focus", () => {
      binding(item).lastFocusedAt = Date.now();
    });
    item.window.on("closed", () => {
      bindings.delete(item.id);
      for (const [token, entry] of pending)
        if (entry.windowId === item.id) {
          clearTimeout(entry.timer);
          pending.delete(token);
          entry.reject(Error("EDITOR_SESSION_EXPIRED"));
        }
    });
  }
  ipcMain.on("agent:summary", (event, value) => {
    const item = owner(event);
    if (value?.projectId === item.projectId) {
      const b = binding(item);
      b.activeTabId = value.activeTabId;
      b.activePage = value.activePage;
      b.activeMode = value.activeMode;
      if (Array.isArray(value.tabs)) b.tabs = value.tabs;
    }
  });
  ipcMain.on("agent:response", (event, value) => {
    const item = owner(event),
      entry = pending.get(value?.token);
    if (!entry || entry.windowId !== item.id) return;
    pending.delete(value.token);
    clearTimeout(entry.timer);
    try {
      if (resolve(entry.sessionId) !== item)
        throw Error("EDITOR_SESSION_EXPIRED");
      if (value.error) throw Error(value.error);
      if (value.context?.projectId !== item.projectId)
        throw Error("EDITOR_SESSION_EXPIRED");
      entry.resolve(value.context);
    } catch (error) {
      entry.reject(error);
    }
  });
  function within(promise, milliseconds, message) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error(message)), milliseconds);
      }),
    ]).finally(() => clearTimeout(timer));
  }
  async function request(id, action) {
    const item = resolve(id);
    await within(item.ready, 5000, "EDITOR_CONTEXT_TIMEOUT");
    if (resolve(id) !== item) throw Error("EDITOR_SESSION_EXPIRED");
    const token = randomUUID();
    return new Promise((accept, reject) => {
      const timer = setTimeout(() => {
        pending.delete(token);
        reject(Error("EDITOR_CONTEXT_TIMEOUT"));
      }, 5000);
      pending.set(token, {
        windowId: item.id,
        sessionId: id,
        timer,
        resolve: accept,
        reject,
      });
      item.window.webContents.send("agent:request", {
        ...action,
        token,
        projectId: item.projectId,
      });
    });
  }
  function focus(id) {
    const w = resolve(id).window;
    w.restore();
    w.show();
    w.focus();
  }
  async function open(projectId, foreground = false) {
    let result = list().filter((s) => s.projectId === projectId);
    if (!result.length) {
      if (!opening.has(projectId))
        opening.set(
          projectId,
          (async () => {
            const entry = service.catalog.entries.find(
              (e) => e.id === projectId,
            );
            if (!entry) throw Error("PROJECT_NOT_IN_CATALOG");
            const value = await service.request({
              type: "openFolder",
              root: entry.root,
            });
            if (value.projectId !== projectId)
              throw Error("PROJECT_ID_CHANGED");
            const existing = list().filter(
              (s) => s.projectId === value.projectId,
            );
            if (existing.length) return existing;
            const id = randomUUID();
            createWindow(id, sessionForResult(id, value), false);
            const item = windows.get(id);
            await within(item.ready, 20000, "EDITOR_OPEN_TIMEOUT");
            return list().filter((s) => s.windowId === id);
          })().finally(() => opening.delete(projectId)),
        );
      result = await opening.get(projectId);
    }
    if (foreground && result.length === 1) focus(result[0].editorSessionId);
    return result;
  }
  return { list, request, focus, open, created, rebound: binding };
};
