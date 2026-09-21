import test from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
const output = path.resolve("outputs/tests/command-hints.cjs");
fs.mkdirSync(path.dirname(output), { recursive: true });
buildSync({
  entryPoints: ["app/command-hints.ts"],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "cjs",
});
const {
  commandInput,
  emptyParameterHint,
  atCommandCloser,
  argumentSpans,
  commandCall,
  commandHover,
  commandLabel,
  parameterLabel,
} = createRequire(import.meta.url)(output);
const commands = [
  {
    name: "play_sound",
    displayName: "播放音效",
    description: "播放指定音效",
    params: [
      {
        name: "asset",
        displayName: "音效",
        type: "string",
        required: true,
        description: "資源名稱",
      },
      {
        name: "volume",
        displayName: "音量",
        type: "number",
        required: false,
        description: "0 到 1",
      },
    ],
  },
];
test("source spans preserve quotes, escapes and grouped expressions", () => {
  const text = '"wind \\"night\\"" {$volume * (1 + 2)}';
  const spans = argumentSpans(text, 7);
  assert.equal(spans.length, 2);
  assert.deepEqual(
    spans.map((s) => text.slice(s.from - 7, s.to - 7)),
    ['"wind \\"night\\""', "{$volume * (1 + 2)}"],
  );
});
test("ambiguous or unfinished arguments never get guessed labels", () => {
  for (const text of ['"wind', "{1 + 2", "(1]", "1 + 2"])
    assert.equal(argumentSpans(text), null);
});
test("ignore ordinary prose, comments and unknown commands", () => {
  for (const line of [
    "Narrator: play_sound",
    '// <<play_sound "wind">>',
    "<<unknown 1>>",
  ])
    assert.equal(commandCall(line, commands), null);
});
test("quoted closing delimiters do not terminate commands", () => {
  const call = commandCall(
    '  <<play_sound "wind >> sea" 0.5>> // hi',
    commands,
  );
  assert.equal(call.args.length, 2);
  assert.equal(call.nameFrom, 4);
});
test("hover explains positional argument display name and description", () => {
  const line = '<<play_sound "wind" 0.5>>';
  assert.match(
    commandHover(line, line.indexOf("0.5"), commands).text,
    /音量.*第 2 個參數/,
  );
  assert.match(
    commandHover(line, line.indexOf("wind"), commands).text,
    /資源名稱/,
  );
  assert.match(commandHover(line, 3, commands).text, /播放音效 · play_sound/);
});
test("legacy definitions keep machine names as display fallback", () => {
  assert.equal(commandLabel({ name: "fade_in" }), "fade_in");
  assert.equal(
    parameterLabel({ name: "duration", displayName: "  " }),
    "duration",
  );
});

test("structured help carries metadata and escapes project Markdown", () => {
  const { commandMarkdown } = createRequire(import.meta.url)(output);
  const hover = commandHover('<<play_sound "wind" 0.8>>', 5, commands);
  assert.equal(hover.command.displayName, "播放音效");
  assert.equal(hover.parameterIndex, -1);
  const markup = commandMarkdown({
    ...commands[0],
    description: "[unsafe](command:run) <script>",
  });
  assert(markup.includes("| # | 參數 |"));
  assert(markup.includes("`play_sound`"));
  assert(!markup.includes("[unsafe](command:run)"));
  assert(!markup.includes("<script>"));
  const argument = commandHover('<<play_sound "wind" 0.8>>', 20, commands);
  assert.equal(argument.parameterIndex, 1);
});

