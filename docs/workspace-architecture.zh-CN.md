[English](workspace-architecture.md) · [繁體中文](workspace-architecture.zh-TW.md) · [简体中文](workspace-architecture.zh-CN.md)

# 工作区架构

Yarn 原文是内容的权威来源。纯文本、阅读、图表节点、标签页和多个窗口共用稳定的 `DocumentId` 与有版本的文字交易。布局、偏好、命令定义和项目历史分别保存并拥有独立的撤销边界。[history/](history/) 保存旧设计记录，不代表当前实现契约。

## 文档、标签页与同步

`app/workspace/types.ts` 定义项目、文档、视图和 IPC。`engine.ts` 管理文档版本与 Undo/Redo，利用 CodeMirror ChangeSet 整理跨窗口编辑并拒绝过期操作。原文 CR 保留，避免悄悄改变 CRLF/BOM 位置。`client.ts` 管理各窗口的乐观编辑；输入法组字期间暂缓该窗口的送出及远程修改，结束后重新同步。主进程拥有磁盘状态，renderer 不直接访问 Node 文件系统。

每个标签页是独立视图，保存导航、模式、选区、阅读状态和图表布局。显示同一文档的多个视图共享文字与文档历史，图表布局历史仍按视图保存。设置和命令工具页在切换标签时隐藏而不卸载。未应用命令草稿只存于该标签内存，关闭即丢弃；已应用定义有独立历史。恢复页选区及 diff 模式作为视图状态保存。

`storage.ts` 验证旧数据与损坏数据，并保存迁移或救援副本。旧无路径草稿在「设置 → 数据恢复」预览、转存或删除；持久化收据避免从旧 localStorage 复活。新 profile 和新项目保持空白。公开的 [The Last Light 示例](../examples/demo-project/the-last-light/README.md) 是测试 fixture 的来源，不会作为 App 初始内容。

## 桌面工作区生命周期

`DesktopWorkspace` 区分首页、正式项目和独立 `.yarn`。`project-catalog.ts` 保存完整列表和最近标记；Project 菜单最多显示五项。`workspace-cache.ts` 只加载当前使用的工作区。打开文件夹、文件、拖入与启动参数统一按真实路径和目录边界判定；最深的已知项目优先。其他 `.yarn` 作为独立文件打开，不会偷偷建立项目。

主进程追踪工作区所绑定的窗口；最后一个窗口离开后才停止监看。关闭、切换项目或重启会先完成编辑交易、保存视图、写回**当前工作区**，成功后才清除旧画面。组字、冲突或保存失败时保留编辑器。多窗口重启／更新要求所有窗口准备成功后才关闭任何窗口。App 风格与语言偏好单独保存在 profile。

正式项目使用 `.spindle/project.json`、`.spindle/history/`、`.spindle/trash/` 和操作日志。文件树保留空文件夹与混合顺序。`project-entries` 让 UI 与 MCP 共用目录操作验证：拒绝项目根、`.spindle`、项目外路径、符号链接／junction 越界、同名及自我嵌套。改名／移动保留 DocumentId、标签、历史和图表锚点。`RecoveryStore` 保留完整文件夹及非 Yarn 子文件，同名恢复不会覆盖现有内容。日志区分磁盘操作与 metadata 写入，以便处理中断，而不是盲目重复执行。

## 语义、诊断与搜索

UI 与 MCP 共用解析、命令与变量辅助来源。`DiagnosticPresentation` 将最新分析与当前可见诊断分离：输入时立即隐藏编辑范围内的波浪、悬浮错误与自动修复，停止 800ms 或离开该行／命令后发布；补全与参数提示保持即时。问题列表和工具栏沿用上次完整发布结果。MCP 的 `validate_project` 立即检查已同步内容，并报告组字／未同步状态。

`app/workspace/search.ts` 定义文件、内容、设置、命令和操作的混合结果；设置字段 ID 来自共用 registry。搜索中新建剧本先进入暂存标签，行内命名成功才建立磁盘文件，取消不会留下空文件。最近项目和三语操作别名本身不会修改项目。

## 图表与手动布局

`graph/model.ts` 从来源范围建立场景、独立跳转和分支组。React Flow 负责画布操作及尺寸测量；`graph/layout-state.ts` 保存节点坐标、中心接点、路线、pin、分叉干线与条件卡锚点。旧坐标和视野原位迁移。`graph/layout-engine.ts` 在 Worker 中使用 ELK Layered 和 libavoid-js 进行明确触发的全图／选取布局及必要的局部修线。文档与布局版本拒绝过期结果；引擎失败时保留旧布局。移动无关节点应保持其他有效线路不变，图表不推算所有隐含 Yarn 执行路径。

`graph/map-sources.ts` 随共享文档交易映射来源锚点，包括离屏或关闭的视图；歧义的整篇替换不会继承无关跳转的手动几何。路线卡是可选的 React Flow 节点；pin／卡片改变走线，不修改 Yarn。节点文字走文档交易与 Undo，拖动布局走独立历史。吸附与通道间距保留同来源的共用前缀，并错开不同去向。Worker、WASM 及许可文件随桌面版离线封装。

## MCP、安装与更新

`desktop/mcp-windows.cjs` 登记运行期会话 ID 并向 renderer 取得精确情境；`app/mcp/use-agent-context.ts` 提供实时来源位置。`desktop/mcp/application.ts` 管理快照、版本核对与去重；`desktop/mcp/runtime.ts` 负责 loopback HTTP、协议及凭证。外部行为见 [MCP 指南](mcp.zh-CN.md)。安装服务只修改指定的 Codex／Claude 用户配置与共用 Skill，记录所有权与恢复状态；不会安装第二个 server 或修改 Agent 的信任策略。

`version.json` 是唯一人工维护的产品版本。`app/i18n/` 包含三种离线语言。`desktop/restart.cjs` 协调语言重启与更新前保存。`desktop/update-service.ts` 限定 GitHub 仓库、版本、平台和附件类型，安装前核对 SHA-256。安装版使用 electron-updater；Portable 使用独立 Windows 辅助程序与旧 exe 备份。自动检查仅接受公开稳定版，用户选择后才下载。测试边界见[发布流程](releases.zh-CN.md)与[验证报告](../releases/0.10.0/verification.md)。
