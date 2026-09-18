# Yarn Workbench：全介面視覺設計審查

2026-09-17 · Windows 0.1.0 · 第二輪 · **以下為修改前的歷史審查。**

使用者其後授權開始修改；0.1.1 的現行設計與實作入口見 [UI 規範](ui-design.md)。本頁與附圖仍保留當時的問題證據，不代表新版現況。

本輪由三位 Sub Agent 分別檢查桌面框架／分頁、浮層／控制項、圖表畫布；主代理操作打包 App、量測有效樣式並補查其他主要介面。與[上一輪工作流審查](D:/GitHub/yarn-workbench/docs/desktop-ui-ux-review-2026-09-17.md)分工：這份專門回答「外觀、空間、狀態與操作暗示哪裡不成立」。

**整體判斷：灰階基調可以保留，但目前各區域的框線、表面、選取、焦點與操作範圍沒有共同規則。精簡到最後，有些不重要的容器很搶眼，有些真正能操作的控制項反而消失。**


[開啟附圖審查板](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/review-board.html)：可依區域與處理層級篩選，點圖放大。

## 先回答三個具體設計問題

**Tab 的＋位置：應移到最後一張分頁後方。** 實測 1440px 寬、只有一張 tab，tab 在 x240–360，＋在 x1079，間隔719px；＋到右方文件工具只有約12px。現在的距離把它分進了錯的群組。少量 tabs 時跟著最後一頁，溢位時固定在 tab 區尾端，剩餘空白放在＋之後。[畫面](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/01-header-single-tab.png)

