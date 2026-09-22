[English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md)

![Spindle](docs/images/banner.svg)

# Spindle

以本机资料为核心的 Yarn Spinner 剧本编辑器。使用纯文字或阅读编辑撰写对话，在流程图整理故事分支，也能透过 MCP 连接本机 Agent。

[下载 Windows 版本](https://github.com/RyuuMeow/Spindle/releases) · [MCP 接入指南](docs/mcp.md) · [回报问题](https://github.com/RyuuMeow/Spindle/issues)

> 0.10.0 正在准备私有 Release 草稿，正式发布后才提供公开下载。Windows 成品目前未签章。

## 三种视角，同一份故事

![阅读编辑](docs/images/reading.png)

- **纯文字**：补全、参数提示、诊断、快速修正与全局搜寻。
- **阅读编辑**：直接编辑易读的对话，亦可切换只显示台词的阅读模式。
- **流程图**：主动整理、自订节点与卡片位置、pin 理线及持久布局。
- **本机专案**：安静自动保存、多视窗、文件版本历史及专案垃圾桶。
- **个人风格**：全局预设与模式覆写，支援 English／繁体中文／简体中文。

| 故事分支 | 统一搜寻 |
|---|---|
| ![流程图](docs/images/graph.png) | ![搜寻](docs/images/search.png) |

| 编辑器风格 | Agent 整合 |
|---|---|
| ![风格](docs/images/appearance.png) | ![Agent](docs/images/agent.png) |

## 开始撰写

1. 在初始画面开启专案资料夹或建立专案。
2. 按 **Ctrl+P** 选择「新增剧本」，命名后开始撰写。
3. 切换纯文字、阅读编辑或流程图；**Ctrl+Shift+F** 搜寻专案与设定。

设定、历史及垃圾桶保存于专案 `.spindle/`。也支援独立开启 `.yarn`；新工作区不会加入示范专案。

## MCP 与 Skill

在「设定 → MCP／Agent 整合」启用唯读或修改存取，并安装 Codex／Claude Code 使用者层级设定与 Skill。Spindle 需要持续执行。Agent 可读取框选、验证剧本、管理指令并进行有版本保护的修改。

详见 [接入指南](docs/mcp.md) 与 [Skill](skills/spindle/SKILL.md)。安装不改变 Agent 的批准规则。

## 开发

使用 Node.js 22.22.0 及 `package.json` 指定的 pnpm。

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm desktop:start
pnpm test:unit
pnpm lint
pnpm desktop:pack
```

产品版本只修改 `version.json`，执行 `pnpm version:sync`，并于 `releases/<version>/` 维护三语说明。[发布流程](docs/releases.md)。

## 授权与贡献

采 [GPL-3.0-only](LICENSE)；第三方资源保留各自授权，见 [第三方声明](THIRD_PARTY_NOTICES.md)。[贡献指南](CONTRIBUTING.md)。

[架构](docs/workspace-architecture.md) · [UI 规范](docs/ui-design.md) · [版本记录](releases/0.10.0/zh-CN.md)

## 提示与版本历史

| Editor assistance | Version comparison |
|---|---|
| ![Assistance](docs/images/assistance.png) | ![History](docs/images/history.png) |
