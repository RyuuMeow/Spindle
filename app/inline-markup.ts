import type { Command } from "./parser";
import { inlineCatalog } from "./inline-catalog.ts";
import type { LocalizedMessage } from "./i18n/index.ts";

export type MarkupProperty = {
  name: string;
  value: string;
  from: number;
  to: number;
  valueFrom: number;
};
export type MarkupTag = {
  name: string;
  from: number;
  to: number;
  closing: boolean;
  selfClosing: boolean;
  complete: boolean;
  properties: MarkupProperty[];
  malformed: boolean;
};
const identifier = /^[\p{L}\p{N}_][\p{L}\p{N}_|]*/u;
function skipValue(text: string, start: number): number {
  if (text[start] === '"') {
    for (let i = start + 1; i < text.length; i++) {
      if (text[i] === "\\") i++;
      else if (text[i] === '"') return i + 1;
    }
    return text.length;
  }
  if (text[start] === "{") {
    let depth = 1;
    for (let i = start + 1; i < text.length; i++) {
      if (text[i] === '"') i = skipValue(text, i) - 1;
      else if (text[i] === "{") depth++;
      else if (text[i] === "}" && --depth === 0) return i + 1;
    }
    return text.length;
  }
  let end = start;
  while (end < text.length && !/[\s\]/]/.test(text[end])) end++;
  return end;
}

/** Source offsets are UTF-16; markup is scoped to one Yarn dialogue line. */
export function scanMarkup(text: string): MarkupTag[] {
  const tags: MarkupTag[] = [];
  let literal = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
      continue;
    }
    if (literal && !text.startsWith("[/nomarkup]", i)) continue;
    if (!literal && text.startsWith("//", i)) break;
    if (!literal && text.startsWith("<<", i)) {
      i += 2;
      for (; i < text.length && !text.startsWith(">>", i); i++) {
        if (text[i] === '"') i = skipValue(text, i) - 1;
      }
      i++;
      continue;
    }
    if (!literal && text[i] === "{") {
      i = skipValue(text, i) - 1;
      continue;
    }
    if (text[i] !== "[") continue;
    const from = i;
    let at = i + 1;
    const closing = text[at] === "/";
    if (closing) at++;
    const name = identifier.exec(text.slice(at))?.[0] || "";
    at += name.length;
    const properties: MarkupProperty[] = [];
    let malformed = false,
      selfClosing = false;
    while (at < text.length && text[at] !== "]") {
      if (/\s/.test(text[at])) {
        at++;
        continue;
      }
      if (text[at] === "/" && /^\/\s*\]/.test(text.slice(at))) {
        selfClosing = true;
        at = text.indexOf("]", at);
        break;
      }
      const propFrom = at;
      const prop =
        text[at] === "=" && !properties.length
          ? name
          : identifier.exec(text.slice(at))?.[0];
      if (!prop) {
        malformed = true;
        at++;
        continue;
      }
      if (text[at] !== "=") at += prop.length;
      while (/\s/.test(text[at] || "x")) at++;
      if (text[at] !== "=") {
        malformed = true;
        continue;
      }
      at++;
      const afterEquals = at;
      while (/\s/.test(text[at] || "x")) at++;
      const start = at;
      // Empty snippet slots may be followed by another named property. Keep
      // that property's name out of this value so each slot retains its help.
      if (
        at > afterEquals &&
        /^[\p{L}\p{N}_][\p{L}\p{N}_|]*\s*=/u.test(text.slice(at))
      ) {
        malformed = true;
        properties.push({
          name: prop,
          value: "",
          from: propFrom,
          to: at,
          valueFrom: afterEquals,
        });
        continue;
      }
      at = skipValue(text, at);
      if (at === start) {
        malformed = true;
        properties.push({
          name: prop,
          value: "",
          from: propFrom,
          to: at,
          valueFrom: start,
        });
        if (text[at] !== "]" && !/^\/\s*\]/.test(text.slice(at))) at++;
        continue;
      }
      properties.push({
        name: prop,
        value: text.slice(start, at),
        from: propFrom,
        to: at,
        valueFrom: start,
      });
    }
    const complete = text[at] === "]";
    const tag = {
      name,
      from,
      to: complete ? at + 1 : text.length,
      closing,
      selfClosing,
      complete,
      properties,
      malformed,
    };
    tags.push(tag);
    if (name === "nomarkup" && complete) literal = !closing && !selfClosing;
    i = tag.to - 1;
  }
  return tags;
}

export function openMarkup(tags: MarkupTag[]) {
  const open: MarkupTag[] = [];
  for (const tag of tags) {
    if (!tag.complete) continue;
    if (tag.closing) {
      if (!tag.name) open.length = 0;
      else {
        const index = open.findLastIndex((t) => t.name === tag.name);
        if (index >= 0) open.splice(index, 1); // Yarn permits overlapping ranges.
      }
    } else if (!tag.selfClosing) open.push(tag);
  }
  return open;
}

