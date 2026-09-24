[English](play.md) · [繁體中文](play.zh-TW.md) · [简体中文](play.zh-CN.md)

# Play 试跑：验收版

本版实现第一轮 A–D，不变更已发布的 0.10.0。Web Play、音频、精准行起点、命名测试与 agent 操控属于后续阶段。

## 操作

从模式切换旁的 Play 按钮启动，默认由当前场景开头开始；无法识别时自行选择起点。每个编辑器窗口有独立 Play 窗口与 runtime；单文件模式只编译该文件。

小说模式累积台词，VN 显示背景、三个立绘位置与对话框。切换呈现不重置状态。第一次推进补完打字机，下一次才推进。Auto 遇选项或错误停止。侧边面板提供变量搜索、固定、类型输入、条件、指令事件与原文定位；不可用选项仍显示，不猜测 runtime 未提供的原因。

上一步还原台词、选项或测试覆盖停点，包括 VM、变量、访问、随机、事件与画面。改选后不保留旧路径结果。选项等待时改变变量，只重新计算该组选项，不重播之前指令。覆盖不修改剧本。

## 角色与素材

Project 菜单、搜索及 Play 可打开“角色与预览”。从台词发现说话者，显示名称不改写原文。导入 PNG、JPEG、WebP，设置默认头像、具名头像／立绘变体后保存；缺少图片使用名称替代。

设置保存于 `.spindle/preview.json`，素材保存于 `.spindle/preview-assets/`，以相对引用及内容哈希识别。单张上限 20 MB，快照加载上限 100 MB。保存核对修订，损坏设置不覆盖。

自定义指令页提供背景、显示、隐藏、表情等声明式预览效果；参数索引由 0 开始，站位为左／中／右。角色页也能设置同一份映射。未绑定指令只显示实际求值事件并继续，不执行 JS、shell 或游戏逻辑；运算所需的未知函数会明确报错。

## 版本、来源与整合

试跑固定已同步的内存文件、指令及素材设置；输入法组字或未同步草稿会阻止获取。修改剧本后本轮继续原版本，标示已更新。“重跑”使用原快照，“使用最新内容重跑”才重新编译。查看原文仅安全映射未变范围，歧义时打开只读快照。

阅读画面使用默认头像，不改来源坐标。图表只标示实际观察到的场景／路径，不重新排列、不清除 pin、不把未测说成不可达。关闭或重新绑定来源窗口会结束 helper，Play 本身没有剧本保存询问。

官方 Yarn Spinner 3.2.1 与 .NET 10.0.12 自包含 helper 随包离线运行，不需另装 .NET。私有标准输入／输出传递消息，不新增网络服务。每次推进限制 100,000 指令，每轮限制 10,000 事件，请求超时 30 秒；关闭 Play 可终止 helper。调试扩展集中于 vendor，保留官方编译及求值规则，执行状态不持久化。

MCP 新增 `list_play_sessions(editorSessionId)` 与 `get_play_context(editorSessionId, playSessionId)`，只读模式可用。情境与编辑器选区分离，长内容明示截断；操控试跑及精准起点留待 E。

## 构建

使用项目指定 Node/pnpm 与 .NET SDK 10.0.401，可用 `SPINDLE_DOTNET` 指向私人 SDK。先执行 `node scripts/build-play-runtime.mjs`，再执行 `node --test scripts/play-runtime.test.mjs scripts/play.test.mjs`。桌面 staging 自动打包 self-contained helper 及授权。

`node scripts/test-play-ui.cjs` 以隔离 profile 验证实际 Electron 与 MCP client；设置 `SPINDLE_PLAY_PORTABLE` 可直接测试最终 Portable。详见[验收记录](play-validation.md)。

