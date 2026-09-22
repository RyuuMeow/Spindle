import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import semver from "semver";
import { APP_VERSION } from "../app/version";
export type UpdateState = {
  phase:
    | "idle"
    | "checking"
    | "available"
    | "current"
    | "unavailable"
    | "downloading"
    | "ready"
    | "error";
  version?: string;
  notes?: string;
  features?: string;
  progress?: number;
  error?: string;
  unsigned?: boolean;
};
type Asset = { name: string; browser_download_url: string; size: number };
type Release = {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets: Asset[];
};
type Manifest = {
  version: string;
  assets: { name: string; sha256: string; size: number }[];
  notes: Record<string, { features: string; markdown: string }>;
};

export function trustedAsset(url: string) {
  const u = new URL(url);
  return (
    u.protocol === "https:" &&
    u.hostname === "github.com" &&
    (!u.port || u.port === "443") &&
    u.pathname.startsWith("/RyuuMeow/Spindle/releases/download/") &&
    !u.username &&
    !u.password
  );
}
export function candidate(release: Release, current: string) {
  const v = release.tag_name.replace(/^v/, "");
  return !release.draft &&
    !release.prerelease &&
    !!semver.valid(v) &&
    !semver.prerelease(v) &&
    semver.gt(v, current)
    ? v
    : null;
}
export async function installedUpdater() {
  const { autoUpdater } = await import("electron-updater");
  return autoUpdater;
}
export class UpdateService {
  state: UpdateState = { phase: "idle" };
  private release?: Release;
  private manifest?: Manifest;
  private selected?: Asset;
  private download?: AbortController;
  private downloaded?: string;
  private cancellation?: { cancel: () => void };
  private updater?: import("electron-updater").AppUpdater;
  constructor(
    private options: {
      profile: string;
      locale: string;
      portable?: string;
      executable: string;
      preferences: () => { skippedVersion?: string };
      skip: (version: string) => void;
      changed: (state: UpdateState, prompt: boolean) => void;
      prepare: (commit: () => Promise<void>) => Promise<void>;
      exit: () => void;
      failedInstall?: () => void;
      resources: string;
    },
  ) {}
  private publish(patch: UpdateState, prompt = false) {
    this.state = patch;
    this.options.changed({ ...patch }, prompt);
    return this.state;
  }
  async check(manual = true) {
    if (this.state.phase === "downloading" || this.state.phase === "checking")
      return this.state;
    this.publish({ phase: "checking" });
    try {
      const response = await fetch(
        "https://api.github.com/repos/RyuuMeow/Spindle/releases/latest",
        {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "Spindle/" + APP_VERSION,
          },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok)
        throw Error(
          response.status === 404
            ? "No public release is available"
            : `Update service returned ${response.status}`,
        );
      const release = (await response.json()) as Release,
        version = candidate(release, APP_VERSION);
      if (!version) return this.publish({ phase: "current" });
      const metadata = release.assets.find(
        (a) => a.name === `Spindle-${version}-release.json`,
      );
      const name = `Spindle-${version}-${this.options.portable ? "Portable" : "Setup"}-x64.exe`;
      const asset = release.assets.find((a) => a.name === name);
      if (
        !metadata ||
        !asset ||
        !trustedAsset(metadata.browser_download_url) ||
        !trustedAsset(asset.browser_download_url)
      )
        throw Error("The release is missing required update assets");
      const payload = await fetch(metadata.browser_download_url, {
        signal: AbortSignal.timeout(15000),
      });
      if (!payload.ok) throw Error("Unable to read release metadata");
      const text = await payload.text();
      if (text.length > 500000) throw Error("Release metadata is too large");
      const manifest = JSON.parse(text) as Manifest,
        entry = manifest.assets.find((a) => a.name === name);
      if (
        manifest.version !== version ||
        !entry ||
        !/^[a-f0-9]{64}$/i.test(entry.sha256) ||
        entry.size !== asset.size
      )
        throw Error("Release metadata does not match the installer");
      this.release = release;
      this.manifest = manifest;
      this.selected = asset;
      const notes = manifest.notes[this.options.locale] || manifest.notes.en;
      return this.publish(
        {
          phase: "available",
          version,
          notes: notes?.markdown || "",
          features: notes?.features || "",
          unsigned: true,
        },
        manual || this.options.preferences().skippedVersion !== version,
      );
    } catch (e) {
      return this.publish({
        phase: manual ? "error" : "unavailable",
        error: String(e),
      });
    }
  }
  skip() {
    if (this.state.version) this.options.skip(this.state.version);
    return this.state;
  }
  cancel() {
    this.download?.abort();
    this.cancellation?.cancel();
  }
  async install() {
    if (!this.selected || !this.manifest || !this.release)
      throw Error("Check for an update first");
    if (this.state.phase === "downloading")
      throw Error("A download is already active");
    const base = { ...this.state };
    this.download = new AbortController();
    try {
      this.publish({ ...base, phase: "downloading", progress: 0 });
      if (this.options.portable) {
        const directory = path.join(this.options.profile, "updates");
        fs.mkdirSync(directory, { recursive: true });
        const file = path.join(directory, this.selected.name + ".partial");
        const response = await fetch(this.selected.browser_download_url, {
          signal: this.download.signal,
        });
        if (!response.ok || !response.body)
          throw Error("Update download failed");
        const output = fs.openSync(file, "w"),
          hash = createHash("sha256");
        let size = 0,
          lastProgress = 0;
        try {
          const reader = response.body.getReader();
          while (true) {
            const { done, value: chunk } = await reader.read();
            if (done) break;
            size += chunk.length;
            if (size > this.selected.size) throw Error("Update size mismatch");
            fs.writeSync(output, chunk);
            hash.update(chunk);
            if (Date.now() - lastProgress > 150) {
              lastProgress = Date.now();
              this.publish({
                ...base,
                phase: "downloading",
                progress: size / this.selected.size,
              });
            }
          }
        } finally {
          fs.closeSync(output);
        }
        const expected = this.manifest.assets.find(
          (a) => a.name === this.selected!.name,
        )!;
        if (size !== expected.size || hash.digest("hex") !== expected.sha256)
          throw Error("Update checksum mismatch");
        this.downloaded = file.slice(0, -8);
        fs.renameSync(file, this.downloaded);
      } else {
        const autoUpdater = await installedUpdater();
        this.updater = autoUpdater;
        autoUpdater.removeAllListeners("download-progress");
        autoUpdater.on("download-progress", (value) =>
          this.publish({
            ...base,
            phase: "downloading",
            progress: value.percent / 100,
          }),
        );
        autoUpdater.on("error", (error) => {
          this.options.failedInstall?.();
          this.publish({ ...base, phase: "error", error: String(error) });
        });
        autoUpdater.autoDownload = false;
        autoUpdater.autoInstallOnAppQuit = false;
        autoUpdater.allowDowngrade = false;
        autoUpdater.setFeedURL({
          provider: "github",
          owner: "RyuuMeow",
          repo: "Spindle",
          private: false,
        });
        const result = await autoUpdater.checkForUpdates();
        if (result?.updateInfo.version !== this.manifest.version)
          throw Error("The available release changed; check again");
        this.cancellation = result?.cancellationToken;
        if (this.download.signal.aborted) throw Error("Download cancelled");
        const files = await autoUpdater.downloadUpdate(
          result?.cancellationToken,
        );
        const file = files.find((f) => f.endsWith(".exe"));
        if (!file) throw Error("No installer was downloaded");
        const expected = this.manifest.assets.find(
          (a) => a.name === this.selected!.name,
        )!;
        const hash = createHash("sha256");
        for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
        if (hash.digest("hex") !== expected.sha256)
          throw Error("Installer checksum mismatch");
        this.downloaded = file;
      }
      if (this.download.signal.aborted) throw Error("Download cancelled");
      if (this.options.portable) {
        fs.accessSync(path.dirname(this.options.portable), fs.constants.W_OK);
        fs.accessSync(this.options.portable, fs.constants.W_OK);
      }
      this.publish({ ...base, phase: "ready", progress: 1 });
      await this.options.prepare(async () => {
        if (this.options.portable) {
          const directory = path.join(this.options.profile, "updates"),
            token = randomUUID();
          const helper = path.join(directory, "portable-update.ps1");
          fs.copyFileSync(
            path.join(this.options.resources, "portable-update.ps1"),
            helper,
          );
          const job = path.join(directory, token + ".json");
          fs.writeFileSync(
            job,
            JSON.stringify({
              target: this.options.portable,
              version: this.manifest!.version,
              source: this.downloaded,
              sha256: this.manifest!.assets.find(
                (a) => a.name === this.selected!.name,
              )!.sha256,
              pid: process.pid,
              profile: this.options.profile,
              token,
            }),
            { flag: "wx" },
          );
          const child = spawn(
            "powershell.exe",
            [
              "-NoProfile",
              "-NonInteractive",
              "-ExecutionPolicy",
              "Bypass",
              "-File",
              helper,
              "-JobFile",
              job,
            ],
            { detached: true, windowsHide: true, stdio: "ignore" },
          );
          await new Promise<void>((resolve, reject) => {
            child.once("spawn", resolve);
            child.once("error", reject);
          });
          child.unref();
          this.options.exit();
        } else {
          const directory = path.join(this.options.profile, "updates");
          fs.mkdirSync(directory, { recursive: true });
          const helper = path.join(directory, "installed-restart.ps1"),
            job = path.join(directory, randomUUID() + ".json");
          fs.copyFileSync(
            path.join(this.options.resources, "installed-restart.ps1"),
            helper,
          );
          fs.writeFileSync(
            job,
            JSON.stringify({
              target: this.options.executable,
              profile: this.options.profile,
              pid: process.pid,
              installer: this.downloaded,
              version: this.manifest!.version,
            }),
            { flag: "wx" },
          );
          const child = spawn(
            "powershell.exe",
            [
              "-NoProfile",
              "-NonInteractive",
              "-ExecutionPolicy",
              "Bypass",
              "-File",
              helper,
              "-JobFile",
              job,
            ],
            { detached: true, windowsHide: true, stdio: "ignore" },
          );
          await new Promise<void>((resolve, reject) => {
            child.once("spawn", resolve);
            child.once("error", reject);
          });
          child.unref();
          this.updater!.quitAndInstall(true, false);
        }
      });
      return this.state;
    } catch (e) {
      this.publish({
        ...base,
        phase: this.download.signal.aborted ? "available" : "error",
        error: this.download.signal.aborted ? undefined : String(e),
      });
      throw e;
    } finally {
      this.download = undefined;
    }
  }
}
