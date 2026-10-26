# 上下文优化 / Context optimization

## 中文

OMD 的核心功能，默认开启。在 **设置 → Oh My DSH → 上下文与记忆 → 上下文优化** 可以关闭，选择会保存。所需运行依赖随完整 OMD 安装包提供。

- 自动精简受支持的只读 JSON、同形表格和完全相同的连续行；只对识别出的成功 Node TAP 日志做概括。未知日志、报错、写入回执、编辑正文与差异保留。
- PTC 内部工具值、程序变量和未输出的中间结果保持原样；只处理最终发给模型的输出。可识别的 JSON、同形数据和连续重复行使用无损视图，失败、取消和写入回执保留。相同程序及实际分派身份的完整输出可复用本次请求中的完整基线，变化以精确差异呈现。
- 整文件写回前，原生文件策略核对当前版本是否已完整读取；仅部分行、字节截断或超长行截断不能作为整文件来源。Native 与 PTC 使用同一写入边界，拒绝时文件保持原样；可通过局部编辑、分段完整读取或完整 raw 快照继续。
- 原生文件读取仍然真实执行。只有本次模型请求里保留着完整旧结果，才把重复读取改成引用，或把变化改成完整差异；基线消失就重新发送完整结果。使用 BC 时，此类依赖模型可见基线的优化自动保守处理。
- 可选 MCP 工具通过 `tool_find` 按需发现，返回完整、当前会话有权使用的参数说明。Native 与 PTC 共用同一份按需目录；发现后下一次请求提供完整参数和返回契约。PTC 继续使用宿主 SDK、注册表和权限。
- `context_view` 对获准的文件、网页或原文引用提供 `raw`、`data`、`article`、`outline`、`query` 视图。正文、提纲和查询片段会明确标注为部分内容。单文件完整快照上限 8 MiB，超限用原生范围读取；不把截断内容冒充完整文件。
- `code_search` 对选定文件做真实 AST 模式搜索，支持 16 种随包语法。返回文件覆盖情况、解析失败、精确位置与分页。先用 glob 或 CodeGraph 选文件；CodeGraph 保留索引、符号、调用关系、影响范围和按问题探索能力。
- 每次缩减前先保存获准原文。工具卡片提供 **查看原文**，支持开头、结尾、行号、搜索和下一页；长单行也可继续读取。模型可用 `recall({rawRef, mode, cursor})`，或 `recall({search:"evidence", query})` 搜索。
- 原文与会话中的真实工具调用绑定，重启和合法分支仍可回查。关闭优化不会删除原文。控制台可导出、导入原文档案；迁移时同时保留原生会话导出和对应原文档案，先恢复会话再导入原文。历史中仍被引用的原文不按时间自动过期。
- OpenCU 仍执行实际观察，保留现有紧凑 AX、DOM 范围读取与完整变化；基线不明时输出全量。在最终请求中统一核验图片，覆盖直接工具结果、PTC 与上下文附件；仅在同一请求已经保留完全相同的不可变图片时折叠重复图片，保留新的观察文字、图片元数据和原始附件。

上下文页显示本会话自首次记录起的成功／失败／取消请求、估算净输入减少、回查与发现开销、请求投影耗时和处理原因。每次请求记录同口径的完整展示对照与实际发送估算，扣除当前请求中的原文回查和工具发现内容；失败与取消不计入成功节省。结果摘要随原生会话日志保存，并索引到现有监控账本，重启后保留；数据库索引缺失时可从会话恢复，分支不继承父会话的消费记录。未触发、不适用、保留错误／回执及失败回退分别展示。PTC 原文回查按实际外层输出计入，图片折叠单列次数。这里不包含历史摘要压缩，也不把输入估算等同于净费用或延迟收益；实际提供方用量和费用仍看监控页。原文、摘要、外部网页均是资料，不能充当新的用户指令。

关闭开关停止新增优化；原文回查、CodeGraph、Dream、历史压缩、任务、侧问和分支继续工作。CodeGraph 的聊天隔离和错误去重修复始终生效。历史摘要沿用已有 OMD 或可选 BC 的单一写入事务。

## English

Context optimization is built into OMD and enabled by default. Turn it off under **Settings → Oh My DSH → Context and memory → Context optimization**; the preference persists. The complete matching OMD package includes its runtime dependencies and grammars.

Native and PTC share one optional-tool catalog with exact input/output contracts available after discovery. Supported read-only data receives reversible whitespace, table or exact-repeat views. Only recognized successful Node TAP output receives a summary. Native whole-file writes reject reconstruction from known incomplete read windows, including byte-capped windows and truncated long lines; exact local edits, complete ranged reads and complete raw snapshots remain available to Native and PTC. Errors, unknown logs, write receipts and exact editing material remain intact. Tools still execute and programmatic return values remain unchanged. PTC optimization occurs only after the program emits its final model-facing output; intermediate values and suppressed output stay untouched. Complete emitted outputs can reuse a visible complete baseline or an exact delta, bound to the program and actual dispatch identities. Repeat reads and complete deltas require a full baseline in the current request; missing baselines and BC use conservative full results.

Use `tool_find` for optional scoped tool schemas, `context_view` for explicit raw/data/article/outline/query views, and `code_search` for AST patterns over selected files using 16 bundled grammars. Partial views and parse failures are identified. Complete file snapshots are limited to 8 MiB; larger files retain the native range-reading path. CodeGraph continues to provide indexed symbols, relationships and question-focused exploration.

Authorized originals are saved before shortening. **View original** and `recall({rawRef, mode, cursor})` support head/tail, lines, search and continuous long-line paging. `recall({search:"evidence", query})` searches saved evidence. References survive restart and legitimate forks; disabling optimization keeps recall available. Export native sessions together with their evidence archives; restore the session before importing evidence. Referenced evidence has no automatic TTL.

The context panel reports persistent per-session request comparisons, estimated net input reductions, recall/discovery overhead, projection time, failures, cancellations and reasons for retaining full output. Each result is recorded in the native session log and indexed in the existing Monitor ledger; missing indexes can be restored, and forks do not inherit their parent’s spending. Only successful requests contribute savings. These estimates exclude historical summary compaction and do not measure net money or latency savings. Actual provider usage remains in Monitor; identical immutable image folding covers Native and PTC delivery and is counted separately. OpenCU observations still execute, with full AX on uncertain baselines. Disabling optimization preserves CodeGraph, Dream, history compaction and the other conversation features. Existing OMD/BC transactions remain the only history writers.
