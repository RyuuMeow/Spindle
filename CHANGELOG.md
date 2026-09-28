# Changelog

[English](CHANGELOG.md) · [繁體中文詳細記錄](CHANGELOG.zh-TW.md)

## 0.11.1

Fix Play compilation of UTF-8 BOM-prefixed scripts: an invisible encoding marker before `title:` could cause the official compiler to report “Nodes must have a title”. Compilation now treats only the leading marker as whitespace, without changing script content or source offsets. Also prevent duplicated BOMs during Source editor synchronization from blocking a latest-content Play restart. The original 0.11.0 binaries are affected; update to 0.11.1.

[Release notes: English](releases/0.11.1/en.md) · [繁體中文](releases/0.11.1/zh-TW.md) · [简体中文](releases/0.11.1/zh-CN.md) · [Verification](releases/0.11.1/verification.md)

## 0.11.0

Adds Windows Play with Novel/VN presentation, reversible runtime checkpoints, source links, character/asset configuration and preview effects. Adds default/document/current-line launch modes, weighted dialogue-length advice and two read-only MCP Play tools. Improves character autosave, list editors, responsive panels, Source/Reading/Graph scrolling and menu tooltip behavior. Live MCP editor context includes the document, cursor and exact selected text; the README now foregrounds this workflow.

[Release notes: English](releases/0.11.0/en.md) · [繁體中文](releases/0.11.0/zh-TW.md) · [简体中文](releases/0.11.0/zh-CN.md) · [Verification](releases/0.11.0/verification.md)

## 0.10.0

Unified search across scripts, content, settings and commands; provisional script creation in a new tab; English, Traditional Chinese and Simplified Chinese UI; legacy draft recovery in Settings; versioned Windows Portable and NSIS update flows. The public demo project and locale-matched guides are separate from the empty default workspace.

[Release notes: English](releases/0.10.0/en.md) · [繁體中文](releases/0.10.0/zh-TW.md) · [简体中文](releases/0.10.0/zh-CN.md) · [Verification](releases/0.10.0/verification.md)

## 0.9.2

Added user-level Codex and Claude Code MCP/Skill installation, update, handshake check and removal; retained existing client settings and handled conflicts. Tab can move outside a paired quote, command or bracket when appropriate.

## 0.9.1

Added quiet diagnostic presentation during typing, MCP project-entry management, and demo-free application bootstrap.

## 0.9.0

Introduced a separate project launcher, project catalog, standalone `.yarn` editing, project-local history and trash, and a recovery view.

Earlier per-change notes, including graph layout and editor assistance revisions, remain in the [Traditional Chinese detailed history](CHANGELOG.zh-TW.md).
