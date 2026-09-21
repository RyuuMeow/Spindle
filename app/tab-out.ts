/** Return the next caret offset only when immediately before a matched closer.
 * Line-local and conservative: never insert text or skip unfinished containers.
 */
export function tabOut(line: string, offset: number): number | null {
  if (offset < 0 || offset >= line.length) return null;
  const stack: string[] = [];
  let quote = "";
  let escaped = false;
  for (let i = 0; i <= offset; i++) {
    const c = line[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === quote) {
        if (i === offset) return i + 1;
        quote = "";
      }
      continue;
    }
    if (line.slice(i, i + 2) === "//") return null;
    if (
      c === '"' ||
      (c === "'" &&
        (stack.length > 0 || !/[\p{L}\p{N}]/u.test(line[i - 1] ?? "")))
    ) {
      quote = c;
    } else if (line.slice(i, i + 2) === "<<") {
      stack.push(">>");
      i++;
    } else if (stack.length && line.startsWith(stack[stack.length - 1], i)) {
      const close = stack.pop()!;
      if (i === offset) return i + close.length;
      i += close.length - 1;
    } else if (stack.length && "({[".includes(c)) {
      stack.push({ "(": ")", "{": "}", "[": "]" }[c]!);
    } else if (stack.length && ")}]".includes(c)) {
      return null;
    }
  }
  return null;
}
