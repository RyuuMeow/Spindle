# 桌面功能與即時渲染實作追蹤

版本：Windows x64 **0.3.0**，2026-09-18。依據使用者批准的 M0–M6、flat-tags-v5、D01–D10 重設與 SVG icon 要求。

0.3.0 已完成介面重設並打包 installer／portable。直接啟動 portable 的新版介面、完整編輯工作流及啟動專項均通過；不是只測開發版。原生輸入法、Snap、多螢幕等未驗證項目另列，不把整份驗收矩陣標成全部完成。

## 本版完成

| 範圍 | 成果 |
|---|---|
| 導航與框架 | 左側專案樹、可收合／按模式固定的右側場景大綱；窄視窗保留一個輔助欄。日常只留兩列工具區，移除圖表第三列及常駐統計底欄。 |
| 控制項 | 操作、狀態、固定分頁、折疊與渲染語義改用 SVG；常用動作採有提示的 icon，歧義動作保留文字。模式等互斥選項統一分段單選並支援鍵盤。 |
| 保存與歷史 | 一般原檔移除常駐 Save，保留 Ctrl+S／Save All；草稿提供存成檔案。文件時鐘開啟右側版本時間線與中央唯讀預覽／差異；還原前保留目前版本，跨窗修改後舊比較不能直接還原。 |
| 搜尋與設定 | 全文搜尋固定於左欄，保留查詢、结果位置與捲動，滑鼠／鍵盤同一導航規則；快速開啟另有輕量選擇器。設定、自訂指令、最近刪除／指令復原各有完整工作區。 |
| 閱讀編輯 | 760／900px 閱讀欄、相對字級、緊湊命令／選項、扁平條件與清楚結束。精確語法揭露；場景收合改暗色並保存於分頁，來源修改時映射範圍。純文字 Monaco 維持原外觀。 |
| 圖表 | 節點自然高度、正文最多兩行；tags／行號等移至詳情，跨檔入口縮小。保留完整條件／選項祖先，往返路線分離，初次 fit 納入連線／標籤，圖內搜尋與細節按需開啟。 |

複審 T01–T05 的條件遺失、草稿狀態矛盾、數值輸入搶改、搜尋導航不一致及白色收合元件均已修正。現行規則集中於 [UI 規範](ui-design.md)；原始問題保留在 [設計複審](desktop-design-review-2026-09-18.md)，不再作為目前缺陷清單。

## 原計畫狀態

| 階段 | 已實作 | 驗證邊界 |
|---|---|---|
| M0 內容保護 | 文件／設定／布局分開恢復、損毀救援、空專案、遷移備份、名稱規則與指令草稿 | 單元及損毀布局重啟通過；未測真實斷電 |
| M1 磁碟專案 | 專案／文件操作、穩定 ID、800ms 自動保存、Save All／Save As、衝突、快照與最近刪除 | 磁碟往返、同名子目錄、BOM／CRLF、外部修改／刪除、唯讀、取消備份與復原通過；磁碟滿採 ENOSPC 注入 |
| M2 桌面操作 | 分頁排序／溢位／固定／批次關閉／重開、中鍵、右鍵、＋選擇器、同稿新視圖 | 10 tabs、鍵盤排序與批次操作通過；原生拖曳仍待專項 |
| M3 即時渲染 | CodeMirror 連續來源編輯、造型、選取貼上、原文／可讀文字複製、共用 Undo／Redo | 跨模式與跨場景編輯、未知／未閉合語法、來源映射通過；真實中文 IME 待驗證 |
| M4 作者與圖表 | 搜尋／導航、場景安全更名與引用更新、跨檔操作、圖表布局歷史／搜尋、診斷與指令管理 | 靜態引用防誤改、跨檔原子 Undo、圖表拖動歷史與布局通過 |
| M5 多視窗與 OS | 跨窗分頁路徑、共享版本交易、獨立視圖與位置、啟動參數、檔案拖入／關聯 | 選單開新窗、跨窗同步／Undo／Redo、重啟通過；原生拖出／拖回、Explorer 關聯、Snap、拔除螢幕、混合 DPI 尚未實測 |
| M6 使用品質 | 閱讀／圖表重設、場景折疊與聚焦、查找與全稿統計、完整設定、錯誤與復原入口、現行文件與發行包 | 800／1100／1440 CSSpx、設定數字輸入與實際 portable 通過；安裝精靈與讀屏待驗證 |

