[English](mcp.md) · [繁體中文](mcp.zh-TW.md) · [简体中文](mcp.zh-CN.md)

# Spindle MCP 与 Agent 接入

Windows 桌面版运行时提供本地 Streamable HTTP MCP，**默认停用**。在「设置 → MCP／Agent 集成」选择只读或允许修改。服务只监听 `127.0.0.1`，不提供远程连接、无界面后台编辑或任意文件系统访问；Web 版不提供此服务。

## 安装与连接

设置页可为 Codex、Claude Code 一键安装或更新用户级 MCP 设置及共用的 [Spindle Skill](../skills/spindle/SKILL.md)。凭证写入 Agent 的本机用户设置，不写入剧本项目；安装不会改变 Agent 的批准策略。安装后重新加载 Agent 或开启新会话。「设置已写入」「Spindle 握手成功」「Agent 已加载工具」是三个不同状态。

Codex 默认使用 `$CODEX_HOME/config.toml`（未设置时 `~/.codex/config.toml`）与 `~/.agents/skills/spindle/`。Claude Code 默认使用 `~/.claude.json` 与 `~/.claude/skills/spindle/`，自定义 `CLAUDE_CONFIG_DIR` 时遵循该目录。安装前会展示实际目标路径。外部同名设置、损坏配置或已修改的 Skill 会提示冲突，不会静默覆盖；移除仅清理未被外部修改的受管理项目，其他 Spindle profile 仍在使用的共用 Skill 会保留。

手动安装时，将仓库的 `skills/spindle/` 复制到个人 Skill 目录，并把 Spindle 设置页显示的连接信息合并到 Agent 用户配置。**不要把真实凭证提交到版本库。** 以下只是占位示例：

```toml
[mcp_servers.spindle]
url = "http://127.0.0.1:PORT/mcp"
http_headers = { Authorization = "Bearer TOKEN" }
```

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

更改端口或重置凭证后，点击「更新安装」。停用 MCP 会撤销原凭证。「检查连接」只验证握手与工具列表，不能证明第三方 Agent 已加载。官方格式：[Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)、[Codex Skills](https://learn.chatgpt.com/docs/build-skills)、[Claude Code MCP](https://code.claude.com/docs/en/mcp)、[Claude Code Skills](https://code.claude.com/docs/en/skills)。

## 指定会话与读取编辑情境

Project 是共享内容；Editor Session 是绑定工作区的窗口；Context Snapshot 是一次读取时固定的编辑状态。先用 `list_editor_sessions`，必要时通过 `list_projects`、`open_project` 打开已知项目。同一项目有多个窗口时，必须明确选择 `editorSessionId`。`activate_editor_session` 默认只指定操作目标，不抢焦点；此后每个项目工具仍要带该 ID。窗口关闭、改绑项目或应用重启后 ID 失效，切换标签页不会使其失效。

`get_editor_context` 从目标编辑器读取当前文档及版本、光标、精确选区、可见来源范围、附近诊断与可识别的场景、变量或命令。Spindle 失焦后保留最后的文档选区。设置、命令、恢复等工具页按实际页面类型返回，最后编辑的文档另列，不泄露未应用表单。阅读选区映射至 Yarn 原文；图表可返回所选场景、分支卡、线与 pin，节点编辑位置映射到完整文档。可见范围**不是**眼球注视位置。

原文范围采用 **UTF-16、从零起算、右边界不包含**的 offset，包含 CRLF 与 BOM；显示的行／列从 1 起算。快照标记截断、同步及输入法组字状态。若 `composing:true`、`synchronized:false` 或有 pendingDocumentIds，不要将画面坐标套用到假定版本。完整内容用 `read_document` 分页读取。

## 20 个工具

| 类别 | 工具 |
| --- | --- |
| 会话 | `list_editor_sessions`、`list_projects`、`open_project`、`activate_editor_session`、`reveal_location`、`get_editor_context` |
| 读取与分析 | `read_document`、`query_project`、`validate_project`、`get_statistics` |
| 语义修改 | `update_commands`、`apply_changes`、`apply_quick_fixes` |
| 项目目录 | `list_project_entries`、`create_document`、`create_folder`、`move_entry`、`trash_entry`、`list_trash`、`restore_trash` |

`query_project.kind` 支持 `documents`、`scenes`、`links`、`variables`、`references`、`commands`、`calls`、`unknown_commands`，结果分页。静态诊断不等于完整 Yarn 执行验证；注册自定义命令仅建立编辑器定义，游戏端仍须自行实现。

项目目录工具只能操作指定项目，不能访问任意磁盘路径或独立单文件工作区。`list_project_entries` 包含空文件夹、树顺序、文档 ID 和相对路径。entry key 为 `file:<DocumentId>` 或 `folder:<相对路径>`。一次写入一个项目条目，支持 `preview`。创建文档可提供初始文本；同父目录的 `move_entry` 相当于改名。垃圾桶保留完整文件夹及非 Yarn 文件；恢复同名冲突使用唯一 recovered 名称。永久删除仍由 UI 确认，不提供 MCP 工具。

## 版本保护与恢复

先读取快照并预览，再以其 `snapshotId` 与唯一的 `operationId` 提交。预览不写磁盘；提交时重新核对内容版本、目录状态、组字、共享窗口、路径边界和名称冲突。结果不明时**用同一 operationId 重试**。如果结果含 `applied:true` 与 `persistenceError` 或 `recoveryRequired`，操作已经发生，不要换 ID 再创建副本或重复修改。

文字修改指定 DocumentId、预期版本与原文范围，一批修改为一笔 Undo。跨文件场景改名核对所依赖文件集合。命令定义有独立版本与历史，不与文字交易混成单一原子操作。受影响文档有组字、未同步输入或节点草稿时拒绝写入。UI 的 800ms 诊断显示延迟不影响同步内容的 `validate_project`。

常见错误：`EDITOR_SESSION_EXPIRED`、`SNAPSHOT_EXPIRED`、`VERSION_CONFLICT`、`INPUT_PENDING`、`MCP_READ_ONLY`、`OPERATION_ID_REUSED`。过期会话必须重新列举，不自动指向别的项目。操作摘要不记录剧本文字。MCP 凭证保存在 App profile，不进入 `.spindle` 或发行附件。

`pnpm test:mcp` 验证 SDK 客户端、版本与权限；`pnpm test:mcp-ui` 在 `pnpm desktop:stage` 后用隔离桌面 profile 测试。v1 不修改图表布局或 pin，不提供远程访问、Resources 与 Prompts。
