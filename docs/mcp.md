# Spindle MCP v1

Windows 桌面版執行期間提供本機 Streamable HTTP MCP。預設停用，不包含遠端服務、無介面編輯、任意檔案系統操作或圖表布局修改。介面使用官方 TypeScript SDK，僅提供 Tools。

## 啟用與連線

在初始畫面或編輯器的「設定 → MCP／Agent 整合」選擇唯讀或允許修改，再按「複製 MCP 連線資料」。首次配置可用連接埠並記住；重啟使用原位址，衝突時由設定頁更改或重試。0 表示重新配置可用連接埠。

複製資料的形式如下；使用設定頁取得實際值，不要把占位文字當憑證：

```json
{
  "mcpServers": {
    "spindle": {
      "type": "http",
      "url": "http://127.0.0.1:PORT/mcp",
      "headers": { "Authorization": "Bearer TOKEN" }
    }
  }
}
```

各 MCP client 的設定容器可能不同；必要的標準連線資訊為 HTTP URL 與 Authorization header。Spindle 不自動改寫外部 agent 設定。

- 只監聽 127.0.0.1；Host 限目前連接埠的 127.0.0.1／localhost，Origin 如有提供也必須相符。
- 每個 App profile 的 `mcp-v1.json` 分別保存模式、連接埠與隨機憑證。不寫入專案或操作摘要。
- 停用及重設憑證立即撤銷舊憑證，已進入原子提交的操作完成後保留結果。
- 最近操作只保存本次啟動最近 100 筆工具名稱、時間及成功／失敗；設定頁顯示最近 20 筆。
- 唯讀可查詢、預覽，以及明確操作視窗／來源定位；不可提交文件或指令修改。

## 目標與工作流程

1. `list_editor_sessions` 查看已開啟的視窗。`list_projects` 讀取完整專案清單及可用狀態；不載入未開專案文本。
2. 必要時用 `open_project({projectId})` 開啟清單中的專案。已有多個視窗會全部回傳，agent 必須自行明確指定。
3. `activate_editor_session({editorSessionId, tabId?, focus:false})` 回傳指定目標的情境。這不是連線隱含的「目前目標」；之後的專案工具仍須攜帶 editorSessionId。
4. 讀取情境、文件或診斷得到 snapshotId，再用其版本與範圍預覽／提交修改。

editorSessionId 只在本次 App 執行、同一視窗工作區綁定內有效。切 tab 不改 ID；關閉、改綁專案或重啟後失效，不會轉向最近專案。開新專案使用新視窗並恢復保存視圖；focus 預設 false，不搶桌面焦點。同專案的並行開啟合併。

## 工具

所有來源 offset 為 **原始文件的 UTF-16 字元索引、0 起算、右界不包含**，包含 CRLF 與 BOM。游標行／欄為 1 起算，emoji 依 UTF-16 計數。不要用 UTF-8 byte offset。

| 工具 | 主要參數與結果 |
|---|---|
| list_editor_sessions | 視窗、工作階段、專案、tabs、作用中頁面／模式、焦點與最後聚焦時間 |
| list_projects | query、offset、limit；items、total、nextOffset、各專案已開工作階段 |
| open_project | projectId、focus=false；回傳 sessions，不任選多視窗候選 |
| activate_editor_session | editorSessionId、tabId?、focus=false；回傳目前情境 |
| reveal_location | editorSessionId、documentId、from、to?、focus=false；在既有導航規則下以純文字定位 |
| get_editor_context | editorSessionId、surroundingLines=10（最多 100）；即時情境及 snapshotId |
| read_document | editorSessionId、documentId、from=0、to?；原文、版本及 nextFrom |
| query_project | editorSessionId、kind、documentId?、query?、offset?、limit? |
| validate_project | editorSessionId、documentId?、offset?、limit?；issues、fixes 及 snapshotId |
| get_statistics | editorSessionId、documentId?、sceneName?；字數、場景、角色、選項與指令使用 |
| update_commands | editorSessionId、snapshotId、commands、preview?、operationId；批次新增／更新完整定義 |
| apply_changes | editorSessionId、snapshotId、change、label?、preview?、operationId；文字交易／場景新增及改名 |
| apply_quick_fixes | editorSessionId、snapshotId、fixIds、preview?、operationId；只套用指定候選 |

`query_project.kind` 可為 documents、scenes、links、variables、references、commands、calls、unknown_commands。查詢與診斷預設每頁 100 筆、最多 200；nextOffset 為 null 表示結束。未知指令提供呼叫資料而不是確定的定義；同名呼叫推測參數互相矛盾時不提供自動註冊候選。新增定義不表示遊戲端已有該指令實作。診斷為編輯器靜態檢查，不是完整 Yarn 執行驗證。

## 即時情境

