[English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md)

![Spindle](docs/images/banner.svg)

# Spindle

A local-first Yarn Spinner dialogue editor for writers and game developers. Write in source or a reading editor, arrange your story on a flowchart, and connect a local agent through MCP.

[Download Windows builds](https://github.com/RyuuMeow/Spindle/releases) · [MCP guide](docs/mcp.md) · [Report an issue](https://github.com/RyuuMeow/Spindle/issues)

> 0.10.0 is being prepared as a private release draft. Downloads become public only after publication. Windows builds are currently unsigned.

## Your story, three views

![Reading editor](docs/images/reading.png)

- **Source** — completion, parameter help, diagnostics, quick fixes and project-wide search.
- **Reading editor** — readable dialogue with inline editing and a dialogue-only reading mode.
- **Flowchart** — automatic arrangement when requested, movable cards, pins and saved manual layouts.
- **Local projects** — quiet autosave, multiple windows, per-document history and a recoverable project trash.
- **Your workspace** — shared style defaults with per-mode overrides, English / 繁體中文 / 简体中文.

| Follow the branches | Find anything |
|---|---|
| ![Flowchart](docs/images/graph.png) | ![Unified search](docs/images/search.png) |

| Make it yours | Connect an agent |
|---|---|
| ![Appearance](docs/images/appearance.png) | ![Agent integration](docs/images/agent.png) |

## Start writing

1. Open a project folder or create a new project from the launcher.
2. Press **Ctrl+P** and choose **New script**. Name it and start writing Yarn.
3. Switch between Source, Reading editor and Flowchart. **Ctrl+Shift+F** searches across the project and settings.

Projects store configuration, history and trash in `.spindle/`. Existing `.yarn` files can also be opened independently. No demo project is inserted into your workspace.

## MCP and Skill

Enable read-only or editing access in **Settings → MCP / Agent integration**. Install the user-level Codex or Claude Code connection and Skill from the same page. Spindle must remain running. The agent can inspect selections, validate scripts, manage commands and perform version-protected edits.

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

## Assistance and history

| Editor assistance | Version comparison |
|---|---|
| ![Assistance](docs/images/assistance.png) | ![History](docs/images/history.png) |