const linkOutput = path.resolve("outputs/tests/scene-link.cjs");
buildSync({
  entryPoints: ["app/scene-link.ts"],
  outfile: linkOutput,
  bundle: true,
  platform: "node",
  format: "cjs",
});
const { sceneLink } = createRequire(import.meta.url)(linkOutput);
test("static transfer links preserve exact target source ranges", () => {
  for (const text of [
    "    <<jump _Start>>",
    "<<detour Village>> // jump Other",
  ]) {
    const link = sceneLink(text);
    assert(link);
    assert.equal(text.slice(link.from, link.to), link.name);
  }
});
test("dynamic, incomplete and commented targets never become scene links", () => {
  for (const text of [
    "// <<jump Village>>",
    "Narrator: <<jump Village>>",
    "<<jump {$target}>>",
    "<<jump Village",
    "<<jump Village extra>>",
  ])
    assert.equal(sceneLink(text), null);
});

test("completion stops at the name and tracks incomplete positional arguments", () => {
  for (const text of ["<<", "<<fa", "  <<play_sound"])
    assert.deepEqual(commandInput(text), { kind: "name" });
  for (const [text, index] of [
    ["<<play_sound ", 0],
    ['<<play_sound "wind ', 0],
    ['<<play_sound "wind >> sea" ', 1],
    ["<<play_sound (1 + ", 0],
    ["<<play_sound (1 + 2)   ", 1],
    ['<<play_sound "wind" 0.', 1],
  ]) {
    assert.deepEqual(commandInput(text), {
      kind: "argument",
      name: "play_sound",
      index,
    });
  }
  for (const text of [
    "// <<play_sound ",
    "Mira: <<play_sound ",
    '<<play_sound "wind" >>',
    "<<fade_in>> ",
  ])
    assert.equal(commandInput(text), null);
});

test("closing pair skipping only recognizes delimiters outside strings", () => {
  const text = '  <<play_sound "literal >>" 0.6>>';
  assert.equal(atCommandCloser(text, text.indexOf(">>")), false);
  assert.equal(atCommandCloser(text, text.lastIndexOf(">>")), true);
  assert.equal(atCommandCloser(text, text.lastIndexOf(">>") + 1), true);
  assert.equal(atCommandCloser("// <<fade_in 2>>", 14), false);
  assert.equal(atCommandCloser('<<play_sound "unfinished >>', 24), false);
});

