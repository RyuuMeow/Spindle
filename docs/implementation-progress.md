# 桌面功能與即時渲染實作追蹤

版本：Windows x64 **0.8.3**，2026-09-20。

## 0.8.3 吸附對齊與依目的地分線

- 場景、卡片與 pin 的小幅錯位依相關接點吸附；混合選取保持相對位置，上下接點使用正確的對齊軸。自動卡片對齊仍遵守分支順序與間距。
- 不同去向使用平行 16 單位線距；同目的地、同方向末段保留匯流，短幹線保留。只調整受影響自由折點，不搬動未選物件或刪除 pin。
- 拖動預覽與 Worker 共用分線，舊布局及 Undo 歷史原位修線一次；不重新排版。
- [單元／服務測試](../outputs/lanes-unit.log) **142／142**，TypeScript 與 [20 檔範圍 lint](../outputs/lanes-lint.json)通過；既有全庫 lint 基線未清零。測试涵蓋水平／垂直間距、三條去向、同向匯流與反向／卡片前禁止假匯流、避障、pin 保留、整組吸附、預覽／Worker 一致與遷移。
- [桌面互動](../outputs/lanes-ui/result.json)與最終 [0.8.3 Portable 實包驗收](../outputs/lanes-portable-0.8.3/result.json)通過實際滑鼠吸附、一次 Undo、pin／卡片／多選操作、模式切換、舊版歷史及重啟恢復；頁面錯誤為零，離線 Worker／WASM 正常。
- [網頁 build](../outputs/lanes-web-build.log)、[桌面 build](../outputs/lanes-stage.log)及[兩種 Windows 封裝](../outputs/lanes-package.log)通過；[SHA256／離線資源核對](../outputs/lanes-release-verification.json)。安裝精靈、混合 DPI、多螢幕未實測。
- [效能記錄](../outputs/lanes-unit.log)包含 10／50／120 節點直線流程及 12／36／72 節點多分支的整理耗時、局部預覽耗時、交叉及轉折數；Node 幾何耗時不等於畫面輸入延遲，亦不代表任意圖全局最優。

## 0.8.2 以可見控制點理線

- 線段及幹線不可拖動，也不再產生隱藏固定線段；場景、卡片與 pin 決定路線，pin 可直接作為轉角。搬動來源時中心出口的短幹線隨之移動，不留在節點後方。
- 舊快照與歷史中的固定線段、pin 軸向、幹線拖曳限制會遷移；保留節點、卡片、pin 位置。日常路線衝突橫幅與橙色標記已移除。
- [單元／服務測試](../outputs/pin-only-unit.log) **131／131** 通過；TypeScript、[範圍 lint](../outputs/pin-only-lint.json)、[網頁 build](../outputs/pin-only-web-build.log)與[桌面 build](../outputs/pin-only-stage.log)通過。既有全庫 lint 基線未清零。
- [桌面互動](../outputs/pin-only-ui/result.json)通過線段／幹線不可拖、卡片／pin 拖移、右鍵刪除、完整撤銷、跨模式與重啟恢復、舊版 Undo 快照即時遷移；離線 Worker／WASM 正常。
- [0.8.2 Portable 實包驗收](../outputs/pin-only-portable-0.8.2/result.json)全部通過，包含舊版 Undo 還原；版本核對 0.8.2，頁面錯誤為零。[封裝核對](../outputs/pin-only-archive.json)確認兩種產物及離線資源。安裝精靈、混合 DPI 與多螢幕未實測。

## 0.8.1 自由卡片與控制點

- 線上卡片參與完整包含框選、Shift 加選、混合場景搬移與選取範圍整理；卡片單獨整理保持場景及未選卡片原位。
- 卡片／pin 位置決定路徑；控制點順序持久保存，拖動不保留多餘自動折線，保留明確手動線段。pin 右鍵刪除與 Delete 共用一筆可撤銷交易，拖曳顯示抓手游標。
- [桌面互動](../outputs/free-route-ui/result.json)通過自由拖曳、pin 右鍵刪除、卡片框選／整理、場景與卡片混合搬移、完整撤銷、離線 Worker／WASM、切換模式與重啟恢復。
- [單元／服務測試](../outputs/free-route-unit.log) **128／128** 通過；TypeScript 與 [18 檔變更範圍 lint](../outputs/free-route-lint.json)通過。全 repo lint 的既有異常目錄／基線問題延續 0.8.0 限制。
- 網頁／桌面 build 與 Setup／Portable 打包通過。[0.8.1 實際 Portable 驗收](../outputs/free-route-portable-0.8.1/result.json)完成卡片鍵盤／框選／混合搬移、自由路由、pin 右鍵刪除、離線 Worker／WASM 與重啟恢復，沒有頁面錯誤。
- [封裝與 SHA256](../outputs/free-route-archive.json)、[發行驗收摘要](../outputs/free-route-release-verification.json)。安裝精靈、混合 DPI、多螢幕未實測；不宣稱任意手動限制都能得到無交叉路線。

