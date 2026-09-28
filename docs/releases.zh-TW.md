[English](releases.md) · [繁體中文](releases.zh-TW.md) · [简体中文](releases.zh-CN.md)

# 發布流程

`version.json` 是唯一人工維護的產品版本；`pnpm version:sync` 更新套件 metadata，`pnpm version:check` 檢查一致性。資料、協定和遷移 schema 版本獨立。每個 `releases/<版本>/` 包含 `en.md`、`zh-TW.md`、`zh-CN.md`（均有 `## Features`）及驗證報告；發布 metadata 從同一份說明產生 GitHub 內容與 App 更新說明。

## 本機驗證與 Windows 成品

1. 乾淨 checkout 使用 Node.js 22.22.0、pnpm 11.25.0 與 `pnpm install --frozen-lockfile`。執行 `pnpm demo:check`、`pnpm version:check`、`pnpm i18n:check`、TypeScript、lint、單元／MCP／安裝服務／發布測試及 Web／桌面 build；於驗證報告記錄實際環境、指令及結果。
2. 用 `pnpm desktop:pack` 建立 Windows x64 Portable 與 NSIS。檢查最終封裝內的授權、離線 MCP、Worker／WASM、三語資源，並排除示範初始內容、profile、憑證及測試產物。
3. 從最終 tag 加入來源封存、驗證報告、LICENSE、第三方聲明及必要的第三方來源檔。執行 `pnpm release:metadata`，核對 `SHA256SUMS-<版本>.txt`、`latest.yml`、更新 metadata、附件名稱與 tag。
4. 在隔離 profile 驗證首頁、複製／開啟示範專案、自訂指令、Portable 重啟／替換及復原。若有乾淨 Windows 環境也實測 NSIS 與更新流程；未實測的 IME、DPI、多視窗、鎖檔或權限情境須列明。

Windows 簽章可透過 `WINDOWS_CSC_LINK` 與 `WINDOWS_CSC_KEY_PASSWORD` 設定；沒有憑證時成品**未簽章**。SHA-256 驗證完整性，不代表發行者簽章。

## GitHub 工作流程與公開

`.github/workflows/verify.yml` 在 PR／main push 觸發；`release.yml` 在版本 tag／手動觸發並建立**草稿** Release，重新下載核對雜湊。寫入 Release 的權限只給發布 job。帳戶額度或付款限制導致 Actions 工作未啟動，不能算測試結果。額度恢復前保留觸發、主分支暫不要求該 check，改以完整本機驗證和紀錄作本輪依據。

後續版本使用現有公開倉庫：推送已驗證的提交及相符版本 tag，建立 Release 草稿，上傳本機成品，重新下載核對雜湊後才發布。發布後以未登入請求驗證說明、來源、下載及更新 metadata。首次倉庫遷移屬於歷史紀錄，見 [0.10.0 報告](../releases/0.10.0/verification.md)。

## 更新邊界

Spindle 每次執行最多檢查一次較新的**公開正式**版本，尊重略過設定，不自動下載。使用者明確選擇後才安裝；全部視窗先完成保存握手才退出。NSIS 透過 electron-updater，Portable 使用獨立 Windows 輔助程序並保留舊 exe；新程式啟動也須驗證。更新限定指定倉庫、相容平台／架構／類型、版本和雜湊。準備或啟動失敗時保持／恢復原程式；不能把「下載成功」當成安裝全流程通過。正式程式不內嵌私有 GitHub 憑證。
