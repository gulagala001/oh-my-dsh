# 上下文优化 / Context optimization

## 中文

OMD 的核心功能，默认开启。在 **设置 → Oh My DSH → 上下文与记忆 → 上下文优化** 可以关闭，选择会保存。所需运行依赖随完整 OMD 安装包提供。

- 自动精简受支持的只读 JSON、同形表格和完全相同的连续行；只对识别出的成功 Node TAP 日志做概括。未知日志、报错、写入回执、编辑正文与差异保留。
- 原生文件读取仍然真实执行。只有本次模型请求里保留着完整旧结果，才把重复读取改成引用，或把变化改成完整差异；基线消失就重新发送完整结果。使用 BC 时，此类依赖模型可见基线的优化自动保守处理。
- 可选 MCP 工具通过 `tool_find` 按需发现，返回完整、当前会话有权使用的参数说明。PTC 沿用宿主 SDK；工具返回给程序的值不变。
- `context_view` 对获准的文件、网页或原文引用提供 `raw`、`data`、`article`、`outline`、`query` 视图。正文、提纲和查询片段会明确标注为部分内容。单文件完整快照上限 8 MiB，超限用原生范围读取；不把截断内容冒充完整文件。
- `code_search` 对选定文件做真实 AST 模式搜索，支持 16 种随包语法。返回文件覆盖情况、解析失败、精确位置与分页。先用 glob 或 CodeGraph 选文件；CodeGraph 保留索引、符号、调用关系、影响范围和按问题探索能力。
- 每次缩减前先保存获准原文。工具卡片提供 **查看原文**，支持开头、结尾、行号、搜索和下一页；长单行也可继续读取。模型可用 `recall({rawRef, mode, cursor})`，或 `recall({search:"evidence", query})` 搜索。
- 原文与会话中的真实工具调用绑定，重启和合法分支仍可回查。关闭优化不会删除原文。控制台可导出、导入原文档案；迁移时同时保留原生会话导出和对应原文档案，先恢复会话再导入原文。历史中仍被引用的原文不按时间自动过期。
- OpenCU 仍执行实际观察，保留现有紧凑 AX、DOM 范围读取与完整变化；基线不明时输出全量。仅在同一请求已经保留完全相同的不可变图片时折叠截图，保留新的观察文字和原始附件。

上下文页显示本次进程内成功请求的估算节省、回查开销、规则耗时和回退次数。估算包含短结果的引用开销；PTC 回查计入其实际外层输出，图片折叠单独计数，不冒充精确 token 收益。实际提供方用量和费用仍看监控页。原文、摘要、外部网页均是资料，不能充当新的用户指令。

关闭开关停止新增优化；原文回查、CodeGraph、Dream、历史压缩、任务、侧问和分支继续工作。CodeGraph 的聊天隔离和错误去重修复始终生效。历史摘要沿用已有 OMD 或可选 BC 的单一写入事务。

## English

Context optimization is built into OMD and enabled by default. Turn it off under **Settings → Oh My DSH → Context and memory → Context optimization**; the preference persists. The complete matching OMD package includes its runtime dependencies and grammars.

Supported read-only data receives reversible whitespace, table or exact-repeat views. Only recognized successful Node TAP output receives a summary. Errors, unknown logs, write receipts and exact editing material remain intact. Tools still execute and programmatic return values remain unchanged. Repeat reads and complete deltas require a full baseline in the current request; missing baselines and BC use conservative full results.

Use `tool_find` for optional scoped tool schemas, `context_view` for explicit raw/data/article/outline/query views, and `code_search` for AST patterns over selected files using 16 bundled grammars. Partial views and parse failures are identified. Complete file snapshots are limited to 8 MiB; larger files retain the native range-reading path. CodeGraph continues to provide indexed symbols, relationships and question-focused exploration.

Authorized originals are saved before shortening. **View original** and `recall({rawRef, mode, cursor})` support head/tail, lines, search and continuous long-line paging. `recall({search:"evidence", query})` searches saved evidence. References survive restart and legitimate forks; disabling optimization keeps recall available. Export native sessions together with their evidence archives; restore the session before importing evidence. Referenced evidence has no automatic TTL.

The context panel reports process-local estimates, recall costs, rule timing and fallbacks. Actual provider usage remains in Monitor; screenshot folding is counted separately. OpenCU observations still execute, with full AX on uncertain baselines. Disabling optimization preserves CodeGraph, Dream, history compaction and the other conversation features. Existing OMD/BC transactions remain the only history writers.