## 0.8.0 圖表排版與手動佈線

- 一次性全圖／選取整理、中心接點、原文分支成組、局部避障、新節點不重排、手動 pin／線段／幹線／卡片與 50 筆完整布局 Undo／Redo 已實作。
- [桌面互動](../outputs/graph-layout-ui/result.json)通過右鍵平移／單擊選單、框選／Shift 加選、整組搬移、局部整理、無關線路不變、pin 拖動／Delete／Esc、卡片及幹線移動、線段撤銷、模式切換、圖表關閉時的來源修改、重啟恢復與節點內文字 Undo。
- 單元／磁碟服務測試 **125／125**，涵蓋獨立／巢狀／不完整分支、相同目的地、唯一身分匹配、CRLF／BOM、舊布局遷移、外部修改、無解 pin 保留、pin 不折返、卡片通道與來源節點搬移。[圖表測試及效能](../outputs/graph-all-unit.log)。
- 直線流程基準（本機 Node）：10／50／120 節點，約 14／65／96ms，皆為零轉折。
- 多分支基準（本機 Node，非拖動延遲）：12／36／72 節點，20／68／140 轉場，約 68／301／1364ms；嚴格內部交叉計數 9／33／69，轉折 104／368／764。這是壓力資料，不代表任意圖可無交叉或得到全局最優解。
- TypeScript、[變更範圍 lint](../outputs/graph-changed-lint.json)、網頁及桌面 build 通過。根目錄既有異常目錄使一般 lint 掃描 ENOENT；改以 Git 追蹤來源掃描，共 177 檔、13 個既有錯誤及 4 個警告，未宣稱清零。
- [0.8.0 Portable 圖表驗收](../outputs/graph-portable-0.8.0/result.json)通過離線 Worker／WASM、手動佈線、完整整理撤銷、來源映射與重啟恢復；最終封裝再次檢查 pin 不折返及卡片始終位於所屬水平通道。
- [原生啟動](../outputs/graph-startup-0.8.0/results.json)在本機 225% DPI 自行顯示視窗，工作區 4.125 秒就緒；雙執行個體解壓資源及重複啟動喚回通過。另有[工作區回歸](../outputs/graph-workspace-0.8.0/results.json)，涵蓋大綱、資料夾、複製、閱讀、提示、選取與窄窗。
- Portable 拖動測試在 1440×960、scale 1 的範例圖採樣 69 筆 requestAnimationFrame 間隔，P95 8ms、最大 9ms；此數據包含等待收尾，僅代表幀間隔，不宣稱是輸入至繪製延遲。
- 安裝版與 Portable 均已產生；ASAR 內含兩個圖表 Worker、WASM 與授權檔。[封裝核對](../outputs/graph-archive-verification.json)及[發行大小／SHA256／驗證摘要](../outputs/release-verification.json)。安裝精靈、多螢幕及混合 DPI 仍未實測。

## 0.7.1 拖移與路由修正

- [0.7.1 Portable 拖移／圖表](../outputs/stable-routing-portable-0.7.1/results.json)及[完整工作區](../outputs/stable-routing-workspace-portable-0.7.1/results.json)皆通過；App 版本核對為 0.7.1，沒有頁面錯誤。樹拖移以 Chromium 滑鼠按下／移動／放開驗證，不再合成 DataTransfer；實體多螢幕與混合 DPI 仍未實測。

- 穩定路由、壓縮間距、標籤不推線與受阻局部更新已加入幾何回歸。
- [指標互動](../outputs/tree-drag-complete/results.json)：Shop、Untitled 2、深層文件移出，起拖門檻、Esc 取消、資料夾移動、混合診斷 12px 間距，以及圖上實際拖動無關節點的線路穩定性通過。
- [工作區回歸](../outputs/stable-routing-workspace-ui/results.json)：完整七個分支標籤、大綱、純閱讀、複製、側欄與窄窗通過。

## 0.7.0 工作區、閱讀與流程修訂

