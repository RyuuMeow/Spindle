import type { SceneScope } from "./scene-scope";
export type PendingSceneDraft = {
  source: string;
  text: string;
  scope: SceneScope;
  at: number;
};
const key = (documentId: string, name: string) =>
  `yarn-workbench.graph-pending.v1:${documentId}:${name}`;
export function loadSceneDraft(
  documentId: string,
  name: string,
): PendingSceneDraft | null {
  try {
    const raw = localStorage.getItem(key(documentId, name));
    if (!raw) return null;
    const draft = JSON.parse(raw) as PendingSceneDraft;
    if (
      typeof draft.source !== "string" ||
      typeof draft.text !== "string" ||
      !draft.scope ||
      ![draft.scope.sceneFrom, draft.scope.from, draft.scope.to].every(
        Number.isInteger,
      ) ||
      draft.scope.sceneFrom < 0 ||
      draft.scope.from < draft.scope.sceneFrom ||
      draft.scope.to < draft.scope.from ||
      draft.scope.to > draft.source.length
    )
      return null;
    return draft;
  } catch {
    return null;
  }
}
export function saveSceneDraft(
  documentId: string,
  name: string,
  draft: PendingSceneDraft,
) {
  localStorage.setItem(key(documentId, name), JSON.stringify(draft));
}
export function removeSceneDraft(documentId: string, name: string) {
  localStorage.removeItem(key(documentId, name));
}
