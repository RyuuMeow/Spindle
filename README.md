# Yarn Workbench

本機 Yarn 劇本編輯器。Windows 桌面版支援磁碟專案、自動保存、多視窗、Monaco 純文字編輯、CodeMirror 即時渲染與故事流程圖；網頁版保留本機工作區與匯入／匯出。

## 啟動與打包

需要 Node.js 22.13+ 與 pnpm。

```sh
pnpm install
pnpm dev
pnpm desktop:start
pnpm desktop:pack
```

Windows x64 0.3.0 產物在 `release/`：`Yarn-Workbench-0.3.0-Setup-x64.exe` 與 `Yarn-Workbench-0.3.0-Portable-x64.exe`。打包包含離線 Monaco、CodeMirror 與主程序文件服務，不依賴編輯器 CDN。程式未簽章。

Portable 開啟時會先顯示「正在解壓並啟動」；0.2.1 改用 ZIP 與每次啟動獨立的暫存目錄。更新時先關閉舊版，再開新版本；兩者沿用同一個 App profile。

## 保存與恢復

- 在專案選單選擇「開啟專案資料夾」，遞迴載入 `.yarn`；子目錄同名檔案以相對路徑區分。
- 停止輸入 800ms 後寫回原檔，中文組字期間暫停。Ctrl+S 立即保存；Ctrl+Shift+S 保存目前專案的待寫入文件。語法錯誤不阻止劇本保存。
- 沒有磁碟路徑的文件是本機草稿。另存新檔會開啟並綁定新檔案；匯出只建立交付副本。
- 偵測外部修改、刪除、唯讀或寫入失敗時保留內容。雙方都有修改時暫停該檔自動保存，提供比較、採用磁碟版本、覆寫或另存。
- 每分鐘對有變更文件留下快照，每份保留最近 50 份；最近刪除保留 30 天。指令設定另有復原快照，非法表單輸入保留為草稿。
- 專案名稱、文件識別與有效指令定義寫入 `.yarn-workbench/project.json`；視窗、復原草稿與快照在 App profile。Windows 安裝版及 portable 預設皆使用 `%APPDATA%/Yarn Workbench`，portable 不把資料放在 exe 旁。
- v1 專案備份仍可匯入。v2 備份包含相對路徑、指令定義與指令草稿；匯入會新增專案，保留原專案。
- 網頁資料存於該瀏覽器的 localStorage，與桌面 profile 分開；請用專案備份轉移。清除網站資料會移除網頁工作區。

## 編輯與操作

0.3.0 將場景大綱移至可收合的右側，全文搜尋固定留在左欄；設定與自訂指令各有完整工作區。文件工具列的時鐘可開啟版本時間線、唯讀預覽與差異比較。常見操作、折疊及渲染語義統一使用 SVG 圖示。

一般原檔自動保存，不再放常駐 Save 按鈕；本機草稿使用「存成檔案」。閱讀編輯可選760／900px欄寬，字級會同步調整標題、命令與標籤，折疊跟隨分頁保存。

純文字保留原有 Monaco 外觀與編輯習慣。渲染是同一份來源文字的連續編輯面：灰色 tags、紫色變數標籤、平面條件區域與場景分隔。游標／選取觸及語法時揭露原文；複製取得原始 Yarn，右鍵另有「複製可讀文字」。渲染顯示所有分支，不執行條件。

分頁可拖移、固定、中鍵關閉、批次關閉、重新開啟及移至其他視窗。＋開啟輕量文件選擇器；「同稿另一個視圖」保留獨立位置與模式。跨視窗共用來源文字、保存狀態與撤銷紀錄；文字歷史保留於目前 App 執行階段，重啟後可使用持久化快照。

| 操作 | 快捷鍵 |
|---|---|
| 新分頁／關閉／重開 | Ctrl+T／Ctrl+W／Ctrl+Shift+T |
| 切換分頁 | Ctrl+Tab／Ctrl+Shift+Tab |
| 分頁鍵盤排序 | 聚焦分頁後 Alt+Shift+←／→ |
| 快速開啟／全專案搜尋 | Ctrl+P／Ctrl+Shift+F |
| 返回／前進 | Alt+←／→、滑鼠側鍵 |
| 前往靜態 jump／detour 目標 | F12／Ctrl+點擊 |
| 撤銷／重做 | Ctrl+Z／Ctrl+Y 或 Ctrl+Shift+Z |
| App 縮放／重設 | Ctrl+＋／－／0 |

場景可更名並更新靜態引用、複製、刪除、跨檔移動與排序。跨檔文字修改是一筆共同撤銷交易。圖表拖動與自動整理使用獨立布局歷史，不改寫劇本。

## 驗證與文檔

```sh
pnpm test:workspace
pnpm test:graph
pnpm test:reading
pnpm test:workspace-ui
pnpm test:ui-redesign
pnpm build
```

桌面整合測試需要 Playwright（可透過 `PLAYWRIGHT_MODULE` 指定），每次建立隔離 profile 與測試專案。預設測試準備好的開發版；設定 `DESKTOP_EXECUTABLE` 可驗證打包版。結果與截圖在 `outputs/workspace-integration/`。

直接測試 portable 啟動器時，另設定 `DESKTOP_PORTABLE_TEST=1`；測試驅動會以僅限本機的 inspector／CDP 連接解壓後的 App，並在結束時關閉連接。可用 `DESKTOP_TEST_OUTPUT` 分開指定結果目錄。現行打包驗證結果由[實作追蹤](docs/implementation-progress.md)集中列出。

目前完成狀態、測試證據與未驗證項目見 [實作追蹤](docs/implementation-progress.md)。設計規則見 [UI 規範](docs/ui-design.md)，保存與同步契約見 [架構說明](docs/workspace-architecture.md)，版本記錄見 [CHANGELOG](CHANGELOG.md)。早期審查與 39 組盤點保留為歷史取證。

本專案只支援 Yarn 結構解析與作者工具；不是官方編譯器，沒有執行引擎、Unity 連接、雲端協作、外掛系統或圖上拉線改寫。未知／未完成語法保留原文。更新來源尚未設定，沒有無效的自動更新按鈕。
