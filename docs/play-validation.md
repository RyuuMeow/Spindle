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

- Final Portable: `release/play-preview/Spindle-0.10.0-Play-preview-x64.exe` (187,603,478 bytes).
- SHA-256: `c1ec8363f8b10656edab39b9931b524e25b33b4ffde72ee4fcccbcee61c22d1a`.
- Actual final Portable passed the Electron/MCP workflow above using `SPINDLE_PLAY_PORTABLE`, including same-project dual-window isolation. `DOTNET_ROOT` pointed at a nonexistent runtime directory; no SDK launcher was used.
- Closing and reopening that Portable with the same isolated profile preserves the imported portrait/configuration and saved edited script, creates a fresh Play ID and resets run variables. Reopening from the restored utility tab correctly requires an explicit start scene. The test navigates the restored page instead of assuming a particular document tab remains selected.
- The packaged `app.asar.unpacked/desktop/play-runtime/Spindle.Play.exe` independently passed all seven runtime tests under the same invalid `DOTNET_ROOT`.
- `node scripts/verify-play-package.mjs`: 406 ASAR inventory entries verified, with Play/MCP runtime, native runtime DLL, Worker/WASM and dependency notices. No test/profile/example/SDK directories, selected fixture dialogue or private-key markers were present. This inventory check is not a claim of an exhaustive security audit.
- `Get-AuthenticodeSignature` reports `NotSigned`, regardless of electron-builder's generic “signing” progress messages.

## Remaining manual coverage and scope

- No claim of physical IME composition, mixed-DPI/multiple-monitor interaction, screen-reader review, or long-duration large-project performance testing. The existing pending/composition guards are reused; source/mapping and keyboard behavior are covered programmatically where listed.
- Same-project multi-window isolation is tested natively; simultaneous independent-project Play windows have not received a separate manual run. Each owns a separate helper and is checked against its editor session.
- No clean OS image with .NET uninstalled was used. The packaged helper is self-contained and is tested directly without SDK invocation; this is distinct from a clean-machine certification.
- No Windows installer or in-place update validation is part of this acceptance delivery. CI was not run; the user's CI quota restriction is not represented as a pass.
- Web playback, audio, game-side command implementation, exact-line starts, MCP playback mutations and named test runs remain out of first-round scope. Commands only execute configured visual previews, never arbitrary game code.
- Official compiler/runtime messages retain upstream wording; surrounding Play controls, labels and guide text support all three UI languages.

Local test logs and isolated profiles are under ignored `outputs/`; they are not distributed in the application or committed to the repository.

## Desktop presentation polish — 2026-09-24

Branch: `feat/play-presentation-polish`. This section describes the source/staging polish; the Portable hash above belongs to the earlier acceptance build and does **not** include this polish.

The desktop shell/novel now reuse product tokens. A separate VN stage uses a wide translucent dialogue band, independent name treatment, serif dialogue, choice bands and an optional game view. Source controls remain in debugging. The renderer preserves novel backreading, pauses Auto during history/source/backreading, supports reduced motion, and uses a fresh run ID for restart presentation. Actor position classes are namespaced to prevent the editor's global center-panel CSS from painting behind a sprite.

### Role review and corrections

Reviews used subagents acting as Desktop UI/UX, game-art UI/UX, PM and adversarial QA; they were not external human reviews. The game-art role directly implemented the VN module. Desktop and PM were reviewed as separate passes by the same reviewer agent because of the concurrent agent limit.

- Round 1: the desktop reviewer found splitter shortcut bubbling, typography mismatch, missing full-line announcements and focus restoration. PM found ambiguous empty/terminal states and loss of novel backreading. Game/QA found long-line scrolling, rerun identity and Auto interruption defects. These were corrected before the second visual pass.
- Round 2: Desktop/PM identified identical-line announcements and VN Auto continuing during backreading. Both were corrected; source review closed these findings and the latter passed an actual timed desktop test. Game-art review approved the demonstrated VN direction, while requiring bright-background/actor/long-content evidence.
- Final contrast review: QA and the implementation review detected the central actor's inherited `.center` background. All three position classes were isolated and a transparent-background regression assertion added. The final native rerun passed.

### Evidence

