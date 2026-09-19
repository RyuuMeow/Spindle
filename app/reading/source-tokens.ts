/** Source-only spans matching the existing Monaco Yarn palette. */
export function sourceTokens(text: string) {
  const tokens: { from: number; to: number; className: string }[] = [];
  const add = (from: number, to: number, kind: string) => {
    if (to > from)
      tokens.push({
        from,
        to,
        className:
          "yarn-source-" +
          kind +
          (kind === "variable" ? " reading-variable-source" : ""),
      });
  };
  const header = /^(title|tags|when|tracking|position)(\s*:)(.*)$/.exec(text);
  if (header) {
    add(0, header[1].length, "header");
    add(
      header[1].length + header[2].length,
      text.length,
      header[1] === "title" ? "speaker" : "tag",
    );
    return tokens;
  }
  if (/^\s*(---|===)\s*$/.test(text)) {
    add(0, text.length, "delimiter");
    return tokens;
  }
  const speaker = /^[ \t]*[^:<>]+:/.exec(text);
  if (speaker) add(0, speaker[0].length, "speaker");
  let command = false;
  const pattern =
    /[/][/].*$|<<\s*\w*|>>|"(?:\\.|[^"\\])*"?|\$[A-Za-z_]\w*|->|#[\w:]+|\b(?:true|false|\d+(?:\.\d+)?)\b/g;
  for (const m of text.matchAll(pattern)) {
    const value = m[0],
      from = m.index!;
    if (value.startsWith("//")) {
      add(from, text.length, "comment");
      break;
    }
    if (value.startsWith("<<")) {
      command = true;
      const name = value.slice(2).trim();
      add(
        from,
        from + value.length,
        /^(if|else|elseif|endif|once|endonce|declare|set|jump|detour|return|stop)$/.test(
          name,
        )
          ? "keyword"
          : "function",
      );
    } else if (value === ">>") {
      command = false;
      add(from, from + 2, "function");
    } else if (value.startsWith("$"))
      add(from, from + value.length, "variable");
    else if (value === "->") add(from, from + 2, "option");
    else if (value.startsWith("#")) add(from, from + value.length, "tag");
    else if (command)
      add(
        from,
        from + value.length,
        value.startsWith('"') ? "string" : "number",
      );
  }
  return tokens;
}
