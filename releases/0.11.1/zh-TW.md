# Spindle 0.11.1

## Features
- 相容性修正：Play 現在可編譯開頭含 BOM 的 UTF-8 劇本。

## 修正
- 修正有效的 title 標頭前有不可見 BOM 時，錯誤顯示「Nodes must have a title」。
- 保留原文及來源位置，涵蓋跨檔播放、CRLF、Unicode 台詞及當前行起跑。只在編譯輸入中將開頭的編碼標記視為空白。

- 修正 Source 編輯器在同步更新時重複插入 BOM，導致使用最新文字重跑 Play 被誤判為尚未同步。

## 發行
Windows x64 Portable 與 NSIS 安裝版均未簽章。保留全部 0.11.0 功能；實測結果及未實測項目見驗證報告。
