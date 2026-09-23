[English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md)

![Spindle](docs/images/banner.svg)

# Spindle

以本机资料为核心的 Yarn Spinner 剧本编辑器。使用纯文字或阅读编辑撰写对话，在流程图整理故事分支，也能透过 MCP 连接本机 Agent。

[下载 Windows 版本](https://github.com/RyuuMeow/Spindle/releases) · [MCP 接入指南](docs/mcp.md) · [回报问题](https://github.com/RyuuMeow/Spindle/issues)

> 0.10.0 正在准备私有 Release 草稿，正式发布后才提供公开下载。Windows 成品目前未签章。

## 三种视角，同一份故事

### 纯文本

直接编写 Yarn，搭配补全、诊断与快速修复。补全列表提供内置与项目自定义命令及参数；将鼠标移到已注册的自定义命令上，可以查看说明和参数。

![纯文本命令补全](docs/images/source.png)

![自定义命令提示](docs/images/assistance.png)

### 阅读编辑

在易读的版面中直接编辑对话，也可以切换到只显示台词的阅读模式。

![阅读编辑](docs/images/reading.png)

### 流程图

需要时主动整理场景，再移动卡片和 pin，保存手动布局。

| 故事分支 | 版本比较 |
|---|---|
| ![流程图](docs/images/graph.png) | ![版本比较](docs/images/history.png) |

本地项目支持安静的自动保存、多窗口、文档历史和可恢复的回收站。编辑器风格可设置全局默认值与模式覆盖，并支持 English、繁體中文和简体中文。

| 统一搜索 | 编辑器风格 |
|---|---|
| ![搜索](docs/images/search.png) | ![风格](docs/images/appearance.png) |

## 开始撰写

1. 在初始画面开启专案资料夹或建立专案。
2. 按 **Ctrl+P** 选择「新增剧本」，命名后开始撰写。
3. 切换纯文字、阅读编辑或流程图；**Ctrl+Shift+F** 搜寻专案与设定。

设定、历史及垃圾桶保存于专案 `.spindle/`。也支援独立开启 `.yarn`；新工作区不会加入示范专案。

## MCP 与 Skill

在「设定 → MCP／Agent 整合」启用唯读或修改存取，并安装 Codex／Claude Code 使用者层级设定与 Skill。Spindle 需要持续执行。Agent 可读取框选、验证剧本、管理指令并进行有版本保护的修改。

![Agent 整合](docs/images/agent.png)

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
