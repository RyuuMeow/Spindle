const { spawn } = require("node:child_process");
const readline = require("node:readline");
module.exports = async function check(executable, env, cwd, expectedPath) {
  const child = spawn(executable, ["app-server"], {
    env,
    cwd,
    windowsHide: true,
    stdio: ["pipe", "pipe", "ignore"],
  });
  const pending = new Map();
  let id = 0;
  const lines = readline.createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    let result;
    try {
      result = JSON.parse(line);
    } catch {
      return;
    }
    const request = pending.get(result.id);
    if (!request) return;
    pending.delete(result.id);
    clearTimeout(request.timer);
    if (result.error)
      request.reject(new Error("Codex rejected skill discovery"));
    else request.resolve(result.result);
  });
  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const seq = ++id;
      const timer = setTimeout(() => {
        pending.delete(seq);
        reject(new Error("Codex skill discovery timed out"));
      }, 15000);
      pending.set(seq, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id: seq, method, params }) + "\n");
    });
  child.on("error", (error) => {
    for (const item of pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    pending.clear();
  });
  try {
    await request("initialize", {
      clientInfo: { name: "spindle-install-test", version: "0.9.2" },
      capabilities: { experimentalApi: true },
    });
    child.stdin.write(
      JSON.stringify({ method: "initialized", params: {} }) + "\n",
    );
    const result = await request("skills/list", {
      cwds: [cwd],
      forceReload: true,
    });
    const skills = result.data?.flatMap((x) => x.skills || []) || [];
    const normalize = (p) => p.replaceAll("\\", "/").toLowerCase();
    return skills.some(
      (skill) =>
        skill.name === "spindle" &&
        normalize(skill.path) === normalize(expectedPath),
    );
  } finally {
    for (const item of pending.values()) clearTimeout(item.timer);
    lines.close();
    child.stdin.end();
    child.kill();
  }
};