- 最新回饋 14 項均已實作：閱讀大綱定位、白色拖移線、caption 提示避讓、單一垃圾桶入口、直接複製改名、純閱讀、資料夾與跨層操作、統計側欄、診斷數字、選單對齊、流程佈線與只選取連線。
- [桌面互動](../outputs/workspace-navigation-ui/results.json)通過已收合場景定位、空資料夾／跨層拖移、直接複製與刪除、工具提示幾何、7 個流程標籤、800px 窄窗。
- 磁碟服務測試確認新 profile 重開後空資料夾、順序與文件 ID 保留；同名／循環／路徑拒絕、垃圾桶失敗不移走原件，BOM／CRLF 不變。
- Windows 混合 DPI、Snap、原生滑鼠拖移及安裝精靈未實測。拖移 UI 使用合成 DataTransfer；垃圾桶 UI 用隔離目錄替身，磁碟服務另驗證失敗保護。

## 0.6.5 指令提示規則

- 自動參數提示只描述空位置；完整行判斷可避免游標位於既有值前方時誤彈窗。字串、未完成內容與完整運算式都算已有內容。
- 三種編輯入口共用補全 → 空參數 → hover 優先順序；已有 hover 被較高優先提示接替，不並排堆疊。Esc、失焦、組字與模式切換清除浮窗。
- [提示互動](../outputs/hint-priority-ui/results.json)及[編輯輔助回歸](../outputs/hint-priority-assistance/results.json)涵蓋三模式、已有值前／中／後、取代 hover、補全互斥、空白行、窄窗與 App 縮放；[參數與摺疊](../outputs/hint-priority-context/results.json)亦通過。

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

- [0.7.0 Portable 工作區互動](../outputs/workspace-navigation-portable-0.7.0/results.json)全部通過，核對 App 版本為 0.7.0 且沒有頁面錯誤；[提示優先順序回歸](../outputs/workspace-navigation-hint-regression/results.json)涵蓋純文字、閱讀與節點編輯。

- [0.7.0 Portable 原生啟動](../outputs/workspace-navigation-startup-0.7.0/results.json)通過自行顯示視窗、兩個隔離執行個體、解壓資源存活與重複啟動喚回；本機 225% DPI，沒有用強制 show 取代啟動驗證。
- TypeScript、修改範圍 lint、網頁及桌面 production build 通過；本輪六個模組見 [lint 報告](../outputs/stable-routing-lint.json)。全專案既有 lint 基線未清零。
- 單元與服務回歸 **105／105**：來源交易、磁碟保存／復原、跨窗競爭、檔案建立失敗回滾、導航／排序、搜尋位置、閱讀裝飾及圖表來源範圍。
- [0.6.5 Portable 提示互動](../outputs/hint-priority-portable-0.6.5/results.json)：空值判斷、hover 取代、候選互斥、Esc 與失焦，三種模式全數通過；安裝精靈及真正 IME／混合 DPI 未實測。
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

每文件保留最近 50 份快照，最近刪除保留 30 天。文字 Undo／Redo 共用於本次 App 執行階段；重啟使用持久化草稿與快照。圖表布局另有按視圖持久化的 50 筆 Undo／Redo。匯入備份新增專案，保留原專案。Portable 與安裝版預設沿用 `%APPDATA%/Yarn Workbench`，不是 exe 旁保存。

仍未實測：真正中文輸入法期間的跨窗輸入、原生 tab 拖出／拖回、Snap、拔除副螢幕、混合 DPI、安裝精靈／Explorer 關聯與讀屏。服務層 composition、合成事件及 Electron 內容截圖不代表上述驗收完成。

完整 Yarn runtime／官方編譯器、Unity、雲端協作、外掛、圖上拉線改寫與完整分支折疊仍屬後續範圍。更新來源未配置，僅提供版本與記錄資訊。

## 版本控制與文件

已初始化 Git，基線 `3c58477`／tag `baseline-v0.3.0`；0.4.0 已標記 `v0.4.0`；0.5.0 指令改版已完成；本輪分支 `feat/graph-layout-editing`，前版基線 `v0.7.1`；四階段提交語義保存、引擎、互動歷史與交付，發行標記為 `v0.8.0`。現行規則見 [UI 規範](ui-design.md)，歷史意圖與取證見 [設計複審](desktop-design-review-2026-09-18.md)，保存／同步見 [架構契約](workspace-architecture.md)。舊版盤點不作現行待辦。
