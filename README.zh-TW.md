[English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md)

![Spindle](docs/images/banner.svg)

# Spindle

以本機資料為核心的 Yarn Spinner 劇本編輯器。使用純文字或閱讀編輯撰寫對話，在流程圖整理故事分支，也能透過 MCP 連接本機 Agent。

[下載 Windows 版本](https://github.com/RyuuMeow/Spindle/releases) · [MCP 接入指南](docs/mcp.md) · [回報問題](https://github.com/RyuuMeow/Spindle/issues)

> 0.10.0 正在準備私有 Release 草稿，正式發布後才提供公開下載。Windows 成品目前未簽章。

## 三種視角，同一份故事

![閱讀編輯](docs/images/reading.png)

- **純文字**：補全、參數提示、診斷、快速修正與全局搜尋。
- **閱讀編輯**：直接編輯易讀的對話，亦可切換只顯示台詞的閱讀模式。
- **流程圖**：主動整理、自訂節點與卡片位置、pin 理線及持久布局。
- **本機專案**：安靜自動保存、多視窗、文件版本歷史及專案垃圾桶。
- **個人風格**：全局預設與模式覆寫，支援 English／繁體中文／简体中文。

| 故事分支 | 統一搜尋 |
|---|---|
| ![流程圖](docs/images/graph.png) | ![搜尋](docs/images/search.png) |

| 編輯器風格 | Agent 整合 |
|---|---|
| ![風格](docs/images/appearance.png) | ![Agent](docs/images/agent.png) |

## 開始撰寫

1. 在初始畫面開啟專案資料夾或建立專案。
2. 按 **Ctrl+P** 選擇「新增劇本」，命名後開始撰寫。
3. 切換純文字、閱讀編輯或流程圖；**Ctrl+Shift+F** 搜尋專案與設定。

設定、歷史及垃圾桶保存於專案 `.spindle/`。也支援獨立開啟 `.yarn`；新工作區不會加入示範專案。

## MCP 與 Skill

在「設定 → MCP／Agent 整合」啟用唯讀或修改存取，並安裝 Codex／Claude Code 使用者層級設定與 Skill。Spindle 需要持續執行。Agent 可讀取框選、驗證劇本、管理指令並進行有版本保護的修改。

詳見 [接入指南](docs/mcp.md) 與 [Skill](skills/spindle/SKILL.md)。安裝不改變 Agent 的批准規則。

## 開發

使用 Node.js 22.22.0 及 `package.json` 指定的 pnpm。

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm desktop:start
pnpm test:unit
pnpm lint
pnpm desktop:pack
```

產品版本只修改 `version.json`，執行 `pnpm version:sync`，並於 `releases/<version>/` 維護三語說明。[發布流程](docs/releases.md)。

## 授權與貢獻

採 [GPL-3.0-only](LICENSE)；第三方資源保留各自授權，見 [第三方聲明](THIRD_PARTY_NOTICES.md)。[貢獻指南](CONTRIBUTING.md)。

[架構](docs/workspace-architecture.md) · [UI 規範](docs/ui-design.md) · [版本記錄](releases/0.10.0/zh-TW.md)

## 提示與版本歷史

| Editor assistance | Version comparison |
|---|---|
| ![Assistance](docs/images/assistance.png) | ![History](docs/images/history.png) |
