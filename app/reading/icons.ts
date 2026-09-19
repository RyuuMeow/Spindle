/** Small SVGs used by CodeMirror widgets, without a separate React root. */
const paths = {
  cube: ["m12 3 9 5v8l-9 5-9-5V8z", "m3 8 9 5 9-5", "M12 13v8"],
  document: ["M6 3h12v18H6z", "M9 7h6", "M9 11h6", "M9 15h4"],
  command: ["m4 5 5 7-5 7", "M12 19h8"],
  branch: [
    "M6 3v12a4 4 0 0 0 4 4h8",
    "m14 15 4 4-4 4",
    "M6 8h12",
    "m14 4 4 4-4 4",
  ],
  jump: ["M4 12h16", "m14 6 6 6-6 6"],
  detour: ["M5 19 19 5", "M7 5h12v12"],
  return: ["m8 4-5 5 5 5", "M3 9h11a6 6 0 0 1 0 12h-2"],
  stop: ["M5 5h14v14H5z"],
  assign: ["M20 12H4", "m10 6-6 6 6 6"],
  option: ["M5 3v12h14", "m14 10 5 5-5 5"],
  expanded: ["m6 9 6 6 6-6"],
  collapsed: ["m9 6 6 6-6 6"],
} as const;

export type ReadingIcon = keyof typeof paths;

export function readingIcon(name: ReadingIcon) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.65");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("reading-icon");
  for (const d of paths[name]) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}