const catalogOutput = path.resolve("outputs/tests/command-catalog.cjs");
buildSync({
  entryPoints: ["app/command-catalog.ts"],
  outfile: catalogOutput,
  bundle: true,
  platform: "node",
  format: "cjs",
});
const { builtinCommands } = createRequire(import.meta.url)(catalogOutput);
test("all supported builtins carry readable syntax and parameter descriptions", () => {
  assert.equal(builtinCommands.length, 14);
  for (const c of builtinCommands) {
    assert(c.description && c.syntax && c.example, c.name);
    for (const p of c.params) assert(p.description && p.type, c.name);
  }
  assert.equal(commandHover("<<wait 0.5>>", 3, []).command.builtin, true);
  assert.match(commandHover("<<wait 0.5>>", 8, []).text, /秒數/);
});
test("built-in expressions stay one semantic argument regardless of spaces", () => {
  for (const prefix of [
    "<<if $gold >= 5 and ",
    "<<elseif $x == true ",
    "<<once if $x && ",
    "<<call max(1, 2) ",
  ])
    assert.equal(commandInput(prefix).index, 0, prefix);
  for (const prefix of [
    "<<set $gold = ",
    "<<set $gold to $gold + ",
    "<<set $gold += 2 ",
    '<<declare $name = "a b" as string',
  ])
    assert.equal(commandInput(prefix).index, 1, prefix);
  const line = "<<set $gold = $gold + 2>>";
  const call = commandCall(line, []);
  assert.deepEqual(
    call.args.map((a) => line.slice(a.from, a.to)),
    ["$gold", "$gold + 2"],
  );
  assert.equal(commandHover(line, line.indexOf("+"), []).parameterIndex, 1);
});
const variableOutput = path.resolve("outputs/tests/variable-completion.cjs");
buildSync({
  entryPoints: ["app/variable-completion.ts"],
  outfile: variableOutput,
  bundle: true,
  platform: "node",
  format: "cjs",
});
const { collectVariables, variableCompletionContext } = createRequire(
  import.meta.url,
)(variableOutput);
test("project variable index prefers declarations, deduplicates and excludes prose/comments", () => {
  const values = collectVariables([
    {
      name: "a.yarn",
      text: '<<set $gold = 2>>\n// <<declare $fake = 1>>\nNarrator: $literal\n<<play_sound "$quoted">>\n<<set $implicit to false>>',
    },
    {
      name: "folder/b.yarn",
      text: '\ufeff/// 金幣數量\r\n<<declare $gold = 12>>\r\n<<declare $rich = $gold > 10>>\r\n<<declare $name = "Hero" as string>>\r\n<<declare $unfinished = ',
    },
  ]);
  assert.deepEqual(
    values.map((v) => v.name),
    ["$gold", "$implicit", "$name", "$rich"],
  );
  assert.equal(values[0].file, "folder/b.yarn");
  assert.equal(values[0].description, "金幣數量");
  assert.equal(values[0].type, "number");
  assert.equal(values.find((v) => v.name === "$rich").readOnly, true);
  assert.equal(values.find((v) => v.name === "$name").readOnly, false);
});
test("variable completion only activates in real expression/assignment contexts", () => {
  for (const prefix of ["<<set ", "<<set $g", "<<set go"])
    assert.equal(variableCompletionContext(prefix).assignment, true, prefix);
  for (const prefix of [
    "<<if $g",
    "<<set $g = $o",
    "<<declare $g = $o",
    "Narrator: {$g",
    "-> 選项 <<if $g",
    "<<play_sound {$v",
  ])
    assert(variableCompletionContext(prefix), prefix);
  for (const prefix of [
    "// <<set $g",
    "Narrator: $g",
    '<<play_sound "$g',
    "<<declare $g",
    "tags: $g",
    "<<set $g = 1>> $g",
    "Narrator: \\{$g",
    '<<play_sound "text // $g',
  ])
    assert.equal(variableCompletionContext(prefix), null, prefix);
});

test("automatic parameter prompts only describe genuinely empty slots", () => {
  const cases = [
    ["<<play_sound |>>", 0],
    ['<<play_sound "wind" |>>', 1],
    ['<<play_sound "wind >> sea" |', 1],
    ["<<wait |>>", 0],
    ["<<set |>>", 0],
    ["<<set $gold = |>>", 1],
    ["<<set $gold += |>>", 1],
    ["<<declare $gold to |", 1],
    ["<<if |>>", 0],
    ["<<once if |>>", 0],
  ];
  for (const [marked, index] of cases) {
    const at = marked.indexOf("|"),
      text = marked.replace("|", "");
    assert.equal(emptyParameterHint(text, at, commands)?.index, index, marked);
  }
});

test("filled values on either side of caret never cause automatic prompts", () => {
  for (const marked of [
    '<<play_sound |"wind" 0.5>>',
    '<<play_sound "wind"| 0.5>>',
    '<<play_sound "wind" |0.5>>',
    '<<play_sound "wind" 0.|5>>',
    '<<play_sound "wind" 0.5|>>',
    '<<play_sound "wind" 0.5 |>>',
    '<<play_sound "unfinished |',
    '<<play_sound ""|>>',
    "<<play_sound {1 + |2}>>",
    "<<wait |0>>",
    "<<jump Village|>>",
    "<<set $gold|>>",
    "<<set $gold |>>",
    "<<set $gold | = 5>>",
    "<<set $gold = |5>>",
    "<<set $gold = $gold + |>>",
    "<<if $gold > 5 |>>",
    "<<once |>>",
    "<<once if |$gold>>",
    "<<return |>>",
    "<<unknown |>>",
    "// <<wait |>>",
    "Narrator: <<wait |>>",
    "<<wait >>|",
  ]) {
    const at = marked.indexOf("|"),
      text = marked.replace("|", "");
    assert.equal(emptyParameterHint(text, at, commands), null, marked);
  }
});

