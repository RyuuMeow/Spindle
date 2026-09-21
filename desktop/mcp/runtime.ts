import http, { type IncomingMessage, type ServerResponse } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AgentApplication, type AgentHost } from "./application";
import { boundedResult } from "./bounded-result";
import { schemas, descriptions } from "./schemas";
import { atomicWrite } from "../disk-io";
import type { WorkspaceService } from "../workspace-service";
import type { McpSettings } from "../../app/mcp/types";
const configSchema = z
  .object({
    mode: z.enum(["disabled", "read", "write"]),
    port: z.number().int().min(0).max(65535),
    token: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const patchSchema = z
  .object({
    mode: z.enum(["disabled", "read", "write"]).optional(),
    port: z.number().int().min(0).max(65535).optional(),
    resetToken: z.boolean().optional(),
  })
  .strict();
export class McpRuntime {
  private config: z.infer<typeof configSchema>;
  private server?: http.Server;
  private file: string;
  private error?: string;
  private log: McpSettings["operations"] = [];
  private queue: Promise<unknown> = Promise.resolve();
  readonly application: AgentApplication;
  constructor(profile: string, service: WorkspaceService, host: AgentHost) {
    this.file = path.join(profile, "mcp-v1.json");
    this.config = {
      mode: "disabled",
      port: 0,
      token: randomBytes(32).toString("hex"),
    };
    try {
      if (fs.existsSync(this.file))
        this.config = configSchema.parse(
          JSON.parse(fs.readFileSync(this.file, "utf8")),
        );
    } catch {
      this.error = "MCP 設定無法讀取；請更改設定重新建立連線。";
    }
    this.application = new AgentApplication(
      service,
      host,
      () => this.config.mode === "write",
    );
  }
  settings(): McpSettings {
    return {
      mode: this.config.mode,
      port: this.config.port,
      url: this.url(),
      running: !!this.server?.listening,
      error: this.error,
      operations: [...this.log],
    };
  }
  connection() {
    return {
      url: this.url(),
      headers: { Authorization: "Bearer " + this.config.token },
    };
  }
  private url() {
    return `http://127.0.0.1:${this.config.port}/mcp`;
  }
  configure(value: unknown) {
    const patch = patchSchema.parse(value);
    const task = this.queue.then(async () => {
      const previousPort = this.config.port;
      const mode = patch.mode ?? this.config.mode;
      this.config = {
        mode,
        port: patch.port ?? this.config.port,
        token:
          patch.resetToken ||
          (mode === "disabled" && this.config.mode !== "disabled")
            ? randomBytes(32).toString("hex")
            : this.config.token,
      };
      atomicWrite(this.file, JSON.stringify(this.config));
      if (
        !this.server?.listening ||
        mode === "disabled" ||
        previousPort !== this.config.port
      ) {
        await this.stop();
        await this.start();
      }
      return this.settings();
    });
    this.queue = task.catch(() => undefined);
    return task;
  }
  async start() {
    if (this.config.mode === "disabled" || this.server?.listening) return;
    const server = http.createServer((req, res) => {
      void this.handle(req, res).catch(() => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
    });
    server.requestTimeout = 30000;
    server.headersTimeout = 10000;
    server.maxHeadersCount = 50;
    this.server = server;
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(this.config.port, "127.0.0.1", () => {
          server.removeListener("error", reject);
          resolve();
        });
      });
      const address = server.address();
      if (address && typeof address !== "string" && this.config.port === 0) {
        this.config.port = address.port;
        atomicWrite(this.file, JSON.stringify(this.config));
      }
      this.error = undefined;
      server.on("error", () => {
        this.error = "MCP 連線服務發生錯誤，請重試。";
      });
    } catch (error) {
      this.error =
        (error as NodeJS.ErrnoException).code === "EADDRINUSE"
          ? "連接埠已被使用，請更改連接埠。"
          : "無法啟動 MCP：" + String(error);
      server.close();
      this.server = undefined;
    }
  }
  async stop() {
    const server = this.server;
    this.server = undefined;
    if (server) {
      server.closeIdleConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
  private authorized(req: IncomingMessage) {
    const value = req.headers.authorization || "",
      expected = "Bearer " + this.config.token;
    return (
      this.config.mode !== "disabled" &&
      Buffer.byteLength(value) === Buffer.byteLength(expected) &&
      timingSafeEqual(Buffer.from(value), Buffer.from(expected))
    );
  }
  private async handle(req: IncomingMessage, res: ServerResponse) {
    const hosts = [
      `127.0.0.1:${this.config.port}`,
      `localhost:${this.config.port}`,
    ];
    if (
      !hosts.includes(req.headers.host || "") ||
      (req.headers.origin &&
        !hosts.map((h) => "http://" + h).includes(req.headers.origin))
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (!this.authorized(req)) {
      res.writeHead(401);
      res.end();
      return;
    }
    if (req.url !== "/mcp") {
      res.writeHead(404);
      res.end();
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" });
      res.end();
      return;
    }
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 1048576) {
        res.writeHead(413);
        res.end();
        return;
      }
      chunks.push(chunk);
    }
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    const server = new McpServer({ name: "spindle", version: "1.0.0" });
    for (const name of Object.keys(schemas) as (keyof typeof schemas)[]) {
      const writes = [
        "apply_changes",
        "apply_quick_fixes",
        "update_commands",
      ].includes(name);
      server.registerTool(
        name,
        {
          description: descriptions[name],
          inputSchema: schemas[name].shape,
          annotations: {
            readOnlyHint:
              !writes &&
              ![
                "open_project",
                "activate_editor_session",
                "reveal_location",
              ].includes(name),
            destructiveHint: writes,
            openWorldHint: false,
          },
        },
        async (args: unknown) => {
          try {
            if (!this.authorized(req)) throw Error("MCP_ACCESS_REVOKED");
            const result = boundedResult(
              await this.application.execute(name, args, () => {
                if (!this.authorized(req)) throw Error("MCP_ACCESS_REVOKED");
              }),
            );
            this.record(name, "ok");
            return {
              content: [
                { type: "text" as const, text: JSON.stringify(result) },
              ],
              structuredContent: result as Record<string, unknown>,
            };
          } catch (error) {
            this.record(name, "error");
            return {
              isError: true,
              content: [{ type: "text" as const, text: String(error) }],
            };
          }
        },
      );
    }
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  }
  private record(tool: string, outcome: string) {
    this.log = [...this.log.slice(-99), { at: Date.now(), tool, outcome }];
  }
}
export function createMcpRuntime(
  profile: string,
  service: WorkspaceService,
  host: AgentHost,
) {
  return new McpRuntime(profile, service, host);
}
