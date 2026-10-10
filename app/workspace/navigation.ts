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
    ...viewOf({ mode: options.mode || current?.mode || "source", line: 1, column: 1 }),
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
    views: reuse ? { ...current.views, ...(current.documentId ? { [current.documentId]: viewOf(current) } : {}) } : {},
    past: reuse ? (options.record !== false && changed && current.documentId ? [...(current.past || []), locationOf(current)].slice(-100) : current.past || []) : [],
    future: reuse && (!changed || options.record === false) ? current.future || [] : [],
  };
  return { ...session, activeId: tab.id, tabs: reuse ? session.tabs.map(t => t.id === tab.id ? tab : t) : [...session.tabs, tab] };
}

/** Removing documents never removes the independent tabs that displayed them. */
export function removeSessionDocuments(
  session: WindowSession,
  removedIds: ReadonlySet<string>,
  validIds: ReadonlySet<string>,
): WindowSession {
  if (!removedIds.size) return session;
  const reconcile = (tab: TabView): TabView => {
    const past = (tab.past || []).filter((location) => validIds.has(location.documentId));
    const future = (tab.future || []).filter((location) => validIds.has(location.documentId));
    const views = Object.fromEntries(
      Object.entries(tab.views || {}).filter(([id]) => validIds.has(id)),
    );
    if (!removedIds.has(tab.documentId)) {
      if (
        past.length === (tab.past?.length || 0) &&
        future.length === (tab.future?.length || 0) &&
        Object.keys(views).length === Object.keys(tab.views || {}).length
      ) return tab;
      return { ...tab, past, future, views };
    }
    const target = past.pop();
    return {
      ...tab,
      ...viewOf({ mode: tab.mode, line: 1, column: 1 }),
      documentId: "",
      ...target,
      past,
      future,
      views,
    };
  };
  return {
    ...session,
    tabs: session.tabs.map(reconcile),
    closedTabs: session.closedTabs.map(reconcile),
  };
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
  const origin = current.documentId ? [locationOf(current)] : [];
  const tab: TabView = {
    ...current, ...target,
    views: { ...current.views, ...(current.documentId ? { [current.documentId]: viewOf(current) } : {}) },
    past: back ? stack : [...(current.past || []), ...origin].slice(-100),
    future: back ? [...(current.future || []), ...origin].slice(-100) : stack,
  };
  return { ...session, tabs: session.tabs.map(t => t.id === current.id ? tab : t) };
}
