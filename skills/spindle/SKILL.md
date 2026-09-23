---
name: spindle
description: Work with a running local Spindle Yarn editor through its MCP tools: inspect the user's selection, query scenes and variables, validate scripts, register commands, and edit project documents or folders with version protection.
---

# Spindle

Use the connected Spindle MCP tools for the user's requested authoring task. Installing this skill does not authorize additional edits or require extra confirmation for already authorized work.

## Choose the target

Call `list_editor_sessions`; match the project/window the user specified. Use `list_projects` and `open_project` for a known project that is not open. If multiple sessions remain plausible, ask which one. Do not choose by desktop focus alone. Carry the explicit `editorSessionId` on every project tool. `activate_editor_session` does not establish an implicit target. Keep `focus:false` unless the user asks to bring the window forward.

Session IDs expire on restart, close, or workspace rebinding. Re-list expired sessions; never silently switch projects.

## Understand the current text

Use `get_editor_context` for the current selection, caret, visible source, and snapshot. Utility tabs are not script editors; `lastDocumentId` is context, not a substitute for the active selection. Check composing, synchronization, and pending-input status before using positions. Do not end the user's composition.

Read missing source with `read_document`, following pagination. Offsets are zero-based UTF-16, with an exclusive end, including CRLF and BOM. Lines and columns are one-based. Do not replace text from a truncated response. Reading-mode selections map to original Yarn and may include hidden syntax. Visible source is not eye tracking.

Use `query_project`, `validate_project`, and `get_statistics` instead of guessing semantic facts. Unknown command call examples are not definitive parameter types. Registering a command only creates its editor definition, not its game implementation.

## Make changes

For an open workspace, prefer Spindle transactions and project-entry tools over direct filesystem edits: they preserve document identity, shared windows, unsaved text, and recovery history. Do not bypass a rejected transaction by rewriting the file on disk.

Read a fresh snapshot and the versions needed by the operation. Use the tool's current input schema as the authority. Preview when useful for a complex change; it is not an extra approval requirement. Commit only the scope the user requested. Cursor movement after capture does not change the original edit target.

Use a unique `operationId` for a logical write. If delivery is uncertain, retry the identical request with the same ID. If preconditions changed, re-read and form a new operation. `applied:true` with a persistence error means the change already happened: report the save problem rather than submitting it again.

Use `apply_changes` for text and scene operations, `apply_quick_fixes` for selected diagnostic candidates, and `update_commands` for command definitions. Command history and text Undo are separate; re-read between the two. Version conflicts require re-analysis, not forced overwrites.

Use `list_project_entries` for paths, empty folders, document IDs, and entry keys. Use `create_document`, `create_folder`, `move_entry`, `trash_entry`, `list_trash`, and `restore_trash` for project objects. Root parent is the empty string. New document names include `.yarn`. Preserve returned IDs; filename changes do not rename scene titles. Creation/restoration does not reveal a tab unless `reveal_location` is requested. Trash is reversible; permanent deletion is not an MCP tool.

Graph context and source lookup are supported; graph layout, pins, and routing edits are not. If tools are unavailable, explain that Spindle must be running and its MCP connection enabled; do not claim to have read or changed the live editor.

After edits, validate affected content and report the actual change and save status briefly. Do not claim static checks prove game runtime behavior.
