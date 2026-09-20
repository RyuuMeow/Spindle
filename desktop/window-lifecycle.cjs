/** Per-window bindings prevent an unrelated cached project from blocking close. */
function scopeOf(item) {
  return item?.projectId || "";
}
function synchronizeBindings(service, windows) {
  service.setActiveProjects([
    ...new Set([...windows.values()].map(scopeOf).filter(Boolean)),
  ]);
}
function flushWindow(service, item) {
  const id = scopeOf(item);
  if (!id) return;
  const failures = service.flush(id),
    p = service.engine.project(id);
  if (failures.length || p.persistenceError || service.profileError)
    throw Error(
      failures
        .map((d) => d.name + "：" + (d.error || "輸入尚未完成"))
        .join("\n") ||
        p.persistenceError ||
        service.profileError,
    );
}
function initialSession(id, projectId = "", remembered) {
  remembered = remembered ? structuredClone(remembered) : undefined;
  return {
    ...(remembered || {}),
    id,
    projectId,
    screen: projectId ? "editor" : "home",
    tabs: remembered?.tabs || [],
    activeId: remembered?.activeId || "",
    closedTabs: remembered?.closedTabs || [],
    left: remembered?.left ?? true,
    lineNumbers: remembered?.lineNumbers ?? false,
    sidebarWidth: remembered?.sidebarWidth || 220,
    readingSize: remembered?.readingSize || 16,
    readingLineHeight: remembered?.readingLineHeight || 29,
    zoom: remembered?.zoom || 1,
  };
}
module.exports = { scopeOf, synchronizeBindings, flushWindow, initialSession };
