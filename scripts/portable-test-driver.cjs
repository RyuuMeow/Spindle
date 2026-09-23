// The NSIS portable launcher does not forward the inspector stderr required by
// Playwright's Electron launcher. Attach to explicit loopback inspector/CDP ports.
const { spawn } = require("node:child_process");
const net = require("node:net");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function unusedPort() {
  // Windows may allocate a low ephemeral port (e.g. 6566) that fetch forbids.
  // Probe only high ports, then release the reservation for Electron.
  for (let attempt = 0; attempt < 30; attempt++) {
    const server = net.createServer();
    try {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(
          require("node:crypto").randomInt(16384, 65536),
          "127.0.0.1",
          resolve,
        );
      });
      const port = server.address().port;
      await new Promise((resolve) => server.close(resolve));
      return port;
    } catch {
      if (server.listening) server.close();
    }
  }
  throw Error("No local debugger port is available");
}
exports.launch = async function (playwright, options) {
  const inspectorPort = await unusedPort(),
    cdpPort = await unusedPort();
  const child = spawn(
    options.executablePath,
    [
      `--inspect=127.0.0.1:${inspectorPort}`,
      `--remote-debugging-port=${cdpPort}`,
      ...options.args,
    ],
    {
      windowsHide: true,
      stdio: options.logPath ? ["ignore", "pipe", "pipe"] : "ignore",
      env: options.env || process.env,
    },
  );
  if (options.logPath) {
    for (const stream of [child.stdout, child.stderr])
      stream?.on("data", (chunk) =>
        require("node:fs").appendFileSync(options.logPath, chunk),
      );
  }
  let socket, browser, spawnError;
  child.on("error", (error) => {
    spawnError = error;
  });
  try {
    let inspectorURL;
    const deadline = Date.now() + options.timeout;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      try {
        const response = await fetch(
          `http://127.0.0.1:${inspectorPort}/json/list`,
        );
        inspectorURL = (await response.json())[0]?.webSocketDebuggerUrl;
        if (inspectorURL) break;
      } catch {
        /* Wait for the portable extraction and child process. */
      }
      await delay(150);
    }
    if (!inspectorURL) throw Error("Portable Node inspector did not start");
    socket = new WebSocket(inspectorURL);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    let sequence = 0;
    const pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      const item = pending.get(message.id);
      if (item) {
        pending.delete(message.id);
        clearTimeout(item.timer);
        if (message.error || message.result?.exceptionDetails)
          item.reject(
            Error(
              JSON.stringify(message.error || message.result.exceptionDetails),
            ),
          );
        else item.resolve(message.result?.result?.value);
      }
    });
    socket.addEventListener("close", () => {
      for (const item of pending.values()) {
        clearTimeout(item.timer);
        if (item.exiting) item.resolve();
        else item.reject(Error("Portable inspector disconnected"));
      }
      pending.clear();
    });
    const evaluateExpression = (expression, exiting = false) =>
      new Promise((resolve, reject) => {
        if (socket.readyState !== WebSocket.OPEN) {
          if (exiting) resolve();
          else reject(Error("Portable inspector is closed"));
          return;
        }
        const id = ++sequence,
          timer = setTimeout(() => {
            pending.delete(id);
            reject(Error("Portable evaluation timed out"));
          }, 15000);
        pending.set(id, { resolve, reject, timer, exiting });
        socket.send(
          JSON.stringify({
            id,
            method: "Runtime.evaluate",
            params: { expression, awaitPromise: true, returnByValue: true },
          }),
        );
      });
    while (Date.now() < deadline) {
      try {
        browser = await playwright.chromium.connectOverCDP(
          `http://127.0.0.1:${cdpPort}`,
          { timeout: 1000 },
        );
        break;
      } catch (error) {
        if (options.logPath)
          require("node:fs").appendFileSync(
            options.logPath,
            String(error) + "\n",
          );
        await delay(150);
      }
    }
    if (!browser) throw Error("Portable browser debugger did not start");
    const context = browser.contexts()[0];
    return {
      disconnect: async () => {
        socket.close();
        await browser.close().catch(() => {});
        child.unref();
      },
      close: async () => {
        try {
          await evaluateExpression(
            "new Promise((resolve,reject)=>{const e=process.mainModule.require('electron');e.app.once('will-quit',resolve);for(const w of e.BrowserWindow.getAllWindows())w.close();setTimeout(()=>reject(Error('Portable close handshake timed out')),12000).unref();})",
            true,
          );
        } finally {
          socket.close();
          await browser.close().catch(() => {});
          child.unref();
        }
      },
      firstWindow: async () =>
        context.pages()[0] || context.waitForEvent("page"),
      windows: () => context.pages(),
      on: (_event, callback) => context.on("page", callback),
      waitForEvent: () => context.waitForEvent("page"),
      evaluate: async (fn, arg) => {
        const exiting = fn.toString().includes("app.exit");
        try {
          return await evaluateExpression(
            `(${fn.toString()})(process.mainModule.require('electron'),${JSON.stringify(arg) ?? "undefined"})`,
            exiting,
          );
        } finally {
          if (exiting) {
            socket.close();
            await browser.close().catch(() => {});
            child.unref();
          }
        }
      },
      browserWindow: async (page) => {
        await page.waitForFunction(() => !!window.yarnDesktop?.windowId);
        const id = await page.evaluate(() => window.yarnDesktop.windowId);
        return {
          evaluate: (fn, arg) =>
            evaluateExpression(
              `(async()=>{for(const w of process.mainModule.require('electron').BrowserWindow.getAllWindows()){if(await w.webContents.executeJavaScript('window.yarnDesktop?.windowId')===${JSON.stringify(id)})return (${fn.toString()})(w,${JSON.stringify(arg) ?? "undefined"})}throw Error('Window not found')})()`,
            ),
        };
      },
    };
  } catch (error) {
    socket?.close();
    await browser?.close().catch(() => {});
    child.kill();
    throw error;
  }
};
