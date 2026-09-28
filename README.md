[English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md)

![Spindle](docs/images/banner.svg)

# Spindle

A local-first Yarn Spinner dialogue editor for writers and game developers. Write, follow your branches, play the story—and work with an MCP assistant that understands where you are editing.

[Download 0.11.1 · Windows x64](https://github.com/RyuuMeow/Spindle/releases/latest) · [Release notes](releases/0.11.1/en.md) · [Report an issue](https://github.com/RyuuMeow/Spindle/issues)

> English · 繁體中文 · 简体中文. Windows x64 Portable and installer builds are unsigned; see the [verification report](releases/0.11.1/verification.md).

## An assistant beside your editor

Select a line in Spindle, switch to your agent and ask: **“Rewrite the passage I selected, keeping this character's voice.”** The agent can request the live editor context instead of asking you to paste the passage or describe which file you mean.

Through MCP, a connected agent can read:

- **Your current document and scene**, including its content version.
- **Your cursor line and column**, nearby source and diagnostics.
- **Exactly what you selected**, including multiple ranges; the last selection remains available when you switch away from Spindle.
- **The chosen project and editor window**, so several open projects do not become one ambiguous “current file.”

That context connects to tools for scene/variable queries, script validation, statistics, command registration, file/folder management and version-protected text edits. Ask “Why does this line have a warning?”, “Register the unknown commands in this project”, or “Shorten this selected dialogue.” Text edits go through Spindle's transactions and Undo. Play context can also report the current dialogue, choices and variables; agent playback controls are not yet available.

**You control access.** MCP is off by default. Enable read-only or editing access in **Settings → MCP / Agent integration**, then install the user-level Codex or Claude Code connection and [Spindle Skill](skills/spindle/SKILL.md). Spindle must remain open. Context is fetched when requested; this is not eye tracking or continuous screen capture. Installing the Skill does not change agent approval rules.

[Connect your assistant](docs/mcp.md)

## Play, inspect and return to the source

Open a separate Play window and switch between a scrolling Novel and a two-line VN presentation without restarting the story. Inspect variables, choices and command events, step back, or follow a source link to edit the original line. Each run keeps its captured version while you continue writing.

| Scrolling Novel | VN presentation |
| --- | --- |
| ![Novel Play with variable inspection](docs/images/play-novel.png) | ![VN Play](docs/images/play-vn.png) |

Characters support automatic name colors, portraits, sprite variants and backgrounds. Character changes autosave; display switches for the editor and Play are independent. Custom commands can have explicit preview effects, without executing arbitrary game code.

Right-click the editor Play button to choose **Default**, **Current document** or a supported **Current line**. Search the default scene in Settings → Play. The official Yarn Spinner runtime is bundled for offline Windows use—no separate .NET installation is needed. [Play guide and current limits](docs/play.md)

## Three views of one story

### Source

Write Yarn directly with completion, diagnostics and quick fixes. Completion includes built-in and project commands with parameter hints; hovering a registered custom command shows its description and signature. Variable types, declarations and source navigation work across project files. Diagnostics stay quiet while you type; configurable dialogue-length advice helps keep lines readable.

![Source command completion](docs/images/source.png)

![Custom command help](docs/images/assistance.png)

### Reading editor

Edit dialogue in a more readable layout, or switch to dialogue-only reading without changing the Yarn source.

![Reading editor](docs/images/reading.png)

### Flowchart

Arrange scenes when you choose, then move cards and pins to preserve your own layout.

![Flowchart](docs/images/graph.png)

## Search, history and appearance

Search scripts, content, settings and commands from one palette. Projects support quiet autosave, document history, multiple windows and a recoverable trash. Shared appearance defaults can be overridden for each editor mode.

| Unified search | Editor appearance |
| --- | --- |
| ![Unified search](docs/images/search.png) | ![Editor appearance](docs/images/appearance.png) |

Compare saved revisions before restoring them.

![Version comparison](docs/images/history.png)

## Start writing

1. Open a project folder or create one from the launcher.
2. Press **Ctrl+P**, choose **New script**, name it and write Yarn.
3. Switch among Source, Reading editor and Flowchart; **Ctrl+Shift+F** searches across the project and settings.

Projects keep configuration, history and trash in `.spindle/`. An existing `.yarn` file can also open on its own. A new workspace starts empty.

To explore branches, copy [The Last Light demo project](examples/demo-project/the-last-light/README.md) to a personal folder and open that folder in Spindle. Its three scripts and custom command definitions are not bundled as your default project.

## Development and license

Use Node.js 22.22.0 and the pnpm version pinned in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm dev                 # Web
pnpm desktop:start       # Windows desktop
pnpm test:unit
pnpm lint
pnpm desktop:pack        # Windows Portable + NSIS
```

`version.json` is the product-version source. Spindle is licensed under [GPL-3.0-only](LICENSE); third-party components keep their own licenses in [third-party notices](THIRD_PARTY_NOTICES.md). See [contributing](CONTRIBUTING.md) and [security reporting](SECURITY.md).

[Architecture](docs/workspace-architecture.md) · [UI conventions](docs/ui-design.md) · [Release process](docs/releases.md) · [Changelog](CHANGELOG.md)