const quickOutput = path.resolve("outputs/tests/command-quick-fix.cjs");
buildSync({
  entryPoints: ["app/command-quick-fix.ts"],
  outfile: quickOutput,
  bundle: true,
  platform: "node",
  format: "cjs",
});
const { unregisteredCommand } = createRequire(import.meta.url)(quickOutput);
test("unknown command registration infers complete positional literals without changing source", () => {
  const text = '  <<show_item "red apple" 2 true $item>>';
  const result = unregisteredCommand(text, 10, []);
  assert.equal(result.command.name, "show_item");
  assert.deepEqual(
    result.command.params.map((p) => p.type),
    ["string", "number", "boolean", "string"],
  );
  assert.deepEqual(
    result.command.params.map((p) => p.name),
    ["arg1", "arg2", "arg3", "arg4"],
  );
  assert(result.command.params.every((p) => p.required));
  assert.equal(unregisteredCommand(text, 10, [result.command]), null);
});
test("quick registration rejects builtins, comments, incomplete calls and unrelated cursor positions", () => {
  for (const text of [
    "<<set $x = 1>>",
    "// <<unknown>>",
    "Narrator: <<unknown>>",
    '<<unknown "unfinished>>',
    "<<unknown",
    "<<unknown $a + 1>>",
  ])
    assert.equal(unregisteredCommand(text, 5, []), null, text);
  assert.equal(unregisteredCommand("    <<unknown>>", 1, []), null);
  assert.equal(
    unregisteredCommand("<<unknown>>", 4, []).command.params.length,
    0,
  );
});

buildSync({
  entryPoints: ["app/variable-quick-fix.ts"],
  outfile: "outputs/tests/variable-fix.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
});
const { missingDeclaration } = createRequire(import.meta.url)(
  path.resolve("outputs/tests/variable-fix.cjs"),
);
buildSync({
  entryPoints: ["app/parser.ts"],
  outfile: "outputs/tests/variable-parser.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
});
const variableParser = createRequire(import.meta.url)(
  path.resolve("outputs/tests/variable-parser.cjs"),
);
test("set requires declare across the entire project, independent of file order", () => {
  const doc = (name, body) => ({
    name,
    text: `title: ${name}\n---\n${body}\n===`,
    saved: "",
  });
  const use = doc("Use", "<<set $score = 12>>");
  assert(
    variableParser
      .parse([use], [])
      .issues.some(
        (i) => i.severity === "error" && i.message.includes("尚未宣告"),
      ),
  );
  const definition = doc("Definitions", "<<declare $score = 0>>");
  assert(
    !variableParser
      .parse([use, definition], [])
      .issues.some((i) => i.message.includes("尚未宣告")),
  );
  assert(
    !variableParser
      .parse([definition, use], [])
      .issues.some((i) => i.message.includes("尚未宣告")),
  );
});
test("declaration quick fix chooses literal defaults and does not guess unknown expressions", () => {
  assert.equal(
    missingDeclaration("  <<set $score += 2>>", 10, [])?.insert,
    "  <<declare $score = 0>>",
  );
  assert.equal(
    missingDeclaration('<<set $name = "Mira">>', 10, [])?.insert,
    '<<declare $name = "">>',
  );
  assert.equal(
    missingDeclaration("<<set $key = true>>", 10, [])?.insert,
    "<<declare $key = true>>",
  );
  assert.equal(
    missingDeclaration("<<set $v = unknown()>>", 10, [])?.insert,
    null,
  );
  assert.equal(missingDeclaration("// <<set $x = 2>>", 10, []), null);
  assert.equal(
    missingDeclaration("<<set $x = 2>>", 5, [{ name: "$x", declared: true }]),
    null,
  );
});

