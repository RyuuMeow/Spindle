# 文件、保存與同步契約

## 邊界

`app/workspace/types.ts` 定義文件、專案、分頁、視窗與 IPC 操作。文件 ID 不依賴顯示檔名；同一文件的多個視圖共用內容，每張 tab 保留模式、位置、選取、閱讀折疊及圖表狀態。

`engine.ts` 是文件版本與歷史權威。修改使用 CodeMirror ChangeSet 與版本化交易，重整跨窗並行修改、去除重送。跨檔場景操作只有全部版本符合時才提交，並整批 Undo／Redo。內部 Text 使用明確 LF 分割，將原檔 CR 當字元保留，避免 CRLF 在貼上或撤銷時被正規化。

`client.ts` 維護每窗的樂觀編輯與同步狀態。中文組字時暫緩該窗的送出及遠端編輯套用，組字結束後以共同版本重整，再觸發保存。主程序的文件版本與實際磁碟狀態是最終權威；renderer 不直接使用 Node 檔案系統。

`storage.ts` 分別驗證文件、設定與布局。舊工作區先留下 migration backup，舊 keys 保留；損毀資料另存救援副本。指令設定損毀不阻止讀取有效文件，空文件清單不以範例取代。

## 桌面儲存

`desktop/workspace-service.ts` 管理所有專案與磁碟寫入，文件 request 依序處理。800ms debounce 只寫有路徑且未衝突的文件。寫入先建立同目錄暫存檔、flush，再核對磁碟內容雜湊後替換；寫入成功才更新 saved。

原檔自動保存與 profile 草稿分開。檔案系統監看在本地乾淨時重載；本地有修改時保留雙方內容並停寫。外部刪除不自動重建。另存至不同資料夾會開啟該資料夾專案並建立綁定副本；匯出不改綁定。

Windows 的暫時性 EPERM／EBUSY／EACCES 最多重試三次，每次仍重新核對磁碟版本並使用暫存檔替換，不退回直接覆寫。持續失敗則保留錯誤與重試入口。profile 本身寫入失敗時，無路徑草稿標為失敗；關閉提示不宣稱草稿已保存。

專案 `.yarn-workbench/project.json` 保存名稱、有效指令、相對路徑與文件 ID。profile 的 `workspace-v2.json` 保存專案工作集、草稿與快照，`windows-v2.json` 保存視窗／tab 狀態。開啟同一資料夾重用專案；複製專案目錄時避免與已開啟專案重用文件 ID。

每分鐘對有變更內容建立快照，每文件保留 50 份；刪除前先持久化復原副本，再透過 Electron `shell.trashItem` 送入系統垃圾桶；失敗保留文件及錯誤，不回退永久刪除。最近刪除保留 30 天。復原遇到同名檔案使用新的 recovered 名稱，不覆蓋既有檔案。無路徑草稿與非法指令表單也保留在 profile。

## 編輯面

Monaco 保留純文字呈現。CodeMirror 使用來源範圍裝飾，不以 DOM 重新序列化劇本；未修改文字、註解、BOM 與換行保留。觸及的token與被選取範圍揭露原文，未知命令與未閉合區域回退來源。折疊與聚焦只影響閱讀；折疊使用正規化來源範圍、隨CM修改映射並在還原時驗證場景邊界。

Monaco React 重用保留的 model 時不保證套用最新 value，因此在掛載及 model 切換後、恢復視圖前，以當前文件同步 model；程式同步不提交交易。

兩個編輯器的 Undo／Redo 接到文件引擎；模式切換沒有文字交易。圖表布局歷史獨立保存於該 tab，跨模式保留。文字 undo stack 在本次 App 生命週期內共用，持久化快照負責重啟後內容恢復。

## 工作區與歷史介面

Workbench 組合 SettingsView、SearchOverlay、CommandManager、HistoryView 及 RecoveryView。設定／指令／復原使用 utility tab；搜尋使用失焦關閉的 popup。文件大綱只由工具列切換，按模式保存偏好。navigation.ts 管理每 tab 的前進／後退與按 DocumentId 區分的視圖快取；一般定位保留目前 TabId。

節點 SceneEditor 以固定來源範圍連續編輯，共用文件歷史與保存。跨檔節點依 DocumentId 提交，文字期待版本不符時不覆蓋新來源；未提交內容另存 Electron profile 所屬 localStorage 的 graph-pending key，重新開該場景可複製或明確捨棄，不自動覆蓋正式劇本。外部修改跨越場景邊界時停止提交。編輯期間固定圖表位置，退出才重建語義連線。

歷史預覽使用獨立唯讀Monaco model，不接文件交易或自動保存；返回保留原編輯器。比較關閉先解除editor/model關係再釋放，避免尚在解析的diff worker讀到已釋放model。recover可帶expectedVersion／expectedText，由服務序列化檢查後才還原；過期比較不能覆蓋跨窗新內容。

## 多視窗

`desktop/main.cjs` 管理視窗生命週期、位置限制與工作階段；preload 只暴露具名操作。移至新視窗需等待 renderer 回報就緒後才移除來源 tab。跨窗拖移沿用相同文件／分頁身分，不複製整份文字作為同步方式。視窗位置依目前可用螢幕 work area 限制。

原生拖出／拖回、Snap、多螢幕拔除及不同 DPI 的最終狀態以 [實作追蹤](implementation-progress.md) 為準，程式存在不代表已完成實機驗收。

## Portable 啟動

0.2.1 的 portable 使用 ZIP、解壓提示與每次啟動獨立的 `$PLUGINSDIR/app`。目前 electron-builder 26.15.3 的實作需要 `unpackDirName: true` 才不指定共用暫存目錄，與該版型別註解的 boolean 說明不一致；升級打包工具時應重跑 `pnpm test:portable-launch`，以實際解壓路徑與關閉後資源仍可載入為準。安裝版與 portable 共用 ZIP 設定，避免 NSIS package helper 重用不同格式的壓縮包。

