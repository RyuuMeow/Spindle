import { EditorState, RangeSetBuilder, type Range } from "@codemirror/state";
import { Decoration, WidgetType } from "@codemirror/view";
import { builtins } from "../parser";
import { readingStructure, type ReadingLine } from "./structure";
import { commandEnd, readingVariables } from "./tokens";
import { readingIcon, type ReadingIcon } from "./icons";

class Token extends WidgetType {
  constructor(
    readonly label: string,
    readonly className: string,
    readonly icon?: ReadingIcon,
    readonly context: string[] = [],
    readonly title?: string,
  ) {
    super();
  }
  eq(other: Token) {
    return (
      this.label === other.label &&
      this.className === other.className &&
      this.icon === other.icon &&
      this.title === other.title &&
      this.context.join("\n") === other.context.join("\n")
    );
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = this.className;
    if (this.title) span.title = this.title;
    if (this.context.length) {
      const context = document.createElement("span");
      context.className = "reading-context";
      context.textContent = this.context.slice(-2).join(" / ");
      context.title = this.context.join(" / ");
      span.appendChild(context);
    }
    if (this.icon) span.appendChild(readingIcon(this.icon));
    span.appendChild(document.createTextNode(this.label));
    return span;
  }
  ignoreEvent() {
    return false;
  }
}

