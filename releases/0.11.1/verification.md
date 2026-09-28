# Spindle 0.11.1 verification

Environment: Windows x64, Node.js 22.23.2, pnpm 11.25.0, .NET SDK 10.0.401; 28 September 2026. Portable and NSIS are unsigned. SHA-256 verifies integrity, not publisher identity.

## Local checks

- Version, three-language catalog (1,039 keys) and demo-fixture checks passed.
- Full local unit/integration suite: 283/283 passed, including the new BOM regression, official runtime, MCP, installation service and release tests.
- TypeScript, lint (zero errors; seven existing image warnings), Web build, desktop build and Windows packaging passed.
- The native runtime regression covers BOM-prefixed title headers, cross-file playback, unchanged body characters, CRLF, Unicode, current-line entry and exact original source offsets. Invalid title syntax still reports its original position.
- Resource audit: 406 archive entries; offline Play helper, MCP/Skill, Worker/WASM and licenses present. No demo scripts, test profiles, credentials or private user paths found.

## Packaged verification

- Final 0.11.1 Portable passed the actual Electron Play suite with BOM-prefixed scripts in both files: playback, cross-file choices, variable overrides, rewind, Novel/VN, source links, captured-version isolation, latest-content restart, character assets, actual MCP SDK context reads, two-window isolation and lifecycle checks. No renderer errors.
- The first packaged test exposed an additional Source synchronization defect: the Monaco React adapter could insert a second BOM after remote text changes, causing PLAY_INPUT_PENDING on latest-content restart. The adapter input was corrected; staged and rebuilt Portable tests both passed. The first failed build is not distributed.
- Isolated replacement from the public 0.11.0 Portable to the final 0.11.1 executable passed: original filename, previous-executable backup, renderer readiness and saved content retained.
- Documentation links and both unsigned artifact identities were checked.

## Coverage limits

CI is intentionally skipped because hosted quota is unavailable; workflow triggers remain configured. NSIS packaging is tested, but clean-account installation and full NSIS auto-update are not newly tested. The Portable replacement test does not cover the entire online download/install UI, failed-start rollback, locked files or restricted permissions. Native IME, mixed DPI, multiple monitors and actual Codex/Claude Code application loading are not retested in this hotfix. See the [0.11.0 report](../0.11.0/verification.md) for the preceding full presentation and three-language UI checks.

Release attachments are downloaded back and checked against SHA256SUMS-0.11.1.txt before publication. After publication, anonymous range downloads check executable/source access, exact bytes and size; complete anonymous downloads check update metadata. Public GitHub asset digests must match the same local hashes. The source archive is generated from the final v0.11.1 commit.
