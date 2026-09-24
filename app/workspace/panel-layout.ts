/** Sizes are CSS pixels; saved widths remain preferences when the window narrows. */
export function panelLayout(
  width: number,
  left: boolean,
  right: boolean,
  preferredLeft: number,
  preferredRight: number,
  focus: "left" | "right",
) {
  const budget = Math.max(0, width - 12 - 320);
  const compact = left && right && budget < preferredLeft + preferredRight + 12;
  const showLeft = left && (!compact || focus === "left");
  const showRight = right && (!compact || focus === "right");
  const minimum = (showLeft ? 180 : 0) + (showRight ? 220 : 0);
  const gutters = (Number(showLeft) + Number(showRight)) * 6;
  const overlay = minimum + gutters > budget;
  const available = overlay ? Math.max(180, width - 24) : budget - gutters;
  const leftMax = Math.max(
    180,
    Math.min(420, available - (showRight ? preferredRight : 0)),
  );
  const rightMax = Math.max(
    220,
    Math.min(420, available - (showLeft ? preferredLeft : 0)),
  );
  return {
    compact,
    overlay,
    leftMax,
    rightMax,
    leftWidth: Math.min(preferredLeft, leftMax),
    rightWidth: Math.min(preferredRight, rightMax),
  };
}
