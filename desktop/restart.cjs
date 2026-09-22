const { randomUUID } = require("node:crypto");
// Prepare every renderer before closing any window. No partial close on failure.
function createRestartCoordinator({
  windows,
  ipcMain,
  flush,
  record,
  commit,
  timeout = 90000,
}) {
  let pending = false;
  return async function restart(commitOverride) {
    if (pending) throw Error("A restart is already being prepared");
    pending = true;
    const targets = [...windows.values()].map((item) => ({
      item,
      projectId: item.projectId,
    }));
    const cleanups = [];
    try {
      await Promise.all(
        targets.map(
          ({ item }) =>
            new Promise((resolve, reject) => {
              const token = randomUUID(),
                sender = item.window.webContents;
              const finish = (error) => {
                cleanup();
                if (error) reject(Error(error));
                else resolve();
              };
              const listener = (event, value) => {
                if (event.sender.id === sender.id && value?.token === token)
                  finish(value.error);
              };
              const destroyed = () =>
                finish("A window closed during restart preparation");
              const timer = setTimeout(
                () => finish("Saving timed out; no windows were closed"),
                timeout,
              );
              const cleanup = () => {
                clearTimeout(timer);
                ipcMain.removeListener("workspace:close-prepared", listener);
                sender.removeListener("destroyed", destroyed);
              };
              cleanups.push(cleanup);
              ipcMain.on("workspace:close-prepared", listener);
              sender.once("destroyed", destroyed);
              sender.send("workspace:prepare-close", token);
            }),
        ),
      );
      if (targets.length !== windows.size)
        throw Error("The open windows changed; retry restarting");
      for (const { item, projectId } of targets) {
        if (
          item.window.isDestroyed() ||
          windows.get(item.id) !== item ||
          item.projectId !== projectId
        )
          throw Error("A workspace changed; retry restarting");
        flush(item);
      }
      await record(targets.map(({ item }) => item));
      await (commitOverride || commit)();
    } catch (error) {
      for (const { item } of targets)
        if (!item.window.isDestroyed())
          item.window.webContents.send("workspace:close-cancelled");
      throw error;
    } finally {
      for (const cleanup of cleanups) cleanup();
      pending = false;
    }
  };
}
module.exports = { createRestartCoordinator };
