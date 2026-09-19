# 桌面功能與即時渲染實作追蹤

版本：Windows x64 **0.6.4**，2026-09-20。已完成打包與隔離 profile 的 Portable 互動驗證。

## 0.6.4 修正

- 劇本直接移到垃圾桶：刪除前持久化復原副本，磁碟檔案使用系統資源回收筒；失敗保留原文件，沒有永久刪除 fallback。
- 行內新增／更名與套用定義不顯示轉圈，保留錯誤及重複提交防護。
- 修復 Monaco 保留 model 在重新掛載時仍顯示舊稿；跨模式、節點與第一筆輸入／共用 Undo 已實測。
- 補齊 14 個支援的內建指令說明；三種編輯入口共用專案變數補全與語義參數位置，候選不被提示遮擋。
- [開發版互動](../outputs/sync-language-ui/results.json)包含 Windows 資源回收筒與 App 復原；[既有輔助回歸](../outputs/sync-language-assistance/results.json)包含窄窗、App 縮放、補全幾何與來源留白。

## 0.6.3 基線修正

- 閱讀空白逐行保留，活動／非活動高度一致，已有空白取代外部段落留白；條件與選項保留邊界內距。BOM／CRLF 原文字節不變。
- 新增劇本在目前資料夾文件頂部完成，保留當下可見順序並同步切回手動排序；雙擊原位改名，反白主檔名，不新增或跳其他 tab。
- 三個編輯入口的補全使用相同字型與 29px 列高；純文字取消重複的說明箭頭及 hover 截斷。
- 純文字提示使用 Monaco 原生來源定位；100／125／150% App 縮放均量測提示與游標相鄰。
- 本輪開發版證據：[編輯互動與幾何](../outputs/refinement-regression/results.json)、[導航／懸浮](../outputs/refinement-navigation/results.json)、[摺疊](../outputs/refinement-folds/results.json)。

## 累積完成

| 範圍 | 成果 |
|---|---|
| 品牌與跳轉 | Spindle；SVG 入庫並產生 Windows／favicon／portable 圖示。Ctrl 懸浮在可解析目標變色加底線，三種編輯器共用精確來源範圍。 |
| 指令提示 | 標題、識別字、描述、位置參數列與範例分區；虛擬參數提示使用相同資料。 |
| 指令與搜尋 | 自訂指令使用與設定一致的工具 tab；保留非法草稿，支援一般分頁切換／關閉。顯示名稱與參數說明可選填，灰色小標籤及單一搜尋焦點框減少雜訊。搜尋／Ctrl+P 共用中央偏上的輕量即時結果浮層；方向鍵選取，Enter 定位，Ctrl+Enter／中鍵新分頁，整體失焦關閉。 |
| 導航與新增 | 普通導航保持目前 TabId，不跳另一個同稿視圖；每 tab 有獨立歷史及文件視圖快取。劇本／場景新增與更名採行內反白輸入，Esc 取消，錯誤就地保留。排序 SVG 隨方向改變，不破壞手排。 |
| 閱讀 | 正文優先，附屬資訊降低彩度；命令與正文維持相同行框。無來源空白時場景分隔前後 24px、分支首尾 16px；空白行保留且減少重複外部留白，圖示與文字起點一致。保留連續編輯、來源揭露、跨區塊選取與 Undo；Monaco 原有字體與配色保留，另加虛擬參數提示。 |
| 圖表 | 雙擊或 Enter 原位展開節點連續編輯器，修改台詞／角色／命令，共用來源與歷史；跨檔節點不切 tab。點空白處可退出編輯，組字／改名／未處理草稿除外；編輯期間不重新布局；外部修改跨越邊界時停寫並保留未提交草稿。 |
| 面板 | 左右與底部調整手柄支援鍵盤、拖動及 Esc 回復；6px 溝槽與表面色階。大綱只保留工具列 toggle，按模式記憶。診斷使用對齊的分段篩選／窄版選單，空狀態縮小；指令參數選單共用風格。 |
| 保存體驗 | 日常自動保存不顯示圓點、轉圈或成功文字，同稿 tab 移除撰寫序號；關閉等待 renderer 交易與 session，再寫入磁碟，待保存時顯示中央小型進度面板，組字／失敗／逾時保留視窗。 |
| 保存保護 | 新增檔案遇 ENOSPC 時清除本次建立的半檔，保留外部替換檔，允許同名重試；場景版本／碰撞與跨檔原子 Undo 在權威端驗證。 |
| 啟動 | 保留 ZIP 解壓提示與每次啟動獨立目錄；首幀事件未到時，已驗證的工作區就緒訊號也會首次顯示視窗，避免已載入但仍隱藏。 |

## 驗證證據

