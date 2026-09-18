import type { DocumentViewState, NavigationLocation, TabView, WindowSession } from "./types";
export function viewOf(tab: DocumentViewState): DocumentViewState {
  const { mode, line, column, scrollTop, selection, folded, sourceView, graph } = tab;
  return { mode, line, column, scrollTop, selection, folded, sourceView, graph };
}
export function locationOf(tab: TabView): NavigationLocation {
  return { documentId: tab.documentId, ...viewOf(tab) };
}
export type NavigateOptions = { newTab?: boolean; line?: number; column?: number; mode?: TabView["mode"]; record?: boolean };
export function navigateSession(session: WindowSession, documentId: string, options: NavigateOptions, newId: string): WindowSession {
  const current = session.tabs.find(t => t.id === session.activeId) || session.tabs[0];
  const reuse = !!current && !options.newTab;
  const cached = reuse ? current.views?.[documentId] : undefined;
  const same = reuse && current.documentId === documentId;
  const base = same ? viewOf(current) : cached;
  const destination: NavigationLocation = {
    documentId,
    mode: options.mode || current?.mode || "source",
    line: 1, column: 1,
    ...base,
    ...(options.mode ? { mode: options.mode } : {}),
    ...(options.line !== undefined ? { line: options.line, column: options.column ?? 1, selection: undefined, scrollTop: undefined, sourceView: undefined } : {}),
  };
  // A file click changes the document inside this tab, never another tab's identity.
  if (!same && !options.mode && current) destination.mode = current.mode;
  const changed = !same || destination.mode !== current.mode || destination.line !== current.line || destination.column !== current.column;
  const tab: TabView = {
    ...(reuse ? current : {}),
    id: reuse ? current.id : newId,
    ...destination,
    views: reuse ? { ...current.views, [current.documentId]: viewOf(current) } : {},
    past: reuse ? (options.record !== false && changed ? [...(current.past || []), locationOf(current)].slice(-100) : current.past || []) : [],
    future: reuse && (!changed || options.record === false) ? current.future || [] : [],
  };
  return { ...session, activeId: tab.id, tabs: reuse ? session.tabs.map(t => t.id === tab.id ? tab : t) : [...session.tabs, tab] };
}
export function navigateHistory(session: WindowSession, back: boolean, validIds: ReadonlySet<string>): WindowSession {
  const current = session.tabs.find(t => t.id === session.activeId);
  if (!current) return session;
  const stack = [...(back ? current.past || [] : current.future || [])];
  if (!stack.length) return session;
  let target: NavigationLocation | undefined;
  while (stack.length && !target) {
    const candidate = stack.pop()!;
    if (validIds.has(candidate.documentId)) target = candidate;
  }
  if (!target) return { ...session, tabs: session.tabs.map(t => t.id === current.id ? { ...t, [back ? "past" : "future"]: [] } : t) };
  const tab: TabView = {
    ...current, ...target,
    views: { ...current.views, [current.documentId]: viewOf(current) },
    past: back ? stack : [...(current.past || []), locationOf(current)].slice(-100),
    future: back ? [...(current.future || []), locationOf(current)].slice(-100) : stack,
  };
  return { ...session, tabs: session.tabs.map(t => t.id === current.id ? tab : t) };
}