早期 [39 組功能盤點](desktop-basic-feature-audit-2026-09-17.md)保留為歷史。角色別台詞量、選取統計、完整分支折疊及跳轉懸浮摘要等延伸提案未宣稱完成。閱讀行寬調整已在 0.3.0 補齊。

## 驗證證據

- TypeScript `tsc --noEmit`、改動產品模組 lint、網頁與桌面 production build 通過。Vite 大型編輯器 bundle 警告及 vinext 路由分類提示仍存在，並非建置失敗。
- `node --test scripts/workspace.test.mjs scripts/graph-layout.test.mjs scripts/reading.test.mjs`：**41／41 通過**，包含來源交易、保存／復原、還原版本競爭保護、完整連線前提、路線布局及語法裝飾。
- **實際 portable 工作流**：[results.json](../outputs/workspace-portable-0.3.0/results.json)。涵蓋原檔自動保存、共享撤銷、純文字貼上、分頁、跨窗同步、外部衝突、圖表歷史、非法指令草稿、重啟與損毀布局恢復；無 renderer 執行期錯誤。
- **實際 portable 新介面**：[results.json](../outputs/ui-redesign-portable-0.3.0/results.json)。涵蓋 SVG／收合跨模式保存、搜尋導航、唯讀歷史取消／比較／還原、過期比較保護、設定數字輸入、800／1100／1440px 輔助欄與溢位、圖表與指令／刪除復原工作區。
- **portable 啟動專項**：[results.json](../outputs/portable-startup-0.3.0/results.json)。本機 225% 縮放的一次觀測為約 **3.9 秒工作區／4.4 秒編輯器**；原生視窗確實顯示、重複啟動喚回、不同執行個體的解壓目錄隔離及資源存活均通過。這不是效能保證或混合 DPI 驗收。
- 補充元件驗證：[圖表](../outputs/graph-redesign/results.json)、[閱讀](../outputs/reading-redesign/harness/results.json)、[設定與指令](../outputs/ui-audit-2026-09-18/settings-command-results.json)。包含首次／保存過的視野、SVG 與字級比例、折疊映射及失效範圍展開、參數排序／草稿驗證；獨立 harness 不替代打包版驗證。
- 代表性 portable 畫面：[閱讀](../outputs/ui-redesign-portable-0.3.0/01-reading.png)、[歷史](../outputs/ui-redesign-portable-0.3.0/03-history.png)、[設定](../outputs/ui-redesign-portable-0.3.0/04-settings.png)、[圖表](../outputs/ui-redesign-portable-0.3.0/05-graph.png)、[800px 大綱](../outputs/ui-redesign-portable-0.3.0/outline-800.png)。這些是 Electron 內容截圖，不能當作 Windows Snap 驗收。
- 全專案 lint 複查仍只有 `app/CodeEditor.tsx` 的既有 **17 errors／2 warnings**；沒有宣稱清零，見 [redesign-lint-0.3.0.json](../outputs/redesign-lint-0.3.0.json)。本次未為清理基線改動純文字編輯器。
- Installer 與 portable 包含相同離線編輯器及主程序服務。產物大小、雜湊及測試摘要見 [release-verification.json](../outputs/release-verification.json)。程式未簽章；安裝精靈及 Explorer 關聯未操作。

## 保存與後續驗收邊界

原始 Yarn 是唯一內容來源；共同文件服務承接來源編輯與撤銷。原檔 800ms 自動保存，組字期間暫停；不合法的 Yarn 仍可保存。非法指令留作草稿，只有「套用定義」才更新有效設定。外部衝突／缺檔時停止自動寫入。

快照每文件保留 50 份，最近刪除保留 30 天。Undo／Redo 共用於本次 App 執行階段；重啟使用持久化草稿與快照，不宣稱永久保留 undo stack。匯入備份新增專案，不破壞性取代既有專案。

後續仍須在原生 Windows 操作環境驗證：中文 IME 期間跨窗編輯、tab 拖出／拖回與 Esc、最大化／Snap、拔除副螢幕、100／150／200% 混合 DPI、安裝精靈／檔案關聯與讀屏。服務層 composition 或 Playwright 輸入不能替代真正輸入法驗收。

完整 Yarn runtime／官方編譯器、Unity、雲端協作、外掛及圖上拉線改寫在範圍外。更新來源未配置，僅提供版本與記錄資訊。
