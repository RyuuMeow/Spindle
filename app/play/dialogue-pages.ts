/** Measure against the actual game text style, including browser line breaking. */
export function measureDialoguePages(
  element: HTMLElement,
  text: string,
): number[] {
  const graphemes = [
    ...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text),
  ].map((s) => s.segment);
  if (!graphemes.length) return [0];
  const probe = element.cloneNode(false) as HTMLElement;
  probe.removeAttribute("id");
  probe.setAttribute("aria-hidden", "true");
  const style = getComputedStyle(element);
  Object.assign(probe.style, {
    position: "absolute",
    visibility: "hidden",
    pointerEvents: "none",
    width: `${element.clientWidth}px`,
    height: "auto",
    minHeight: "0",
    maxHeight: "none",
    padding: "0",
    margin: "0",
    overflow: "visible",
  });
  element.parentElement!.appendChild(probe);
  const capacity = parseFloat(style.lineHeight) * 2;
  const ends: number[] = [];
  let start = 0;
  try {
    while (start < graphemes.length) {
      let low = start + 1,
        high = graphemes.length,
        end = low;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        probe.textContent = graphemes.slice(start, mid).join("");
        if (probe.getBoundingClientRect().height <= capacity + 0.5) {
          end = mid;
          low = mid + 1;
        } else high = mid - 1;
      }
      // Prefer a word boundary when English wraps; preserve every character.
      if (
        end < graphemes.length &&
        /[\p{L}\p{N}]/u.test(graphemes[end]) &&
        /[\p{L}\p{N}]/u.test(graphemes[end - 1])
      ) {
        const candidate = graphemes
          .slice(start, end)
          .findLastIndex((s) => /\s/u.test(s));
        if (candidate > (end - start) * 0.65) end = start + candidate + 1;
      }
      ends.push(end);
      start = end;
    }
  } finally {
    probe.remove();
  }
  return ends;
}
