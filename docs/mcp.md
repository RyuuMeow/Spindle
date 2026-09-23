[English](mcp.md) · [繁體中文](mcp.zh-TW.md) · [简体中文](mcp.zh-CN.md)

# Spindle MCP and agent integration

Spindle's Windows desktop app hosts a local Streamable HTTP MCP server while it is running. Access is **disabled by default**. Choose read-only or allow changes in **Settings → MCP / Agent integration**. It listens only on `127.0.0.1`; it is not a remote service or an unrestricted filesystem tool. The Web app does not host the server.

## Connect Codex or Claude Code

The settings page can install or update each client's user-level MCP entry and the shared [Spindle Skill](../skills/spindle/SKILL.md). The connection credential is written into that client's local user settings, never into a story project. Installation does not change the agent's approval policy. Reload the agent or start a new session after installation. **Configuration written**, **Spindle handshake succeeded**, and **agent loaded the tools** are distinct states.

Codex defaults to `$CODEX_HOME/config.toml` (or `~/.codex/config.toml`) and `~/.agents/skills/spindle/`. Claude Code defaults to `~/.claude.json` and `~/.claude/skills/spindle/`; a custom `CLAUDE_CONFIG_DIR` is respected. The actual target paths appear before installation. Changed or unowned entries and edited Skill files are reported as conflicts rather than silently overwritten. Remove only deletes unchanged managed entries; another profile's shared Skill remains.

To install manually, copy `skills/spindle/` into the appropriate personal Skill directory and merge the connection shown by Spindle into the client's user settings. **Do not commit the copied credential.** The examples below use placeholders; copy the actual URL and token from the running app.

```toml
[mcp_servers.spindle]
url = "http://127.0.0.1:PORT/mcp"
http_headers = { Authorization = "Bearer TOKEN" }
```

```json
{
  "mcpServers": {
    "spindle": {
      "type": "http",
      "url": "http://127.0.0.1:PORT/mcp",
      "headers": { "Authorization": "Bearer TOKEN" }
    }
  }
}
```

Changing the port or resetting the credential marks managed connections as needing an update. Disable access to revoke the old credential; reset it and update the client after exposure. `Check connection` tests a handshake and tool listing, not whether an external agent has loaded the configuration. See the official [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [Codex Skills](https://learn.chatgpt.com/docs/build-skills), [Claude Code MCP](https://code.claude.com/docs/en/mcp) and [Claude Code Skills](https://code.claude.com/docs/en/skills) references.

## Sessions and editing context

Spindle has projects, window-bound editor sessions, and point-in-time context snapshots. Call `list_editor_sessions`, or `list_projects` and `open_project` for a known project. If one project has several windows, choose a specific `editorSessionId`; do not assume the foreground window is the intended target. `activate_editor_session` normally selects the operation target without focusing the window. Every project tool still requires that ID. An ID expires when the window closes, changes workspace, or the app restarts; tab changes do not invalidate it.

`get_editor_context` asks the target renderer for its current document, source version, cursor, exact selections, visible source ranges, nearby diagnostics and recognized scene/variable/command. It preserves the last selection after Spindle loses focus. Utility tabs report their own page type and a separate last document ID; unsubmitted settings and command drafts are not exposed as document content. Reading selections map back to raw Yarn offsets. Graph selections can identify scenes, branch cards, lines and pins; node-editor positions map to the full document. A visible range is **not** eye tracking.

Raw ranges use zero-based, end-exclusive **UTF-16 offsets**, including CRLF and BOM. Displayed cursor line and column are one-based. Responses flag truncation, synchronization and composition. If `composing:true`, `synchronized:false`, or pending document IDs are present, do not apply a screen range to an assumed source version. Use `read_document` for full text; the context snapshot has size limits.

## Tools

| Group | Tools and purpose |
| --- | --- |
| Sessions | `list_editor_sessions`, `list_projects`, `open_project`, `activate_editor_session`, `reveal_location`, `get_editor_context` |
| Read and analyze | `read_document`, `query_project`, `validate_project`, `get_statistics` |
| Semantic edits | `update_commands`, `apply_changes`, `apply_quick_fixes` |
| Project entries | `list_project_entries`, `create_document`, `create_folder`, `move_entry`, `trash_entry`, `list_trash`, `restore_trash` |

`query_project.kind` supports `documents`, `scenes`, `links`, `variables`, `references`, `commands`, `calls` and `unknown_commands`. Results are paginated. Static diagnostics do not claim to model all Yarn execution. Registering a custom command defines editor assistance; the game must implement the command separately.

Project entry tools only target the selected **project**, never arbitrary paths or standalone files. `list_project_entries` includes empty folders, tree order, document IDs and relative paths. An entry key is `file:<DocumentId>` or `folder:<relative path>`. Write tools operate on one item per call and support `preview`. Creating a document accepts optional initial text. Moving an item includes same-parent rename. Trash preserves complete folders and non-Yarn children; restore may choose a unique recovered name. Permanent deletion remains a UI confirmation action, not an MCP tool.

## Versioned writes and recovery

Read a snapshot, preview a proposed change, then submit with its `snapshotId` and a unique `operationId`. A preview makes **no disk changes**. The final call rechecks versions, tree state, input composition, shared windows, path containment and name conflicts. Do not reuse a snapshot after relevant project content changes. Unknown results can be retried with the **same** operation ID; a different request with the same ID is rejected. If a result says `applied:true` with `persistenceError` or `recoveryRequired`, the change already happened: do not create a second item or repeat a text edit under a new ID.

Text edits use document IDs, expected versions and explicit source ranges. A batch is one text Undo transaction. Cross-file scene rename verifies the referenced document set. Commands have their own revision and history; text and command changes are not one atomic operation. Pending IME composition, unsynchronized text and node drafts block affected writes. The UI's 800 ms diagnostic-display delay does not delay `validate_project` for synchronized content.

Common failures include `EDITOR_SESSION_EXPIRED`, `SNAPSHOT_EXPIRED`, `VERSION_CONFLICT`, `INPUT_PENDING`, `MCP_READ_ONLY` and `OPERATION_ID_REUSED`. Re-enumerate an expired target; never redirect a stale ID to another project. The app keeps a limited operation summary without story text. MCP settings and credentials live in the local App profile, not `.spindle` or release assets.

Run `pnpm test:mcp` for SDK/client and version checks; `pnpm test:mcp-ui` uses an isolated desktop profile after `pnpm desktop:stage`. The server exposes 20 tools in v1. Graph layout and pin modification, background editing without Spindle, remote access, Resources and Prompts are outside this version.
