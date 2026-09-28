[English](play.md) · [繁體中文](play.zh-TW.md) · [简体中文](play.zh-CN.md)

# Play preview — acceptance build

This Windows desktop preview implements A–D plus editor launch modes. It does not change the published 0.10.0 release. Web Play, audio, unrestricted source entry, saved test cases and agent-controlled playback are deferred.

## Try a story

Open a project and press Play beside the editor mode buttons. The button shows active feedback during startup and while its Play window exists; pressing it again interrupts the run and closes that window. Closing Play directly resets the editor button. Each editor window owns one Play window and a separate runtime. Standalone files compile only that document.

Right-click Play to select its launch mode: Default uses the scene name in Settings → Play (initially `Start`); Current document starts at that document's first scene in source order; Current line requests a validated direct source entry. The checked mode and default scene are saved in the local App profile. Changing modes affects the next launch, not an existing run. A missing scene or invalid source entry reports an error rather than silently selecting another location.

The editor Play button shows its mode beside the icon. Settings → Play offers a searchable scene dropdown populated from all documents in the current workspace. Typing filters the open list; arrows and Enter select, Escape cancels. A saved scene missing from this workspace remains unchanged until another scene is selected. The story area has no persistent launch-mode banner.

Current-line entry currently accepts standalone, top-level dialogue without interpolation in a straight-line scene. It initializes declared variables and skips preceding execution; the editor button tooltip explains this. Scenes containing conditional branches or options, as well as headers, comments, commands and interpolation, are rejected. Restart retains the captured entry. Recompiling a changed entry document requires launching again from the editor, so an old line number cannot target unrelated new content.

Novel mode accumulates dialogue; VN mode shows a background, three actor positions and a dialogue box. Switching modes preserves the run. Next first completes the typewriter, then advances. Auto remains enabled while waiting for a choice and resumes after a manual selection; errors stop Auto. The debug panel provides variable search, pins, typed test overrides, conditions, commands and source links. Unavailable options remain visible; an unavailable reason is not invented.

Back restores the previous dialogue/choice/override checkpoint, including the official VM, variables, visits, random generator, events and visual effects. A new choice discards the old future. Overrides affect the run, not the script. At a choice, changing a variable recalculates that option group without replaying preceding commands.

## Characters and effects

Open Characters and preview from the Project menu, search or Play. Speaker names are discovered from dialogue; display names do not rename source text. Import PNG, JPEG or WebP, assign a default portrait and named portrait/sprite variants, with automatic saving. Missing portraits use a colored placeholder.

Project data lives in `.spindle/preview.json`; content-addressed images live in `.spindle/preview-assets/`. References are project-relative. Imports are limited to 20 MB each and a loaded snapshot to 100 MB. Configuration updates validate the revision; malformed configuration is preserved.

The custom command editor provides declarative preview bindings for background, show, hide and expression effects, with zero-based argument indexes and a fixed left/center/right position. The Characters page can configure the same bindings. Unbound commands create evaluated event cards and continue. No JavaScript, shell or game implementation is executed. Unknown functions needed for evaluation are errors, not ignored commands.

## Versions and source links

A run fixes its synchronized in-memory documents, command definitions and preview configuration. Composition or unsynchronized drafts block capture. Editing marks the run stale but does not replace its program. Restart uses the captured program; use latest explicitly recompiles. Source links map only unchanged ranges; ambiguous changes open a read-only snapshot.

Reading views use default portraits without changing source offsets. Graph badges and route accents indicate observed execution only; they do not rearrange nodes, change pins or claim unvisited paths are unreachable. Closing/rebinding the owner ends its helper; closing Play has no story-save prompt.

## Runtime and MCP

The offline, self-contained Windows x64 helper uses official Yarn Spinner 3.2.1 and .NET 10.0.12. No separate .NET install or network server is required. Main-process ownership checks isolate windows. Private JSON-lines pipes carry versioned state. Execution is bounded to 100,000 VM instructions per advance, 10,000 events per run and a 30-second request timeout; closing Play terminates a stuck helper.