test("assignments use declared types across files, including expressions and compound assignments", () => {
  const doc = (name, text) => ({
    name,
    text: "title: " + name + "\n---\n" + text + "\n===",
    saved: "",
  });
  const definitions = doc(
    "Definitions",
    '<<declare $n = 0>>\n<<declare $b = true>>\n<<declare $s = "hello">>\n<<declare $derived = $n + 2>>',
  );
  for (const value of ['"wrong"', "true", "$b", "($n > 1)"]) {
    const issues = variableParser.parse(
      [doc("Use", "<<set $n = " + value + ">>"), definitions],
      [],
    ).issues;
    assert(
      issues.some((i) => i.severity === "error" && i.message.includes("指派")),
      value,
    );
  }
  for (const body of [
    "<<set $n = -2.5>>",
    "<<set $n += $derived * 2>>",
    "<<set $b = $n > 2>>",
    '<<set $s += " world">>',
    "<<set $n = unknown()>>",
  ]) {
    assert(
      !variableParser
        .parse([doc("Use", body), definitions], [])
        .issues.some((i) => i.message.includes("指派")),
      body,
    );
  }
  assert(
    variableParser
      .parse([definitions, doc("Use", "<<set $b += false>>")], [])
      .issues.some((i) => i.message.includes("指派")),
  );
});
test("variable metadata stays tied to declaration; reference hit test excludes prose, strings and comments", () => {
  const { variableAt } = createRequire(import.meta.url)(variableOutput);
  const vars = collectVariables([
    { name: "Use.yarn", text: '<<set $value = "wrong">>' },
    { name: "Defs.yarn", text: "<<declare $value = 12>>" },
  ]);
  assert.equal(vars[0].type, "number");
  assert.equal(vars[0].initialValue, "12");
  assert.equal(vars[0].file, "Defs.yarn");
  for (const text of [
    "<<set $value = 2>>",
    "Text: {$value}",
    "<<declare $value = 12>>",
    "<<if $value > 1>>",
  ]) {
    assert.equal(
      variableAt(text, text.indexOf("$value") + 2, vars)?.variable.file,
      "Defs.yarn",
      text,
    );
  }
  for (const text of [
    "Text: $value",
    "// <<set $value = 2>>",
    '<<set $s = "$value">>',
    'Text: {"$value"}',
    "title: $value",
  ]) {
    assert.equal(
      variableAt(text, text.indexOf("$value") + 2, vars),
      null,
      text,
    );
  }
});

test("bare assignment text reports invalid string syntax without guessing function types", () => {
  const types = new Map([
    ["$n", "number"],
    ["$b", "boolean"],
    ["$s", "string"],
  ]);
  for (const value of ["hi", "hello", "hello world", "你好"]) {
    assert.match(
      variableParser.assignmentTypeError("$n = " + value, types),
      /宣告為 number.*指派 string/,
    );
  }
  assert.match(
    variableParser.assignmentTypeError("$s = hello", types),
    /雙引號/,
  );
  assert.match(
    variableParser.assignmentTypeError("$b = hello", types),
    /宣告為 boolean.*指派 string/,
  );
  assert.equal(
    variableParser.assignmentTypeError("$unknown = hello", types),
    null,
  );
  assert.match(
    variableParser.assignmentTypeError('$n = "hello"', types),
    /指派 string/,
  );
  assert.equal(
    variableParser.assignmentTypeError("$n = unknown()", types),
    null,
  );
  assert.equal(variableParser.assignmentTypeError("$n = 12", types), null);
});

