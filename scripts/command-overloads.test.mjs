import test from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url);
function load(entry) {
  const outfile = path.resolve(
    "outputs/tests/overloads-" + path.basename(entry) + ".cjs",
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
const { parse, validateCommand } = load("app/parser.ts");
const { validateCommands } = load("app/workspace/engine.ts");
const { commandKey, accepts } = load("app/command-overloads.ts");
const { markupDiagnostics, markupCompletion, markupPropertyCompletion } = load(
  "app/inline-markup.ts",
);
const { commandCall, commandHover, emptyParameterHint } = load(
  "app/command-hints.ts",
);
const { commandCompletionCatalog } = load("app/command-catalog.ts");
const { commandValueCompletion } = load("app/command-values.ts");
const { schemas } = load("desktop/mcp/schemas.ts");
const { variableQuickFix } = load("app/variable-quick-fix.ts");
const { collectVariables } = load("app/variable-completion.ts");
const parameter = (type, extra = {}) => ({
  name: "value",
  type,
  required: true,
  defaultValue: "",
  ...extra,
});
const command = (name, params, extra = {}) => ({
  name,
  params,
  description: "",
  example: "",
  ...extra,
});
const pause = command(
  "pause",
  [
    parameter("string", {
      name: "pause",
      allowList: ["short", "normal", "long"],
    }),
  ],
  { inline: true, markupMode: "selfClosing" },
);
const issues = (body, commands) => {
  const text = `title: Start\n---\n${body}\n===`;
  return parse([{ name: "test.yarn", text, saved: text }], commands).issues;
};

test("builtin inline and custom positional definitions support independent overloads", () => {
  const defs = [pause, command("pause", [parameter("boolean")])];
  validateCommands(defs);
  for (const text of [
    "[pause=500/]",
    "[pause=normal/]",
    '[pause="long"/]',
    "[pause={$speed}/]",
  ])
    assert.deepEqual(markupDiagnostics(text, defs), [], text);
  assert.equal(
    markupDiagnostics("[pause=nromal/]", defs)[0].code,
    "command.noMatch",
  );
  assert.equal(
    markupDiagnostics("[pause=true/]", defs)[0].code,
    "command.noMatch",
  );
  assert.equal(
    markupDiagnostics("[pause=normal]hi[/pause]", defs)[0].code,
    "command.noMatch",
  );
  assert.equal(
    markupDiagnostics("[pause=normal pause=long/]", defs)[0].code,
    "markup.duplicate",
  );
});

test("unknown markup is a ranged warning with escape and nomarkup exclusions", () => {
  const findings = issues(
    "Mira: [puase=normal/] [unknown]hi[/unknown] \\[escaped/] [nomarkup][literal/][/nomarkup]",
    [pause],
  );
  assert.deepEqual(
    findings.map((i) => [i.code, i.severity]),
    [
      ["markup.unknown", "warning"],
      ["markup.unknown", "warning"],
    ],
  );
  assert.equal(findings[0].column, 7);
  assert.equal(findings[0].endColumn, 22);
});

test("inline shorthand names the marker property, not an arbitrary first parameter", () => {
  const timed = { ...pause, params: [{ ...pause.params[0], name: "time" }] };
  assert.equal(
    markupDiagnostics("[pause=normal/]", [timed])[0].code,
    "command.noMatch",
  );
  assert.deepEqual(markupDiagnostics("[pause time=normal/]", [timed]), []);
  assert.deepEqual(markupDiagnostics("[pause=normal/]", [pause]), []);
});

test("positional matching combines arity, types, allow lists and number limits", () => {
  const defs = [
    command("move", [parameter("string", { allowList: ["home"] })]),
    command("move", [
      parameter("number", { min: 0, max: 5, integer: true }),
      parameter("boolean", { name: "fast" }),
    ]),
    command("move", [parameter("number", { min: 10, max: 20, integer: true })]),
  ];
  validateCommands(defs);
  for (const text of [
    '<<move "home">>',
    "<<move 0 true>>",
    "<<move 5 false>>",
    "<<move 10>>",
    "<<move 20>>",
  ])
    assert.deepEqual(issues(text, defs), [], text);
  for (const text of [
    "<<move 6 true>>",
    "<<move 1.5 true>>",
    "<<move 9>>",
    '<<move "away">>',
    "<<move>>",
    "<<move 10 false true>>",
  ])
    assert.equal(issues(text, defs)[0]?.code, "command.noMatch", text);
});

test("optional parameters retain defaults and duplicate signatures ignore metadata", () => {
  const first = command("move", [parameter("number")]);
  const second = command("move", [
    parameter("number"),
    parameter("string", {
      name: "mode",
      required: false,
      defaultValue: '"normal"',
      allowList: ["normal"],
    }),
  ]);
  validateCommands([first, second]);
  assert.deepEqual(issues("<<move 3>>", [second]), []);
  assert.notEqual(
    validateCommand(
      {
        ...first,
        description: "Changed",
        params: [{ ...first.params[0], name: "renamed" }],
      },
      [first],
    ),
    "",
  );
  const reordered = {
    ...pause,
    params: [{ ...pause.params[0], allowList: ["long", "short", "normal"] }],
  };
  assert.equal(commandKey(reordered), commandKey(pause));
  assert.notEqual(validateCommand(reordered, [pause]), "");
});

test("named signatures ignore property order but distinguish markup shape", () => {
  const first = command(
    "shape",
    [
      parameter("string", { name: "color" }),
      parameter("number", { name: "size" }),
    ],
    { inline: true, markupMode: "paired" },
  );
  const reordered = { ...first, params: [...first.params].reverse() };
  assert.equal(commandKey(first), commandKey(reordered));
  const single = { ...first, markupMode: "selfClosing", description: "single" };
  validateCommands([first, single]);
  assert.deepEqual(
    markupDiagnostics('[shape size=3 color="red"/]', [first, single]),
    [],
  );
  assert.equal(
    commandHover('[shape size=3 color="red"/]', 3, [first, single]).command
      .description,
    "single",
  );
});

test("limits reject invalid configuration and default values at persistence boundary", () => {
  for (const p of [
    parameter("number", { min: 2, max: 1 }),
    parameter("number", { min: 0.2, max: 0.8, integer: true }),
    parameter("number", { min: NaN }),
    parameter("number", { max: Infinity }),
    parameter("number", { integer: "yes" }),
    parameter("string", { min: 0 }),
    parameter("boolean", { allowList: ["true"] }),
    parameter("string", { allowList: ["a", "a"] }),
    parameter("string", { allowList: [1] }),
    parameter("number", { min: 1, defaultValue: "0", required: false }),
    parameter("string", {
      allowList: ["a"],
      defaultValue: '"b"',
      required: false,
    }),
  ])
    assert.throws(
      () => validateCommands([command("sample", [p])]),
      JSON.stringify(p),
    );
  validateCommands([
    command("sample", [parameter("string", { allowList: [] })]),
  ]);
});

test("number bounds include endpoints, support one-sided limits and integer checks", () => {
  const p = parameter("number", { min: -2, max: 2, integer: true });
  for (const v of ["-2", "0", "2", "2.0"]) assert(accepts(p, v), v);
  for (const v of ["-2.1", "2.1", "1.5"]) assert(!accepts(p, v), v);
  assert(accepts(parameter("number", { max: 0 }), "-99"));
  assert(accepts(parameter("number", { min: 0 }), "99"));
  assert(accepts(p, "$value"));
  assert(accepts(p, "{$value + 2}"));
});

test("dynamic expressions use known types without inventing values for limits", () => {
  const defs = [
    command("value", [parameter("string", { allowList: ["normal"] })]),
    command("value", [parameter("number", { min: 10 })]),
  ];
  assert.deepEqual(
    issues(
      '<<declare $n = 0>>\n<<declare $s = "other">>\n<<value $n>>\n<<value {$s}>>',
      defs,
    ),
    [],
  );
  assert.equal(
    issues("<<declare $b = true>>\n<<value $b>>", defs)[0]?.code,
    "command.noMatch",
  );
  // Every parameter must match the same overload, not a union of individual slots.
  const crossed = [
    command("pair", [
      parameter("string", { name: "a" }),
      parameter("number", { name: "b" }),
    ]),
    command("pair", [
      parameter("number", { name: "a" }),
      parameter("string", { name: "b" }),
    ]),
  ];
  assert.equal(
    issues("<<declare $n = 0>>\n<<pair $n 1>>", crossed)[0]?.code,
    "command.noMatch",
  );
});

test("wait supports extension while language control structures remain reserved", () => {
  const wait = command("wait", [
    parameter("string", { allowList: ["normal"] }),
  ]);
  validateCommands([wait]);
  assert.deepEqual(issues('<<wait 0.5>>\n<<wait "normal">>', [wait]), []);
  assert.equal(issues('<<wait "bad">>', [wait])[0]?.code, "command.noMatch");
  assert.notEqual(
    validateCommand(command("if", [parameter("string")]), []),
    "",
  );
});

test("help picks the matching signature, carries limits and groups completion names", () => {
  const defs = [
    command("go", [parameter("number")]),
    command("go", [parameter("string", { allowList: ["home"] })]),
  ];
  assert.equal(
    commandCall('<<go "home">>', defs).command.params[0].type,
    "string",
  );
  const hover = commandHover("[pause=normal/]", 9, [pause]);
  assert.equal(hover.command.params[0].type, "string");
  assert(hover.text.includes('"normal"'));
  assert.equal(
    commandCompletionCatalog(defs).filter((c) => c.name === "go").length,
    1,
  );
  assert.equal(
    commandCompletionCatalog(defs).find((c) => c.name === "go").overloads
      .length,
    2,
  );
  assert.equal(
    markupCompletion("[pau", 4, [pause]).options.filter(
      (c) => c.name === "pause",
    ).length,
    1,
  );
  assert.equal(
    emptyParameterHint("<<go >>", 5, defs).command.overloads.length,
    2,
  );
});

test("allow list completion replaces the whole token and filters quoted or bare prefixes", () => {
  for (const [text, offset] of [
    ["[pause=nromal/]", 8],
    ['[pause="nromal"/]', 9],
    ["[pause=]", 7],
  ]) {
    const c = commandValueCompletion(text, offset, [pause]);
    assert(c, text);
    assert(c.values.some((v) => v.label === "normal"));
    const selected = c.values.find((v) => v.label === "normal");
    assert.equal(
      text.slice(0, c.from) + selected.insertText + text.slice(c.to),
      '[pause="normal"' + (text.endsWith("/]") ? "/]" : "]"),
    );
  }
  const def = command("mode", [
    parameter("string", { allowList: ["normal", "slow motion", 'say "hi"'] }),
  ]);
  for (const text of ["<<mode n>>", '<<mode "n">>']) {
    const c = commandValueCompletion(text, text.indexOf("n") + 1, [def]);
    assert.deepEqual(
      c.values.map((v) => v.label),
      ["normal"],
    );
    assert.equal(
      text.slice(0, c.from) + c.values[0].insertText + text.slice(c.to),
      '<<mode "normal">>',
    );
  }
  assert.equal(commandValueCompletion("[pause={$value}/]", 12, [pause]), null);
  assert.equal(commandValueCompletion("<<mode $value>>", 12, [def]), null);
  const c = commandValueCompletion("<<mode >>", 7, [def]);
  assert.equal(
    c.values.find((v) => v.label === 'say "hi"').insertText,
    '"say \\"hi\\""',
  );
});

test("value and property completion narrow candidates using other parameters", () => {
  const defs = [
    command("choose", [
      parameter("number", { name: "kind" }),
      parameter("string", { name: "mode", allowList: ["numeric"] }),
    ]),
    command("choose", [
      parameter("string", { name: "kind" }),
      parameter("string", { name: "mode", allowList: ["text"] }),
    ]),
  ];
  const c = commandValueCompletion("<<choose 1 >>", 11, defs);
  assert.deepEqual(
    c.values.map((v) => v.label),
    ["numeric"],
  );
  const inline = defs.map((d) => ({
    ...d,
    inline: true,
    markupMode: "selfClosing",
  }));
  const text = "[choose kind=1 mode=]";
  assert.deepEqual(
    commandValueCompletion(text, text.length - 1, inline).values.map(
      (v) => v.label,
    ),
    ["numeric"],
  );
  const properties = markupPropertyCompletion("[choose kind=1 ", 15, inline);
  assert.deepEqual(
    properties.parameters.map((p) => p.name),
    ["mode"],
  );
});

test("MCP schema retains constraints and rejects non-finite numeric bounds", () => {
  const input = {
    editorSessionId: "s",
    snapshotId: "v",
    commands: [
      pause,
      command("count", [
        parameter("number", { min: 1, max: 10, integer: true }),
      ]),
    ],
  };
  assert.deepEqual(
    schemas.update_commands.parse(input).commands,
    input.commands,
  );
  assert.throws(() =>
    schemas.update_commands.parse({
      ...input,
      commands: [command("n", [parameter("number", { min: Infinity })])],
    }),
  );
});

test("quick fixes respect resolved overloads and never insert out-of-range defaults", () => {
  const defs = [
    command("choose", [parameter("string", { allowList: ["home"] })]),
    command("choose", [parameter("number", { min: 2, integer: true })]),
  ];
  const variables = collectVariables([
    { name: "test.yarn", text: "<<declare $n = 0>>" },
  ]);
  assert.equal(variableQuickFix("<<choose $n>>", 5, variables, defs), null);
  const missingString = variableQuickFix("<<choose>>", 5, [], [defs[0]]);
  assert.equal(missingString.insert, ' "home"');
  const missingNumber = variableQuickFix("<<choose>>", 5, [], [defs[1]]);
  assert.equal(missingNumber.insert, " 2");
});
