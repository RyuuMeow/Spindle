import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";

function helper(t) {
  const local = path.resolve("outputs/dotnet/dotnet.exe");
  const child = spawn(
    process.env.SPINDLE_PLAY_EXECUTABLE ||
      process.env.SPINDLE_DOTNET ||
      (fs.existsSync(local) ? local : "dotnet"),
    process.env.SPINDLE_PLAY_EXECUTABLE
      ? []
      : [
          path.resolve(
            "desktop/play-runtime/bin/Release/net10.0/Spindle.Play.dll",
          ),
        ],
    { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
  );
  t.after(() => child.kill());
  const pending = new Map();
  let next = 0;
  createInterface({ input: child.stdout }).on("line", (line) => {
    const message = JSON.parse(line),
      item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    clearTimeout(item.timer);
    if (message.error) item.reject(Error(message.error));
    else item.resolve(message.result);
  });
  return (action, data = {}) =>
    new Promise((resolve, reject) => {
      const id = ++next,
        timer = setTimeout(() => reject(Error("helper timeout")), 10000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ id, action, ...data }) + "\n");
    });
}
const docs = (text) => [{ id: "doc", name: "Story.yarn", version: 2, text }];

test("UTF-8 BOM preserves titles, cross-file playback and original source offsets", async (t) => {
  const call = helper(t);
  const text =
    "\uFEFFtitle: Opening\r\n---\r\n// Test\r\n我叫山田智也\r\n<<portrait_show left heroine normal fade 0.25>>\r\n我: 很好！\r\n<<jump Next>>\r\n===";
  const second = "\uFEFFtitle: Next\n---\n內文\uFEFF保留 🌧️\n===";
  const compiled = await call("compile", {
    documents: [
      ...docs(text),
      { id: "second", name: "Next.yarn", version: 3, text: second },
    ],
  });
  assert.equal(compiled.status, "ready");
  assert.deepEqual(compiled.diagnostics, []);
  let state = await call("start", { scene: "Opening" });
  let line = state.events.find((e) => e.kind === "line");
  assert.equal(line.text, "我叫山田智也");
  assert.equal(line.source.from, text.indexOf("我叫"));
  assert.equal(line.source.line, 4);
  state = await call("next");
  assert.equal(
    state.events.filter((e) => e.kind === "line").at(-1).text,
    "我: 很好！",
  );
  state = await call("next");
  line = state.events.filter((e) => e.kind === "line").at(-1);
  assert.equal(line.text, "內文\uFEFF保留 🌧️");
  assert.equal(line.source.documentId, "second");
  assert.equal(line.source.from, second.indexOf("內文"));
  state = await call("start", {
    scene: "Opening",
    location: { documentId: "doc", line: 4 },
  });
  assert.equal(
    state.events.filter((e) => e.kind === "line").at(-1).source.from,
    text.indexOf("我叫"),
  );

  const invalid = "\uFEFFtitle: **Opening**\n---\nHello\n===";
  const failed = await call("compile", { documents: docs(invalid) });
  assert.equal(failed.status, "error");
  assert.equal(failed.diagnostics[0].source.from, invalid.indexOf("*"));
});
test("official compiler, choices, variable override, detour and rewind", async (t) => {
  const call = helper(t);
  let state = await call("compile", {
    documents: docs(
      "title: Start\n---\n<<declare $key = false>>\nMira: Hello\n-> Door <<if $key>>\n    <<detour Room>>\n-> Stay\n    Mira: Wait\nMira: End\n===\ntitle: Room\n---\nMira: Inside\n<<return>>\n===",
    ),
  });
  assert.deepEqual(state.diagnostics, []);
  state = await call("start", { scene: "Start" });
  assert.equal(state.status, "line");
  assert.equal(state.events.find((e) => e.kind === "line").source.line, 4);
  state = await call("next");
  assert.equal(state.status, "options");
  assert.equal(state.options[0].available, false);
  state = await call("setVariable", { name: "$key", value: true });
  assert.ok(state.options.length, JSON.stringify(state));
  assert.equal(state.options[0].available, true);
  state = await call("choose", { optionId: state.options[0].id });
  assert.equal(
    state.events.filter((e) => e.kind === "line").at(-1).text,
    "Mira: Inside",
  );
  state = await call("next");
  assert.equal(
    state.events.filter((e) => e.kind === "line").at(-1).text,
    "Mira: End",
  );
  state = await call("back");
  assert.equal(state.scene, "Room");
  state = await call("next");
  assert.equal(
    state.events.filter((e) => e.kind === "line").at(-1).text,
    "Mira: End",
  );
});
test("random results replay exactly and commands are events, not external effects", async (t) => {
  const call = helper(t);
  await call("compile", {
    documents: docs(
      "title: Start\n---\nA\n<<give_item key 1>>\nValue {random()}\n===",
    ),
  });
  await call("start", { scene: "Start" });
  const first = await call("next");
  await call("back");
  const second = await call("next");
  assert.deepEqual(first.events, second.events);
  assert.equal(first.events.filter((e) => e.kind === "command").length, 1);
});
test("invalid Yarn blocks running and infinite loops stop within budget", async (t) => {
  const call = helper(t);
  const invalid = await call("compile", {
    documents: docs(
      "title: Start\n---\n<<if unknown_function()>>\nA\n<<endif>>\n===",
    ),
  });
  assert.equal(invalid.status, "ready");
  const failed = await call("start", { scene: "Start" });
  assert.equal(failed.status, "error");
  await call("compile", {
    documents: docs("title: Start\n---\n<<jump Start>>\n==="),
  });
  const looping = await call("start", { scene: "Start" });
  assert.equal(looping.status, "error");
  assert.match(
    looping.events.at(-1).text,
    /INSTRUCTION_BUDGET_EXCEEDED|PLAY_EVENT_LIMIT_EXCEEDED/,
  );
});

