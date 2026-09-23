[English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md)

![Spindle](docs/images/banner.svg)

# Spindle

A local-first Yarn Spinner dialogue editor for writers and game developers. Write in source or a reading editor, arrange branches on a flowchart, and connect a local agent through MCP.

[Download Windows x64](https://github.com/RyuuMeow/Spindle/releases) · [Release notes](releases/0.10.0/en.md) · [Report an issue](https://github.com/RyuuMeow/Spindle/issues)

> Portable and installer builds are unsigned. Review the [verification report](releases/0.10.0/verification.md) before installing.

## Three views of one story

### Source

Write Yarn directly with completion, diagnostics and quick fixes. Completion includes built-in and project commands with parameter hints; hovering a registered custom command shows its description and signature.

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

## MCP and Skill

Enable read-only or editing access in **Settings → MCP / Agent integration**, then install a user-level Codex or Claude Code connection and the [Spindle Skill](skills/spindle/SKILL.md). Keep Spindle running. An agent can inspect selections, validate scripts, manage commands and make version-protected edits; Skill installation does not change agent approvals.

![Agent integration](docs/images/agent.png)

[Connection and installation guide](docs/mcp.md)

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
