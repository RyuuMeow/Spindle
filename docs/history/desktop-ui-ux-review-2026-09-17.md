# Historical development record

This document describes an earlier milestone. Current behavior and release status are documented in the main architecture/UI guides and release verification report. Links to local verification outputs are retained as labels only; those artifacts are not distributed.

# Yarn Workbench Desktop UI／UX 嚴格審查

2026-09-17 · Windows x64 0.1.0 · **審查與改善提案；產品程式未修改。**

三位 Sub Agent 分別從創作流程、視覺與資訊架構、桌面互動與可及性獨立找碴；主代理實際操作已打包的 App、查證關鍵發現並合併重複項。判斷是：**介面已經精簡，日常創作所需的信任、可發現性與可恢復性還沒補齊。** 下一輪應優先處理這些問題。

## 比較基準

| 參照 App | 本次採用的具體原則 | 對 Yarn Workbench 的意義 |
|---|---|---|
| Notion | 新分頁預設可開搜尋，承接找內容／建立內容的下一步；刪除有恢復路徑。 | ＋的目的清楚、操作可反悔。參照 [桌面分頁](https://www.notion.com/help/notion-for-desktop)、[刪除與恢復](https://www.notion.com/help/duplicate-delete-and-restore-content)。 |
| Linear | 區分工作區搜尋與目前視圖搜尋。 | 搜尋範圍明確，作品變大仍能找到內容。參照 [Search](https://linear.app/docs/search)。 |
| Obsidian | 可从定期快照恢復作品。 | 本機創作也需要恢復途徑。參照 [File recovery](https://obsidian.md/help/plugins/file-recovery)。 |
| Miro | 連線、標籤與避開物件是關係圖的閱讀問題。 | 流程圖必須幫助追蹤分支。只比較圖表任務。參照 [Connection lines](https://help.miro.com/hc/en-us/articles/360017730733-Connection-lines)。 |

依使用者要求排除 VS Code。上述參照限相近任務，不導入企業協作、雲端帳號、龐大指令系統或 IDE 面板。官網資料已查閱，沒有冒稱本輪操作過競品。

## 優先排序

**P1**：資料保護缺陷或關鍵保存流程失敗，需要先處理。**P2**：可繞過但持續增加猜測、辨識或操作成本。評級由主代理統一，與各子報告的原始評級可能不同；發生頻率未經使用者研究量化。

| ID | 等級 | 最尖銳的問題 | 證據強度 | 改善重點 |
|---|---|---|---|---|
| A01 | P1 | 只是版面設定壞了，正常劇本卻被範例覆蓋。 | 隔離實測＋源碼 | 故障隔離，保留原資料，停止錯誤覆寫 |
| A02 | P1 | 點「儲存並切換」後沒完成，錯誤還被確認框擋住。 | 兩條操作路徑實測 | 當前對話框說明失敗，直接回到問題欄位 |
| A03 | P1／P2 | 「已儲存」沒有一致契約：劇本有復原草稿，指令沒有；原始檔也不會更新。 | 源碼＋畫面 | P1 統一草稿保護；P2 明示工作區保存與檔案匯出 |
| A04 | P2 | 有刪除確認，但確認後不能反悔。 | 源碼＋確認框 | 本機最近刪除／取代前快照 |
| A05 | P2 | 想開始自己的故事，找不到新建空白專案與專案更名。 | 源碼＋首次畫面 | 清楚起步入口，補日常整理操作 |
| A06 | P2 | 流程圖先裁掉部分場景，適應全部後連線仍穿過其他卡片。 | 實測＋畫面 | 合理初始視野、追線高亮、連線避讓 |
| A07 | P2 | 最顯眼的＋直接開同稿第二視圖，兩個分頁看起來一樣。 | 實測＋源碼 | 新分頁先選目的，保留但標明同稿視圖 |
| A08 | P2 | 記得一句對白，卻得先猜它在哪一份劇本。 | 源碼 | 整個故事的輕量搜尋，標示局部範圍 |
| A09 | P2 | 有桌面分頁，Ctrl+T／W／Tab 卻沒有對應行為。 | 實測；其他可及性為源碼 | 少量核心快捷鍵、縮放、欄位錯誤定位 |
| A10 | P2 | 部分必要資訊被縮成低對比小字。 | 樣式量測＋畫面 | 提高必要小字的可讀性，保留灰階風格 |

## 具體問題與驗收

### A01：錯誤恢復正在造成第二次破壞

隔離 profile 中放入有效且已保存的 `AuditOnly.yarn`，只將版面 JSON 設成非法字串。重新載入後 850ms，文件儲存區已變成三份範例，測試稿的識別文字消失；畫面只說「保存資料無法讀取，已載入範例」。原因是三類資料在同一個 try 讀取，失敗後仍開啟自動保存。[page.tsx:31](D:/GitHub/yarn-workbench/app/page.tsx:31)

**改法／驗收：** 文件、指令、版面分開讀取與驗證；失敗資料保留原字串，提供匯出救援與重試。只破壞版面時文件應完整可讀；任何讀取失敗都不得自動以範例覆寫原內容。這是人工注入損毀測試，未估計正常使用的發生機率。

證據：`實測結果` (local verification artifact)、`測試腳本` (local verification artifact)、`恢復後畫面` (local verification artifact)。

### A02：保存失敗沒有可操作的回饋

把指令名稱改成 `bad name`，切換另一指令後按「儲存並切換」：確認框留在原地，錯誤文字在背景表單，焦點仍在保存按鈕。關閉該分頁後選「儲存」也一樣。使用者可取消返回，因此不是無法逃出的死鎖，但 App 沒告訴他為何失敗或如何修正。[CommandManager.tsx:15](D:/GitHub/yarn-workbench/app/CommandManager.tsx:15)

**改法／驗收：** 保留草稿，在當前框內明示原因與「返回修正」，或直接返回並聚焦錯誤欄位。兩條保存路徑都能一步到問題處，修正後完成原操作；讀屏能取得錯誤原因。[W3C 錯誤辨識原則](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html)

!`錯誤留在背景表單，確認框沒有解釋` (local verification artifact)

### A03：作者需要知道作品到底安全了沒有

劇本文字每 500ms 保存復原草稿，Ctrl+S 再更新保存版本；指令草稿僅在記憶體。桌面退出提示已明說指令可能遺失，但意外終止沒有這個預警。另一方面，匯入 `.yarn` 後 Ctrl+S 只保存 App 工作區，原始檔不更新。這是已記載的既有行為；設計問題是主狀態「已儲存」不足以說明交付狀態。[page.tsx:32](D:/GitHub/yarn-workbench/app/page.tsx:32)、[CommandManager.tsx:8](D:/GitHub/yarn-workbench/app/CommandManager.tsx:8)、[main.cjs:34](D:/GitHub/yarn-workbench/desktop/main.cjs:34)

**改法／驗收：** 先讓合法與暫時非法的指令草稿都可恢復；明確選定「App 管理作品＋匯出」或「直接編輯選定檔案」的產品契約。短期主狀態寫明保存於工作區、匯入時說明是副本，讓匯出更容易找到。新使用者不讀 README，也應能回答「這次修改已寫回遊戲讀取的檔案嗎」。指令與劇本未保存工作在重開後皆能找回。指令保存通知的「此瀏覽器」也須與桌面措辭一致。

### A04：確認框不能取代恢復能力

移除劇本、刪除指令及取代專案均有明確防呆，這些應保留；但確認後找不到撤回或最近刪除。App 內建立、尚未匯出的劇本沒有另一份原始檔可救。[page.tsx:50](D:/GitHub/yarn-workbench/app/page.tsx:50)、`移除確認` (local verification artifact)

**改法／驗收：** 刪除先進本機可恢復區，取代前自動快照。確認移除後立即撤銷、重開後恢復，都必須取回最新文字與參數；明確處理同名衝突。無需複製 Notion 的整套服務，採用它的[刪除後可恢復原則](https://www.notion.com/help/duplicate-delete-and-restore-content)即可。本輪未實際刪除使用者作品。

### A05：範例能教人看，還沒教人開始自己的作品

全新 profile 直接進 The Last Light，專案選單只有匯入、備份、自訂指令、說明。沒有空白專案與專案更名；新增劇本仍落在範例專案。日常整理也缺劇本重新命名／複製，場景改名必須自行處理引用。`專案選單` (local verification artifact)、[page.tsx:60](D:/GitHub/yarn-workbench/app/page.tsx:60)

**改法／驗收：** 起步提供「建立故事／開啟現有稿／試用範例」，專案與文件可就地命名。新使用者三個明確操作內建立自己的命名專案及第一稿，匯出不混入範例。場景改名若後續加入，需先預覽靜態引用影響；不能以盲目文字取代處理動態引用。

### A06：流程圖的第一個任務是讓人讀懂關係

首次進入流程會在初始 fit 後強制聚焦目前場景至 zoom=1，右侧兩個場景幾乎出界。「適應全部」可修正，但 Departure → Lighthouse 的線仍穿過 Shop 正文；「重新排列」只是依索引排三欄。跨檔有效目標和缺失／動態目標還共用淡化虛線造型，後者相似性由源碼確認，未逐一捕捉實畫。[Graph.tsx:13](D:/GitHub/yarn-workbench/app/Graph.tsx:13)

**改法／驗收：** 首次顯示總覽、後續保留使用者視野；明確要求定位才移動畫面。先加入選取節點的入／出線凸顯，再改善線路與標籤避讓；來源位置與錯誤狀態分開標示。範例及含回圈、跨檔的 20 場景測試稿中，能追完每個出口，不被無關卡片遮住。這沿用 [Miro 對連線可讀性的處理](https://help.miro.com/hc/en-us/articles/360017730733-Connection-lines)，不增加完整圖形編輯器。

!`首次進入流程時部分節點出界` (local verification artifact)

`按適應全部後的對照` (local verification artifact)。

### A07：分頁能力存在，但操作意圖不清楚

頂部＋建立目前文件的第二視圖；兩個 tab 同名、內容同步，但可保留不同模式與位置。這是 v0.4 刻意設計，不能當成 bug。問題是最顯眼的新增動作沒有讓人選下一個目的，同稿視圖也無可見辨識。`實測画面` (local verification artifact)

**改法／驗收：** ＋先提供找劇本／新建／另開目前視圖的精簡入口，同稿頁籤顯示模式或場景提示。保留共享內容和獨立視野；新手在點擊前能區分「新稿」與「同稿另一視圖」。這是設計提案，應以小型任務測試驗證；[Notion 新分頁預設開搜尋](https://www.notion.com/help/notion-for-desktop)提供可比較的模式。

### A08：搜尋不能要求使用者先記得答案在哪

「尋找場景」只篩目前劇本的場景名稱，Ctrl+F 是目前文件內文；沒有整個故事的內容搜尋。局部功能本身有效，範圍卻不夠明顯。[page.tsx:28](D:/GitHub/yarn-workbench/app/page.tsx:28)

**改法／驗收：** 一個輕量入口搜尋劇本、場景與對白，結果帶檔名和片段；局部搜尋寫明「此劇本」。相同文字在不同文件都能一次找出，結果可精確導航。採用 [Linear 工作區／視圖搜尋區分](https://linear.app/docs/search)或 [Notion 工作區／頁內搜尋區分](https://www.notion.com/help/search)，不必增加永久面板。

### A09：少數熟悉快捷鍵，比更多按鈕更能建立桌面感

在編輯器有焦點的隔離實測中，Ctrl+Tab 不切 tab、Ctrl+T 不新增、Ctrl+W 不關 tab；Ctrl+= 的整體 zoomFactor 維持 1。現有 Ctrl+S／F 與 Monaco 編輯功能仍存在，不能說完全沒有鍵盤支援。`實測數據` (local verification artifact)

另外，新增劇本檔名缺可程式判讀名稱、表單錯誤未與欄位關聯；流程節點可 Enter 到原文，但個別位置操作缺非拖曳替代。這些是源碼發現，未做 NVDA 或完整鍵盤驗收。

**改法／驗收：** 補新建／開啟／切換／關閉／搜尋／保存等少數快捷鍵與可見提示、持久化縮放；對話框內不誤觸全域動作。欄位錯誤精確定位，圖節點整理有非拖曳途徑。參照 [Notion 桌面快捷鍵](https://www.notion.com/help/keyboard-shortcuts)的可預期性，不搬入 IDE 指令庫。

### A10：安靜的介面仍須讓必要資訊可讀

部分 11–12px 輔助文字使用 #777，對 #1c1c1c／#202020 的計算對比分別約 3.81／3.64:1；適用於場景計數與流程標題等指定角色，不能擴大為「全部 UI 不合格」。模式與保存文字量到 11px，部分節點 footer 宣告 10px。[globals.css:6](D:/GitHub/yarn-workbench/app/globals.css:6)、`實際控制項量測` (local verification artifact)

**改法／驗收：** 提升必要小字對比，重要操作標籤考慮 12–13px 並實測密度；保留灰階與低干擾風格。以有效樣式核對普通文字至少 4.5:1 的[對比參照](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)，包含透明度合成；另驗證 Windows 不同縮放。本輪不是完整 WCAG 認證。

## 建議實作順序與應保留項目

1. **資料信任：** A01 恢復覆寫 → A02 保存失敗回饋 → A03 指令草稿恢復；之後補 A04 可撤回操作。
2. **日常創作：** 確定保存／匯出契約，完成 A05 自己的專案入口，再處理 A07 分頁目的、A08 全故事搜尋。
3. **閱讀與操作：** A06 視野與追線、A09 核心快捷鍵與可及性、A10 小字。流程初始視野可作獨立的小修正提早處理。

保留「撰寫／故事流程」雙模式、可收側欄、按需開啟的診斷與資訊、流程回原文、共享文件的獨立視圖、現有草稿與確認保護。對標後的方向是**讓作者少猜規則、少做補救動作**。

## 範圍與可追溯資料

本輪以打包的 Windows App、全新隔離 profile、1440×900 和 800×600 CSSpx、DPR 1 操作。收集 18 張畫面；其中 `12-check-error.png` 的測試內容未触發診斷，不拿它作錯誤證據，真正診斷圖為 `18-real-diagnostics.png` (local verification artifact)。截圖含 App 客戶區，不含 Windows 標題列。

800×600 的主畫面及指令表單沒有觀察到可確認裁切，因此沒有列為缺陷。未做真實作者測試、長時間大型專案效能測試、NVDA、觸控、Windows 高對比／150% DPI 全面驗證。使用者困惑與效率代價是根據證據的設計推論，沒有捏造訪談或量化結果。

獨立審查：`創作流程` (local verification artifact)、`視覺與資訊架構` (local verification artifact)、`桌面互動與可及性` (local verification artifact)。取證腳本：`capture.cjs` (local verification artifact)、`probe.cjs` (local verification artifact)。證據位於本機 outputs，不是公開託管連結。這個目錄目前沒有 Git 中繼資料，本輪未建立 commit。
