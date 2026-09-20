import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { EditorState, Text } from "@codemirror/state";
import { parse } from "../app/parser.ts";
import { buildGraphModel } from "../app/graph/model.ts";
await build({
  entryPoints: ["app/graph/map-sources.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "outputs/graph-sources-test.mjs",
});
const { mapGraphSources, mapSessionGraphSources } =
  await import("../outputs/graph-sources-test.mjs");
const scene = (n, b) => "title: " + n + "\r\n---\r\n" + b + "\r\n===\r\n";
const make = (text, anchors) => {
  const documents = [{ id: "doc", name: "story.yarn", text, version: 1 }];
  return buildGraphModel({
    file: "story.yarn",
    ...parse(documents, []),
    documents,
    anchors,
  });
};
test("source mappings preserve independent pins after multiple edits with graph unmounted", () => {
  const text =
    "\uFEFF" +
    scene("A", "A: same\r\n<<jump B>>\r\nA: same\r\n<<jump B>>") +
    scene("B", "End");
  const model = make(text),
    graph = {
      anchors: model.anchors,
      positions: { [model.records[0].id]: { x: 8, y: 12 } },
    };
  const state = EditorState.create({
    doc: Text.of(text.split("\n")),
    extensions: [EditorState.lineSeparator.of("\n")],
  });
  const tr = state.update({
    changes: [
      { from: text.indexOf("A: same"), insert: "// first\r\n" },
      { from: text.lastIndexOf("A: same"), insert: "// second\r\n" },
    ],
  });
  const mapped = mapGraphSources(
      graph,
      "doc",
      tr.changes,
      tr.newDoc.toString(),
    ),
    next = make(tr.newDoc.toString(), mapped.anchors);
  assert.deepEqual(
    next.groups.map((g) => g.id),
    model.groups.map((g) => g.id),
  );
  assert.deepEqual(
    next.records.map((r) => r.id),
    model.records.map((r) => r.id),
  );
  const session = {
    tabs: [
      {
        id: "view",
        graph,
        views: { doc: { graph } },
        past: [{ graph }],
        future: [{ graph }],
      },
    ],
    closedTabs: [{ id: "closed", graph }],
  };
  const s = mapSessionGraphSources(
    session,
    "doc",
    tr.changes,
    tr.newDoc.toString(),
  );
  for (const v of [
    s.tabs[0],
    s.tabs[0].views.doc,
    s.tabs[0].past[0],
    s.tabs[0].future[0],
    s.closedTabs[0],
  ])
    assert.deepEqual(v.graph.anchors, mapped.anchors);
});
test("external duplicate transitions cannot inherit a unique old route arbitrarily", () => {
  const text = scene("A", "<<jump B>>") + scene("B", "End"),
    old = make(text);
  const next = make(
    "// changed\r\n" +
      scene("A", "<<jump B>>\r\n<<jump B>>") +
      scene("B", "End"),
    old.anchors,
  );
  assert.equal(
    next.groups.some((g) => g.id === old.groups[0].id),
    false,
  );
});
test("whole deletion drops anchors; whole replacement uses only unique source matching", () => {
  const text = scene("A", "<<jump B>>") + scene("B", "End"),
    old = make(text),
    graph = { anchors: old.anchors };
  const edge = old.anchors.find((a) => a.kind === "transition");
  const deleted = EditorState.create({
    doc: Text.of(text.split("\n")),
    extensions: [EditorState.lineSeparator.of("\n")],
  }).update({ changes: { from: edge.from, to: edge.to } });
  assert.equal(
    mapGraphSources(
      graph,
      "doc",
      deleted.changes,
      deleted.newDoc.toString(),
    ).anchors.some((a) => a.id === edge.id),
    false,
  );
  const replacement = "// new\r\n" + text,
    change = EditorState.create({
      doc: Text.of(text.split("\n")),
      extensions: [EditorState.lineSeparator.of("\n")],
    }).update({ changes: { from: 0, to: text.length, insert: replacement } });
  const mapped = mapGraphSources(graph, "doc", change.changes, replacement);
  assert.equal(
    make(replacement, mapped.anchors).groups[0].id,
    old.groups[0].id,
  );
});
