[English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md)

![Spindle](docs/images/banner.svg)

# Spindle

A local-first Yarn Spinner dialogue editor for writers and game developers. Write in source or a reading editor, arrange your story on a flowchart, and connect a local agent through MCP.

[Download Windows builds](https://github.com/RyuuMeow/Spindle/releases) · [MCP guide](docs/mcp.md) · [Report an issue](https://github.com/RyuuMeow/Spindle/issues)

> 0.10.0 is being prepared as a private release draft. Downloads become public only after publication. Windows builds are currently unsigned.

## Your story, three views

### Source

Write Yarn directly with completion, diagnostics and quick fixes. Completion suggests built-in and project commands with their parameters; hovering a registered custom command shows its description and signature.

![Source command completion](docs/images/source.png)

![Custom command help](docs/images/assistance.png)

### Reading editor

Edit dialogue in a more readable layout, or switch to a dialogue-only reading mode.

![Reading editor](docs/images/reading.png)

### Flowchart

Arrange scenes when you choose, then move cards and pins to keep a manual layout.

| Follow the branches | Compare revisions |
|---|---|
| ![Flowchart](docs/images/graph.png) | ![Version comparison](docs/images/history.png) |

Local projects provide quiet autosave, multiple windows, document history and a recoverable trash. Shared style defaults can be overridden per mode in English, 繁體中文 or 简体中文.

| Find anything | Make it yours |
|---|---|
| ![Unified search](docs/images/search.png) | ![Editor appearance](docs/images/appearance.png) |

## Start writing

1. Open a project folder or create a new project from the launcher.
2. Press **Ctrl+P** and choose **New script**. Name it and start writing Yarn.
3. Switch between Source, Reading editor and Flowchart. **Ctrl+Shift+F** searches across the project and settings.

Projects store configuration, history and trash in `.spindle/`. Existing `.yarn` files can also be opened independently. No demo project is inserted into your workspace.

## MCP and Skill

Enable read-only or editing access in **Settings → MCP / Agent integration**. Install the user-level Codex or Claude Code connection and Skill from the same page. Spindle must remain running. The agent can inspect selections, validate scripts, manage commands and perform version-protected edits.

![Agent integration](docs/images/agent.png)

Read the [connection guide](docs/mcp.md) and [portable Skill](skills/spindle/SKILL.md). Agent installation does not change its approval policy.

## Development

Use Node.js 22.22.0 and the pnpm version pinned in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm dev                 # Web
pnpm desktop:start       # Windows desktop
pnpm test:unit
pnpm lint
pnpm desktop:pack        # Portable + NSIS
```

`version.json` is the only manually edited product version. Run `pnpm version:sync`, add notes in `releases/<version>/`, then run `pnpm version:check`. [Release process](docs/releases.md).

## License and contributing

Spindle is licensed under [GPL-3.0-only](LICENSE). Third-party components retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md). [Contribution guide](CONTRIBUTING.md).

[Architecture](docs/workspace-architecture.md) · [UI conventions](docs/ui-design.md) · [Release notes](releases/0.10.0/en.md)
