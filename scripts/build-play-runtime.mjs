import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const local = path.join(root, "outputs", "dotnet", process.platform === "win32" ? "dotnet.exe" : "dotnet");
const dotnet = process.env.SPINDLE_DOTNET || (fs.existsSync(local) ? local : "dotnet");
const args = process.argv.includes("--publish")
  ? ["publish", "desktop/play-runtime/Spindle.Play.csproj", "-c", "Release", "-r", "win-x64", "--self-contained", "true", "-o", "dist-desktop/app/desktop/play-runtime", "-p:DebugType=None", "-p:DebugSymbols=false"]
  : ["build", "desktop/play-runtime/Spindle.Play.csproj", "-c", "Release"];
execFileSync(dotnet, [...args, "--verbosity", "quiet", "-p:EnableNETAnalyzers=false"], { cwd: root, stdio: "inherit", windowsHide: true, env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" } });
