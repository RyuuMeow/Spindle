# 文件、保存與同步契約

## 邊界

`app/workspace/types.ts` 定義文件、專案、分頁、視窗與 IPC 操作。文件 ID 不依賴顯示檔名；同一文件的多個視圖共用內容，每張 tab 保留模式、位置、選取、閱讀折疊及圖表狀態。

`engine.ts` 是文件版本與歷史權威。修改使用 CodeMirror ChangeSet 與版本化交易，重整跨窗並行修改、去除重送。跨檔場景操作只有全部版本符合時才提交，並整批 Undo／Redo。內部 Text 使用明確 LF 分割，將原檔 CR 當字元保留，避免 CRLF 在貼上或撤銷時被正規化。

`client.ts` 維護每窗的樂觀編輯與同步狀態。中文組字時暫緩該窗的送出及遠端編輯套用，組字結束後以共同版本重整，再觸發保存。主程序的文件版本與實際磁碟狀態是最終權威；renderer 不直接使用 Node 檔案系統。

`storage.ts` 分別驗證文件、設定與布局。舊工作區先留下 migration backup，舊 keys 保留；損毀資料另存救援副本。指令設定損毀不阻止讀取有效文件，空文件清單不以範例取代。

## 工作區生命週期（0.9.0）

`DesktopWorkspace` 區分 home、project、standalone，`ProjectLauncher` 只讀專案目錄資料。`project-catalog.ts` 保存不限數量的 catalog、recent 標記與啟動偏好；UI 將最近清單限制為 5 筆。`workspace-cache.ts` 按工作區延後載入草稿；profile 啟動不載入所有曾開啟專案的文本。

主程序以視窗綁定建立 active 工作區集合，最後一窗離開才取消監看、寫入計時器並卸載文件。開啟、直接檔案、拖入、啟動參數都經過相同實際路徑／目錄邊界判定；最深層已知專案優先，未知檔案使用獨立作用域。既有工作區視窗優先聚焦。

renderer 離開前完成交易與草稿、保存視圖、flush 指定工作區，成功後才能改畫面。主程序再次核對視窗工作區及切換授權，不接受無範圍 save。組字、衝突、目前工作區的歷史／草稿或共用 profile 寫入失敗留在原畫面；其他工作區的快取錯誤只阻擋其所屬視窗。

## MCP 與即時工作階段

`desktop/mcp-windows.cjs` 管理執行期間的 editorSessionId、焦點、已知專案開啟合併與 renderer 請求。與保存的 WindowSession ID 分離，改綁或關閉即失效。renderer 的 `app/mcp/use-agent-context.ts` 協調同步與導航，各編輯器透過 `editor-context.ts` 提供即時選取及來源映射；摘要只在 tab／模式變更合併傳送，不為每次打字傳送整份情境。

`desktop/mcp/application.ts` 管理快照、版本保護、去重與操作；`semantics.ts` 使用 UI 共用 parser、變數／快速修正 helper 及抽出的 `workspace/statistics.ts`。相同內容的語義結果快取，不建立另一套 Yarn 規則。主程序 `requestChecked` 在既有工作區佇列內重新核對授權與版本，失敗回呼只包住實際執行，以區分提交前拒絕與提交後保存失敗。

`desktop/mcp/runtime.ts` 只處理官方 SDK Streamable HTTP、schema、loopback 憑證檢查與有界輸出；預設停用。設定／憑證保存於 profile，業務修改仍經文件引擎及歷史。SDK 與實際包含依賴的授權通知隨 desktop staging 打包；主程序 CJS 亦在 staging 階段進行語法檢查。工具與座標契約見 [MCP 接入](mcp.md)。

## 桌面儲存

`desktop/workspace-service.ts` 管理所有專案與磁碟寫入，文件 request 依序處理。800ms debounce 只寫有路徑且未衝突的文件。寫入先建立同目錄暫存檔、flush，再核對磁碟內容雜湊後替換；寫入成功才更新 saved。

原檔自動保存與 profile 草稿分開。檔案系統監看在本地乾淨時重載；本地有修改時保留雙方內容並停寫。外部刪除不自動重建。另存至不同資料夾會開啟該資料夾專案並建立綁定副本；匯出不改綁定。