test("quote fix replaces only bare assignment values", () => {
  const { variableQuickFix } = createRequire(import.meta.url)(
    path.resolve("outputs/tests/variable-fix.cjs"),
  );
  const line = "  <<set $n = hello world>> // note";
  const fix = variableQuickFix(line, 10, [
    { name: "$n", declared: true, type: "string" },
  ]);
  for (const type of ["number", "boolean"])
    assert.equal(
      variableQuickFix(line, 10, [{ name: "$n", declared: true, type }]).insert,
      type === "number" ? "0" : "true",
    );
  assert.equal(
    variableQuickFix(line, 10, [
      { name: "$n", declared: true, type: "expression" },
    ]),
    null,
  );
  assert.equal(
    line.slice(0, fix.from) + fix.insert + line.slice(fix.to),
    '  <<set $n = "hello world">> // note',
  );
  assert.equal(fix.label, "補上雙引號");
  for (const text of [
    "<<set $n = unknown()>>",
    "<<set $n = true and false>>",
    "<<set $n = not false>>",
    "<<set $n = $other>>",
    "// <<set $n = hello>>",
  ])
    assert.equal(variableQuickFix(text, 10, [])?.replace ?? false, false);
});

test("quick fixes repair missing variable prefixes, typed values and missing arguments", () => {
  const { variableQuickFix } = createRequire(import.meta.url)(
    path.resolve("outputs/tests/variable-fix.cjs"),
  );
  const vars = [
    { name: "$n", type: "number", declared: true },
    { name: "$flag", type: "boolean", declared: true },
    { name: "$s", type: "string", declared: true },
  ];
  const repair = (line, commands = []) => {
    const fix = variableQuickFix(line, 4, vars, commands);
    assert(fix, line);
    return line.slice(0, fix.from) + fix.insert + line.slice(fix.to);
  };
  assert.equal(repair("<<declare count = 0>>"), "<<declare $count = 0>>");
  assert.equal(repair("<<set n = 2>>"), "<<set $n = 2>>");
  assert.equal(repair("<<set $n = n + 1>>"), "<<set $n = $n + 1>>");
  assert.equal(repair("<<if flag>>"), "<<if $flag>>");
  assert.equal(repair("Narrator: {n}"), "Narrator: {$n}");
  assert.equal(repair("<<set $n = hello>>"), "<<set $n = 0>>");
  assert.equal(repair("<<set $s = 12>>"), '<<set $s = "">>');
  assert.equal(repair("<<set $flag = 12>>"), "<<set $flag = true>>");
  assert.equal(repair("<<set $n = >>"), "<<set $n = 0>>");
  assert.equal(repair("<<declare $fresh>>"), "<<declare $fresh = 0>>");
  const commands = [
    {
      name: "test",
      params: [
        { name: "duration", type: "number", required: true },
        { name: "enabled", type: "boolean", required: true },
      ],
    },
  ];
  assert.equal(repair('<<test "bad" true>>', commands), "<<test 0 true>>");
  assert.equal(repair("<<test>>", commands), "<<test 0 true>>");
  assert.equal(repair("<<if>>"), "<<if true>>");
  assert.equal(repair("<<elseif 12>>"), "<<elseif true>>");
  assert.equal(repair("<<wait>>"), "<<wait 0>>");

  const unknownVars = [
    ...vars,
    { name: "$computed", type: "expression", declared: true },
  ];
  assert.equal(
    variableQuickFix("<<set $n = $computed>>", 4, unknownVars),
    null,
  );
  assert.equal(
    variableQuickFix("<<test $computed true>>", 4, unknownVars, commands),
    null,
  );

  for (const text of [
    "Narrator: n",
    "<<jump n>>",
    '<<set $s = "n">>',
    "// <<set n = 2>>",
  ])
    assert.equal(variableQuickFix(text, 4, vars), null, text);
  assert.deepEqual(
    variableParser
      .missingVariablePrefixes("<<if n > 1>>", ["$n"])
      .map((h) => h.name),
    ["n"],
  );
});
test("scene hover resolves unique locations only", () => {
  const { sceneAt } = createRequire(import.meta.url)(linkOutput);
  const scenes = [{ name: "Village", file: "chapter.yarn", start: 15 }];
  assert.equal(sceneAt("<<jump Village>>", 9, scenes).scene.start, 15);
  assert.equal(sceneAt("<<jump Village>>", 9, [...scenes, ...scenes]), null);
  assert.equal(sceneAt("Narrator: Village", 10, scenes), null);
});
