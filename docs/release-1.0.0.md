# OMD 1.0.0 · DSH 0.2.1-rc.3

[中文](#zh-100) | [English](#en-100)

<a id="zh-100"></a>

## 中文

### 新增功能

- 预处理气泡、总览和上下文页显示本轮新增事件数、触发目标与等待原因，区分待处理积压和实际触发进度。
- 工具上下文优化记录请求前后估算、发现与原文回查成本、处理耗时及失败／取消状态，重启后恢复统计。

### 体验优化

- 统一上下文、最终请求、预处理、压缩、任务和 Workflow 的计量；区分提供方实测、估算、部分回执和未知值，按完整请求与输出预留计算预算。
- Native 与 PTC 共用按需工具目录、结果精简和可回查原文，保留脚本原始返回值、工具权限、图片与会话边界。
- AST 与网页正文解析移至计算线程，复用有界解析结果和原文前缀；直连 HTTP 在每次原生 DNS 校验后复用连接，截图链路减少重复编码。

### 问题修复

- 修复工具优化事件缺少可忽略标记、导致重开会话时“历史加载失败”的问题。遇到该类旧记录时，先保留原始日志备份，再在宿主写锁保护下修复标记并通过完整原生校验；消息内容、事件序号和分支引用保持不变。
- 修复自有工具在 TypeScript／Python SDK 中参数被表示为 unknown 的问题；统一 Native 与 PTC 参数契约。
- 阻止只读到部分内容后错误覆盖整份文件；未显式指定外层超时时，PTC 按实际子工具预算调整等待，保留宿主总上限与取消清理。
- 修复 Responses ID 续传中的失效恢复、并发候选覆盖、工具命名空间匹配及旧实例接管；失败仍完整回退原请求。
- 修复桌面依赖环境中的小网页正文解析失败，以及取消原因值为 0 等情况被丢弃的问题。

### 其他变更

- 内置 Response ID Reuse 更新至 0.1.2，保留 OpenCU 2.2.1 的截图传输改进与 Workflow 计量更新。
- 修正当前下载页、版本徽章和组件文档中的过期版本信息。

<a id="en-100"></a>

## English

### New Features

- Preprocessing bubbles, overview and context panels show new-event progress, trigger targets and waiting reasons, separating the pending backlog from the trigger cadence.
- Tool context optimization records before/after estimates, discovery and original-text recall costs, processing time, failures and cancellations, with statistics restored after restart.

### Experience Improvements

- Unifies measurement across context, final requests, preprocessing, compaction, tasks and Workflow. Provider usage, estimates, partial receipts and unknown values remain distinct; budgets include the complete request and output reservation.
- Native and PTC share scoped tool discovery, reduced results and retrievable originals while preserving script return values, tool permissions, images and session boundaries.
- Moves AST and article parsing to computation workers, reuses bounded results and immutable source prefixes, pools direct HTTP connections after each native DNS check, and reduces repeated screenshot encoding.

### Bug Fixes

- Fixes optimization records missing the ignorable marker and blocking history reload. Affected records are repaired only after an original-log backup, under the native write lease and full native validation. Messages, event sequence numbers and branch references remain unchanged.
- Fixes unknown argument types in the TypeScript/Python SDK and aligns owned Native/PTC tool contracts.
- Prevents overwriting a complete file from a partial read. Without an explicit outer timeout, PTC follows actual child-tool budgets while retaining host limits and cancellation cleanup.
- Fixes Responses ID recovery, concurrent candidate replacement, tool namespace matching and takeover from older instances. Failed continuation retains full-request fallback.
- Fixes small article parsing under desktop dependency resolution and preserves falsy cancellation reasons such as 0.

### Other Changes

- Bundles Response ID Reuse 0.1.2, OpenCU 2.2.1 screenshot transfer improvements and Workflow measurement updates.
- Corrects stale versions in current download pages, badges and component documentation.

## 安装 / Installation

在 **插件 → 添加插件** 使用下方固定包。精确宿主为 **DSH 0.2.1-rc.3**；保留原 profile、配置和会话，待任务结束后完整重启。此前受影响的会话在修复版载入后重新打开即可触发定点恢复；仍被其他进程持有的会话需先正常结束占用。

Install the fixed package through **Plugins → Add plugin** on **DSH 0.2.1-rc.3**. Keep the existing profile, settings and conversations, then restart after active tasks finish. Reopening affected histories after the fixed plugin loads triggers targeted recovery. Sessions held by another writer must first be released normally.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [OMD 1.0.0](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.1.0.0/oh-my-dsh-0.2.1-rc.3.omd.1.0.0.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.1.0.0/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install_EN.md)
