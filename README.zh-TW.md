[English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md)

![Spindle](docs/images/banner.svg)

# Spindle

以本機資料為核心的 Yarn Spinner 劇本編輯器。使用純文字或閱讀編輯撰寫對話，在流程圖整理故事分支，也能透過 MCP 連接本機 Agent。

[下載 Windows 版本](https://github.com/RyuuMeow/Spindle/releases) · [MCP 接入指南](docs/mcp.md) · [回報問題](https://github.com/RyuuMeow/Spindle/issues)

> 0.10.0 正在準備私有 Release 草稿，正式發布後才提供公開下載。Windows 成品目前未簽章。

## 三種視角，同一份故事

### 純文字

直接撰寫 Yarn，搭配補全、診斷與快速修正。補全清單提供內建與專案自訂指令及參數；滑鼠移到已註冊的自訂指令上，可以查看說明與參數。

![純文字指令補全](docs/images/source.png)

![自訂指令提示](docs/images/assistance.png)

### 閱讀編輯

以易讀的版面直接編輯對話，也可以切換只顯示台詞的閱讀模式。

![閱讀編輯](docs/images/reading.png)

### 流程圖

需要時主動整理場景，再移動卡片與 pin，保存手動布局。

| 故事分支 | 版本比較 |
|---|---|
| ![流程圖](docs/images/graph.png) | ![版本比較](docs/images/history.png) |

本機專案支援安靜自動保存、多視窗、文件歷史及可復原的垃圾桶。編輯器風格可設定全局預設與模式覆寫，並支援 English、繁體中文及简体中文。

| 統一搜尋 | 編輯器風格 |
|---|---|
| ![搜尋](docs/images/search.png) | ![風格](docs/images/appearance.png) |

## 開始撰寫

1. 在初始畫面開啟專案資料夾或建立專案。
2. 按 **Ctrl+P** 選擇「新增劇本」，命名後開始撰寫。
3. 切換純文字、閱讀編輯或流程圖；**Ctrl+Shift+F** 搜尋專案與設定。

設定、歷史及垃圾桶保存於專案 `.spindle/`。也支援獨立開啟 `.yarn`；新工作區不會加入示範專案。

## MCP 與 Skill

在「設定 → MCP／Agent 整合」啟用唯讀或修改存取，並安裝 Codex／Claude Code 使用者層級設定與 Skill。Spindle 需要持續執行。Agent 可讀取框選、驗證劇本、管理指令並進行有版本保護的修改。

![Agent 整合](docs/images/agent.png)

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
