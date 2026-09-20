import type { ChangeDesc } from "@codemirror/state";
import type {
  WindowSession,
  TabView,
  DocumentViewState,
} from "../workspace/types";
import type { GraphState } from "./layout-state";
import { stamp } from "./model";

/** Runs for every shared document transaction, even when a graph view is unmounted. */
export function mapGraphSources(
  graph: GraphState | undefined,
  documentId: string,
  changes: ChangeDesc,
  nextText: string,
  previousText?: string,
): GraphState | undefined {
  if (!graph?.anchors?.some((a) => a.documentId === documentId)) return graph;
  const hash = stamp(nextText),
    previousHash = previousText === undefined ? undefined : stamp(previousText);
  return {
    ...graph,
    anchors: graph.anchors.flatMap((anchor) => {
      if (anchor.documentId !== documentId) return [anchor];
      if (
        anchor.from < 0 ||
        anchor.to > changes.length ||
        (previousHash !== undefined && anchor.stamp !== previousHash)
      )
        return [anchor];
      let replaced = false,
        deleted = false;
      changes.iterChangedRanges((a, b, c, d) => {
        if (a <= anchor.from && b >= anchor.to && b > a) {
          replaced = true;
          deleted = d === c;
        }
      });
      if (deleted) return [];
      // Whole-object replacement is ambiguous: retain only the old source signature
      // for unique matching, never hand its geometry to whatever occupies that offset.
      if (replaced) return [anchor];
      return [
        {
          ...anchor,
          from: changes.mapPos(anchor.from, 1),
          to: changes.mapPos(anchor.to, -1),
          stamp: hash,
        },
      ];
    }),
  };
}
export function mapSessionGraphSources(
  session: WindowSession,
  documentId: string,
  changes: ChangeDesc,
  nextText: string,
  previousText?: string,
): WindowSession {
  const view = <T extends DocumentViewState>(v: T): T => {
    const graph = mapGraphSources(
      v.graph,
      documentId,
      changes,
      nextText,
      previousText,
    );
    return graph === v.graph ? v : { ...v, graph };
  };
  const tab = (t: TabView): TabView => ({
    ...view(t),
    views: t.views
      ? Object.fromEntries(
          Object.entries(t.views).map(([id, v]) => [id, view(v)]),
        )
      : undefined,
    past: t.past?.map(view),
    future: t.future?.map(view),
  });
  return {
    ...session,
    tabs: session.tabs.map(tab),
    closedTabs: session.closedTabs.map(tab),
  };
}
