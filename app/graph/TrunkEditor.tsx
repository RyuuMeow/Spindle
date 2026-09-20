import { useRef } from "react";
import { ViewportPortal, useReactFlow } from "@xyflow/react";
import { pathData, type TrunkGeometry } from "./layout-state";
import type { Point } from "../graph-layout";
type Props = {
  trunk: TrunkGeometry;
  ys: number[];
  selected: boolean;
  select: () => void;
  begin: () => void;
  move: (delta: Point) => void;
  end: () => void;
};
export default function TrunkEditor({
  trunk,
  ys,
  selected,
  select,
  begin,
  move,
  end,
}: Props) {
  const flow = useReactFlow(),
    drag = useRef<Point | null>(null);
  const last = trunk.points.at(-1);
  if (!last || !ys.length) return null;
  const points = [
    { x: last.x, y: Math.min(last.y, ...ys) },
    { x: last.x, y: Math.max(last.y, ...ys) },
  ];
  function down(e: React.PointerEvent<SVGElement>) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    select();
    begin();
    drag.current = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function update(e: React.PointerEvent) {
    if (!drag.current) return;
    e.stopPropagation();
    const p = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    move({ x: p.x - drag.current.x, y: p.y - drag.current.y });
  }
  function up(e: React.PointerEvent) {
    if (!drag.current) return;
    e.stopPropagation();
    drag.current = null;
    end();
  }
  return (
    <ViewportPortal>
      <svg
        className="flow-trunk-layer"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "visible",
          pointerEvents: "none",
          zIndex: 30,
        }}
      >
        <path
          className="flow-trunk-hit nodrag nopan"
          data-trunk-id={trunk.id}
          d={pathData([...trunk.points]) + " " + pathData(points)}
          aria-label="共用幹線"
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            select();
          }}
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            select();
          }}
          onPointerDown={down}
          onPointerMove={update}
          onPointerUp={up}
          onLostPointerCapture={up}
        />
        {selected && (
          <circle
            className="flow-route-pin nodrag nopan"
            style={{ pointerEvents: "auto", cursor: "ew-resize" }}
            cx={last.x}
            cy={last.y}
            r={5 / Math.max(0.5, flow.getZoom())}
            onPointerDown={down}
            onPointerMove={update}
            onPointerUp={up}
            onLostPointerCapture={up}
          />
        )}
      </svg>
    </ViewportPortal>
  );
}
