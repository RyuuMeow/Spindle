[English](play.md) · [繁體中文](play.zh-TW.md) · [简体中文](play.zh-CN.md)

# Play preview — acceptance build

This Windows desktop preview implements the first development round (A–D). It does not change the published 0.10.0 release. Web Play, audio, precise line entry, saved test cases and agent-controlled playback are deferred.

## Try a story

Open a project and press Play beside the editor mode buttons. Playback starts at the current scene's beginning; if no scene can be identified, choose a start scene. Each editor window owns one Play window and a separate runtime. Standalone files compile only that document.

Novel mode accumulates dialogue; VN mode shows a background, three actor positions and a dialogue box. Switching modes preserves the run. Next first completes the typewriter, then advances. Auto pauses at choices and errors. The debug panel provides variable search, pins, typed test overrides, conditions, commands and source links. Unavailable options remain visible; an unavailable reason is not invented.

Back restores the previous dialogue/choice/override checkpoint, including the official VM, variables, visits, random generator, events and visual effects. A new choice discards the old future. Overrides affect the run, not the script. At a choice, changing a variable recalculates that option group without replaying preceding commands.

## Characters and effects

Open Characters and preview from the Project menu, search or Play. Speaker names are discovered from dialogue; display names do not rename source text. Import PNG, JPEG or WebP, assign a default portrait and named portrait/sprite variants, then save. Missing media uses a name fallback.

Project data lives in `.spindle/preview.json`; content-addressed images live in `.spindle/preview-assets/`. References are project-relative. Imports are limited to 20 MB each and a loaded snapshot to 100 MB. Configuration updates validate the revision; malformed configuration is preserved.

The custom command editor provides declarative preview bindings for background, show, hide and expression effects, with zero-based argument indexes and a fixed left/center/right position. The Characters page can configure the same bindings. Unbound commands create evaluated event cards and continue. No JavaScript, shell or game implementation is executed. Unknown functions needed for evaluation are errors, not ignored commands.

## Versions and source links

A run fixes its synchronized in-memory documents, command definitions and preview configuration. Composition or unsynchronized drafts block capture. Editing marks the run stale but does not replace its program. Restart uses the captured program; use latest explicitly recompiles. Source links map only unchanged ranges; ambiguous changes open a read-only snapshot.

Reading views use default portraits without changing source offsets. Graph badges and route accents indicate observed execution only; they do not rearrange nodes, change pins or claim unvisited paths are unreachable. Closing/rebinding the owner ends its helper; closing Play has no story-save prompt.

## Runtime and MCP

The offline, self-contained Windows x64 helper uses official Yarn Spinner 3.2.1 and .NET 10.0.12. No separate .NET install or network server is required. Main-process ownership checks isolate windows. Private JSON-lines pipes carry versioned state. Execution is bounded to 100,000 VM instructions per advance, 10,000 events per run and a 30-second request timeout; closing Play terminates a stuck helper.

`vendor/yarn-spinner/UPSTREAM.md` identifies the pinned upstream and concentrated debug extensions. Compilation and expression evaluation remain official Yarn code. Checkpoints are process-local and not persisted. The UI labels official compiler diagnostics separately from editor diagnostics.

MCP adds `list_play_sessions(editorSessionId)` and `get_play_context(editorSessionId, playSessionId)`. Both work in read-only mode and return no edit authority. Context is separate from the editor selection; events, choices and variable strings carry truncation indicators. Playback mutations and precise source entry belong to phase E.

## Build and verify

Install Node/pnpm from the repository configuration and .NET SDK 10.0.401. `SPINDLE_DOTNET` can point to a private SDK. Run `node scripts/build-play-runtime.mjs`, then `node --test scripts/play-runtime.test.mjs scripts/play.test.mjs`. Desktop staging publishes the self-contained runtime and copies its licenses. `node scripts/test-play-ui.cjs` exercises real Electron and an MCP client with an isolated profile; set `SPINDLE_PLAY_PORTABLE` to test the final Portable instead of staging.

See [acceptance evidence](play-validation.md) for actual checks and remaining manual scenarios.

