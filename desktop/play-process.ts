import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type { PlayState } from "../app/play/types";

/** One isolated official VM per Play session. A hung compiler cannot block Electron. */
export class PlayProcess {
  private child: ChildProcessWithoutNullStreams;
  private nextId = 0;
  private pending = new Map<
    number,
    {
      resolve(value: PlayState): void;
      reject(error: Error): void;
      timer: NodeJS.Timeout;
    }
  >();
  private closed = false;
  constructor(executable: string, onFailure: (message: string) => void) {
    this.child = spawn(executable, [], {
      windowsHide: true,
      stdio: "pipe",
      env: { ...process.env, DOTNET_EnableDiagnostics: "0" },
    });
    const lines = createInterface({ input: this.child.stdout });
    lines.on("line", (line) => {
      try {
        if (line.length > 32_000_000) throw Error("PLAY_RESPONSE_TOO_LARGE");
        const response = JSON.parse(line),
          request = this.pending.get(response.id);
        if (!request) return;
        clearTimeout(request.timer);
        this.pending.delete(response.id);
        if (response.error) request.reject(Error(String(response.error)));
        else if (response.result?.protocolVersion !== 1)
          request.reject(Error("PLAY_PROTOCOL_MISMATCH"));
        else request.resolve(response.result);
      } catch {
        this.fail("PLAY_INVALID_RESPONSE");
      }
    });
    this.child.stderr.resume(); // No story text is written to logs.
    this.child.on("error", () => {
      this.fail("PLAY_HELPER_UNAVAILABLE");
      onFailure("PLAY_HELPER_UNAVAILABLE");
    });
    this.child.on("exit", () => {
      if (!this.closed) {
        this.fail("PLAY_HELPER_EXITED");
        onFailure("PLAY_HELPER_EXITED");
      }
    });
  }
  request(action: object): Promise<PlayState> {
    if (this.closed) return Promise.reject(Error("PLAY_HELPER_CLOSED"));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail("PLAY_HELPER_TIMEOUT");
      }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(
        JSON.stringify({ ...action, id }) + "\n",
        (error) => {
          if (error) this.fail("PLAY_HELPER_CLOSED");
        },
      );
    });
  }
  private fail(message: string) {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(Error(message));
    }
    this.pending.clear();
    this.close();
  }
  close() {
    this.closed = true;
    this.child.kill();
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(Error("PLAY_HELPER_CLOSED"));
    }
    this.pending.clear();
  }
}
