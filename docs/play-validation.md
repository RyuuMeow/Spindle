# Play A–D acceptance evidence

This is a local Windows x64 acceptance build on `feat/play-preview`, not a new official release. Product version remains 0.10.0. Phase E and later roadmap items are not implemented by this change.

## Environment and completed checks

- Windows 10.0.26200 x64; Node 22.23.2; Electron 43.3.0; TypeScript 5.9.3.
- Official Yarn Spinner 3.2.1, pinned upstream commit `3a5b7343f715e4e9a3705fa4224e7fa510b92f1c`; privately installed .NET SDK 10.0.401; self-contained runtime 10.0.12.
- `SPINDLE_LOCALE=zh-TW node --test scripts/*.test.mjs`: **247 passed**, zero failed. This includes seven official runtime tests, four preview/host tests, existing editor/layout/workspace tests, MCP SDK tests and installation service tests. The existing suites assert Chinese messages and require the same locale as CI; an initial system-English run failed those locale assertions, then passed with the configured locale.
- `node node_modules/typescript/bin/tsc --noEmit`: passed.
- `node scripts/lint.mjs`: no errors; seven `no-img-element` warnings for local raster/data-URL images. No remote image optimizer is used for offline project assets.
- `node scripts/check-i18n.mjs`: 1,024 central messages verified across three locales. Play strings additionally use typed three-language tuples.
- `node scripts/version.mjs --check`: passed, 0.10.0 unchanged.
- `node scripts/run-framework.mjs build`: Web build passed, with existing chunk/static route classification notices.
- Vite desktop build and `node scripts/prepare-desktop.mjs`: passed, including self-contained helper publication and license staging.
- `node scripts/test-public-ui.cjs`: English, Traditional Chinese and Simplified Chinese desktop/search/settings regression passed.
- `node scripts/test-play-ui.cjs`: actual Electron and authenticated MCP client passed with an isolated project/profile. Covers cross-file playback, unavailable options and typed override, rewind, mode switch without runtime mutation, source reveal, frozen source versus explicit latest restart, one Play per owner, imported raster/config persistence, actual MCP context parity, invalid/wrong-owner IDs, two same-project windows with independent variables, and owner-close cleanup.

## Runtime evidence

Tests execute the official compiler/runtime: conditional choices, detour/return, variable interpolation and assignment sources, `once`, `visited_count`, deterministic random rewind, alternate branch after rewind, invalid functions/source, and bounded loops. The public The Last Light fixture compiles and reaches its ending. UTF-8 pipes preserve Chinese, emoji and CRLF; duplicate dialogue is located using compiler source information. Host failure tests reject missing/closed helpers without unhandled pipe errors.

Preview effects are pure event replay. Tests exercise declarative mappings, rewind without future visual state, invalid asset references, revision conflicts, corrupted configuration preservation and standalone write rejection. Reading decoration tests remain passing; execution overlays do not modify graph layout state.

## Artifact verification

The acceptance Portable is built with `node scripts/package-desktop.mjs --portable-only --config.directories.output=release/play-preview --config.portable.artifactName=Spindle-0.10.0-Play-preview-x64.exe`. It is unsigned. No installer, version tag, remote Release or public publication is produced.

Final Portable execution, package inventory and SHA-256 are recorded below after verification.

## Remaining manual coverage and scope

- No claim of physical IME composition, mixed-DPI/multiple-monitor interaction, screen-reader review, or long-duration large-project performance testing. The existing pending/composition guards are reused; source/mapping and keyboard behavior are covered programmatically where listed.
- Same-project multi-window isolation is tested natively; simultaneous independent-project Play windows have not received a separate manual run. Each owns a separate helper and is checked against its editor session.
- No clean OS image with .NET uninstalled was used. The packaged helper is self-contained and is tested directly without SDK invocation; this is distinct from a clean-machine certification.
- No Windows installer or in-place update validation is part of this acceptance delivery. CI was not run; the user's CI quota restriction is not represented as a pass.
- Web playback, audio, game-side command implementation, exact-line starts, MCP playback mutations and named test runs remain out of first-round scope. Commands only execute configured visual previews, never arbitrary game code.
- Official compiler/runtime messages retain upstream wording; surrounding Play controls, labels and guide text support all three UI languages.

Local test logs and isolated profiles are under ignored `outputs/`; they are not distributed in the application or committed to the repository.