所有啟動測試都使用隔離 profile。預設 profile 仍在 `%APPDATA%/Yarn Workbench`；這次修正不改變劇本、草稿或工作階段的保存位置。

指令的 `name` 仍是原始識別字，新增可選 `displayName`；參數新增可選 `displayName`／`description`。舊設定不需重寫，空顯示名回退識別字。純文字、閱讀與節點共用來源位置 tokenizer；虛擬提示不提交內容交易，未知／未完成或無法安全分辨的參數不猜測標籤。

### 關閉握手（0.5.1）

主程序攔截 close，以每次隨機 token 向該 renderer 請求 prepare-close。renderer 暫停操作，檢查組字並 flush 未同步交易、保存 session 後回覆。主程序核對 sender 與 token，再 flush 磁碟；重複 close 合併，15 秒未回覆保留視窗，錯誤可返回編輯。正常關閉不需要使用者確認；保存失敗沿用問題文件提示與草稿保護。

### Spindle 品牌相容性（0.6.0）

顯示名稱與可執行檔改為 Spindle；保留 com.yarnworkbench.desktop 安裝識別、Yarn Workbench profile 路徑、localStorage key、.yarn-workbench 與備份格式。顯式 --user-data-dir 優先，不改動隔離測試或使用者指定路徑。

Ctrl 連結由共用 sceneLink 解析來源範圍，解析後先確認唯一存在的目標。Monaco 與 CodeMirror 都用同一命中範圍顯示和導航；裝飾不新增內容交易。指令提示共享 metadata，Monaco 跳脫 Markdown，CodeMirror 用 textContent 建構 DOM。

### 內建指令與變數補全（0.6.4）

`command-catalog.ts` 提供純顯示 metadata，不寫入自訂指令設定。三個編輯入口共用內建／自訂候選、懸浮說明與參數提示；`set`／`declare` 的名稱與值分開，條件與右側運算式不依空格拆成位置參數。內建語法不增加重複的 inline 參數標籤。補全清單開啟時暫停參數提示，關閉後依空參數規則重新判斷，不提示已填值。

`variable-completion.ts` 索引整個專案的完整 declare／set 定義，宣告優先、同名去重，保留型別、文件、行數及緊鄰的 /// 說明。`set` 左側不提供唯讀 smart variable；條件、運算式及插值中的 `$` 提供定義候選，排除註解、字串與普通台詞。這是編輯輔助，不代替官方編譯器的型別分析。

語義來源：[變數、declare、set 與型別](https://yarnspinner.dev/docs/yarn/02-fundamentals/05-logic-and-variables/)、[detour／return 與 v3 語法](https://docs.yarnspinner.dev/2.5/coming-in-v3)、[once](https://docs.yarnspinner.dev/write-yarn-scripts/scripting-fundamentals/once)、[函式與 call](https://docs.yarnspinner.dev/api/csharp/yarn.unity/yarn.unity.dialoguerunner/yarn.unity.dialoguerunner.addfunction)、[wait／stop](https://docs.yarnspinner.dev/2.3/getting-started/writing-in-yarn/commands?fallback=true)。


### 指令提示互斥（0.6.5）

emptyParameterHint 同時讀取游標兩側，內建語義位置與自訂位置參數共用空值規則。CodeMirror 的 commandEditing 統一安裝游標與 hover extension，hover 的建立與保留均受參數提示、補全狀態及組字狀態約束；選取／內容變動撤掉舊 hover。Monaco 的同一個來源定位 widget 顯示參數或 hover，延遲回呼也再次核對優先順序，避免過期 hover 搶回顯示。Esc、失焦與組字關閉提示；來源內容與交易不參與提示狀態。

### 工作區樹與輔助閱讀（0.7.0）

FileTree 負責選取、折疊、命名入口和拖移命中；file-tree.ts 共用資料夾合法性、移動規劃、混合順序。Project.folders 保存空資料夾，treeOrder 保存文件 ID／資料夾路徑鍵的排列；舊資料缺欄位仍可還原。建立與移動透過具名 IPC，renderer 不取得任意 filesystem。單次資料夾移動先驗證來源／目的在 root 內、排除 symlink 和同名，完成磁碟 rename 後才映射全部子文件路徑及 metadata，文字、版本與 DocumentId 保持不變。資料夾移到系統垃圾桶前保留各 Yarn 文件快照；App 可逐檔復原，完整目錄及其他檔案可從系統垃圾桶復原。

ReadingEditor 接受 goTo nonce 以區分外部定位與游標回報，解除覆蓋目標的折疊再捲動。DialogueReader 是唯讀、來源行對應的 React 畫面，不生成或回寫 Yarn；書本狀態屬於 tab。StatisticsPanel 僅聚合目前文件，沿用 document-side 寬度與窄窗規則。desktop:stage 更新 renderer、主程序服務與版本資訊後才供 UI 測試／打包使用；只清理驗證位於 dist-desktop/app 下的生成 renderer，避免過期 hash bundle 混入發行。

### 穩定路由與指標拖移（0.7.1）

createConnectionRouter 在每個 Canvas 內保留上一組路徑，核對端點尺寸、連線拓撲及新障礙；有效路徑直接沿用。routeConnections 的幾何與標籤分兩階段，標籤位置不作幾何障礙；短引線也檢查碰撞。快取不寫入劇本或跨窗共享歷史。useTreeDrag 使用 pointer capture 與來源鍵，依 elementFromPoint 命中現有樹列／層尾，放開再呼叫同一 moveEntry 驗證與磁碟服務；不產生 OS 檔案拖曳 payload。