**Tabs 是否與 Windows 頂部欄整合：推薦作為目標方案，但保留系統視窗控制與手勢。** 實際原生框架為深色，沒有白色標題列衝突；問題是上層只有 App 名和大片空白，下層44px卻把專案、分頁、模式、選單、檢查和保存全塞一起。Windows 官方也提供以 tabs 使用 titlebar 空間的模式；其拖曳、雙擊最大化、系統選單與右側視窗按鈕必須保留。[Windows titlebar 指引](https://learn.microsoft.com/en-us/windows/apps/design/basics/titlebar-design)

**浮動選單白邊：在現在的深色系統裡確實太強，而且是已確認的樣式問題。** 實測 border 是 `1px solid #ccc`，outline 為 none，hover 前後不變，故不是鍵盤焦點框。元件設了 border 卻沒指定邊色，實際沿用文字顏色。應分開定義浮層底色、低權重邊框、陰影與焦點提示；不能用全域去邊框解決。[實際白邊](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/02-project-menu-pointer-away.png)

## 桌面框架與分頁

| ID | 找碴結論 | 建議與驗收重點 | 證據 |
|---|---|---|---|
| F1 | 原生標題列與內容頂欄各自排版，視窗／專案／文件層級未整合；視窗名只寫App名。 | tabs整合titlebar，或保留原生框架但明確分組；視窗標題帶目前工作，系統視窗行為完整。 | [原生視窗](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/26-native-window.png)；觀測＋源碼 |
| F2 | ＋距唯一tab719px，視覺歸屬更像右側文件工具。 | ＋跟著tabs尾端；1／2／10頁及窄窗都不脫離群組。 | [單tab](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/01-header-single-tab.png)；量測 |
| F3 | tab採上圓下方、全框、亮底線，卻上下留空，像浮動按鈕套了附著頁籤的輪廓；active同時靠四種強調。 | 選一套語法：低邊框浮動tab，或真正接到內容的tab。分別設計inactive／active／hover／focus／dirty；不能把焦點一起刪除。 | [hover](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/06-inactive-tab-hover.png)、[focus](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/07-tab-keyboard-focus.png) |
| F4 | 10頁時active tab右端被切掉45px，關閉X不可見；自動捲入只照顧內部trigger，沒包住整張tab。細捲軸成為主要補救。 | 保證整個active shell含X可見；溢位才顯示導航或開啟頁清單；首尾頁與完整名稱容易到達。 | [寬窗溢位](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/10-ten-tabs-wide.png)、[800px](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/11-ten-tabs-narrow.png)；實測 |
| F5 | 側欄調寬到354.25px，tab起點仍固定240px，軸線差114.25px；窄窗另有跳欄。 | 若tabs屬內容區就共享sidebar寬度；若屬整個視窗，就正式移入titlebar，解除半套對齊暗示。 | [調寬](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/28-sidebar-width-misalignment.png)；量測 |
| F6 | 看起來整張tab都能點，框內左留白點下去卻不切換。 | 除關閉鍵外，整個可見tab面都是選取目標；邊緣、文字、空白都能切換。 | [visual-facts的tabPaddingClick](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/visual-facts.json)；實測 |
| F7 | 同稿的不同模式／閱讀位置，只顯示相同檔名，無法在切入前辨認。 | 只在重複視圖出現時加模式或場景提示；完整名稱和位置可預覽。保留共享文字與獨立視野的既有設計。 | [同名tabs](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/06-inactive-tab-hover.png)；觀測＋源碼 |

**Header 方案選擇：** A＝保留原生標題列，先整理下方群組；B＝tabs整合titlebar，保留系統caption controls，文件操作另外成次級區；C＝把開啟視圖移到側欄。推薦B作目標，A可先交付；C會改變既有水平分頁習慣，暫不推薦。B若仍用兩層，總高度未必更低，價值在分層清楚與消除空間錯配。

建議分工是「titlebar：專案／tabs＋／可拖曳留白／系統按鈕」，「文件操作：撰寫與流程／本檔選單／保存」。不要把第二排所有工具硬擠進最大化與關閉按鈕旁。Notion的分頁預覽與Windows TabView可作辨識、溢位的參照，無需複製所有功能。[Notion Desktop](https://www.notion.com/help/notion-for-desktop)、[Windows TabView](https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/tab-view)

## 浮層、按鈕、側欄與表單

| ID | 找碴結論 | 建議與驗收重點 | 證據 |
|---|---|---|---|
| C1 | 三種下拉選單常駐亮框比dialog、分隔線都強，像聚焦的輸入框。 | 統一浮層表面／弱邊／陰影；選項hover另外呈現，文字色不再決定容器邊色。 | [選單](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/02-project-menu-pointer-away.png)、[hover](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/03-project-menu-hover.png)；量測 |
| C2 | 未勾選checkbox的border為0、底色透明，靜止時方框消失，只剩「必填」文字。 | box／tick／hover／focus由元件負責；unchecked在不hover時仍清楚可見。 | [靜止並列](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/29-checkbox-rest-states.png)；實測，優先修 |
| C3 | 建立／保存／移除劇本共用白色primary；刪除指令的兩顆按鈕卻同為純文字。同角色不一致。 | primary／secondary／quiet／destructive各有明確角色；不以是否碰巧加.primary決定層級。 | [刪除指令](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/30-toast-over-modal.png)、[移除劇本](D:/GitHub/yarn-workbench/outputs/ui-audit/13-remove-confirmation.png) |
| C4 | sidebar hover和selected都#333，未選hover文字#eee反而比已選#aaa更亮；灰塊寬度還不同。 | hover只短暫提示，selected穩定指出位置，focus單獨可辨；三種清單採同一狀態語法。 | [hover／selected](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/27-sidebar-hover-vs-selected.png)；量測 |
| C5 | 成功toast在z70，dialog和遮罩z50；上一個成功訊息在風險確認旁仍明亮。 | 普通成功提示於modal打開時淡出／排隊／退後；相關錯誤放當前dialog內。 | [浮層穿插](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/30-toast-over-modal.png)；實測 |
| C6 | focus由全域outline、元件ring和局部!important混合決定。 | 建立可見且一致的focus規則；目前07圖的細框是正確訊號。多重規則不等於每個元件都已出問題，此項低優先整理。 | [keyboard focus](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/07-tab-keyboard-focus.png)；源碼＋校準 |
| C7 | error／warning和一般字同灰白，輸入出錯時欄位本身不變，只在旁邊多一段話。 | 錯誤欄位、圖示、短文案與語意色一起提示，保留error+focus的區別；灰階顯示仍能識別。 | [非法場景名](D:/GitHub/yarn-workbench/outputs/ui-audit/07-scene-name-validation.png)；觀測＋源碼 |
| C8 | icon-only控制項有的HTML title、有的只aria-label；同列提示不一致。 | 使用一致的短tooltip補充動作與範圍，hover／focus皆可取得；已帶文字的按鈕不重複補提示。 | [工具列](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/01-header-single-tab.png)；源碼確認 |

白邊、checkbox消失、確認按鈕退成純文字，有共同實作根因：未分層的全域button reset覆蓋元件utilities，而部分容器又沒指定自己的border token。先修這層規則，再調色與圓角，才不會此處修好、另一處失去狀態。[components獨立報告](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/components-review.md)保留完整selector、對照和驗收。

Linear的2026設計調整可借用兩個原則：導航與邊框降低不必要的視覺權重，操作放在可預期的位置。這不等於把字縮小或把所有邊框刪光。[Linear設計說明](https://linear.app/now/behind-the-latest-design-refresh)

## 圖表編輯器：卡片、路徑、狀態與畫布工具

壓力測例只有五個可見節點，包含長標題、長摘要、兩條同端點分支、自回圈，以及跨檔／缺失／動態目標；不是用極端上千節點製造問題。

| ID | 找碴結論 | 建議與驗收重點 | 證據 |
|---|---|---|---|
| G1 | 固定三欄排列不看故事關係，固定左入右出讓回頭線穿卡片，自回圈難辨。跨檔卡透明，線會透過正文。 | 依關係安排流向；回圈走外側、路徑避卡；卡片背景不透明。每條直接去向可連續追讀。 | [範例穿卡](D:/GitHub/yarn-workbench/outputs/ui-audit/04-story-flow-fit.png)、[壓力圖](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/18-graph-stress-fit.png) |
| G2 | 兩個選項連到同一目標時label疊在同一位置；長label被卡片遮住。 | 平行連線錯開或合併為可展開分支；標籤獨立避讓，選中來源時能逐條讀到原文。 | [同端點分支](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/18-graph-stress-fit.png)；觀測 |
| G3 | 245px卡片的長名稱直接裁切，摘要固定高度切半行；footer長tag擠壓行號。 | 標題有限換行／ellipsis與完整預覽；摘要按整行截斷；來源與狀態保留固定位置。 | [長卡片](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/18-graph-stress-fit.png)；觀測＋源碼 |
| G4 | 有效跨檔、缺失、動態未知都用同樣灰色虛線和外連圖示。 | 跨檔用來源標籤，缺失用明確警告，動態用未知標籤；不靠最小footer才辨認狀態。 | [三種外部節點](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/18-graph-stress-fit.png)；觀測 |
| G5 | 常駐圓形handles暗示可拉線，但nodesConnectable=false；畫布實際編排位置，內容仍需回原文。 | 若只讀關係，弱化成路徑端點或不顯示可拖連接點；清楚說明圖上可做哪些操作。 | [Graph.tsx:19](D:/GitHub/yarn-workbench/app/Graph.tsx:19)；源碼＋外觀，未當拖曳故障 |
| G6 | 點空白後選框消失，但工具列「編輯原文」仍指向舊節點；焦點／選取／編輯對象不同步。 | 單一選取來源；無選取就隱藏／停用相關動作，選中時命名對象；凸顯相連路徑。 | [點空白後](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/20-graph-blank-selection.png)；chosen=0、editActionVisible=true |
| G7 | 初次進圖聚焦把節點推到畫外；800px適應全部只把一切縮成小字，沒有閱讀層級切換。＋／−在左下、fit在右上，缺縮放比例。 | 首次總覽、其後還原視野；集中viewport controls與百分比；縮遠顯示標題／狀態，選取再讀摘要。 | [800px圖](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/22-graph-stress-800.png)、[首次圖](D:/GitHub/yarn-workbench/outputs/ui-audit/03-story-flow.png) |
| G8 | 「重新排列」其實是固定網格重置，與fit並列，看不出會覆蓋手排位置。 | 將視野操作與版面變更分組；明確命名並提供恢復上一版排列的方式。 | [Graph.tsx:19](D:/GitHub/yarn-workbench/app/Graph.tsx:19)；源碼確認，未測撤銷手勢 |
| G9 | 零場景仍顯示整面grid、fit、重排和手勢提示，沒有建立入口；已開Empty.yarn，側欄卻提示先選劇本。 | 空圖中央明示「尚無場景」並提供新增／回原文；沒有目標的工具停用或收起。 | [真正空圖](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/35-empty-graph.png)；0 nodes實測 |

畫布建議構成：上方只放文件範圍與場景數；中央以標題優先的卡片和可追讀連線呈現故事；選取才凸顯相鄰分支及「編輯〈場景〉」；角落一組縮放／fit／定位控制；空圖與解析失敗分開呈現。Miro、FigJam、Whimsical只借用關係閱讀和操作回饋的模式，不導入多人白板與工具箱。[完整圖表報告及官方參照](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/graph-review.md)

## 其他主要介面的補查

| 區域 | 判斷與具體方向 | 證據／限制 |
|---|---|---|
| 指令設定 | 文件sidebar＋空場景區仍佔位，再加指令列表；800px下表單剩餘空間有限。可保留專案導航，但在設定情境收斂無關場景區，參數表單按名稱／型別／必填／預設值分組。沒有把正常可捲動的長表單說成裁切故障。 | [長表單800px](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/16-long-form-800.png)；設計提案 |
| 文字編輯器 | 右鍵選單是另一套較亮的方形表面，且以英文顯示Change All Occurrences／Command Palette，與繁中主介面斷開。應統一可控的主題／語言與對作者有用的命令；保留文本編輯習慣。 | [右鍵選單](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/31-editor-context-menu.png)；觀測 |
| 尋找／取代 | 動畫中截圖看似被切；等待800ms後正常出現於y48、高62px。**排除「搜尋框被裁切」指控。** | [完成動畫](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/36-find-replace-settled.png)、[量測](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/find-facts.json) |
| 診斷面板 | 有圖示、錯誤文字與來源，是好的基礎；右側長檔名是一整條低對比小字，宜縮短顯示＋完整提示，行號單獨可掃描。error／warning視覺語義與C7一起整理。 | [診斷](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/23-diagnostics.png)；未宣稱長檔名已溢出 |
| 新增／場景資訊dialog | 18px標題、13px說明基本層級成立。新增劇本欄位欠明確label；資訊dialog用滿寬白按鈕強調「前往原文」，與其他導航動作的權重差距偏大。建議同類dialog統一footer操作位置及尺寸。 | [新增](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/12-new-file-dialog.png)、[場景資訊](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/24-scene-info-dialog.png) |
| 使用說明 | 新手操作、保存規則、語法清單與實作限制同放長modal，需要逐段掃讀。建議以短的開始／保存／導航入口為前段，進階範圍放可展開區。保留現有標題層級。 | [說明](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/34-help-dialog.png)；設計提案 |
| 工作區空態／搜尋空態 | 搜尋空態有清除入口，保留。全空專案的主CTA偏弱，仍帶空場景區與上一狀態開啟的檢查面板；可收斂成建立／匯入入口。不是要求儀表板。 | [工作區空態](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/25-empty-workspace.png)、[搜尋空態](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/33-search-empty.png) |
| 字級、間距與捲軸 | 主編輯文字16px／29px行高可保留；部分導航11–12px、graph footer10px過弱。文字contrast見前輪A10。不同捲軸7／8px不自動算缺陷；tab捲軸問題在F4的導航代價。 | 有效樣式＋畫面；字型實際fallback、150%DPI尚未全測 |

## 建議先修與設計驗收

**第一批，已確認的視覺與命中缺陷：** C2隱形checkbox、F4裁切active tab、F6框內死區、G2重疊分支文字、G3長標題與半行截斷、G6選取／工具對象不同步。

**第二批，共用設計規則：** 浮層階梯、按鈕角色、hover／selected／focus／error的狀態表；F2的＋歸屬、F5的空間對齊。先解決樣式覆蓋衝突，再決定精確token值。

**第三批，框架與圖表品質：** titlebar整合、tab溢位導航、依關係排圖、縮放層級與空態。這批屬設計方案，需要用同一套代表畫面評審，而非逐個元件各自改漂亮。

驗收至少同時對照：1440／800px、1／10tabs、短／長名稱、sidebar展開／調寬／收起、滑鼠hover／鍵盤focus、乾淨／未保存、dialog＋toast、checked／unchecked，以及本檔／跨檔／缺失／動態／零節點圖。後續實作時補Windows不同DPI、失焦／最大化／Snap與讀屏測試。

## 覆蓋與證據

本輪新增37張圖片（編號01–36含21b），其中26為Computer Use原生視窗縮圖；其餘為打包App客戶區CSS尺寸截圖。有效樣式與腳本在 [ui-visual-audit](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/visual-facts.json)，補證在 [supplement-facts](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/supplement-facts.json)。全部使用測試profile。

已覆蓋目前主要產品介面模組，並未宣稱所有輸入法、所有語言／DPI、所有組合狀態已窮盡。15檔名雖寫toast但當時保存失敗，toast以30為準；09拖錯separator未完成調寬，對齊量測以28為準；21b未證實點中edge，不拿來宣稱線選取失效；32是動畫中，搜尋浮層以36為準。原生檔案對話框沒有僅因風格不同而被列為缺陷。

完整獨立審查：[框架與分頁，7項](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/frame-review.md)、[元件與浮層，8項](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/components-review.md)、[圖表，9項](D:/GitHub/yarn-workbench/outputs/ui-visual-audit/graph-review.md)。各子報告保留逐項源碼、官方對照、改善與驗收；本頁是統一判讀入口。