- `node node_modules/typescript/bin/tsc --noEmit`: passed.
- `SPINDLE_LOCALE=zh-TW node --test scripts/*.test.mjs`: 247 passed, zero failures.
- `node scripts/lint.mjs`: zero errors; seven existing local-image optimization warnings.
- Web and desktop builds passed; existing chunk-size notices remain.
- `node scripts/test-play-ui.cjs`: real Electron and MCP flow passed; evidence at ignored `outputs/play-ui/1790255311944/`.
- `node scripts/test-play-presentation.cjs`: eleven scenarios passed at `outputs/play-presentation/1790255904250/`, including native splitter keys; first-click reveal/second-click advance; rerun identity; reduced-motion full text; overflowing dialogue and reset; VN Auto backreading and history pauses beyond 5.3 seconds; novel mode-switch scroll retention; fourteen long choices at 760 × 540; immersion Escape focus restoration; bright background, three transparent synthetic actor images and long CJK dialogue. Renderer errors were empty.
- Synthetic PNGs are disposable contrast/layout probes generated inside the isolated test renderer, not bundled game artwork. Test measurements permit one CSS pixel at fractional Windows scale boundaries.

Still unverified this round: final Portable packaging, real screen-reader output, physical IME/touchpad/touch interaction, other DPI/multiple monitors, full keyboard traversal, all fade transitions, localized long toolbar screenshots, and a dedicated normal-Auto-to-options timed test. No CI or Release was run. These limits do not invalidate the narrower checks above and are not presented as passes.

## Reference-led VN iteration — 2026-09-24

This supersedes the previous round's full-width/serif/scrolling presentation. The user requested a one-to-two-line baseline after reference analysis; two lines are a product constraint, not a universal rule inferred from commercial games. Aokana, ATRI, Summer Pockets and a STEINS;GATE counterexample informed separate observations of message placement, names, text and controls. The implementation is an original proposal, not a replica or an approved global token change.

The VN surface now uses an inset translucent message window, attached name tag and sans-serif text. Narration preserves text geometry while hiding the name tag. Product chrome and novel remain on shared tokens. Actual DOM line measurement creates grapheme-safe local pages when needed; concatenated pages retain the original text, and resize retains a source character anchor. Only finishing the final page advances the runtime. Pointer, toolbar, keyboard and Auto share the progression decision; MCP/event history still describe the complete runtime line.

Four-role review used subagents as Desktop UI/UX, game-art UI/UX, PM and adversarial QA (Desktop/PM were separate passes by one agent). Review caught a real options-state defect: the page counter could show unread pages while the mouse control was disabled, although the keyboard could advance. Local page navigation is now allowed while waiting for a choice, without changing runtime revision; the last page waits for a choice and Auto remains stopped. Game-art feedback accepted the demonstrated visual hierarchy and contrast as a proposal, not user aesthetic approval. Synthetic actors/backgrounds are layout probes, not representative final game art.

Validation below concerns local staging; no Portable, installer, CI or Release was produced in this iteration. Physical IME/touch, screen-reader speech, different DPI/multiple monitors and finished illustration composition remain unverified.

- TypeScript check passed; all 247 unit/integration tests passed.
- Lint passed with zero errors and seven existing local-image warnings. Final Web and desktop builds passed (existing bundle-size and upstream XML-documentation warnings remain).
- Real Electron/MCP regression: `outputs/play-ui/1790258744866/` passed.
- Final native presentation regression: `outputs/play-presentation/1790259005574/` passed all 15 checks with no renderer errors: fixed two-line geometry; exact page concatenation including whitespace and family emoji; pointer reveal/page/runtime boundaries; narrow/wide source-anchor reflow; rerun; reduced motion; Auto/page/history; novel scroll retention; 14 options at 760×540; mouse and keyboard paging while options wait; last-page disabled behavior; immersion focus; bright three-actor transparency; short English/CJK; and timed Auto-to-options stop without selection.
- The first added Auto-to-options assertion sampled backend state before the renderer's IPC update completed. It now requires the actual UI to stop within a bounded two-second wait and still verifies unchanged revision afterward; the final rerun passed. No failure is counted as a pass.

User review then identified a presentation mismatch that role reviews had missed: a visible page counter and Continue/Next page labels exposed tool mechanics inside the VN. The visible counter and advance labels are removed. A small filled continuation triangle appears only when the message can advance and its current text is fully revealed. The transparent 36px hit target and accessible action name remain; no button background or visible pagination is added. Local pagination data remains internal for tests. This correction supersedes the screenshots reviewed before it.

