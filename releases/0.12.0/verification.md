# Spindle 0.12.0 verification

Environment: Windows x64, Node.js 24.15.0, pnpm 11.25.0, .NET SDK 10.0.401; 13 October 2026. Portable and NSIS are unsigned, confirmed with Windows Authenticode inspection. SHA-256 verifies integrity, not publisher identity.

## Local checks

- Version consistency, three-language catalog (1,083 keys) and demo-fixture checks passed.
- `pnpm test:unit`: 255/255 passed with `SPINDLE_LOCALE=zh-TW`.
- MCP, agent installation, release/update services and Play storage/runtime suites: 62/62 passed. The 12 runtime cases were rerun with `SPINDLE_PLAY_EXECUTABLE` pointing to the staged self-contained helper after the default local DLL path was unavailable; all 12 passed against that shipped helper.
- `pnpm exec tsc --noEmit` passed. `pnpm lint` passed with zero errors and seven existing image warnings.
- `pnpm build`, `pnpm desktop:stage` and `pnpm desktop:pack` passed.
- `pnpm test:inline-markup-ui`: 50 checks passed across Source, Reading and Flowchart editors, covering completion, linked pairs, literal regions, quick fixes and sidebar resizing.
- `pnpm test:inline-ranges-ui`: seven checks passed, covering cycling colors, stacked solid lines, hover, pair-only expansion, graph entry, syntax colors, saved settings and pure-reading gap collapse with exact source offsets.
- `pnpm test:command-overloads-ui`: five groups passed, covering all three editors, constraints, overloaded signatures, manager validation and persistence after restart.
- Resource audit passed for 406 archive entries: version 0.12.0, offline Play helper, MCP/Skill, Worker/WASM and licenses present; no test profiles or example scripts bundled. Required third-party source archive checksums passed.

## Packaged verification

- Final 0.12.0 Portable passed `pnpm test:public-ui` in English, Traditional Chinese and Simplified Chinese, including editor loading, search, settings, commands and recovery/history controls.
- Final Portable passed `pnpm test:portable-launch`: empty clean profile, copied demo opening, visible native window, Source editor readiness, separate extraction directories, resources retained after another instance exits and repeat-launch window restoration.
- Final Portable passed `node scripts/test-play-ui.cjs` with `SPINDLE_PLAY_PORTABLE`: BOM-prefixed scripts, cross-file playback, choices, variable changes, rewind, Novel/VN, source links, version isolation, latest-content restart, character assets, MCP context and window lifecycle.
- Final Portable passed `node scripts/test-portable-update.cjs` using the downloaded, SHA-256-verified public 0.11.2 Portable as its predecessor: original filename, backup, new renderer readiness and saved script content were preserved.

## Coverage limits

Node.js 24.15.0 was used locally; the CI-pinned Node.js 22 was not separately retested. This report records local verification and does not claim hosted CI success. The latest pre-publication hosted run had failed before any job steps; workflow definitions remain configured.

NSIS packaging and artifact identity were checked; clean-account NSIS installation and full online auto-update were not newly tested. Native IME, mixed DPI, multiple monitors, restricted permissions and failed-start update rollback are not newly covered by this release. See preceding release reports for earlier acceptance results.

## Publication gate

Generate the source archive from the final v0.12.0 commit. Release attachments, update metadata, license notices, third-party source archives and this report are listed in SHA256SUMS-0.12.0.txt. Download draft attachments back and verify their hashes before publication; verify anonymous release/asset access and update metadata after publication.
