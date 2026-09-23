[English](workspace-architecture.md) · [繁體中文](workspace-architecture.zh-TW.md) · [简体中文](workspace-architecture.zh-CN.md)

# Workspace architecture

Spindle keeps Yarn text as the content authority. Source, reading, graph node editors, tabs, and windows share stable `DocumentId`s and versioned text transactions. Layout, preferences, command definitions and project history have separate persistence and Undo boundaries. Historical design notes live under [history/](history/); they are not current implementation contracts.

## Documents, tabs and synchronization

`app/workspace/types.ts` defines projects, documents, tabs, sessions and IPC operations. `engine.ts` owns document versions and Undo/Redo; it uses CodeMirror ChangeSets to rebase concurrent window edits and reject stale operations. Original CR characters are preserved so CRLF and BOM positions are not silently normalized. `client.ts` holds each renderer's optimistic view. During IME composition, it delays that window's outgoing and remote transactions and reconciles them after composition. The main process owns disk state; renderers do not access Node filesystem APIs directly.

Each tab is a view container with its own navigation, mode, selection, reading state and graph layout. Tabs viewing the same document share text and document history, while graph layout history is per view. Switching a utility tab hides but does not remount its settings or command page. Unsaved command definition drafts remain in that tab's memory and are discarded on close; applied definitions have separate command history. Recovery page selection and diff mode persist as view state.

`storage.ts` validates data and retains migration or recovery copies when old or damaged data is encountered. Legacy pathless drafts are available in **Settings → Data recovery**; their transfer/delete receipt prevents resurrection from old localStorage. A new profile and new project start empty. The public [The Last Light example](../examples/demo-project/the-last-light/README.md) is used by generated test fixtures, never as app bootstrap content.

## Desktop workspace lifecycle

`DesktopWorkspace` separates home, project and standalone `.yarn` sessions. `project-catalog.ts` stores the complete known-project list and recent marker; the Project menu displays at most five recent projects. `workspace-cache.ts` loads only active workspaces. Opening folders, files, drag-in and launch arguments use normalized real paths and directory boundaries; a known deepest containing project wins. Other `.yarn` files open as standalone documents without secretly creating a project.

The main process tracks which windows use a workspace and stops its watcher only after the last window leaves. Close, project switch and restart prepare all finished editor transactions, persist the relevant view, then flush **that workspace** before clearing the old UI. Save failures, conflicts or unfinished composition keep the editor open. Multi-window restart/update requires every window's prepare handshake to succeed before any window closes. App-level appearance and language preferences are saved separately in the profile.

Projects use `.spindle/project.json`, `.spindle/history/`, `.spindle/trash/` and operation journals. The tree model retains empty folders and mixed order. Entry planning in `project-entries` is shared by UI and MCP; writes reject root/`.spindle`/outside paths, symlink or junction escapes, name conflicts and moving a folder into itself. Rename/move preserves DocumentId and associated tabs, history and graph anchors. `RecoveryStore` moves full folders, including non-Yarn files, to app-managed trash and restores without overwriting existing names. Journals distinguish disk changes from metadata persistence so interrupted operations can be recovered rather than repeated blindly.

## Analysis, diagnostics and search

Parsing and command/variable assistance share semantic helpers across the UI and MCP. The renderer's `DiagnosticPresentation` keeps latest analysis separate from visible diagnostics: editing a command or source line hides local markers, hover and automatic fixes until 800 ms after typing stops or the cursor leaves, while completion and parameter hints remain immediate. The problem list and toolbar use the last complete published results. MCP `validate_project` checks synchronized content immediately and reports composition or unsynchronized state.

`app/workspace/search.ts` defines mixed results for documents, content, settings, commands and actions. The settings registry owns field IDs used by search deep links. New-script search results open a provisional tab, then create the file only after inline naming succeeds; cancel leaves no empty disk file. Recent search and locale aliases do not change project data by themselves.

## Graph layout and editing

`graph/model.ts` builds scenes, independent transitions and branch groups from source ranges. React Flow owns canvas interaction and measurement. `graph/layout-state.ts` stores node positions, center-side ports, routes, pins, branch trunks and card anchors. Existing positions and viewport migrate in place. `graph/layout-engine.ts` runs ELK Layered and libavoid-js in a worker for explicit full or selected layout and necessary local repairs. Document/layout versions reject stale worker output; failure preserves the prior layout. Moving an unrelated node should retain unaffected valid routes. The graph does not infer arbitrary Yarn execution paths.

`graph/map-sources.ts` maps anchors through shared document transactions, including offscreen or closed views. Ambiguous full-document replacement does not inherit an unrelated transition's manual geometry. Route cards are selectable React Flow nodes; pins and cards alter routing without writing Yarn text. Scene-node text edits use the normal document transaction and Undo; a drag is a separate layout history entry. Route snapping and lane separation keep a shared source prefix while offsetting divergent destinations. Engine/WASM resources and license notices are bundled for offline desktop operation.

## MCP, installation and updates

`desktop/mcp-windows.cjs` registers runtime editor-session IDs and mediates precise renderer context requests. `app/mcp/use-agent-context.ts` supplies live source positions. `desktop/mcp/application.ts` owns snapshot validation, operation deduplication and semantic actions; `desktop/mcp/runtime.ts` implements the loopback Streamable HTTP protocol and credential checks. The [MCP guide](mcp.md) defines its external contract. The installer manages only selected Codex/Claude user configuration and the shared Skill, with ownership hashes and recovery records; it does not install a second server or alter agent trust settings.

`version.json` is the manually maintained product version. `app/i18n/` contains the three offline interface catalogs. `desktop/restart.cjs` coordinates language restart and update saves. `desktop/update-service.ts` accepts only the configured GitHub repository, version, platform and asset type, and verifies SHA-256 before installation. Installed builds use electron-updater for NSIS; Portable uses a separate Windows helper with a previous-executable backup. Production checks only publicly released stable versions, and downloads start after explicit user action. See the [release process](releases.md) and [verification report](../releases/0.10.0/verification.md) for test boundaries.