- TypeScript、改動範圍 lint、網頁及桌面 production build 已檢查。本輪改動範圍 lint 仍只有 `app/CodeEditor.tsx` 的既有 **13 errors／2 warnings**，見 [lint 報告](../outputs/sync-language-lint.json)；未冒稱全專案 lint 清零。
- 單元與服務回歸 **95／95**：來源交易、磁碟保存／復原、跨窗競爭、檔案建立失敗回滾、導航／排序、搜尋位置、閱讀裝飾及圖表來源範圍。
- [0.6.4 Portable 互動](../outputs/sync-language-portable-0.6.4/results.json)：純文字／閱讀／圖表即時同步與共享 Undo、跨檔變數補全、內建指令參數說明、靜默更名、無確認刪除、Windows 資源回收筒與 App 復原，全數通過且無頁面錯誤。
- [0.6.3 Portable 互動](../outputs/refinement-portable-0.6.3/results.json)：三個編輯入口、相同 29px 補全列高與參數文字寬度、空白行與 BOM／CRLF 保留、頂部新增與雙擊改名、800px 窄窗及 100／125／150% App 縮放提示定位，全數通過且無頁面錯誤。
- [0.6.2 portable 基線互動](../outputs/assistance-portable-0.6.2/results.json)：三種編輯入口、補全／參數／Esc／貼上／Undo、失焦、模式切換、診斷數量與窄窗浮窗。
- [0.6.0 品牌／導航／提示基線](../outputs/spindle-portable-0.6.0/results.json)：名稱、隔離 profile、Monaco／閱讀／節點 Ctrl 懸浮與釋放、分層提示、跨檔不增 tab。
- [保存與關閉基線（0.5.1）](../outputs/quiet-autosave-portable-0.5.1/results.json)：持續輸入 tab 寬度穩定、無日常圓點／轉圈、關閉保存面板、磁碟衝突保留視窗、立即關閉寫入最後編輯。
- [0.5.0 桌面互動基線](../outputs/command-display-portable-0.5.0/results.json)：目前分頁導航、行內新增／取消、排序、大綱、搜尋浮層、指令 tab／草稿／虛擬提示與懸浮說明、面板及實際節點共享來源。
- [0.5.0 歷史與UI回歸基線](../outputs/command-ui-regression/results.json)：跨模式收合、草稿保存、歷史唯讀／差異／過期保護、設定輸入與 800／1100／1440px 面板。
- [磁碟及多視窗工作流](../outputs/spindle-workspace-regression/results.json)：原檔自動寫回、BOM／CRLF、跨模式及跨窗 Undo／Redo、同名子路徑、外部衝突、圖表布局歷史、非法指令草稿與損毀布局重啟。
- [0.6.0 Portable 啟動基線](../outputs/portable-startup-0.6.0/results.json)：原生可見性、兩個隔離執行個體、重複啟動喚回及解壓資源存活。測試不以強制 `show()` 取代自行顯示。
- 0.4.0 基線證據：[節點獨立測試](../outputs/graph-inline-edit/results.json)：連續編輯、CRLF／BOM、共享歷史、未完成語法、外部位移、改名、跨檔、拒絕提交後重新載入取回草稿。
- 0.4.0 基線證據：[閱讀幾何](../outputs/reading-refinement/harness/results.json)與[行內輸入](../outputs/inline-name-ui/results.json)：實際 CodeMirror 間距／對齊、跨場景貼上及 Undo／Redo、反白、Esc、衝突重試。組字事件為合成測試，不能替代原生 IME。
- 發行包大小、SHA256 與驗證摘要：[release-verification.json](../outputs/release-verification.json)。Installer 和 portable 使用相同離線編輯器及主程序服務；安裝精靈未操作。

## 保留契約與未驗證邊界

原始 Yarn 是唯一內容來源；純文字、閱讀、節點與跨窗視圖共用文件版本及撤銷。指令別名與虛擬參數名稱只影響顯示，不改原始 Yarn；舊定義回退識別字。懸浮說明顯示位置、型別及參數描述，未完成／歧義輸入不猜測標籤。原檔停止輸入 800ms 後自動保存，組字期間暫停；不合法 Yarn 仍可保存。非法指令保留草稿，只有「套用定義」才更新有效設定。外部衝突／缺檔不自動覆寫或重建。

每文件保留最近 50 份快照，最近刪除保留 30 天。Undo／Redo 共用於本次 App 執行階段；重啟使用持久化草稿與快照。匯入備份新增專案，保留原專案。Portable 與安裝版預設沿用 `%APPDATA%/Yarn Workbench`，不是 exe 旁保存。

仍未實測：真正中文輸入法期間的跨窗輸入、原生 tab 拖出／拖回、Snap、拔除副螢幕、混合 DPI、安裝精靈／Explorer 關聯與讀屏。服務層 composition、合成事件及 Electron 內容截圖不代表上述驗收完成。

完整 Yarn runtime／官方編譯器、Unity、雲端協作、外掛、圖上拉線改寫、角色別台詞量與完整分支折疊仍屬後續範圍。更新來源未配置，僅提供版本與記錄資訊。

## 版本控制與文件

已初始化 Git，基線 `3c58477`／tag `baseline-v0.3.0`；0.4.0 已標記 `v0.4.0`；0.5.0 指令改版已完成；本輪在 `fix/quiet-actions-and-editor-sync` 修正垃圾桶、靜默操作、來源同步與語言輔助；前版基線為 `v0.6.3`，本輪交付標記為 `v0.6.4`。現行規則見 [UI 規範](ui-design.md)，歷史意圖與取證見 [設計複審](desktop-design-review-2026-09-18.md)，保存／同步見 [架構契約](workspace-architecture.md)。舊版盤點不作現行待辦。
