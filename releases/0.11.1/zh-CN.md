# Spindle 0.11.1

## Features
- 兼容性修复：Play 现在可以编译开头含 BOM 的 UTF-8 剧本。

## 修复
- 修复有效的 title 标头前有不可见 BOM 时，错误显示「Nodes must have a title」。
- 保留原文和源位置，涵盖跨文件播放、CRLF、Unicode 台词及当前行起跑。仅在编译输入中将开头的编码标记视为空白。

- 修复 Source 编辑器在同步更新时重复插入 BOM，导致使用最新文本重跑 Play 被误判为尚未同步。

## 发行
Windows x64 Portable 和 NSIS 安装版均未签名。保留全部 0.11.0 功能；实测结果及未实测项目见验证报告。
