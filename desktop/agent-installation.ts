import { APP_VERSION } from "../app/version";
import { t as tr } from "../app/i18n";
import fs from "node:fs";
import { z } from "zod";
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
  resourceVersion?: string;
  hash: string;
  plannedHash?: string;
  owners: string[];
};
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
const targetSchema = z.object({
  configPath: z.string().refine(path.isAbsolute),
  skillPath: z.string().refine(path.isAbsolute),
});
const hashSchema = z.string().regex(/^(absent|[a-f0-9]{64})$/);
const registrySchema = z.object({
  version: z.literal(1),
  entries: z.record(
    z.string(),
    targetSchema.extend({
      profile: z.string(),
      client: z.enum(["codex", "claude"]),
      name: z.string().regex(/^spindle(?:-[a-f0-9]{12})?$/),
      entryHash: hashSchema,
      plannedHash: hashSchema.optional(),
      pending: z.enum(["install", "remove"]).optional(),
    }),
  ),
  skills: z.record(
    z.string(),
    z.object({
      hash: hashSchema,
      plannedHash: hashSchema.optional(),
      resourceVersion: z.string().optional(),
      owners: z.array(z.string()),
    }),
  ),
});
const targetsSchema = z
  .object({ codex: targetSchema.optional(), claude: targetSchema.optional() })
  .strict();
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
      return registrySchema.parse(JSON.parse(text(this.registryFile)));
    } catch {
      throw new Error(tr("m647ac0655a70"));
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
        throw new Error(tr("m34a6635982a6"));
      fs.unlinkSync(lock);
    }
    let fd: number;
    try {
      fd = fs.openSync(lock, "wx");
    } catch {
      throw new Error(tr("m34a6635982a6"));
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
        throw new Error(tr("m102ebe7c7a00"));
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
      throw new Error(tr("mf3ca0e801e74"));
    const overrides = fs.existsSync(this.targetsFile)
      ? targetsSchema.parse(JSON.parse(text(this.targetsFile)))
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
        throw new Error(tr("mfe31177e22ef"));
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
        ? targetsSchema.parse(JSON.parse(text(this.targetsFile)))
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
      if (text(file) !== expected) throw new Error(tr("m3d64d03c6ea7"));
    });
  }
  install(client: AgentClient): InstallResult {
    return this.locked(() => {
      if (!this.options.enabled()) throw new Error(tr("m0c1a9e072617"));
      const state = this.inspect(client);
      if (state.mcp === "conflict" || state.skill === "conflict")
        throw new Error(state.error || tr("mc790e73e19ae"));
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
        throw new Error(tr("me1f70f512665"));
      const next = patchEntry(client, original, this.name(), value);
      const skillFile = path.join(target.skillPath, "SKILL.md"),
        oldSkill = text(skillFile),
        source = text(this.options.skillSource);
      if (!source.startsWith("---")) throw new Error(tr("m5b5458f7b61f"));
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
        throw new Error(tr("m2be0b834184d"));
      shared.hash = fs.existsSync(skillFile) ? hash(oldSkill) : "absent";
      shared.plannedHash = hash(source);
      shared.resourceVersion = APP_VERSION;
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
          message: tr("m5a93d4d948ba"),
        };
      } catch {
        return {
          installation: this.inspect(client),
          message: tr("m65b6ed82ac80"),
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
          message: tr("m35f835820555"),
        };
      const original = text(target.configPath),
        current = readEntry(client, original, record.name),
        currentHash = digest(current);
      if (
        current !== undefined &&
        ![record.entryHash, record.plannedHash].includes(currentHash)
      )
        throw new Error(tr("m6c44e47f3a98"));
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
          message: retained ? tr("m22b9377646e1") : tr("m563b0a187661"),
        };
      } catch {
        return {
          installation: this.inspect(client),
          message: tr("m16c317368ae1"),
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
      throw new Error(tr("md32d051e973e"));
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
      throw new Error(tr("m8257b3e81c08"));
    const sdk = new Client({
      name: "spindle-install-check",
      version: APP_VERSION,
    });
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
        message: tr("mf8f8af3c9e34", [response.tools.length]),
      };
    } catch {
      throw new Error(tr("m3403556e493b"));
    } finally {
      await sdk.close();
    }
  }
}
