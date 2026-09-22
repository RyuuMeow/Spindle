import fs from "node:fs";
const file = new URL("../version.json", import.meta.url);
const version = JSON.parse(
  fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""),
).version;
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version))
  throw Error("Invalid product version");
const pkgPath = new URL("../package.json", import.meta.url),
  pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
if (process.argv.includes("--check")) {
  if (pkg.version !== version)
    throw Error("package.json does not match version.json");
} else {
  pkg.version = version;
  pkg.name = "spindle";
  pkg.license = "GPL-3.0-only";
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}
console.log(version);
