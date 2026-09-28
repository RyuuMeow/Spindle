[English](README.md) · [繁體中文](README.zh-TW.md) · [简体中文](README.zh-CN.md)

![Spindle](docs/images/banner.svg)

# Spindle

以本機資料為核心的 Yarn Spinner 劇本編輯器。撰寫、整理分支、試跑故事，也能讓 MCP 助手理解你目前正在編輯的位置，陪你一起修改。

[下載 0.11.0 · Windows x64](https://github.com/RyuuMeow/Spindle/releases/latest) · [版本說明](releases/0.11.0/zh-TW.md) · [回報問題](https://github.com/RyuuMeow/Spindle/issues)

> English · 繁體中文 · 简体中文。Windows x64 Portable 與安裝版未簽章，詳見[驗證報告](releases/0.11.0/verification.md)。

## 像坐在編輯器旁邊的助手

在 Spindle 反白一句台詞，切到 Agent 說：**「幫我改寫剛剛反白的段落，保留這個角色的語氣。」** Agent 可以按請求讀取即時編輯情境，不必再請你貼上內容、解釋是哪份文件。

透過 MCP，連線的助手能取得：

- **目前文件與場景**，以及對應的內容版本。
- **游標所在行、欄**，附近原文與診斷。
- **精確反白內容**，包含多段選取；切到 Agent 後仍保留最後一次選取。
- **指定專案與編輯器視窗**，同時開啟多個專案也能明確選定操作目標。

情境可接著用於查詢場景／變數、檢查劇本、統計、註冊指令、管理文件／資料夾及版本保護修改。例如：「這行為什麼有警告？」「幫這個專案註冊未知指令」「把反白的對話縮短。」文字修改經過 Spindle 的交易與 Undo。助手也能讀取 Play 的目前台詞、選項與變數；尚不提供 Agent 操控播放。

**存取由你決定。** MCP 預設停用。在「設定 → MCP／Agent 整合」選擇唯讀或允許修改，再安裝使用者層級的 Codex／Claude Code 連線與 [Spindle Skill](skills/spindle/SKILL.md)。Spindle 必須保持開啟；情境在請求時取得，不是眼球追蹤或持續錄製畫面。安裝 Skill 不會改變 Agent 的批准規則。

[連接你的助手](docs/mcp.zh-TW.md)

## 試跑、查看狀態、回到原文

以獨立 Play 視窗試跑，在逐行小說與雙行 VN 之間切換而不重跑故事。查看變數、選項與指令事件，回到上一步，或定位原文修改。你繼續撰寫時，本輪試跑仍保留啟動時的內容版本。

| 逐行小說 | VN 呈現 |
| --- | --- |
| ![小說 Play 與變數面板](docs/images/play-novel.png) | ![VN Play](docs/images/play-vn.png) |

角色支援自動姓名配色、頭貼、立繪變體與背景。角色修改自動保存，編輯器與 Play 的顯示開關獨立控制。自訂指令可明確設定預覽效果，不執行任意遊戲程式。

右鍵點擊編輯器 Play 按鈕，選擇「預設」「目前文件」或支援的「目前行」；在設定 → Play 搜尋預設場景。Windows 版內含官方 Yarn Spinner runtime，可離線試跑，不需另裝 .NET。[Play 操作與目前範圍](docs/play.zh-TW.md)

## 三種視角，同一份故事

### 純文字

直接撰寫 Yarn，搭配補全、診斷與快速修正。補全包含內建及專案自訂指令與參數提示；滑鼠移到已註冊的自訂指令可查看說明及簽名。變數型別、宣告與來源導航支援跨檔案；輸入時保持安靜診斷，可設定台詞長度提醒。

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