export function markupCompletion(
  text: string,
  offset: number,
  commands: Command[],
) {
  if (/^\s*(?:title|tags|tracking|when|position)\s*:/.test(text)) return null;
  const tags = scanMarkup(text.slice(0, offset));
  let tag = tags.at(-1);
  if (
    tag?.name === "nomarkup" &&
    tag.complete &&
    !tag.closing &&
    !tag.selfClosing
  ) {
    const from = text.lastIndexOf("[", offset - 1);
    const tail = text.slice(from, offset);
    if (
      from > tag.from &&
      tail.startsWith("[/") &&
      "[/nomarkup]".startsWith(tail)
    ) {
      tag = {
        name: tail.slice(2),
        from,
        to: offset,
        complete: false,
        closing: true,
        selfClosing: false,
        properties: [],
        malformed: false,
      };
      tags.push(tag);
    }
  }
  if (!tag || tag.complete || tag.to !== offset) return null;
  const input = text.slice(tag.from, offset);
  if (!/^\[\/?[\p{L}\p{N}_|]*$/u.test(input)) return null;
  const open = openMarkup(tags.slice(0, -1));
  const definitions = inlineCatalog(commands);
  const options = tag.closing
    ? [...new Set(open.map((t) => t.name).reverse())].map(
        (name) =>
          definitions.find((c) => c.name === name) || {
            name,
            description: "",
            params: [],
            example: "",
            inline: true,
            markupMode: "paired" as const,
          },
      )
    : definitions;
  // A bare opener cannot distinguish following dialogue from a tag name.
  // Only consume a right-hand name when its closing bracket proves the boundary.
  const suffix = /^[\p{L}\p{N}_|]*\]/u.exec(text.slice(offset))?.[0] || "";
  const existing =
    !tag.closing &&
    scanMarkup(text).find(
      (t) => t.from === tag.from && t.complete && !t.malformed,
    );
  return {
    from: tag.from,
    to: existing ? existing.to : offset + suffix.length,
    properties:
      existing && existing.properties.length > 0
        ? text
            .slice(existing.from + 1 + existing.name.length, existing.to - 1)
            .replace(/\/\s*$/, "")
            .trimEnd()
        : undefined,
    closing: tag.closing,
    options,
  };
}

export function needsMarkupCloser(text: string, to: number, name: string) {
  const next = scanMarkup(text.slice(to)).find(
    (tag) => tag.name === name || (tag.closing && !tag.name),
  );
  return !next?.closing;
}

/** Named-property completion, separate from values/expressions and marker names. */
export function markupPropertyCompletion(
  text: string,
  offset: number,
  commands: Command[],
) {
  if (/^\s*(?:title|tags|tracking|when|position)\s*:/.test(text)) return null;
  const tag = scanMarkup(text.slice(0, offset)).at(-1);
  if (!tag || tag.complete || tag.closing || !tag.name || tag.to !== offset)
    return null;
  const tail = text.slice(tag.from + 1 + tag.name.length, offset);
  const match = /(?:^|\s)([\p{L}\p{N}_]*)$/u.exec(tail);
  if (!match || (!tail.startsWith(" ") && !tail.startsWith("\t"))) return null;
  if (tag.properties.some((p) => !p.value && p.to === offset)) return null;
  // The scanner consumes unfinished quoted/grouped values to the caret.
  if (
    tag.properties.some(
      (p) =>
        p.to === offset &&
        p.value &&
        ((p.value.startsWith('"') && !/^"(?:\\.|[^"\\])*"$/.test(p.value)) ||
          (p.value.startsWith("{") && !p.value.endsWith("}"))),
    )
  )
    return null;
  const command = inlineCatalog(commands).find((c) => c.name === tag.name);
  if (!command) return null;
  const used = new Set(tag.properties.map((p) => p.name));
  const from = offset - match[1].length;
  const suffix = /^[\p{L}\p{N}_]*/u.exec(text.slice(offset))?.[0] || "";
  // Do not overwrite an existing assignment's value when completing its name.
  if (/^\s*=/.test(text.slice(offset + suffix.length))) return null;
  return {
    from,
    to: offset + suffix.length,
    parameters: command.params.filter((p) => !used.has(p.name)),
  };
}

export function markupDiagnostics(text: string, commands: Command[]) {
  const findings: ({ from: number; to: number } & LocalizedMessage)[] = [];
  const tags = scanMarkup(text);
  const catalog = inlineCatalog(commands);
  const open: MarkupTag[] = [];
  const add = (
    tag: MarkupTag,
    code: LocalizedMessage["code"],
    args: string[] = [tag.name],
  ) => findings.push({ from: tag.from, to: tag.to, code, args });
  for (const tag of tags) {
    if (
      !tag.complete ||
      tag.malformed ||
      (!tag.name && !tag.closing) ||
      (tag.closing && (tag.properties.length || tag.selfClosing))
    ) {
      add(tag, "markup.invalid");
      continue;
    }
    if (tag.closing) {
      if (!tag.name) open.length = 0;
      else {
        const index = open.findLastIndex((t) => t.name === tag.name);
        if (index < 0) add(tag, "markup.unmatched");
        else open.splice(index, 1);
      }
      continue;
    }
    if (!tag.selfClosing) open.push(tag);
    const command = catalog.find((c) => c.name === tag.name);
    if (!command) continue; // Yarn permits application-defined attributes.
    if ((command.markupMode === "selfClosing") !== tag.selfClosing)
      add(tag, "markup.mode");
    const seen = new Set<string>();
    for (const property of tag.properties) {
      if (seen.has(property.name))
        add(tag, "markup.duplicate", [property.name]);
      seen.add(property.name);
      const parameter = command.params.find((p) => p.name === property.name);
      if (!parameter) {
        if (
          !("dynamicProperties" in command && command.dynamicProperties) &&
          property.name !== "trimwhitespace"
        )
          add(tag, "markup.property", [tag.name, property.name]);
        continue;
      }
      if (property.value.startsWith("{")) continue; // The expression analyzer owns dynamic values.
      const type = /^(true|false)$/i.test(property.value)
        ? "boolean"
        : /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(property.value)
          ? "number"
          : "string";
      if (
        type !== parameter.type &&
        !(command.name === "select" && property.name === "value")
      )
        add(tag, "markup.type", [tag.name, property.name, parameter.type]);
    }
    for (const p of command.params) {
      if (p.required && !seen.has(p.name))
        add(tag, "markup.required", [tag.name, p.name]);
    }
  }
  for (const tag of open) add(tag, "markup.unclosed");
  return findings;
}