Windows 的暫時性 EPERM／EBUSY／EACCES 最多重試三次，每次仍重新核對磁碟版本並使用暫存檔替換，不退回直接覆寫。持續失敗則保留錯誤與重試入口。profile 本身寫入失敗時，無路徑草稿標為失敗；關閉提示不宣稱草稿已保存。

專案 `.spindle/project.json` 保存名稱、有效指令、相對路徑與文件 ID。profile 的 `workspace-v2.json` 保留舊無路徑草稿，`workspace-cache/` 按需保存每個工作區草稿；`project-catalog-v1.json` 保存專案紀錄與啟動偏好，`windows-v2.json` 保存各視窗綁定與布局，`project-views-v1.json` 保存專案重新開啟的視圖。開啟同一資料夾重用專案；複製專案目錄時避免與已開啟專案重用文件 ID。

`recovery-store.ts` 管理 `.spindle/history/index.json` 與 `trash/<entry-id>/entry.json + payload`。單檔歷史使用 profile 的 `single-file-history/<identity>/`。只為活動工作區每分鐘建立快照，每文件／指令保留 50 份，垃圾桶保留 30 天。

刪除先保存文件，再以 prepared → deleted 日誌移動完整目錄（含非 Yarn 檔）；復原以 restoring 日誌移回，碰撞使用 recovered 名稱。永久刪除以 purging 日誌刪 payload，索引持久化後才移除操作紀錄。索引寫入失敗保留日誌，重試／重啟可完成操作，不讓已刪除項目復活；符號連結不跟隨。全域 Windows 垃圾桶不參與新操作。

專案首次開啟時匯入舊 profile 歷史；history 索引同時是遷移標記，存在後不重複匯入。還原沿用 DocumentId，衝突時重映射歷史；文件引擎重設已移除文件的交易日誌。

## 編輯面

Monaco 保留純文字呈現。CodeMirror 使用來源範圍裝飾，不以 DOM 重新序列化劇本；未修改文字、註解、BOM 與換行保留。觸及的token與被選取範圍揭露原文，未知命令與未閉合區域回退來源。折疊與聚焦只影響閱讀；折疊使用正規化來源範圍、隨CM修改映射並在還原時驗證場景邊界。

Monaco 非同步載入完成時，若已有浮層或其他輸入欄位取得焦點，不再搶回焦點。

Monaco React 重用保留的 model 時不保證套用最新 value，因此在掛載及 model 切換後、恢復視圖前，以當前文件同步 model；程式同步不提交交易。

兩個編輯器的 Undo／Redo 接到文件引擎；模式切換沒有文字交易。圖表布局歷史獨立保存於該 tab，跨模式保留。文字 undo stack 在本次 App 生命週期內共用，持久化快照負責重啟後內容恢復。

## 工作區與歷史介面

`RecoveryViewState` 隨 session 保存分類、查詢、選取 ID、預覽／比較、列表及預覽捲動、比較基準。專案復原不提供返回編輯按鈕；成功復原垃圾桶項目後不導航並選取相鄰項目。指令版本還原仍保留該歷史。

Workbench 組合 SettingsView、SearchOverlay、CommandManager、HistoryView 及 RecoveryView。設定／指令／復原使用 utility tab；搜尋使用失焦關閉的 popup。文件大綱只由工具列切換，按模式保存偏好。navigation.ts 管理每 tab 的前進／後退與按 DocumentId 區分的視圖快取；一般定位保留目前 TabId。

節點 SceneEditor 以固定來源範圍連續編輯，共用文件歷史與保存。跨檔節點依 DocumentId 提交，文字期待版本不符時不覆蓋新來源；未提交內容另存 Electron profile 所屬 localStorage 的 graph-pending key，重新開該場景可複製或明確捨棄，不自動覆蓋正式劇本。外部修改跨越場景邊界時停止提交。編輯期間固定圖表位置，退出才重建語義連線。

歷史預覽使用獨立唯讀Monaco model，不接文件交易或自動保存；返回保留原編輯器。比較關閉先解除editor/model關係再釋放，避免尚在解析的diff worker讀到已釋放model。recover可帶expectedVersion／expectedText，由服務序列化檢查後才還原；過期比較不能覆蓋跨窗新內容。

## 多視窗