`vendor/yarn-spinner/UPSTREAM.md` identifies the pinned upstream and concentrated debug extensions. Compilation and expression evaluation remain official Yarn code. Checkpoints are process-local and not persisted. The UI labels official compiler diagnostics separately from editor diagnostics.

MCP adds `list_play_sessions(editorSessionId)` and `get_play_context(editorSessionId, playSessionId)`. Both work in read-only mode and return no edit authority. Context is separate from the editor selection; events, choices and variable strings carry truncation indicators. MCP playback mutations and source-entry operations remain deferred.

## Build and verify

Install Node/pnpm from the repository configuration and .NET SDK 10.0.401. `SPINDLE_DOTNET` can point to a private SDK. Run `node scripts/build-play-runtime.mjs`, then `node --test scripts/play-runtime.test.mjs scripts/play.test.mjs`. Desktop staging publishes the self-contained runtime and copies its licenses. `node scripts/test-play-ui.cjs` exercises real Electron and an MCP client with an isolated profile; set `SPINDLE_PLAY_PORTABLE` to test the final Portable instead of staging.

See [acceptance evidence](play-validation.md) for actual checks and remaining manual scenarios.


## Desktop presentation

The shell and scrolling novel use Spindle's shared color, type and control tokens. VN has a separate game presentation: an inset translucent message window, attached speaker label, sans-serif story text and centered choices. Source links stay in the debug panel, outside the VN stage. Game view hides editor controls; Escape returns focus to its entry button. At narrow widths the debug panel opens over the stage only when requested.

The message window reserves two lines. VN shows no page counter or Continue label: a small continuation triangle appears when ready; clicking the message or using the keyboard advances. Clicking completes the current display page, then moves to the next page; only the final page advances the runtime. Overflow uses measured grapheme-safe pages, not scrolling or reduced font size. Resizing retains the source character anchor. Pointer, keyboard and Auto share this progression. VN uses a game pointer and does not select text; dragging does not advance. The transparent space after the Novel transcript is also an advance surface, with a blinking cue while enabled. Click or Enter/Space first reveals the text and then advances; dragging, reading earlier text, or waiting for a choice never selects an answer. Reduced motion keeps the cue still. Rapid consecutive VN clicks are accepted, including the second click of a double-click; pending runtime requests are not duplicated. Opening history, following a source link, errors, and reading earlier novel text stop Auto. Choices only suspend advancement, preserving the Auto toggle. Novel scroll position survives switching modes. OS reduced-motion preference disables typewriter animation without rewriting the saved preference. Restarting creates a new run identity so identical first lines animate again.

## Presentation and saving

Characters save valid changes after 400 ms and flush when leaving a field or character. Composition and invalid input retain the draft. Disjoint remote changes merge; a conflicting field offers reload or explicit resubmission of local changes. There is no daily Save button. Merely selecting a scanned speaker does not create project data.

Editor appearance has separate portrait and name-color switches; Source name colors have their own opt-in. Settings → Play independently controls Novel portraits and Play name colors, live across windows without changing the run. Automatic name colors are stable by source name; custom colors remain exact. Missing portraits use a colored placeholder, and disabling portraits removes their space. VN nameplates never contain portraits. VN sprites and backgrounds remain visible.

Compile results have a bottom panel with a toolbar toggle, close button and draggable/keyboard-resizable separator. Height and visibility persist. A new compilation failure opens it once; ordinary updates do not reopen a closed panel. In immersion, View compile results returns to the tool view. The VN triangle is decorative; click the dialogue area or use Enter/Space to advance. Auto and history are plain text game controls; Auto shows ON/OFF with distinct colors. Both presentations keep scene/location status in the debug sidebar, outside the story area. Stop ends the run while keeping the window and debug records available; the window close control closes Play.