test("UTF-8 stdio, CRLF, emoji, duplicate dialogue and assignment source mapping", async (t) => {
  const call = helper(t),
    text =
      "title: Start\r\n---\r\n<<declare $n = 0>>\r\nMira: 中文 👨‍👩‍👧‍👦\r\n<<set $n = 2>>\r\nMira: 中文 👨‍👩‍👧‍👦\r\n===";
  const compilation = await call("compile", { documents: docs(text) });
  assert.equal(compilation.status, "ready");
  const first = await call("start", { scene: "Start" });
  assert.equal(first.variables[0].initial, 0);
  assert.equal(
    first.events.find((e) => e.kind === "line").source.from,
    text.indexOf("Mira:"),
  );
  const second = await call("next");
  assert.equal(
    second.events.filter((e) => e.kind === "line").at(-1).source.line,
    6,
  );
  assert.equal(second.events.find((e) => e.kind === "variable").source.line, 5);
  const back = await call("back");
  assert.equal(back.variables[0].value, 0);
});

test("rewinding an option override restores its availability and permits a new branch", async (t) => {
  const call = helper(t);
  await call("compile", {
    documents: docs(
      "title: Start\n---\n<<declare $key = false>>\nHello\n-> Open <<if $key>>\n    Opened\n-> Leave\n    Left\n===",
    ),
  });
  await call("start", { scene: "Start" });
  await call("next");
  await call("setVariable", { name: "$key", value: true });
  let state = await call("back");
  assert.equal(state.options[0].available, false);
  state = await call("setVariable", { name: "$key", value: true });
  assert.equal(state.options[0].available, true);
  await call("choose", { optionId: 0 });
  state = await call("back");
  assert.equal(state.status, "options");
  state = await call("choose", { optionId: 1 });
  assert.equal(
    state.events.filter((e) => e.kind === "line").at(-1).text,
    "Left",
  );
  assert(!state.events.some((e) => e.text === "Opened"));
});

test("demo compiles and runs with official semantics; malformed source blocks start", async (t) => {
  const call = helper(t),
    dir = "examples/demo-project/the-last-light";
  const documents = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".yarn"))
    .map((name, i) => ({
      id: "demo-" + i,
      name,
      version: 0,
      text: fs.readFileSync(path.join(dir, name), "utf8"),
    }));
  let state = await call("compile", { documents });
  assert.equal(state.status, "ready", JSON.stringify(state.diagnostics));
  state = await call("start", { scene: "Start" });
  for (
    let i = 0;
    i < 100 && !["completed", "error"].includes(state.status);
    i++
  )
    state =
      state.status === "options"
        ? await call("choose", {
            optionId: state.options.find((o) => o.available).id,
          })
        : await call("next");
  assert.equal(
    state.status,
    "completed",
    JSON.stringify(state.events.slice(-5)),
  );
  state = await call("compile", {
    documents: docs("title: Bad\n---\n<<set $x = >>\n==="),
  });
  assert.equal(state.status, "error");
  await assert.rejects(call("start", { scene: "Bad" }), /PROGRAM_NOT_COMPILED/);
});

