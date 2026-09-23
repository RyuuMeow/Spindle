[English](releases.md) · [繁體中文](releases.zh-TW.md) · [简体中文](releases.zh-CN.md)

# 发布流程

`version.json` 是唯一人工维护的产品版本；`pnpm version:sync` 更新包 metadata，`pnpm version:check` 检查一致性。数据、协议与迁移 schema 版本独立。每个 `releases/<版本>/` 包含 `en.md`、`zh-TW.md`、`zh-CN.md`（均有 `## Features`）和验证报告。发布 metadata 从同一份说明生成 GitHub 内容与 App 更新说明。

## 本地验证与 Windows 成品

1. 干净 checkout 使用 Node.js 22.22.0、pnpm 11.25.0 和 `pnpm install --frozen-lockfile`。运行 `pnpm demo:check`、`pnpm version:check`、`pnpm i18n:check`、TypeScript、lint、单元／MCP／安装服务／发布测试，以及 Web／桌面构建；在验证报告记录实际环境、命令和结果。
2. 用 `pnpm desktop:pack` 生成 Windows x64 Portable 与 NSIS。检查最终封装中的许可、离线 MCP、Worker／WASM、三语资源，排除示例初始内容、profile、凭证和测试产物。
3. 从最终 tag 加入源码归档、验证报告、LICENSE、第三方声明及必要第三方源码。运行 `pnpm release:metadata`，核对 `SHA256SUMS-<版本>.txt`、`latest.yml`、更新 metadata、附件名与 tag。
4. 在隔离 profile 验证首页、复制／打开示例项目、自定义命令、Portable 重启／替换及恢复。有干净 Windows 环境时还应实测 NSIS 与更新流程；未实测的 IME、DPI、多窗口、锁文件或权限场景必须列出。

Windows 签名可选用 `WINDOWS_CSC_LINK` 与 `WINDOWS_CSC_KEY_PASSWORD`；没有证书时成品**未签名**。SHA-256 验证完整性，不代表发行者签名。

## GitHub 工作流与公开

`.github/workflows/verify.yml` 在 PR／main push 触发；`release.yml` 在版本 tag／手动触发并创建**草稿** Release，重新下载核对哈希。写入 Release 的权限只授予发布 job。账户额度或付款限制导致 Actions 未启动，不能算测试结果。额度恢复前保留触发、main 暂不要求此 check，本轮以完整本地验证及记录为依据。

0.10.0 公开切换时，先将旧私有仓库改为 `Spindle-private-archive`，再建立全新的私有 `RyuuMeow/Spindle`，只推送整理后的 main 与重新创建的 `v0.10.0`。先备份旧 refs／附件；重用同名仓库后不可依赖 GitHub 的旧网址跳转。所有新附件从新 tag 构建、上传后重新下载核对哈希、源码及封装内容。公开前检查失败则新仓库继续私有，Release 保持草稿。公开后用未登录请求验证 README、文档、源码及下载，保护 main 禁止删除／强制推送，最后将旧私有仓库封存为只读。旧私有 0.10.0 测试者需手动安装同版本新成品。

## 更新边界

Spindle 每次运行最多检查一次较新的**公开正式**版本，尊重跳过设置，不自动下载。用户明确选择后才安装；所有窗口先完成保存握手再退出。NSIS 通过 electron-updater；Portable 使用独立 Windows 辅助程序并保留旧 exe，新程序启动也需验证。更新限定指定仓库、兼容平台／架构／类型、版本和哈希。准备或启动失败时保留／恢复旧程序；不能把「下载成功」当作安装全流程通过。正式程序不内嵌私有 GitHub 凭证。