快照從指定 renderer 主動取得，先同步已完成的交易，不強制結束組字。包含作用中頁面、模式、文件版本、目前場景、游標、多段正向／反向選取、主要選取索引、可視來源範圍、附近診斷及語義物件。

失焦保留最後選取。設定、指令、復原等工具頁如實回報 page；document 為 null，lastDocumentId 另列，不回傳未套用表單。切换專案清除上一專案的 lastDocumentId。閱讀模式將可見文本映射回原文；跨越隱藏語法的選取，其 text 為該完整原始範圍。圖表提供場景、卡片、線與 pin 識別及可解析的來源；節點內編輯提供全文座標。可視範圍不代表眼球注視。

`synchronized:false`、`composing:true` 或 pendingDocumentIds 非空表示尚有未完成輸入；不同版本的畫面位置不回傳為有效選取。renderer 就緒與精確讀取各有 5 秒上限，失敗回報 EDITOR_CONTEXT_TIMEOUT，不用 profile 資料冒充即時快照。

情境最多 100 段選取、200 段可視範圍；選取文字總量及附近原文各最多 12,000 UTF-16 字元。文件讀取每次最多 32,000，使用 nextFrom 繼續。傳輸另限制大型字串與巢狀列表，截斷會附 responseTruncated／truncatedFields；不得把截斷文字當完整替換內容。

## 修改、版本與恢復

文字修改範例：

```json
{
  "editorSessionId": "SESSION",
  "snapshotId": "SNAPSHOT",
  "operationId": "unique-operation-uuid",
  "preview": true,
  "label": "調整對話",
  "change": {
    "kind": "edits",
    "documents": [{
      "id": "DOCUMENT",
      "version": 12,
      "edits": [{ "from": 80, "to": 85, "insert": "新的台詞" }]
    }]
  }
}
```

確認 preview 結果後，以 preview=false 及新的提交 operationId 送出。新增場景使用 `change:{kind:"create_scene",documentId,name}`；改名使用 `change:{kind:"rename_scene",documentId,fromName,name}`，共用既有跨檔引用更新，不更改一般台詞中的同名文字。同名場景歧義拒絕操作。

- 快照最多保留最近 128 筆、10 分鐘。採保守的整個專案內容／指令／文件集合簽章；任何相關專案版本變動都需重讀。提交時再次核對，游標移動不會改變原目標範圍。
- 共用此專案的所有視窗先同步。觸及文件仍在組字、存在節點草稿衝突或未送出输入時拒絕；沒有修改的其他文件組字不阻擋單文件文字交易。
- 一批文字修改使用既有文件交易，一次 Undo，不與前後打字合併。指令更新使用有效定義的比較交換及指令歷史；未套用草稿保留，過期時不能覆蓋新定義。
- 文字修正與指令註冊不可混為一個原子批次；MIXED_HISTORY_SCOPES 時分兩次取得快照、提交。
- operationId 在本次執行與工作階段內去重；同 ID 同內容回傳原結果，同 ID 不同內容拒絕。失敗後若要修正條件重新嘗試，使用新 ID；網路結果不明時重送原 ID。
- applied=true 表示已提交到文件權威，不等於磁碟已完成保存。檢查各文件 status 與 persistenceError；磁碟失敗時不要再次提交相同文字。read_document 可取得後續保存狀態／版本。
- 文字交易、指令定義及磁碟寫入均經工作區服務，MCP 不直接覆寫 .yarn 或專案設定。

常見拒絕：EDITOR_SESSION_EXPIRED、TAB_NOT_FOUND、DOCUMENT_NOT_FOUND、SNAPSHOT_EXPIRED、VERSION_CONFLICT、INPUT_PENDING、MCP_READ_ONLY、OPERATION_ID_REUSED、MCP_ACCESS_REVOKED。已失效目標必須重新列舉，不能自行套到另一個專案。

## 驗證與後續範圍

`pnpm test:mcp` 驗證服務、官方 SDK client、版本保護、唯讀／憑證撤銷、埠衝突、跨檔交易、歧義及分頁。`pnpm test:mcp-ui` 使用隔離 profile 啟動實際桌面 build，測試多視窗、讀取與修改、純文字／閱讀／圖表映射、草稿、合成組字事件及重啟；需先 `pnpm desktop:stage`，使用本機 Playwright runtime。

本輪不修改圖表布局／pin，不提供 Resources、Prompts、通知、遠端連線或自動修改 client 設定。原生中文 IME、混合 DPI／多螢幕、每種第三方 client 設定 UI 及安裝版未逐一實測。驗證與實際交付狀態見[實作追蹤](implementation-progress.md)。

桌面版的複製連線資料透過受信任視窗的原生剪貼簿介面寫入，不依賴瀏覽器剪貼簿權限；憑證不會寫入操作日誌。