Final user-correction build: `outputs/play-presentation/1790259220286/` passed 16 checks with no renderer errors. Added assertions confirm no visible page counter or advance text, a preserved accessible name and 36px hit target, and hidden/visible continuation glyph states during typing, ready text and the final options page. Desktop staging was rebuilt for these screenshots. TypeScript passed after the cue change.

## Character, layout and Play corrections — 2026-09-25

Branch: `feat/character-presentation-and-play-fixes`. This round supersedes the earlier manual character Save workflow and the 36px VN advance button. It does not change the product version or build a release package.

Implemented independent editor/Source/Play character display preferences; stable automatic versus exact custom name colors; neutral portrait borders and solid missing-image placeholders; per-field preview autosave with revision checks, disjoint-field merge and explicit conflict resubmission; responsive character list drawers; provisional filename blur/cancel/background completion; stable appearance-mode scroll; container-aware editor widths and overflow tools; shared weighted static dialogue-length warnings; decorative VN continuation cues and plain text controls; and a persistent, resizable compiler-results dock. Play preferences use a dedicated authenticated read-only IPC channel, not the editor-only workspace request channel.

### Review and corrections

Subagents reviewed actual screenshots and behavior as Desktop UI/UX, game-art UI/UX, PM and adversarial QA. Desktop and PM were separate passes by one agent. These are role reviews, not independent human sign-off or user art approval.

- Desktop/PM found separator shortcuts advancing the story, lost focus after closing compiler results, and an unreadable active tab at 200% zoom. These were fixed and exercised in Electron.
- Game art found low automatic-name contrast on the previous blue nameplate and an intrusive native option scrollbar. The nameplate was darkened and the game scrollbar styled; text controls have no hover background, border or active underline. The continuation triangle is a decorative span; its location remains within the message area's delegated click surface.
- QA found missing spaces in English style previews and IME Enter/Escape reaching Play actions. Preview spacing and composition guards were corrected. Live preference tests then exposed an editor-only IPC scope failure; the restricted Play channel was added and preference updates passed without changing runtime revision.
- Conflicting character changes now offer explicit resubmission of only locally changed fields. Ordinary autosave never silently chooses a conflicting local value. Tests cover typing during an in-flight save, invalid values, composition, merge, conflict and resubmission.

### Local evidence

- `SPINDLE_LOCALE=zh-TW node --test scripts/*.test.mjs`: **276/276 passed**; includes MCP, installation services, weighted length, quiet diagnostic timing, character presentation, autosave and preference persistence.
- TypeScript passed. Lint: zero errors, seven existing local-raster image warnings. Three-language catalog: 1,038 keys verified. Web and desktop builds passed with existing large-chunk and upstream .NET documentation warnings.
- Real Electron/MCP flow: `outputs/play-ui/1790268283181/` passed.
- Character/layout native run: `outputs/character-layout/1790268847213/`, **10/10**, no renderer errors. Covers blur, cancellation, background tab creation, synthetic composition, autosave/character switching, character drawer focus, style scrolling, compiler failure auto-open once and keyboard resizing/focus return.
- At an approximately 800-DIP window, 100/125/150/200% App zoom produced central editor widths of 563/403/320/388 CSS px, respectively. Native `capturePage` was used for zoom evidence; ordinary Playwright screenshots were found to crop high-zoom content and were not treated as evidence of product clipping.
- Play presentation run: `outputs/play-presentation/1790268968663/`, **20/20**, no renderer errors. Includes two-line page fidelity, pointer/keyboard/Auto boundaries, pending choices, novel backreading, bright synthetic assets, live Play preference isolation, borderless normal/hover/active controls and synthetic IME guards.

No CI, Release, Portable or installer was produced. Physical Windows IME, screen-reader speech, mixed-DPI/multi-monitor operation, real game artwork composition and prolonged large-project use remain unverified. Synthetic composition and generated art probes are explicitly narrower evidence. Existing frozen-run behavior remains: character configuration changes require latest restart; display switches apply immediately without runtime mutation.

Final three-language native UI run: `outputs/public-ui-1790268969854/` passed English, Traditional Chinese and Simplified Chinese. The test-generated README screenshots were restored afterward; this round does not refresh public marketing assets.
