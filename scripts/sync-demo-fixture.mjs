import fs from "node:fs";
import path from "node:path";

const root = path.resolve("examples/demo-project/the-last-light");
const names = ["Chapter_01.yarn", "Lighthouse.yarn", "Shop.yarn"];
const metadata = JSON.parse(fs.readFileSync(path.join(root, ".spindle/project.json"), "utf8"));
if (metadata.id || metadata.files?.some((file) => file.id)) {
  throw Error("The portable demo must not contain fixed project or document IDs");
}
const sources = Object.fromEntries(names.map((name) => [name, fs.readFileSync(path.join(root, name), "utf8").replace(/\r\n/g, "\n")]));
const result = `// Generated from examples/demo-project/the-last-light. Run pnpm demo:sync.\nimport type { Command, Doc } from "../../app/parser";\nconst sources: Record<string, string> = ${JSON.stringify(sources, null, 2)};\nexport const initialDocs: Doc[] = Object.entries(sources).map(([name, text]) => ({ name, text, saved: text }));\nexport const initialCommands: Command[] = ${JSON.stringify(metadata.commands, null, 2)};\n`;
const output = path.resolve("scripts/fixtures/sample.ts");
if (process.argv.includes("--check")) {
  if (fs.readFileSync(output, "utf8").replace(/\r\n/g, "\n") !== result) throw Error("Demo fixture is out of sync; run pnpm demo:sync");
} else {
  fs.writeFileSync(output, result);
}
console.log(`Demo fixture ${process.argv.includes("--check") ? "matches" : "generated from"} ${root}`);
