import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { atomicWrite } from "./disk-io";
import {
  readEntry,
  patchEntry,
  entryFor,
  type Connection,
} from "./agent-config";
import type {
  AgentClient,
  AgentInstallation,
  InstallResult,
} from "../app/mcp/install-types";
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const canonical = (v: unknown): string =>
  v && typeof v === "object" && !Array.isArray(v)
    ? JSON.stringify(
        Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, x]) => [k, JSON.parse(canonical(x))]),
        ),
      )
    : JSON.stringify(v ?? null);
const digest = (v: unknown) =>
  v === undefined ? "absent" : hash(canonical(v));
const text = (file: string) =>
  fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
const identity = (file: string) => path.resolve(file).toLowerCase();
type Target = { configPath: string; skillPath: string };
type RecordEntry = Target & {
  profile: string;
  client: AgentClient;
  name: string;
  entryHash: string;
  plannedHash?: string;
  pending?: "install" | "remove";
};
type SkillRecord = {
  resourceVersion?: string; hash: string; plannedHash?: string; owners: string[] };
type Registry = {
  version: 1;
  entries: Record<string, RecordEntry>;
  skills: Record<string, SkillRecord>;
};
type Options = {
  home?: string;
  env?: NodeJS.ProcessEnv;
  defaultProfile: string;
  skillSource: string;
  connection: () => Connection;
  enabled: () => boolean;
  beforeWrite?: () => void;
};
export class AgentInstaller {
  private home: string;
  private env: NodeJS.ProcessEnv;
  private profileId: string;
  private directory: string;
  private registryFile: string;
  private targetsFile: string;
  constructor(
    private profile: string,
    private options: Options,
  ) {
    this.home = options.home ?? os.homedir();
    this.env = options.env ?? process.env;
    this.profileId = hash(identity(profile)).slice(0, 12);
    this.directory = path.join(this.home, ".spindle-agent");
    this.registryFile = path.join(this.directory, "installations-v1.json");
    this.targetsFile = path.join(profile, "agent-targets-v1.json");
  }
  private name() {
    return identity(this.profile) === identity(this.options.defaultProfile)
      ? "spindle"
      : `spindle-${this.profileId}`;
  }
  private registry(): Registry {
    if (!fs.existsSync(this.registryFile))
      return { version: 1, entries: {}, skills: {} };
    try {
      const value = JSON.parse(text(this.registryFile));
      if (value.version !== 1 || !value.entries || !value.skills)
        throw new Error();
      return value;
    } catch {
      throw new Error("安裝紀錄無法讀取；保留既有設定。");
    }
  }
  private save(registry: Registry) {
    atomicWrite(this.registryFile, JSON.stringify(registry));
  }
  private locked<T>(action: () => T): T {
    this.safe(this.registryFile);
    fs.mkdirSync(this.directory, { recursive: true });
    const lock = path.join(this.directory, "install.lock");
    if (fs.existsSync(lock)) {
      const pid = Number(text(lock));
      let alive = true;
      try {
        process.kill(pid, 0);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ESRCH") alive = false;
      }
      if (alive || !Number.isInteger(pid) || pid <= 0)
        throw new Error("其他安裝正在執行；請稍後重試。");
      fs.unlinkSync(lock);
    }
    let fd: number;
    try {
      fd = fs.openSync(lock, "wx");
    } catch {
      throw new Error("其他安裝正在執行；請稍後重試。");
    }
    try {
      fs.writeFileSync(fd, String(process.pid));
      return action();
    } finally {
      fs.closeSync(fd);
      fs.unlinkSync(lock);
    }
  }
  private safe(file: string) {
    for (let at = path.resolve(file); ; at = path.dirname(at)) {
      if (fs.existsSync(at) && fs.lstatSync(at).isSymbolicLink())
        throw new Error("安裝路徑包含連結；請選擇實際目錄。");
      if (path.dirname(at) === at) break;
    }
  }
  private key(client: AgentClient, target: Target) {
    return hash(
      client +
        identity(target.configPath) +
        identity(target.skillPath) +
        this.profileId,
    );
  }
  target(client: AgentClient): Target {
    if (client !== "codex" && client !== "claude")
      throw new Error("不支援的 Agent。");
    const overrides = fs.existsSync(this.targetsFile)
      ? JSON.parse(text(this.targetsFile))
      : {};
    if (overrides[client]) return overrides[client];
    const claude = this.env.CLAUDE_CONFIG_DIR;
    return client === "codex"
      ? {
          configPath: path.join(
            this.env.CODEX_HOME || path.join(this.home, ".codex"),
            "config.toml",
          ),
          skillPath: path.join(this.home, ".agents", "skills", "spindle"),
        }
      : {
          configPath: claude
            ? path.join(claude, ".claude.json")
            : path.join(this.home, ".claude.json"),
          skillPath: path.join(
            claude || path.join(this.home, ".claude"),
            "skills",
            "spindle",
          ),
        };
  }
  setTarget(client: AgentClient, part: "config" | "skill", selected: string) {
    return this.locked(() => {
      const target = this.target(client),
        registry = this.registry();
      if (registry.entries[this.key(client, target)])
        throw new Error("請先移除目前受管理的安裝，再變更路徑。");
      const next =
        part === "config"
          ? { ...target, configPath: path.resolve(selected) }
          : {
              ...target,
              skillPath: path.join(path.resolve(selected), "spindle"),
            };
      this.safe(next.configPath);
      this.safe(next.skillPath);
      const values = fs.existsSync(this.targetsFile)
        ? JSON.parse(text(this.targetsFile))
        : {};
      atomicWrite(
        this.targetsFile,
        JSON.stringify({ ...values, [client]: next }),
      );
      return this.inspect(client);
    });
  }
  inspect(client: AgentClient): AgentInstallation {
    const target = this.target(client);
    const result: AgentInstallation = {
      client,
      ...target,
      serverName: this.name(),
      mcp: "missing",
      skill: "missing",
      pending: false,
    };
    try {
      this.safe(target.configPath);
      this.safe(target.skillPath);
      const registry = this.registry(),
        record = registry.entries[this.key(client, target)];
      result.pending = !!record?.pending;
      const actual = readEntry(client, text(target.configPath), this.name());
      const actualHash = digest(actual);
      if (actual !== undefined)
        result.mcp =
          !record ||
          ![record.entryHash, record.plannedHash].includes(actualHash)
            ? "conflict"
            : actualHash === digest(entryFor(client, this.options.connection()))
              ? "installed"
              : "outdated";
      const skill = path.join(target.skillPath, "SKILL.md"),
        shared = registry.skills[identity(target.skillPath)];
      if (fs.existsSync(target.skillPath)) {
        const extras = fs
          .readdirSync(target.skillPath)
          .some((name) => name !== "SKILL.md");
        result.skill =
          extras ||
          !fs.existsSync(skill) ||
          !shared ||
          ![shared.hash, shared.plannedHash].includes(hash(text(skill)))
            ? "conflict"
            : hash(text(skill)) === hash(text(this.options.skillSource))
              ? "installed"
              : "outdated";
      }
    } catch (error) {
      result.mcp = "conflict";
      result.error = (error as Error).message;
    }
    return result;
  }
  private write(file: string, expected: string, content: string) {
    this.safe(file);
    this.options.beforeWrite?.();
    atomicWrite(file, content, () => {
      this.safe(file);
      if (text(file) !== expected)
        throw new Error("設定已由其他程式修改；請重新檢查再試。");
    });
  }
  install(client: AgentClient): InstallResult {
    return this.locked(() => {
      if (!this.options.enabled())
        throw new Error("請先啟用 MCP 唯讀或允許修改，並確認服務執行中。");
      const state = this.inspect(client);
      if (state.mcp === "conflict" || state.skill === "conflict")
        throw new Error(
          state.error || "同名設定或 Skill 已被修改；保留原內容。",
        );
      const target = this.target(client),
        registry = this.registry(),
        key = this.key(client, target);
      const original = text(target.configPath),
        value = entryFor(client, this.options.connection());
      const currentHash = digest(readEntry(client, original, this.name()));
      const owned = registry.entries[key];
      if (
        currentHash !== "absent" &&
        (!owned || ![owned.entryHash, owned.plannedHash].includes(currentHash))
      )
        throw new Error("MCP 設定已由其他程式修改；保留原檔。");
      const next = patchEntry(client, original, this.name(), value);
      const skillFile = path.join(target.skillPath, "SKILL.md"),
        oldSkill = text(skillFile),
        source = text(this.options.skillSource);
      if (!source.startsWith("---")) throw new Error("內建 Skill 資源遺失。");
      const skillKey = identity(target.skillPath);
      const record: RecordEntry = registry.entries[key] ?? {
        ...target,
        client,
        profile: this.profileId,
        name: this.name(),
        entryHash: "absent",
      };
      record.entryHash = digest(readEntry(client, original, this.name()));
      record.pending = "install";
      record.plannedHash = digest(value);
      registry.entries[key] = record;
      const shared = registry.skills[skillKey] ?? {
        hash: "absent",
        owners: [],
      };
      if (
        oldSkill &&
        ![shared.hash, shared.plannedHash].includes(hash(oldSkill))
      )
        throw new Error("Skill 已由其他程式修改；保留原檔。");
      shared.hash = fs.existsSync(skillFile) ? hash(oldSkill) : "absent";
      shared.plannedHash = hash(source);
      shared.resourceVersion = "0.9.2";
      if (!shared.owners.includes(key)) shared.owners.push(key);
      registry.skills[skillKey] = shared;
      this.save(registry);
      try {
        if (next !== original) this.write(target.configPath, original, next);
        if (source !== oldSkill) this.write(skillFile, oldSkill, source);
        record.entryHash = digest(value);
        delete record.plannedHash;
        delete record.pending;
        shared.hash = hash(source);
        delete shared.plannedHash;
        this.save(registry);
        return {
          installation: this.inspect(client),
          message:
            "MCP 設定與 Skill 已寫入。請重新載入 Agent 或開啟新工作階段；尚未驗證 Agent 是否已載入工具。",
        };
      } catch {
        return {
          installation: this.inspect(client),
          message:
            "安裝部分完成；紀錄已保留。請檢查路徑權限或外部修改後重試，不會建立副本。",
        };
      }
    });
  }
  remove(client: AgentClient): InstallResult {
    return this.locked(() => {
      const target = this.target(client),
        registry = this.registry(),
        key = this.key(client, target),
        record = registry.entries[key];
      if (!record)
        return {
          installation: this.inspect(client),
          message: "沒有可移除的受管理安裝；外部內容保留。",
        };
      const original = text(target.configPath),
        current = readEntry(client, original, record.name),
        currentHash = digest(current);
      if (
        current !== undefined &&
        ![record.entryHash, record.plannedHash].includes(currentHash)
      )
        throw new Error("MCP 設定已被外部修改；保留設定與 Skill。");
      const next =
        current === undefined
          ? original
          : patchEntry(client, original, record.name, undefined);
      record.pending = "remove";
      record.plannedHash = "absent";
      this.save(registry);
      try {
        if (next !== original) this.write(target.configPath, original, next);
        const skillKey = identity(target.skillPath),
          shared = registry.skills[skillKey];
        let retained = false;
        if (shared) {
          shared.owners = shared.owners.filter((owner) => owner !== key);
          if (!shared.owners.length) {
            const file = path.join(target.skillPath, "SKILL.md");
            if (
              fs.existsSync(file) &&
              [shared.hash, shared.plannedHash].includes(hash(text(file))) &&
              fs
                .readdirSync(target.skillPath)
                .every((name) => name === "SKILL.md")
            ) {
              this.safe(file);
              fs.unlinkSync(file);
              fs.rmdirSync(target.skillPath);
            } else retained = fs.existsSync(target.skillPath);
            delete registry.skills[skillKey];
          }
        }
        delete registry.entries[key];
        this.save(registry);
        return {
          installation: this.inspect(client),
          message: retained
            ? "MCP 設定已移除；使用者修改過的 Skill 已保留。"
            : "已移除本 profile 的安裝；其他設定及共用中的 Skill 保留。",
        };
      } catch {
        return {
          installation: this.inspect(client),
          message: "移除部分完成；紀錄已保留，可重試。",
        };
      }
    });
  }
  format(client: AgentClient | "http") {
    const connection = this.options.connection(),
      name = this.name();
    return client === "codex"
      ? patchEntry("codex", "", name, entryFor("codex", connection))
      : JSON.stringify(
          { mcpServers: { [name]: entryFor("claude", connection) } },
          null,
          2,
        );
  }
  async test(client: AgentClient): Promise<InstallResult> {
    const state = this.inspect(client);
    if (state.mcp !== "installed" || !this.options.enabled())
      throw new Error("請先啟用服務並更新 MCP 安裝設定。");
    const entry = readEntry(
      client,
      text(state.configPath),
      state.serverName,
    ) as {
      url: string;
      http_headers?: Record<string, string>;
      headers?: Record<string, string>;
    };
    // Only connect to this profile's endpoint; edited/external URLs never receive its credential.
    if (entry.url !== this.options.connection().url)
      throw new Error("連線網址不符。");
    const sdk = new Client({ name: "spindle-install-check", version: "0.9.2" });
    const transport = new StreamableHTTPClientTransport(new URL(entry.url), {
      requestInit: { headers: entry.http_headers ?? entry.headers },
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.any([
            AbortSignal.timeout(5000),
            ...(init?.signal ? [init.signal] : []),
          ]),
        }),
    });
    try {
      await sdk.connect(transport);
      const response = await sdk.listTools();
      return {
        installation: state,
        toolCount: response.tools.length,
        message: `Spindle 握手成功，發現 ${response.tools.length} 個工具。這是連線測試，不代表 Agent 已載入。`,
      };
    } catch {
      throw new Error("連線檢查失敗；請確認服務、連接埠及憑證後重試。");
    } finally {
      await sdk.close();
    }
  }
}
