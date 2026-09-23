[English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md)

![Spindle](docs/images/banner.svg)

# Spindle

以本機資料為核心的 Yarn Spinner 劇本編輯器。使用純文字或閱讀編輯撰寫對話，在流程圖整理故事分支，也能透過 MCP 連接本機 Agent。

[下載 Windows x64](https://github.com/RyuuMeow/Spindle/releases) · [版本說明](releases/0.10.0/zh-TW.md) · [回報問題](https://github.com/RyuuMeow/Spindle/issues)

> Portable 與安裝版尚未簽章。安裝前請參閱[驗證報告](releases/0.10.0/verification.md)。

## 三種視角，同一份故事

### 純文字

直接撰寫 Yarn，搭配補全、診斷與快速修正。補全包含內建及專案自訂指令與參數提示；滑鼠移到已註冊的自訂指令可查看說明及簽名。

![純文字指令補全](docs/images/source.png)

![自訂指令提示](docs/images/assistance.png)

### 閱讀編輯

以易讀版面直接編輯對話，也能切換只顯示台詞的閱讀模式，不改變 Yarn 原文。

![閱讀編輯](docs/images/reading.png)

### 流程圖

需要時主動整理場景，移動卡片及 pin 並保存自己的布局。

![流程圖](docs/images/graph.png)

## 搜尋、歷史與風格

從同一清單搜尋劇本、內容、設定與指令。專案提供安靜自動保存、文件歷史、多視窗及可復原垃圾桶；編輯器風格可用全局預設並按模式覆寫。

| 統一搜尋 | 編輯器風格 |
| --- | --- |
| ![搜尋](docs/images/search.png) | ![風格](docs/images/appearance.png) |

復原前可先比較保存的版本。

![版本比較](docs/images/history.png)

## 開始撰寫

1. 從初始畫面開啟專案資料夾或建立新專案。
2. 按 **Ctrl+P** 選「新增劇本」，命名並撰寫 Yarn。
3. 在純文字、閱讀編輯和流程圖之間切換；**Ctrl+Shift+F** 搜尋專案與設定。

設定、歷史與垃圾桶保存在 `.spindle/`；也能獨立開啟 `.yarn`。新工作區保持空白。

想試用分支，可將 [The Last Light 示範專案](examples/demo-project/the-last-light/README.md) 複製到個人資料夾後在 Spindle 開啟。三份劇本及自訂指令定義不會成為預設專案。

## MCP 與 Skill

在「設定 → MCP／Agent 整合」啟用唯讀或修改存取，再安裝使用者層級的 Codex／Claude Code 連線與 [Spindle Skill](skills/spindle/SKILL.md)。Spindle 須持續執行。Agent 可讀取框選、檢查劇本、管理指令並進行版本保護修改；安裝 Skill 不改變 Agent 批准規則。

![Agent 整合](docs/images/agent.png)

[接入與安裝指南](docs/mcp.zh-TW.md)

## 開發與授權

使用 Node.js 22.22.0 及 `package.json` 指定的 pnpm。

```sh
pnpm install --frozen-lockfile
pnpm dev                 # Web
pnpm desktop:start       # Windows 桌面
pnpm test:unit
pnpm lint
pnpm desktop:pack        # Windows Portable + NSIS
```

產品版本以 `version.json` 為準。Spindle 採 [GPL-3.0-only](LICENSE)；第三方元件保留各自授權，見[第三方聲明](THIRD_PARTY_NOTICES.md)。另見[貢獻指南](CONTRIBUTING.md)及[安全問題回報](SECURITY.md)。

[架構](docs/workspace-architecture.zh-TW.md) · [UI 規範](docs/ui-design.zh-TW.md) · [發布流程](docs/releases.zh-TW.md) · [版本記錄](CHANGELOG.md)
