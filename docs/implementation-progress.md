# 桌面功能與即時渲染實作追蹤

版本：Windows x64 **0.4.0**，2026-09-19。依據 M0–M6 與使用者批准的第二輪 R01–R08 修訂。安裝版與 portable 已完成打包；新版 portable 的啟動、互動與磁碟／多視窗回歸均通過，未實測邊界列於下方。

## 本版完成

| 範圍 | 成果 |
|---|---|
| 指令與搜尋 | 自訂指令使用壓暗背景的大型獨立面板，不建立 tab；保留非法草稿、關閉回焦點、隔離背景快捷鍵。搜尋／Ctrl+P 共用中央偏上的輕量即時結果浮層；方向鍵選取，Enter 定位，Ctrl+Enter／中鍵新分頁，整體失焦關閉。 |
| 導航與新增 | 普通導航保持目前 TabId，不跳另一個同稿視圖；每 tab 有獨立歷史及文件視圖快取。劇本／場景新增與更名採行內反白輸入，Esc 取消，錯誤就地保留。排序 SVG 隨方向改變，不破壞手排。 |
| 閱讀 | 正文優先，附屬資訊降低彩度；命令與正文維持相同行框。場景分隔前後 24px，分支首尾 16px，圖示與文字起點一致。保留連續編輯、來源揭露、跨區塊選取與 Undo；Monaco 外觀不變。 |
| 圖表 | 雙擊或 Enter 原位展開節點連續編輯器，修改台詞／角色／命令，共用來源與歷史；跨檔節點不切 tab。編輯期間不重新布局；外部修改跨越邊界時停寫並保留未提交草稿。 |
| 面板 | 左右與底部調整手柄支援鍵盤、拖動及 Esc 回復；6px 溝槽與表面色階。大綱只保留工具列 toggle，按模式記憶。診斷使用對齊的分段篩選／窄版選單，空狀態縮小；指令參數選單共用風格。 |
| 保存保護 | 新增檔案遇 ENOSPC 時清除本次建立的半檔，保留外部替換檔，允許同名重試；場景版本／碰撞與跨檔原子 Undo 在權威端驗證。 |
| 啟動 | 保留 ZIP 解壓提示與每次啟動獨立目錄；首幀事件未到時，已驗證的工作區就緒訊號也會首次顯示視窗，避免已載入但仍隱藏。 |

## 驗證證據

- TypeScript、改動範圍 lint、網頁及桌面 production build 已檢查。全產品與測試腳本 lint 仍只有 `app/CodeEditor.tsx` 的既有 **17 errors／2 warnings**，見 [lint 報告](../outputs/refinement-lint-0.4.0.json)。未為清理基線改動純文字編輯器。
- 單元與服務回歸 **75／75**：來源交易、磁碟保存／復原、跨窗競爭、檔案建立失敗回滾、導航／排序、搜尋位置、閱讀裝飾及圖表來源範圍。
- [新版桌面互動](../outputs/desktop-refinement-portable-0.4.0/results.json)：目前分頁導航、行內新增／取消、排序、大綱、搜尋浮層、指令焦點／草稿、面板及實際節點共享來源。
- [歷史與UI回歸](../outputs/ui-redesign-portable-0.4.0/results.json)：跨模式收合、草稿保存、歷史唯讀／差異／過期保護、設定輸入與 800／1100／1440px 面板。
- [磁碟及多視窗工作流](../outputs/workspace-portable-0.4.0/results.json)：原檔自動寫回、BOM／CRLF、跨模式及跨窗 Undo／Redo、同名子路徑、外部衝突、圖表布局歷史、非法指令草稿與損毀布局重啟。
- [Portable 啟動專項](../outputs/portable-startup-0.4.0/results.json)：原生可見性、兩個隔離執行個體、重複啟動喚回及解壓資源存活。測試不以強制 `show()` 取代自行顯示。
- [節點獨立測試](../outputs/graph-inline-edit/results.json)：連續編輯、CRLF／BOM、共享歷史、未完成語法、外部位移、改名、跨檔、拒絕提交後重新載入取回草稿。
- [閱讀幾何](../outputs/reading-refinement/harness/results.json)與[行內輸入](../outputs/inline-name-ui/results.json)：實際 CodeMirror 間距／對齊、跨場景貼上及 Undo／Redo、反白、Esc、衝突重試。組字事件為合成測試，不能替代原生 IME。
- 發行包大小、SHA256 與驗證摘要：[release-verification.json](../outputs/release-verification.json)。Installer 和 portable 使用相同離線編輯器及主程序服務；安裝精靈未操作。

## 保留契約與未驗證邊界

原始 Yarn 是唯一內容來源；純文字、閱讀、節點與跨窗視圖共用文件版本及撤銷。原檔停止輸入 800ms 後自動保存，組字期間暫停；不合法 Yarn 仍可保存。非法指令保留草稿，只有「套用定義」才更新有效設定。外部衝突／缺檔不自動覆寫或重建。

每文件保留最近 50 份快照，最近刪除保留 30 天。Undo／Redo 共用於本次 App 執行階段；重啟使用持久化草稿與快照。匯入備份新增專案，保留原專案。Portable 與安裝版預設沿用 `%APPDATA%/Yarn Workbench`，不是 exe 旁保存。

仍未實測：真正中文輸入法期間的跨窗輸入、原生 tab 拖出／拖回、Snap、拔除副螢幕、混合 DPI、安裝精靈／Explorer 關聯與讀屏。服務層 composition、合成事件及 Electron 內容截圖不代表上述驗收完成。

完整 Yarn runtime／官方編譯器、Unity、雲端協作、外掛、圖上拉線改寫、角色別台詞量與完整分支折疊仍屬後續範圍。更新來源未配置，僅提供版本與記錄資訊。

## 版本控制與文件

已初始化 Git，基線 `3c58477`／tag `baseline-v0.3.0`；本輪在 `feat/desktop-interaction-refinement` 分批提交閱讀、導航、資料保護、節點、浮層與啟動修復。現行規則見 [UI 規範](ui-design.md)，歷史意圖與取證見 [設計複審](desktop-design-review-2026-09-18.md)，保存／同步見 [架構契約](workspace-architecture.md)。舊版盤點不作現行待辦。
