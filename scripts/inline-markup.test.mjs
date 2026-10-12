import test from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
function load(entry) {
  const outfile = path.resolve(
    "outputs/tests/inline-" + path.basename(entry) + ".cjs",
  );
  buildSync({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    format: "cjs",
  });
  return require(outfile);
}
const {
  scanMarkup,
  markupCompletion,
  markupDiagnostics,
  needsMarkupCloser,
  markupPropertyCompletion,
} = load("app/inline-markup.ts");
const { inlineSnippet, builtinInline } = load("app/inline-catalog.ts");
const { parse, validateCommand } = load("app/parser.ts");
const { commandCatalog, findCommand } = load("app/command-catalog.ts");
const { validateCommands } = load("app/workspace/engine.ts");
const { schemas } = load("desktop/mcp/schemas.ts");
const paired = {
  name: "wave",
  description: "Wave",
  params: [],
  example: "",
  inline: true,
  markupMode: "paired",
};
const single = {
  name: "flash",
  description: "Flash",
  params: [
    { name: "flash", type: "number", required: true, defaultValue: "100" },
  ],
  example: "",
  inline: true,
  markupMode: "selfClosing",
};
const commands = [paired, single];

test("scan escaped, literal, expression and command regions without inventing markup", () => {
  assert.deepEqual(
    scanMarkup(String.raw`Text \[wave] <<cmd "[wave]">> {"[wave]"} // [wave]`),
    [],
  );
  assert.deepEqual(
    scanMarkup("[nomarkup][wave] [pause=500 /][/nomarkup]").map((t) => t.name),
    ["nomarkup", "nomarkup"],
  );
  const tags = scanMarkup('Mira: [wave title="a ] b" count={$n + 1}]hi[/wave]');
  assert.equal(tags.length, 2);
  assert.equal(tags[0].properties[0].value, '"a ] b"');
  assert.equal(tags[0].properties[1].value, "{$n + 1}");
});

test("completion respects escapes, comments, nomarkup and brackets already inserted", () => {
  assert.equal(markupCompletion("Hello [pa]", 9, commands).to, 10);
  assert.equal(markupCompletion("Hello \\[pa", 10, commands), null);
  assert.equal(markupCompletion("// [pa", 6, commands), null);
  assert.equal(markupCompletion("[nomarkup][pa", 12, commands), null);
  const rawClosing = "[nomarkup][raw][/no";
  assert.deepEqual(
    markupCompletion(rawClosing, rawClosing.length, commands).options.map(
      (c) => c.name,
    ),
    ["nomarkup"],
  );
  const closingText = "[wave][b]hi[/wave][/";
  const close = markupCompletion(closingText, closingText.length, commands);
  assert.deepEqual(
    close.options.map((c) => c.name),
    ["b"],
  );
  assert.equal(needsMarkupCloser("[wa]text[/wave]", 4, "wave"), false);
  assert.equal(needsMarkupCloser("[wa]text", 4, "wave"), true);
  const edited = markupCompletion("[wa rate=2]text[/wave]", 3, commands);
  assert.equal(edited.to, 11);
  assert.equal(edited.properties, " rate=2");
  assert.equal(
    inlineSnippet(paired, "", "monaco", false, edited.properties),
    "[wave rate=2]$0",
  );
});

test("registered markup checks named properties, shapes and overlapping ranges", () => {
  assert.deepEqual(
    markupDiagnostics("[wave][b]hi[/wave][/b] [flash=20 /]", [
      ...commands,
      { ...paired, name: "b" },
    ]),
    [],
  );
  assert.deepEqual(
    markupDiagnostics("[wave][b]hi[/]", [
      ...commands,
      { ...paired, name: "b" },
    ]),
    [],
  );
  assert.deepEqual(
    markupDiagnostics('[select value={$kind} yes="yes" no="no" /]', commands),
    [],
  );
  assert.deepEqual(
    markupDiagnostics('[select value=2 2="two" /]', commands),
    [],
  );
  assert.deepEqual(
    markupDiagnostics('[plural value=2 other="% items" /]', commands),
    [],
  );
  assert.deepEqual(
    markupDiagnostics('[plural value=1 one="an item" /]', commands),
    [],
  );
  for (const [text, code] of [
    ["[wave]", "markup.unclosed"],
    ["[/wave]", "markup.unmatched"],
    ["[wave /]", "markup.mode"],
    ["[flash /]", "markup.required"],
    ['[flash="bad" /]', "markup.type"],
    ["[flash=1 flash=2 /]", "markup.duplicate"],
    ["[flash=1 bogus=2 /]", "markup.property"],
    ['[flash="unfinished]', "markup.invalid"],
  ])
    assert(
      markupDiagnostics(text, commands).some((d) => d.code === code),
      text,
    );
});

test("shared catalog keeps normal command lookup separate and preserves old definitions", () => {
  const old = { name: "legacy", description: "", example: "", params: [] };
  assert.equal(validateCommand(old, []), "");
  const legacyPause = { ...old, name: "pause" };
  assert.equal(validateCommand(legacyPause, []), "");
  assert.equal(findCommand("pause", [legacyPause]), legacyPause);
  assert(
    commandCatalog([legacyPause]).some((c) => c.name === "pause" && !c.inline),
  );
  validateCommands([old, ...commands]);
  assert.equal(findCommand("wave", commands), undefined);
  assert.equal(findCommand("wave", commands, true).name, "wave");
  assert(
    commandCatalog(commands).some(
      (c) => c.name === "pause" && c.inline && c.builtin,
    ),
  );
  for (const builtin of builtinInline)
    assert.notEqual(validateCommand(builtin, []), "");
  assert.throws(() => validateCommands([{ ...paired, markupMode: undefined }]));
  assert.throws(() => validateCommands([{ ...old, markupMode: "paired" }]));
});

