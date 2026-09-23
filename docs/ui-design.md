[English](ui-design.md) · [繁體中文](ui-design.zh-TW.md) · [简体中文](ui-design.zh-CN.md)

# Spindle interface conventions

These rules describe the current dark Windows desktop and Web workspace. Historical reviews are archived under [history/](history/); the [verification report](../releases/0.10.0/verification.md) distinguishes implemented behavior from device cases not tested. UI copy is available in English, Traditional Chinese and Simplified Chinese; Yarn source, user stories and custom command content are never translated.

## Launcher and workspaces

The launcher is separate from the editor. It offers **Open project folder**, **Create project**, a searchable full project list and access to global settings. A missing project path is dimmed and marked with an SVG warning; it can be removed from the list but not opened or renamed. Creating a project shows the parent, full destination and inline validation; it never merges into an existing folder. The Project menu lists at most five recent projects, but removing a recent item does not remove it from the complete list. Closing a project saves it before returning to the launcher. Standalone `.yarn` windows hide project-only actions. Legacy pathless drafts are managed under **Settings → Data recovery**.

## Shell, tabs and navigation

The first Windows row is a 44 px title/tab bar with native caption safety space. The second is a 42 px navigation and mode toolbar. A centered 1 px divider separates Project from the tabs. Document tree is on the left, current-document outline on the right; the outline is opened only by its toolbar toggle and retains its preference across normal navigation. Narrow windows temporarily show one auxiliary sidebar without overwriting its saved open/width preference. Splitters show hover/focus feedback and support keyboard movement.

A tab is a **view container**, not a unique file. Clicking the tree, an ordinary search result, the outline or a diagnostic navigates within the current TabId and retains its mode. Middle click, Ctrl+Enter, the tab plus, or an explicit new-tab action creates a new container. Each tab retains its own history, selection, scroll and graph viewport; all views of one document share text and Undo. Switching away from settings, commands or recovery does not reset that tab's controls or diff preview.

New script/scene names appear inline in their owning list. Enter or valid blur commits; Escape cancels without creating a file/source block; IME Enter does not commit. Invalid names or I/O failures leave the input in place. Folder arrows have a fixed 24 px control column and a centered SVG, with no hover fill; arrow click expands, name click selects, double click renames. A project tree drag uses a white insertion line, and trash is the ordinary delete destination.

## Unified search and creation

Global search, Ctrl+P and the add-tab action share one light popup (roughly 680 px wide, near the upper center) without a dark backdrop or confirm button. The default scope is all for global search and file-oriented for Ctrl+P/add-tab. It can find names/paths, script content, settings fields, custom commands and actions. Empty queries show **New script** first, recent scripts and settings/command entries. `New`, `新增` and `新建` match creation; a valid no-result query can become **Create “query” as script**, while an invalid filename explains why. Results show their type and essential context. Settings results reveal a category/field; command results reveal a definition without applying a draft.

Arrow keys change the active result, Enter opens, Ctrl+Enter or middle click opens a new tab, and Esc returns focus. Composition must not trigger navigation. Search input and result-list focus changes keep the popup open; leaving the popup closes it. Creating from search first opens a **provisional editor tab** and then an inline name; cancel removes only that provisional tab and restores the source tab. Utility tab state remains untouched.

## Editor assistance, diagnostics and reading

Source completion and custom command help use the same rounded, layered popover grammar as option/parameter help; default Monaco/VS Code square boxes are suppressed. A diagnostic at the hovered range takes priority over generic command help, and only one assistance popover is visible. Parameter help appears for an empty positional argument without being blocked by its temporary missing-value diagnostic. Find controls are aligned; tooltips never overlap or flicker against their own buttons. In source, selection and cursor height follow glyphs rather than filling the configured line-height. Editor style settings are global with per-mode inherited overrides; UI chrome retains its own type and colors.

Typing, deletion, paste and Undo/Redo immediately hide local diagnostic underlines, hover errors and automatic quick fixes; the current analysis still powers completion. Diagnostics appear after an 800 ms pause or when the caret leaves the edited command/line. IME composition remains protected. The problems panel and toolbar counts use the last complete publication. Explicit checks and Alt+Enter can inspect completed input immediately. No stale diagnostic should be displayed at a remapped/deleted source range.

The reading editor keeps dialogue readable while allowing direct editing; dialogue-only reading hides commands/tags without altering source. Outline and cross-file navigation use source positions and expand a folded destination. The graph has a separately saved manual layout: explicit auto-arrange, centered ports, movable cards/pins, branch grouping and local reroutes. Selecting a line or branch card does not open the sidebar. Graph gestures have their own layout Undo, while node text uses document Undo.

## Recovery, saving and confirmation

Project history, document history, command versions and trash are distinct. Selecting a trash item shows its preview without navigating away; restoring removes it from trash, retains the recovery page and selects the next/previous item. Version switching does not reset diff mode. Permanent delete of one/all trash items requires a compact confirmation and never deletes current scripts or command versions. Routine save is quiet; failure or a delayed workspace-exit save is visible. Project switching/close/restart keeps the editor until all applicable workspaces are safely prepared. Unapplied command drafts must be applied or discarded before a restart/update; ordinary tab close discards them.

Surfaces have four levels: shell, docked panels, editor and floating layers. Docked panels use narrow gutters, restrained contrast and small rounded corners; shadows are primarily for popovers. The same rounded control grammar applies to completion, quick fixes, Find, settings and menus. Focus, hover, selected and disabled states keep consistent geometry instead of shifting icons or text. Product UI links to locale-matched guides, while the portable Skill and legal texts remain English.
