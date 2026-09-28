# Spindle 0.11.0 verification

Environment: Windows x64, Node.js 22.23.2, pnpm 11.25.0 and .NET SDK 10.0.401. Local validation completed on 28 September 2026. Windows artifacts are **unsigned**; hashes verify integrity, not publisher identity.

## Local results

| Check | Result |
| --- | --- |
| `node scripts/version.mjs --check`, `node scripts/check-i18n.mjs`, `node scripts/sync-demo-fixture.mjs --check` | Passed: version 0.11.0, 1,039 matching keys in three languages, matching demo fixture. |
| `SPINDLE_LOCALE=zh-TW node --test scripts/*.test.mjs` | Passed: 282 tests, including MCP, agent installation, transactions, Play and release services. A hard-coded future-version test fixture was corrected for the new product version before the full passing run. |
| TypeScript `--noEmit`, `node scripts/lint.mjs` | Passed; lint has seven existing image-element warnings and no errors. |
| `node scripts/run-framework.mjs build` | Web build passed. Web Play is not offered. |
| Desktop Vite build, `node scripts/prepare-desktop.mjs`, `node scripts/package-desktop.mjs` | Passed; produced Windows x64 Portable and NSIS, including the offline self-contained Play runtime. |
| `node scripts/test-play-ui.cjs` with `SPINDLE_PLAY_PORTABLE` pointing to the final 0.11.0 Portable | Passed: actual packaged Play, isolated source snapshots, variables, choices, backtracking, characters, narrow VN layout, owner lifecycle and real MCP SDK context reads. |
| `node scripts/test-portable-launch.cjs` | Passed against the final Portable: clean profile, project opening, independent extraction directories, multi-instance resource isolation and repeated-launch focus. |
| `node scripts/test-public-ui.cjs` with `SPINDLE_PORTABLE` pointing to the final artifact | Passed in English, Traditional Chinese and Simplified Chinese. Public screenshots use isolated fictional content and no credentials. |
| `node scripts/test-portable-update.cjs` | Passed from a hash-verified public 0.10.0 Portable to 0.11.0 in an isolated directory: same filename, old-executable backup, new renderer readiness and saved content preserved. This tests replacement and restart, not the complete online download/install UI. |
| Package/resource audit and third-party source verification | Passed: MCP, Skill, Play helper, Worker/WASM and required license resources present; no bundled demo scripts, test profiles, credentials or private user paths found. Four pinned third-party source archives verified. |

The release manifest `SHA256SUMS-0.11.0.txt` contains the exact artifact hashes. The product source archive is generated from the final tagged commit. Release attachments are downloaded back and hash-checked before publication; anonymous access to public assets and update metadata is checked afterward. Those transport checks do not replace runtime or installer tests.

## Scope and remaining coverage

- CI was intentionally skipped because hosted quota is unavailable; local results are not reported as hosted CI passes. Workflow triggers remain configured.
- NSIS packaging passed, but a clean-account installation and end-to-end NSIS auto-update were not exercised in this round.
- Portable download/install UI, failure rollback, locked executables and restricted-write cases were not exercised in this round.
- Actual Codex and Claude Code application loading was not retested; real MCP SDK communication and installation-service tests passed independently.
- Native IME, mixed DPI, multiple monitors and every multi-window restart combination require further device testing.
- Source, Graph and editable-reading performance fixes are included. The reported editable-reading bottom discontinuity was not reproduced with isolated fixtures; it is not claimed resolved. See [Play and editor validation](../../docs/play-validation.md) for measurements and earlier regression coverage.
- Current-line Play supports safe top-level standalone dialogue/narration without interpolation. Web Play, audio and MCP playback mutations are not included.