test("parser publishes source ranges and does not accept inline registrations as commands", () => {
  const text = 'title: Start\n---\nMira: [flash="bad" /]\n<<wave>>\n===\n';
  const result = parse([{ name: "test.yarn", text, saved: text }], commands);
  const issue = result.issues.find((d) => d.code === "markup.type");
  assert.equal(issue.column, 7);
  assert.equal(issue.line, 3);
  assert(result.issues.some((d) => d.code === "diagnostic.f9bb37d04146"));
});

test("snippets leave parameter values empty, finish inside paired markup and escape selected text", () => {
  assert.equal(inlineSnippet(single), "[flash=${1:} /]$0");
  assert.equal(inlineSnippet(paired), "[wave]$0[/wave]");
  assert.equal(inlineSnippet(paired, "", "monaco", false), "[wave]$0");
  assert.equal(
    inlineSnippet(paired, "$gold", "codemirror"),
    "[wave]$gold${0}[/wave]",
  );
  assert.equal(
    inlineSnippet(paired, "$gold", "monaco"),
    "[wave]\\$gold$0[/wave]",
  );
});

test("bare opener completion never replaces following dialogue", () => {
  for (const text of ["[後面的文字", "[hello world", "[你好[wave]text[/wave]"])
    assert.equal(markupCompletion(text, 1, commands).to, 1, text);
  assert.equal(markupCompletion("[]後文", 1, commands).to, 2);
  assert.equal(markupCompletion("[wa]後文", 2, commands).to, 4);
  assert.equal(markupCompletion("[pa /]後文", 3, commands).to, 6);
});

test("inline help recognizes empty, unfinished and reordered named values", () => {
  const { emptyParameterHint, commandHover, inlineParameterLabels } = load(
    "app/command-hints.ts",
  );
  assert.equal(emptyParameterHint("[flash= /]", 7, commands).index, 0);
  assert.equal(emptyParameterHint("[flash=20 /]", 7, commands), null);
  const character = '[character name=""]text[/character]';
  assert.equal(emptyParameterHint(character, 17, commands).index, 0);
  assert.equal(
    commandHover('[character name="unfinished', 20, commands).parameterIndex,
    0,
  );
  const labels = inlineParameterLabels("[flash=20 /]", commands);
  assert.equal(labels[0].label, "flash");
  assert.equal(labels[0].shorthand, true);
  const move = {
    ...paired,
    name: "move",
    params: ["x", "y"].map((name) => ({
      name,
      type: "number",
      required: true,
      defaultValue: "",
    })),
  };
  const slots = "[move x= y=]body[/move]";
  assert.equal(
    emptyParameterHint(slots, slots.indexOf("x=") + 2, [move]).index,
    0,
  );
  assert.equal(
    emptyParameterHint(slots, slots.indexOf("y=") + 2, [move]).index,
    1,
  );
});

test("property completion only offers missing definitions outside values", () => {
  assert.deepEqual(
    markupPropertyCompletion("[character ", 11, commands).parameters.map(
      (p) => p.name,
    ),
    ["name"],
  );
  for (const text of [
    '[character name="unfinished ',
    "[character name={$foo ",
    "[nomarkup][character ",
    "// [character ",
  ])
    assert.equal(
      markupPropertyCompletion(text, text.length, commands),
      null,
      text,
    );
  const text = '[character name="Mira" ';
  assert.deepEqual(
    markupPropertyCompletion(text, text.length, commands).parameters,
    [],
  );
});

test("unknown markup quick fixes infer shapes and literal parameter types without registering", () => {
  const { unregisteredCommand } = load("app/command-quick-fix.ts");
  const text = '[shake speed=2 enabled=true style="soft"]text[/shake]';
  const candidate = unregisteredCommand(text, 3, commands);
  assert.equal(candidate.command.inline, true);
  assert.equal(candidate.command.markupMode, "paired");
  assert.deepEqual(
    candidate.command.params.map((p) => [p.name, p.type]),
    [
      ["speed", "number"],
      ["enabled", "boolean"],
      ["style", "string"],
    ],
  );
  assert.equal(
    unregisteredCommand(text, text.length - 3, commands).command.name,
    "shake",
  );
  assert.equal(
    unregisteredCommand("[shake=2 /]", 2, commands).command.markupMode,
    "selfClosing",
  );
  const nested = "[shake speed=1]outer[shake speed=2]inner[/shake]tail[/shake]";
  assert.equal(
    unregisteredCommand(nested, nested.length - 3, commands).command.example,
    nested,
  );
  assert.equal(
    unregisteredCommand("[shake]ok[/shake][/shake]", 20, commands),
    null,
  );
  const decimals = "[shake speed=.5 enabled=TRUE /]";
  const definition = unregisteredCommand(decimals, 3, []).command;
  assert.deepEqual(
    definition.params.map((p) => p.type),
    ["number", "boolean"],
  );
  assert.deepEqual(markupDiagnostics(decimals, [definition]), []);
  for (const raw of [
    "[pause=5 /]",
    "[wave]text[/wave]",
    "// [shake /]",
    "[nomarkup][shake /][/nomarkup]",
    "\\[shake /]",
  ])
    assert.equal(
      unregisteredCommand(raw, raw.indexOf("shake") + 1, commands),
      null,
      raw,
    );
});

test("MCP registration schema retains inline metadata and rejects invalid enum values", () => {
  const request = {
    editorSessionId: "session",
    snapshotId: "snapshot",
    commands,
  };
  assert.deepEqual(schemas.update_commands.parse(request).commands, commands);
  assert.throws(() =>
    schemas.update_commands.parse({
      ...request,
      commands: [{ ...paired, markupMode: "invalid" }],
    }),
  );
});
