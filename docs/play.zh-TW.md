[English](play.md) · [繁體中文](play.zh-TW.md) · [简体中文](play.zh-CN.md)

# Play 試跑：驗收版

本版實作第一輪 A–D，不變更已發布的 0.10.0。Web Play、音訊、精準行起點、命名測試與 agent 操控屬於後續階段。

## 操作

從模式切換旁的 Play 按鈕啟動，預設由目前場景開頭開始；無法識別時自行選擇起點。每個編輯器視窗有獨立 Play 視窗與 runtime；單檔模式只編譯該文件。

小說模式累積台詞，VN 顯示背景、三個立繪位置與對話框。切換呈現不重置狀態。第一次推進補完打字機，下一次才推進。Auto 遇選項或錯誤停止。側邊面板提供變數搜尋、釘選、型別輸入、條件、指令事件與原文定位；不可用選項仍顯示，不猜測 runtime 未提供的原因。

上一步還原台詞、選項或測試覆寫停點，包含 VM、變數、訪問、隨機、事件與畫面。改選後不保留舊路徑結果。選項等待時改變變數，只重算該組選項，不重播之前指令。覆寫不修改劇本。

## 角色與素材

Project 選單、搜尋及 Play 可開啟「角色與預覽」。由台詞發現說話者，顯示名稱不改寫原文。匯入 PNG、JPEG、WebP，設定預設頭貼、具名頭貼／立繪變體後保存；缺少圖片使用名稱替代。

設定存於 `.spindle/preview.json`，素材存於 `.spindle/preview-assets/`，以相對參照及內容雜湊識別。單張上限 20 MB，快照載入上限 100 MB。保存核對修訂，損毀設定不覆寫。

自訂指令頁提供背景、顯示、隱藏、表情等宣告式預覽效果；參數索引由 0 開始，站位為左／中／右。角色頁也能設定同一份對應。未綁定指令只顯示實際求值事件並繼續，不執行 JS、shell 或遊戲邏輯；運算所需的未知函式會明確報錯。

## 版本、來源與整合

試跑固定已同步的記憶體文件、指令及素材設定；組字或未同步草稿會阻擋擷取。修改劇本後本輪繼續原版本，標示已更新。「重跑」使用原快照，「使用最新內容重跑」才重新編譯。查看原文僅安全映射未變範圍，歧義時開唯讀快照。

閱讀畫面使用預設頭貼，不改來源座標。圖表只標示實際觀察到的場景／路徑，不重排、不清 pin、不把未測說成不可達。關閉或改綁來源視窗會結束 helper，Play 本身沒有劇本保存詢問。

官方 Yarn Spinner 3.2.1 與 .NET 10.0.12 自包含 helper 隨包離線運作，不需另裝 .NET。私有標準輸入／輸出傳遞訊息，不新增網路服務。每次推進限制 100,000 指令，每輪限制 10,000 事件，請求逾時 30 秒；關閉 Play 可终止 helper。除錯擴充集中於 vendor，保留官方编譯及求值規則，執行狀態不持久化。

MCP 新增 `list_play_sessions(editorSessionId)` 與 `get_play_context(editorSessionId, playSessionId)`，唯讀模式可用。情境與編輯器框選分離，長內容明示截斷；操控試跑及精準起點留待 E。

## 建置

使用專案指定 Node/pnpm 與 .NET SDK 10.0.401，可用 `SPINDLE_DOTNET` 指向私人 SDK。先執行 `node scripts/build-play-runtime.mjs`，再執行 `node --test scripts/play-runtime.test.mjs scripts/play.test.mjs`。桌面 staging 自動打包 self-contained helper 及授權。

`node scripts/test-play-ui.cjs` 以隔離 profile 驗證實際 Electron 與 MCP client；設定 `SPINDLE_PLAY_PORTABLE` 可直接測最終 Portable。詳見[驗收紀錄](play-validation.md)。

