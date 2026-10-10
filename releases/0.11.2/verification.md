# Spindle 0.11.2 verification

Environment: Windows x64, Node.js 24.15.0, pnpm 11.25.0, .NET SDK 10.0.401; 10 October 2026. Portable and NSIS are unsigned, confirmed with Windows Authenticode inspection. SHA-256 verifies integrity, not publisher identity.

## Local checks

- Version consistency, three-language catalog (1,039 keys) and demo-fixture checks passed.
- Full local unit/integration suite: 284/284 passed, including navigation, document persistence, official Play runtime, MCP, installation services and update/release tests. Tests ran with `SPINDLE_LOCALE=zh-TW` and the self-contained Play executable.
- TypeScript passed. Lint passed with zero errors and seven existing image warnings.
- Web build, desktop build/staging and Windows Portable/NSIS packaging passed.
- Six browser UI regression cases passed against the production renderer: first-position marker visibility, insertion between tabs, rejection of drops without a preview, Escape cancellation, native first/last reordering, deletion with duplicate views/history/empty-tab reuse and reload, and Chinese punctuation. Some cases cover multiple related assertions.
- Resource audit passed for 406 archive entries: offline Play helper, MCP/Skill, Worker/WASM and licenses present; no test profiles or example scripts bundled.

## Packaged verification

- Final 0.11.2 Portable passed the English, Traditional Chinese and Simplified Chinese public UI suite, including editor loading, search, settings, custom commands and recovery/history controls. No renderer errors.
- Final Portable startup tests passed: clean profile without a preloaded demo, opening a copied demo, visible native window, Source editor readiness, separate extraction directories, preserving resources after another instance exits, and restoring the window on repeat launch.
- Final Portable passed the actual Electron Play suite with BOM-prefixed scripts: cross-file playback, choices, variable override, rewind, Novel/VN, source links, fixed-version isolation, latest-content restart, character assets, actual MCP context reads and window lifecycle checks. No renderer errors.
- Isolated replacement from the downloaded, SHA-256-verified public 0.11.1 Portable to the final 0.11.2 executable passed: original filename, previous-executable backup, new renderer readiness handshake and saved script edits were preserved.

## Coverage limits

Node.js 24.15.0 was used locally; the CI-pinned Node.js 22 was not separately retested. Hosted CI is not claimed: the most recent available run failed before any steps because of account payment/spending limits. This release uses the recorded local checks; workflow definitions remain configured.

NSIS packaging and artifact identity were checked; clean-account NSIS installation and full online auto-update were not newly tested. Native IME, mixed DPI, multiple monitors, restricted permissions and failed-start update rollback are not newly covered by this patch. See the preceding release reports for earlier acceptance results.

## Publication gate

The source archive must be generated from the final v0.11.2 commit. Release attachments, update metadata, license notices, third-party source archives and verification report are listed in SHA256SUMS-0.11.2.txt. Publication requires downloading the draft attachments back, verifying their hashes, and then checking anonymous release/asset access and update metadata after publication.
