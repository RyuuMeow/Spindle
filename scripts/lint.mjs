import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { ESLint } from "eslint";
// Enumerate versioned and new source files without traversing generated output or
// unrelated directory entries in the checkout (including malformed Windows names).
const files = execFileSync(
  "git",
  [
    "-c",
    `safe.directory=${process.cwd().replaceAll("\\", "/")}`,
    "ls-files",
    "--cached",
    "--others",
    "--exclude-standard",
    "-z",
  ],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(
    (file) =>
      /\.(cjs|mjs|js|ts|tsx)$/.test(file) &&
      fs.existsSync(file) &&
      !file.startsWith("public/"),
  );
const eslint = new ESLint({ globInputPaths: false, warnIgnored: false });
const results = await eslint.lintFiles(files);
process.stdout.write((await eslint.loadFormatter("stylish")).format(results));
process.exitCode = results.some((result) => result.errorCount) ? 1 : 0;
