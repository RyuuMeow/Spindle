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

每分鐘對有變更內容建立快照，每文件保留 50 份；刪除前先持久化復原副本，再刪磁碟檔案。最近刪除保留 30 天。復原遇到同名檔案使用新的 recovered 名稱，不覆蓋既有檔案。無路徑草稿與非法指令表單也保留在 profile。

## 編輯面

Monaco 保留純文字呈現。CodeMirror 使用來源範圍裝飾，不以 DOM 重新序列化劇本；未修改文字、註解、BOM 與換行保留。觸及的token與被選取範圍揭露原文，未知命令與未閉合區域回退來源。折疊與聚焦只影響閱讀；折疊使用正規化來源範圍、隨CM修改映射並在還原時驗證場景邊界。

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