/** Decorations only; the source and its offsets never depend on rendered DOM. */
export function readingDecorations(
  state: EditorState,
  commands: string[],
  lines: ReadingLine[] = readingStructure(state.doc.toString()),
  readOnly = false,
) {
  const ranges: Range<Decoration>[] = [];
  const touched = (from: number, to: number) =>
    !readOnly &&
    state.selection.ranges.some(
      (range) => range.from <= to && range.to >= from,
    );
  const mark = (from: number, to: number, className: string) => {
    if (to > from)
      ranges.push(Decoration.mark({ class: className }).range(from, to));
  };
  const add = (
    from: number,
    to: number,
    label: string,
    className: string,
    icon?: ReadingIcon,
    context?: string[],
    title?: string,
  ) => {
    if (to <= from) return;
    if (touched(from, to)) {
      if (className === "reading-variable")
        mark(from, to, "reading-variable-source");
      return;
    }
    ranges.push(
      Decoration.replace({
        widget: new Token(label, className, icon, context, title),
        inclusive: false,
      }).range(from, to),
    );
  };
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index],
      trim = line.text.trim(),
      leading = line.text.length - line.text.trimStart().length,
      from = line.from + leading,
      active = touched(line.from, line.to),
      structural =
        ["start", "end"].includes(line.kind) ||
        ["endif", "endonce"].includes(line.command || ""),
      known =
        !line.command ||
        builtins.includes(line.command) ||
        commands.includes(line.command),
      classes = ["reading-line"];
    if (
      !line.valid ||
      (line.kind === "command" && !known) ||
      (line.command && commandEnd(trim) < 0)
    ) {
      ranges.push(
        Decoration.line({ class: "reading-line reading-raw" }).range(line.from),
      );
      continue;
    }
    if (line.depth > 0) classes.push("reading-region");
    if (line.optionEnd) classes.push("reading-option-end");
    if (line.kind === "title") classes.push("reading-title");
    if (line.kind === "tags") classes.push("reading-tags");
    if (line.kind === "header") classes.push("reading-header");
    if (line.kind === "comment") classes.push("reading-comment");
    if (line.kind === "blank") {
      classes.push(active ? "reading-blank-active" : "reading-blank");
      let previous = index - 1,
        next = index + 1;
      while (previous >= 0 && lines[previous].kind === "blank") previous--;
      while (next < lines.length && lines[next].kind === "blank") next++;
      if (
        !active &&
        (lines[previous]?.kind === "end" || lines[next]?.kind === "title")
      )
        classes.push("reading-scene-space");
    }
    if (line.kind === "option") {
      classes.push("reading-option");
      if (line.optionGroupStart) classes.push("reading-option-first");
    }
    if (line.kind === "condition") {
      classes.push("reading-condition");
      if (["if", "once"].includes(line.command || ""))
        classes.push("reading-region-start");
      if (["else", "elseif"].includes(line.command || ""))
        classes.push("reading-region-split");
      if (["endif", "endonce"].includes(line.command || ""))
        classes.push("reading-region-end");
    }
    if (line.kind === "command") classes.push("reading-command");
    if (line.kind === "end") classes.push("reading-scene-end");
    if (line.kind === "start") classes.push("reading-scene-start");
    if (active && structural) classes.push("reading-editing-syntax");
    const hint =
      line.kind === "end"
        ? "場景結束"
        : line.kind === "start"
          ? "場景開始"
          : "條件結束";
    ranges.push(
      Decoration.line({
        attributes: {
          class: classes.join(" "),
          ...(active && structural ? { "data-structure-label": hint } : {}),
        },
      }).range(line.from),
    );
    if (line.kind === "blank") continue;
    if (active && structural) continue;
    if (
      leading &&
      ["dialogue", "option", "condition", "command"].includes(line.kind)
    )
      add(line.from, from, "", "reading-hidden");
    if (line.kind === "title")
      add(
        from,
        from + (trim.match(/^title\s*:\s*/)?.[0].length || 0),
        "",
        "reading-hidden",
      );
    else if (line.kind === "tags") {
      const prefix = trim.match(/^tags\s*:\s*/)?.[0].length || 0;
      add(from, from + prefix, "", "reading-hidden");
      for (const match of trim.slice(prefix).matchAll(/\S+/g))
        add(
          from + prefix + match.index!,
          from + prefix + match.index! + match[0].length,
          match[0],
          "reading-tag",
        );
      continue;
    } else if (line.kind === "start" || line.kind === "end") {
      add(from, line.to, "", "reading-rule");
      continue;
    } else if (line.kind === "comment") {
      add(from, from + 2, "", "reading-hidden");
      continue;
    } else if (line.kind === "option")
      add(
        from,
        from + 2,
        "",
        "reading-option-marker",
        "option",
        line.context.length > line.depth ? line.context : [],
        "選項",
      );
    else if (
      (line.kind === "command" || line.kind === "condition") &&
      line.command
    ) {
      const prefix = trim.match(/^<<\s*\w+\s*/)?.[0].length || 0,
        end = commandEnd(trim);
      if (!known || end < 0) continue;
      // A delimiter is a structural boundary. Reveal the whole command when
      // editing it, rather than showing an unmatched << with its >> hidden.
      if (touched(from, from + prefix) || touched(from + end, from + end + 2)) {
        for (const variable of readingVariables(line))
          mark(
            line.from + variable.from,
            line.from + variable.to,
            "reading-variable-source",
          );
        continue;
      }
      if (line.command === "endif" || line.command === "endonce") {
        add(from, from + end + 2, "", "reading-rule");
        continue;
      }
      const presentation: Record<
        string,
        { label: string; icon: ReadingIcon; title?: string }
      > = {
        if: { label: "若 ", icon: "branch" },
        elseif: { label: "否則若 ", icon: "branch" },
        else: { label: "否則", icon: "branch" },
        once: { label: "首次 ", icon: "branch" },
        jump: { label: "", icon: "jump", title: "跳轉" },
        detour: { label: "呼叫 ", icon: "detour" },
        return: { label: "返回", icon: "return" },
        stop: { label: "結束", icon: "stop" },
      };
      const context = ["if", "once", "elseif", "else"].includes(line.command)
        ? line.context
        : [];
      const assignment =
        line.command === "set" &&
        trim.match(/^<<\s*set\s+(\$[A-Za-z_]\w*)\s*(=|to)\s*/);
      if (assignment) {
        add(from, from + prefix, "", "reading-hidden");
        const variableEnd =
          from + trim.indexOf(assignment[1]) + assignment[1].length;
        add(
          variableEnd,
          from + assignment[0].length,
          "",
          "reading-assignment",
          "assign",
          [],
          "指定值",
        );
      } else {
        const display = presentation[line.command] || {
          label: line.command + " ",
          icon: "command" as const,
        };
        add(
          from,
          from + prefix,
          display.label,
          line.kind === "condition"
            ? "reading-keyword"
            : line.command === "jump"
              ? "reading-target"
              : "reading-function",
          display.icon,
          context,
          display.title,
        );
      }
      add(from + end, from + end + 2, "", "reading-hidden");
      if (["jump", "detour"].includes(line.command))
        mark(from + prefix, from + end, "reading-target");
      if (
        line.text
          .slice(leading + end + 2)
          .trimStart()
          .startsWith("//")
      )
        mark(from + end + 2, line.to, "reading-comment");
    }
    if (line.kind === "dialogue") {
      const role = line.text.match(/^\s*[^:<>]+:/);
      if (role) mark(from, line.from + role[0].length, "reading-role");
    }
    for (const variable of readingVariables(line))
      add(
        line.from + variable.from,
        line.from + variable.to,
        variable.name,
        "reading-variable",
      );
  }
  const builder = new RangeSetBuilder<Decoration>();
  ranges.sort(
    (a, b) =>
      a.from - b.from || a.value.startSide - b.value.startSide || a.to - b.to,
  );
  for (const range of ranges) builder.add(range.from, range.to, range.value);
  return builder.finish();
}
