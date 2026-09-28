# Spindle 0.11.0

## Features
- Play your story in a separate Windows window, with scrolling Novel and two-line VN presentations sharing the same run.
- Inspect variables, choices, command events and source locations; step back to restore execution and preview state.
- Configure characters, portraits, sprites and declarative preview effects with automatic saving and independent editor/Play appearance preferences.
- Choose a persistent Play launch mode: default scene, current document or supported current line. Search all workspace scenes in the default-scene selector.
- Let a connected MCP assistant read Play sessions and context alongside the existing live editor document, cursor and exact selections. Spindle now exposes 22 tools; agent playback control is not included.

## Improvements
- Weighted dialogue-length advice, with a configurable threshold and quiet diagnostics while typing.
- More consistent Characters/Commands list editors, searchable dropdowns, responsive panels and a resizable compilation-results dock.
- Reliable rapid VN advancement, Novel background-area advancement, clear Auto ON/OFF and preserved Auto state while choices wait.
- Less repeated work during Source scrolling, editable-reading viewport updates and Graph zoom/pan; manual graph positions and pins remain intact.
- Fixed provisional script naming on blur, appearance-tab scrolling, context-menu animation and lingering Play tooltips.

## Runtime and limits
Play bundles the official Yarn Spinner 3.2.1 compiler/runtime with a self-contained .NET helper; no separate .NET installation is needed. A run retains its captured story version until explicitly restarted with the latest content. Custom command preview bindings do not implement game code.

Current-line entry supports top-level standalone dialogue/narration without interpolation; nested branches, commands and expressions are not entry points. Web Play, audio, saved test cases and MCP playback mutations remain outside this release.

## Distribution
Windows x64 Portable and NSIS packages are unsigned. See the accompanying verification report for actual package checks and untested scenarios. The reported editable-reading bottom discontinuity was not reproduced in isolated fixtures; performance measurements are not a guarantee of stutter-free operation in every project.
