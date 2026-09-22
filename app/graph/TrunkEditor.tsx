import { t as tr } from "../i18n/index.ts";
import { ViewportPortal } from "@xyflow/react";
import { pathData, type TrunkGeometry } from "./layout-state";
export default function TrunkEditor({
  trunk,
  select,
}: {
  trunk: TrunkGeometry;
  select: () => void;
}) {
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
          d={pathData(trunk.points)}
          aria-label={tr("m1c72b6b4c43a")}
          role="button"
          tabIndex={0}
          onPointerDown={(e) => {
            if (e.button === 0) e.stopPropagation();
          }}
          onClick={(e) => {
            e.stopPropagation();
            select();
          }}
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            select();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              select();
            }
          }}
        />
      </svg>
    </ViewportPortal>
  );
}
