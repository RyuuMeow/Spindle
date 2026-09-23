# Spindle 0.10.0 candidate verification

This is a private, unsigned release candidate. It is not approved for public publication.

## Passed locally

- TypeScript type checking and lint.
- 191 unit tests, 25 MCP integration tests, 12 agent installation tests and 6 release/restart tests.
- 1,023 message keys have identical coverage in English, Traditional Chinese and Simplified Chinese.
- Web and Windows desktop builds; Portable and NSIS artifact production.
- Isolated three-language desktop UI: search, provisional creation cancellation, reading, graph, settings, assistance and history.
- Actual Portable replacement from 0.9.2: original filename, previous executable backup, new renderer readiness handshake and saved document content preserved.
- Actual Portable language restart: runtime language stayed unchanged until restart, the same profile/project/tab was restored in Simplified Chinese, and saved content remained identical.
- Settings deep links: indentation, whitespace, reading width, startup preference, MCP port and zoom were found, revealed and focused without rebuilding the settings page.
- Final Portable archive and offline MCP/Skill installation were checked; both client configuration formats completed handshake, context read, edit/Undo and uninstall in isolated homes. Actual Codex/Claude CLI executables were unavailable in that environment.
- Current source/history secret-pattern scan: no matches among 1,022 historical text objects. This is a bounded pattern scan, not a security certification.

## Not yet passed / publication gates

- GitHub hosted CI did not start. The account reported failed payments or a spending limit restriction; no runner steps executed. Run: https://github.com/RyuuMeow/Spindle/actions/runs/35713561488
- End-to-end NSIS electron-updater installation and restart have not been verified on a clean Windows machine.
- Complete Portable download-to-install UI flow, rollback after a newly launched binary fails, locked files and insufficient permissions need further real-machine coverage. The actual replacement helper was exercised separately.
- Real multi-window language restart, native IME, DPI and multi-monitor combinations remain unverified beyond component/save-coordinator tests.
- Public anonymous update checks remain unavailable while the repository/release is private; no private credential is embedded in the product.
- Windows publisher signatures are absent. SHA-256 verifies asset integrity, not publisher identity.

Do not interpret the private draft or a successful download as completion of these publication gates.
