const { execFile } = require("node:child_process");
let cached;
module.exports = function systemFonts() {
  if (cached) return cached;
  if (process.platform !== "win32") return Promise.resolve([]);
  cached = new Promise((resolve, reject) => {
    // Static script only; no renderer supplied strings are executed.
    const script =
      "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); Add-Type -AssemblyName System.Drawing; $fontCollection = [System.Drawing.Text.InstalledFontCollection]::new(); try { ConvertTo-Json -Compress -InputObject @($fontCollection.Families | ForEach-Object { $_.Name } | Sort-Object -Unique) } finally { $fontCollection.Dispose() }";
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        windowsHide: true,
        timeout: 15000,
        maxBuffer: 2 * 1024 * 1024,
        encoding: "utf8",
      },
      (error, output) => {
        if (error) {
          cached = undefined;
          reject(error);
          return;
        }
        try {
          const names = JSON.parse(output.replace(/^\uFEFF/, ""));
          resolve(
            Array.isArray(names)
              ? names.filter((n) => typeof n === "string")
              : [],
          );
        } catch (error) {
          cached = undefined;
          reject(error);
        }
      },
    );
  });
  return cached;
};