`desktop/main.cjs` 管理視窗生命週期、位置限制與工作階段；preload 只暴露具名操作。移至新視窗需等待 renderer 回報就緒後才移除來源 tab。跨窗拖移沿用相同文件／分頁身分，不複製整份文字作為同步方式。視窗位置依目前可用螢幕 work area 限制。

原生拖出／拖回、Snap、多螢幕拔除及不同 DPI 的最終狀態以 [實作追蹤](history/implementation-progress.md) 為準，程式存在不代表已完成實機驗收。

## Portable 啟動

0.2.1 的 portable 使用 ZIP、解壓提示與每次啟動獨立的 `$PLUGINSDIR/app`。目前 electron-builder 26.15.3 的實作需要 `unpackDirName: true` 才不指定共用暫存目錄，與該版型別註解的 boolean 說明不一致；升級打包工具時應重跑 `pnpm test:portable-launch`，以實際解壓路徑與關閉後資源仍可載入為準。安裝版與 portable 共用 ZIP 設定，避免 NSIS package helper 重用不同格式的壓縮包。

所有啟動測試都使用隔離 profile。預設 profile 仍在 `%APPDATA%/Yarn Workbench`；0.9.0 將正式專案歷史／垃圾桶遷至專案內，個人工作階段仍在 profile。

指令的 `name` 仍是原始識別字，新增可選 `displayName`；參數新增可選 `displayName`／`description`。舊設定不需重寫，空顯示名回退識別字。純文字、閱讀與節點共用來源位置 tokenizer；虛擬提示不提交內容交易，未知／未完成或無法安全分辨的參數不猜測標籤。

### 關閉握手（0.9.0）

主程序攔截 close，以每次隨機 token 向該 renderer 請求 prepare-close。renderer 暫停操作，檢查組字並 flush 未同步交易、保存 session 後回覆。主程序核對 sender、token 與原工作區綁定，再只 flush 該工作區；重複 close 合併，15 秒未回覆保留視窗，錯誤可返回編輯。正常關閉不需要使用者確認；保存失敗沿用問題文件提示與草稿保護。

### Spindle 品牌相容性（0.6.0）

顯示名稱與可執行檔改為 Spindle；保留 com.yarnworkbench.desktop 安裝識別、Yarn Workbench profile 路徑、localStorage key、.spindle 與備份格式。顯式 --user-data-dir 優先，不改動隔離測試或使用者指定路徑。

Ctrl 連結由共用 sceneLink 解析來源範圍，解析後先確認唯一存在的目標。Monaco 與 CodeMirror 都用同一命中範圍顯示和導航；裝飾不新增內容交易。指令提示共享 metadata，Monaco 跳脫 Markdown，CodeMirror 用 textContent 建構 DOM。

### 內建指令與變數補全（0.6.4）

`command-catalog.ts` 提供純顯示 metadata，不寫入自訂指令設定。三個編輯入口共用內建／自訂候選、懸浮說明與參數提示；`set`／`declare` 的名稱與值分開，條件與右側運算式不依空格拆成位置參數。內建語法不增加重複的 inline 參數標籤。補全清單開啟時暫停參數提示，關閉後依空參數規則重新判斷，不提示已填值。

`variable-completion.ts` 索引整個專案的完整 declare／set 定義，宣告優先、同名去重，保留型別、文件、行數及緊鄰的 /// 說明。`set` 左側不提供唯讀 smart variable；條件、運算式及插值中的 `$` 提供定義候選，排除註解、字串與普通台詞。這是編輯輔助，不代替官方編譯器的型別分析。