test("once and visited state restore with the runtime checkpoint", async (t) => {
  const call = helper(t);
  const compiled = await call("compile", {
    documents: docs(
      'title: Start\ntracking: always\n---\nVisits {visited_count("Start")}\n<<once>>\nFirst\n<<else>>\nAgain\n<<endonce>>\n-> Repeat\n    <<jump Start>>\n-> End\n    <<stop>>\n===',
    ),
  });
  assert.equal(compiled.status, "ready", JSON.stringify(compiled.diagnostics));
  await call("start", { scene: "Start" });
  const first = await call("next");
  assert.equal(
    first.events.filter((e) => e.kind === "line").at(-1).text,
    "First",
  );
  await call("back");
  const replay = await call("next");
  assert.deepEqual(replay.events, first.events);
  await call("next");
  const revisit = await call("choose", { optionId: 0 });
  assert.equal(
    revisit.events.filter((e) => e.kind === "line").at(-1).text,
    "Visits 1",
  );
  const again = await call("next");
  assert.equal(
    again.events.filter((e) => e.kind === "line").at(-1).text,
    "Again",
  );
  await call("back");
  await call("back");
  const replayVisit = await call("choose", { optionId: 0 });
  assert.deepEqual(replayVisit.events, revisit.events);
});

test("current-line entry skips prior effects and preserves exact source and rewind", async (t) => {
  const call = helper(t);
  await call("compile", {
    documents: docs(
      "title: Start\n---\n<<declare $n = 0>>\n<<set $n = 8>>\nMira: Before\nMira: Target\nMira: After\n===",
    ),
  });
  let state = await call("start", {
    scene: "Start",
    location: { documentId: "doc", line: 6 },
  });
  assert.equal(
    state.events.filter((e) => e.kind === "line").at(-1).text,
    "Mira: Target",
  );
  assert.equal(
    state.events.filter((e) => e.kind === "line").at(-1).source.line,
    6,
  );
  assert.equal(state.variables.find((v) => v.name === "$n").value, 0);
  assert.equal(
    state.events.some((e) => e.kind === "variable"),
    false,
  );
  state = await call("next");
  assert.equal(
    state.events.filter((e) => e.kind === "line").at(-1).text,
    "Mira: After",
  );
  state = await call("back");
  assert.equal(
    state.events.filter((e) => e.kind === "line").at(-1).text,
    "Mira: Target",
  );
});

test("current-line rejects structural, nested, interpolated and nonexistent entries", async (t) => {
  const call = helper(t);
  await call("compile", {
    documents: docs(
      "title: Start\n---\n<<declare $n = 0>>\n// Comment\nMira: {$n}\n<<if true>>\nMira: Nested\n<<endif>>\n-> Choice\n    Mira: Branch\nMira: End\n===",
    ),
  });
  for (const line of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 99]) {
    await assert.rejects(
      call("start", { scene: "Start", location: { documentId: "doc", line } }),
      /PLAY_LINE_NOT_EXECUTABLE/,
    );
  }
});

test("plain narration current-line entry preserves Unicode and CRLF source", async (t) => {
  const call = helper(t);
  await call("compile", {
    documents: docs(
      "title: Start\r\n---\r\n第一句旁白。\r\n雨落下了。🌧️\r\n最後一句。\r\n===",
    ),
  });
  const state = await call("start", {
    scene: "Start",
    location: { documentId: "doc", line: 4 },
  });
  assert.equal(
    state.events.filter((e) => e.kind === "line").at(-1).text,
    "雨落下了。🌧️",
  );
  assert.equal(
    state.events.filter((e) => e.kind === "line").at(-1).source.line,
    4,
  );
});

test("top-level narration can start before and after unrelated branches", async (t) => {
  const call = helper(t);
  await call("compile", {
    documents: docs(
      "title: Start\n---\n雨落下了。\n<<if true>>\n條件內旁白。\n<<endif>>\n-> Go\n    選項內旁白。\n結束旁白。\n===",
    ),
  });
  for (const line of [3, 9]) {
    const state = await call("start", {
      scene: "Start",
      location: { documentId: "doc", line },
    });
    assert.equal(
      state.events.filter((e) => e.kind === "line").at(-1).source.line,
      line,
    );
    const after = await call("next");
    assert.notEqual(after.status, "error");
  }
  for (const line of [5, 8])
    await assert.rejects(
      call("start", { scene: "Start", location: { documentId: "doc", line } }),
      /PLAY_LINE_NOT_EXECUTABLE/,
    );
});