語義來源：[變數、declare、set 與型別](https://yarnspinner.dev/docs/yarn/02-fundamentals/05-logic-and-variables/)、[detour／return 與 v3 語法](https://docs.yarnspinner.dev/2.5/coming-in-v3)、[once](https://docs.yarnspinner.dev/write-yarn-scripts/scripting-fundamentals/once)、[函式與 call](https://docs.yarnspinner.dev/api/csharp/yarn.unity/yarn.unity.dialoguerunner/yarn.unity.dialoguerunner.addfunction)、[wait／stop](https://docs.yarnspinner.dev/2.3/getting-started/writing-in-yarn/commands?fallback=true)。


### 指令提示互斥（0.6.5）

emptyParameterHint 同時讀取游標兩側，內建語義位置與自訂位置參數共用空值規則。CodeMirror 的 commandEditing 統一安裝游標與 hover extension，hover 的建立與保留均受參數提示、補全狀態及組字狀態約束；選取／內容變動撤掉舊 hover。Monaco 的同一個來源定位 widget 顯示參數或 hover，延遲回呼也再次核對優先順序，避免過期 hover 搶回顯示。Esc、失焦與組字關閉提示；來源內容與交易不參與提示狀態。

### 工作區樹與輔助閱讀（0.7.0）

FileTree 負責選取、折疊、命名入口和拖移命中；file-tree.ts 共用資料夾合法性、移動規劃、混合順序。Project.folders 保存空資料夾，treeOrder 保存文件 ID／資料夾路徑鍵的排列；舊資料缺欄位仍可還原。建立與移動透過具名 IPC，renderer 不取得任意 filesystem。單次資料夾移動先驗證來源／目的在 root 內、排除 symlink 和同名，完成磁碟 rename 後才映射全部子文件路徑及 metadata，文字、版本與 DocumentId 保持不變。0.9.0 起資料夾刪除由專案垃圾桶保存完整目錄及文件識別；復原及永久刪除共用操作日誌，詳見上方「桌面儲存」。

ReadingEditor 接受 goTo nonce 以區分外部定位與游標回報，解除覆蓋目標的折疊再捲動。DialogueReader 是唯讀、來源行對應的 React 畫面，不生成或回寫 Yarn；書本狀態屬於 tab。StatisticsPanel 僅聚合目前文件，沿用 document-side 寬度與窄窗規則。desktop:stage 更新 renderer、主程序服務與版本資訊後才供 UI 測試／打包使用；只清理驗證位於 dist-desktop/app 下的生成 renderer，避免過期 hash bundle 混入發行。

### 穩定路由與指標拖移（0.7.1，圖表部分由 0.8.0 取代）

createConnectionRouter 在每個 Canvas 內保留上一組路徑，核對端點尺寸、連線拓撲及新障礙；有效路徑直接沿用。routeConnections 的幾何與標籤分兩階段，標籤位置不作幾何障礙；短引線也檢查碰撞。快取不寫入劇本或跨窗共享歷史。useTreeDrag 使用 pointer capture 與來源鍵，依 elementFromPoint 命中現有樹列／層尾，放開再呼叫同一 moveEntry 驗證與磁碟服務；不產生 OS 檔案拖曳 payload。


### 持久圖表布局（0.8.4）

0.8.0 取代 Canvas 內的即時 createConnectionRouter。React Flow 負責畫布與量測；graph/model.ts 建立獨立場景、轉場、分支組。graph/layout-state.ts 的 schema 2 快照包含節點位置、中心接點面、線路、pin、固定線段、幹線與卡片錨點。舊 positions／viewport 原位遷移，不重新排列。

graph/layout-engine.ts 接收全圖／所選／修線請求。ELK Layered 使用量測尺寸與具有原文順序的虛擬分支組；libavoid-js 只負責固定部分之間的避障候選，Spindle 管理幹線、卡片通道及手動限制。全圖整理清除限制並適應視窗；局部只重排選取的完整範圍，外部節點作固定障礙，外部 pin／卡片保留。repair 逐點保留無關有效線路；受影響線路由端點、卡片、pin 重建，不把舊自動折線當作限制；新節點尋找鄰近空位。

use-graph-layout.ts 管理 Worker、文件／布局版本、50 筆完整布局 Undo／Redo 與保存。過期回應丟棄，失敗保留布局；30 秒逾時終止引擎，重試建立新 Worker。layout.worker.ts 使用獨立 ELK Worker 與離線 libavoid WASM；avoid.ts 封裝已驗證的 embind API 與原生物件生命週期，不假設 C++ 全部介面皆可用。public/legal/ 附 LGPL／EPL 與對應來源。

map-sources.ts 訂閱 WorkspaceClient 每筆共享文件交易。即使圖表未掛載，也更新目前、快取、前後導航及已關閉 tab 的來源錨點；使用保留 CRLF／BOM 的原文座標。全物件替換／外部改寫只作唯一特徵匹配，歧義轉場不繼承舊幾何。文件以 DocumentId 識別，Graph 掛載 key 包含 TabId／DocumentId，避免同 tab 切稿套用別稿布局。

線上卡片透過 React Flow routeCard 節點參與框選、選取與混合拖曳；量測尺寸必須隨受控節點保留。RouteEditor／use-route-gestures.ts 管理 pin 拖曳；TrunkEditor 僅提供實際共用幹線的選取命中區；文字仍使用 SceneEditor 文件交易。每次手勢一筆布局快照，Undo 不回寫 Yarn。縮放細節以 visibility 處理而不移除摘要，接點不因縮放移動。

0.8.1 在 schema 2 增加 controlOrder；0.8.2 加入可選 routing="pins" 遷移標記。normalizeRouting 保留可見物件位置與控制順序，移除舊固定線段、pin 軸向／方向、幹線拖曳限制，當前快照與 Undo／Redo 均走相同遷移。修改控制點前按舊路徑解析一次順序，之後不因位置改變而重排。manual-routing.ts 以控制點產生拖動預覽；Worker 只保留明確限制，不把自動舊折線再當手動限制。卡片只選整理以 scope.cards 傳遞，保持場景固定。reroute 為待修線旗標，成功後清除。重疊物件或無可行避障時仍以短直角路徑連接控制點，保留內部 errors 供測試，不回退舊幾何或顯示路線衝突；引擎真正執行失敗仍維持原有錯誤處理。舊資料仍可讀取，歧義不影響劇本文字。

0.8.3 的 route-snapping.ts 在互動入口為可見物件計算連接中心吸附，整組使用同一位移，與內容交易無關。route-lanes.ts 由預覽及 Worker 共用，以未受影響線為固定參照；依來源、出口、連續共用前綴、目的地、方向與卡片／pin 先後判別合法共線，只調整自由折點。候選必須保持可見控制點、正交、無折返與避障，再降低重疊及繞路成本。schema 2 的可選 lanes=2 標記讓舊線路（含 lanes=1）修整一次，節點、手動卡片、pin 與視野保留；歷史還原沿用同一流程。

0.8.4 的來源共用判定同步沿兩條折線前進，忽略 pin 造成的額外共線頂點；實際分岔或第一張卡片結束共用前綴。以同一出口的真實路徑判定，不依固定長度或分支組 ID；分岔後重合仍算衝突。每次分線呼叫內快取折線片段與成對前綴，拖動或 Worker 下次請求重新建立快取。lanes=1 遷移重新計算自由折點，但不再重新吸附已存在卡片。

### 指令快速註冊與專案目錄

專案設定、歷史及垃圾桶統一使用 `.spindle/`，不讀取或遷移舊 `.yarn-workbench/`。`command-quick-fix.ts` 只從完整呼叫建立保守的參數定義；純文字、閱讀與節點編輯共用。`registerCommand` 由工作區服務基於目前指令集追加並去重，沿用驗證、歷史與持久化，不由 renderer 覆蓋整份舊清單；不修改劇本文字。

### Utility tab 生命週期

設定與指令頁的 React instance 隨開啟 tab 存活，切換以 hidden 隱藏，關閉時卸載。指令草稿只存在該 instance，不提供工作區 commandDraft action，不包含於 profile、備份或遷移；讀取舊資料時移除殘留欄位。已套用定義照常保存及建立版本歷史。文件 tab 與復原頁繼續使用既有視圖快取／RecoveryViewState。


## App 編輯器風格

`AppPreferences.editorAppearance` 是版本化的全局值、四模式部分覆寫、純文字編輯選項／語法色與閱讀寬度。`app/appearance/model.ts` 集中預設、欄位驗證、逐欄 patch 和 effective style 解析；缺少覆寫欄位代表繼承，null patch 取消覆寫。未知或不合法的持久化欄位回退，無效寫入 patch 整筆拒絕。

桌面 `appearance` action 經既有序列佇列合併最新資料、原子寫入 App profile 並廣播，不修改 `.spindle` 專案資料。保存失敗恢復記憶體舊值。首次初始化從最近工作階段匯入閱讀值與行號；以已存在的版本化設定為遷移完成標記，不再讀 session 覆蓋。Web 使用獨立 localStorage 偏好、storage 通知及可用的 Web Lock 序列化跨 tab 更新。

`workspace:fonts` 為具名唯讀 IPC，檢查視窗身分後，以固定 PowerShell 腳本列出 Windows 字型，隱藏程序視窗、限制逾時並快取。renderer 無法傳入腳本；失敗時仍可輸入字型。模組包含於 desktop stage。

風格 Context 提供共用有效值；Monaco 使用 options/theme，CodeMirror 使用獨立 Compartment，在組字結束後套用重配置，保留文件及 Undo。閱讀畫面使用 CSS 變數；React Flow 節點及轉場卡以 DOM 高度與字型量測更新 repair 請求，保存位置、pin、手動卡片中心和布局歷史，不重新整理全圖。介面提示維持 UI 字型與既有浮層樣式。

## 0.9.1 診斷呈現與專案物件操作

`DiagnosticPresentation` 在 renderer 將即時語義分析與可見診斷分開；以 DocumentId、原文差異及來源行追蹤 800ms 暫緩範圍。Monaco／CodeMirror 使用同一可見性判斷，工具列／問題清單／圖表標記使用完整發布結果。此狀態不寫入 profile，也不延遲文件交易或 MCP 檢查。

`project-entries` 共用 UI 與 MCP 的檔案操作規劃、路径與完整子樹驗證。`EntryJournal` 連接磁碟新增／移動與 project.json 身分資料；開始前保存意圖，保存來源後重新記錄檔案身分，metadata 成功後才清除紀錄。開啟時以設定摘要與磁碟證據恢復；不明狀態保留，拒絕默默覆寫。`RecoveryStore` 繼續負責完整垃圾桶資料與復原日誌。

正式產品不再引用示範工作區；The Last Light 僅存於 scripts/fixtures。封裝白名單涵蓋 MCP runtime、視窗模組、系統字型查詢與 licenses，並以實際 Portable 驗證。


## Agent 安裝服務（0.9.2）

`AgentInstaller` 與客戶端設定 adapter 獨立於 WorkspaceService：只管理由設定頁選定的 agent 使用者設定及 Skill，不接觸劇本。可信 renderer 透過具名 IPC 檢查、安裝／更新、移除、選擇路徑及握手；憑證由主程序 MCP runtime 提供，renderer 不提交任意設定內容。Codex TOML 使用受管理區塊與解析前後的無關語義比對，Claude JSON 使用局部 edit；損毀或未知擁有權拒絕接管。

每個 Spindle profile 的 `agent-targets-v1.json` 保存路徑選擇。使用者 `~/.spindle-agent/installations-v1.json` 記錄 profile、目標、資源版本、雜湊與共享 Skill 擁有者，不含憑證。安裝與移除使用跨程序鎖，先持久保存意圖／允許的前後雜湊，再逐檔原子替換；提交前重新檢查內容。部分失敗下次以紀錄核對現況續作，不還原整份第三方設定備份。失效程序鎖僅於確認程序不存在時清理。

MCP entry 預設 `spindle`，非預設 profile 使用正規化 profile 路徑雜湊後綴。Skill 不含 profile 特定資訊並共用；最後一個擁有者移除時，只有檔案仍符合受管理雜湊且無額外檔案才移除。不同 client 可各自存放 Skill。連接埠／憑證更新只標示過期，使用者明確更新後同步 agent 設定。此安裝流程不建立額外 MCP 工具，也不修改 agent 的信任或工具批准設定。

## 0.10.0 跨工作區整合

- `app/workspace/search.ts` 定義統一結果；`settings-registry.ts` 與設定頁共用欄位 ID。暫存新增 tab 不對應文件，確認成功才接上 DocumentId。
- `app/i18n/` 提供三語訊息與固定執行階段語言；診斷保留穩定 code/args，呈現文字不作為修正識別。`AppPreferences` 以 patch 保存語言與更新偏好。
- `desktop/restart.cjs` 執行全視窗 prepare/commit；任一視窗失敗時取消全部，成功才寫一次性恢复清單。原有單窗關閉流程仍獨立。
- `desktop/update-service.ts` 限制 GitHub 倉庫、SemVer、資產種類與 SHA-256；NSIS 使用 electron-updater，Portable 使用獨立 PowerShell helper 等待退出、保留原檔並確認新程式啟動。
- `version.json` 為產品唯一人工版本來源。`releases/` 產生 App 說明與 GitHub 草稿內容；CI 限定發布 job 擁有寫入權限。

舊資料 bootstrap 與救援操作使用持久遷移收據，避免刪除或转存後由舊 localStorage 復活。專案名稱不作為示範資料的刪除條件。
