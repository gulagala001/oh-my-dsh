# Workflow 使用说明 / Usage

[中文首页](../README.md) · [English](../README_EN.md)

## 脚本与结果 / Scripts and results

调用 `workflow` 时，`script`、`scriptPath`、`name` 三选一。脚本是支持顶层 `await` 的 JavaScript，以 `return` 返回 JSON；可内联导出纯字面量 `meta`，也兼容独立的 `meta` 参数。`args` 可为数组或对象。

Choose exactly one of `script`, `scriptPath` or `name` when calling `workflow`. Scripts are JavaScript bodies with top-level `await` and a JSON return value. Metadata can be a literal `export const meta` declaration or a separate `meta` parameter. `args` accepts an array or object.

`agent(prompt, options)` 启动原生子代理。`label` 用于进度与子会话名称；可选 `provider`、`model`、`effort` 指定模型，`agentType` 使用已注册 preset id，`general-purpose` 继承当前 preset。结构化输出遵循宿主支持的 object-root JSON Schema 子集。

`agent(prompt, options)` starts a native subagent. `label` names progress and child sessions; optional `provider`, `model` and `effort` select a model. `agentType` names a registered preset; `general-purpose` inherits the current preset. Structured output uses the host's supported object-root JSON Schema subset.

`parallel()` 汇合分支，`pipeline()` 让每项工作经过后续阶段，`phase()` 与 `log()` 报告进度。子代理失败返回 `null`，并在 `failures` 中保留独立失败记录；脚本正常返回不代表所有子任务成功。

`parallel()` joins branches; `pipeline()` advances each item through subsequent stages. `phase()` and `log()` report progress. Child failures yield `null` and separate `failures` records. A returned script value does not imply every child succeeded.

## 保存与嵌套 / Saved and nested workflows

回执提供 `runId`、`scriptPath`、`transcriptDir`。可以编辑返回脚本后通过 `scriptPath` 再运行；项目内 `.omd/workflows/<name>.js` 可通过 `name` 调用。

Results expose `runId`, `scriptPath` and `transcriptDir`. Edit a returned script and run it via `scriptPath`, or invoke `.omd/workflows/<name>.js` by `name`.

脚本可用 `workflow('name', args)` 或 `workflow({ scriptPath }, args)` 嵌套一层；并发、总代理数、取消和预算共享。`Date.now()`、`Math.random()` 和无参数 `new Date()` 不可用；时间与随机值须通过 `args` 明确输入。

Scripts can nest one level using `workflow('name', args)` or `workflow({ scriptPath }, args)`, sharing concurrency, total agents, cancellation and budget. Supply time and randomness through `args`; `Date.now()`, `Math.random()` and argument-free `new Date()` are unavailable.

## 续跑 / Resume

同一会话中传入 `resumeFromRunId`，按调用开始顺序复用最长的未变化成功前缀。第一处变化、新调用、失败、未完成调用及后续部分会重跑，不能等同于只补跑失败项。运行记录见 `transcriptDir/journal.jsonl`。

Pass `resumeFromRunId` within the same session to reuse the longest unchanged successful prefix in call-start order. The first changed, new, failed or unfinished call and all subsequent calls execute again; resume does not mean retrying failed calls alone. Records are in `transcriptDir/journal.jsonl`.

恢复前检查产物和副作用。运行中或已被另一轮恢复的记录不能并发重放；取消等待已开始的启动及清理。崩溃后仅复用已持久保存的成功结果，取消不会自动重启。

Check artifacts and side effects before resuming. Active runs and runs already locked by another resume cannot be replayed concurrently. Cancellation waits for pending starts and cleanup. After a crash, only durable successful results are reusable; cancellation never restarts work automatically.

子任务释放、执行日志或 worktree 回执保存失败会使工作流报错并停止新派发，已开始的任务仍会等待收尾。恢复锁只在无法确认原生子任务已经停止时保留到进程退出；仅保存失败且任务已停止时，修复存储问题并检查副作用后可手动续跑，未保存的结果不会成为成功缓存。

Child disposal, journal writes or worktree receipt failures fail the workflow and stop new dispatches while admitted work is joined. A resume lock remains until process exit only when native child shutdown cannot be confirmed. If children have stopped and only persistence failed, fix storage and inspect side effects before resuming manually; unsaved results are never treated as successful cache entries.

## 隔离 / Worktree isolation

`agent(prompt, { isolation: 'worktree' })` 从当前仓库 HEAD 创建 `.omd/worktrees/` 下的独立 Git worktree。未提交改动不复制；无变化目录自动清理，有修改、未跟踪文件、忽略文件或新提交的目录保留，并在 `worktrees` 中返回。检查和合并由用户或后续授权操作负责。

`agent(prompt, { isolation: 'worktree' })` creates a Git worktree under `.omd/worktrees/` from the current HEAD. Uncommitted parent changes are not copied. Clean worktrees are removed; changed, untracked, ignored or newly committed content keeps the worktree, reported in `worktrees`. Inspection and merging require a later authorized action.

需要本地 Git 仓库和写权限，继续遵守宿主沙箱及项目／私有会话范围；无法确认干净的目录会保留。

Requires a local Git repository and write access, retaining the host's sandbox and project/private-session scope. Worktrees with uncertain cleanliness are retained.

## 输出目标与后台任务 / Output targets and background jobs

人类消息末尾的 `+500k` 表示 500,000 输出 token，`+1m` 表示 1,000,000。脚本读取 `budget.total`、`budget.spent()`、`budget.remaining()`。主回合及其子代理共享计数；推理 token 不重复计算。达到目标或缺少可信用量后停止新派发，已经运行的调用可继续结束，因此目标不是精确硬上限。

A trailing `+500k` means 500,000 output tokens; `+1m` means 1,000,000. Scripts read `budget.total`, `budget.spent()` and `budget.remaining()`. The initiating turn and its descendants share usage; reasoning tokens are not double counted. Reaching the target or losing trustworthy usage stops new dispatches, while running calls may finish above the target.

`run_in_background: true` 返回原生 `jobId`。通过 `job_output` 获取结果、`job_kill` 取消，完成通知由 DSH Jobs 提供。后台工作保留发起时预算；新输入不会重置旧工作的用量。失败仍保留已有结果和运行路径，并按失败状态结算。

`run_in_background: true` returns a native `jobId`. Read results with `job_output`, cancel with `job_kill`, and receive completion through DSH Jobs. Background work retains its initiating budget across later user turns. Failure retains available results and run paths while settling as failed.

## 数据与权限 / Data and permissions

独立状态目录为 `$DSH_HOME/dsh-workflow/`（默认 `~/.dsh/dsh-workflow/`）：`sessions/` 保存预算，`workflows/` 保存工作流脚本和执行记录。原生会话与 Jobs 由宿主保存；本插件不新增独立账号或遥测端点。

Standalone state lives in `$DSH_HOME/dsh-workflow/` (default `~/.dsh/dsh-workflow/`): `sessions/` stores budgets and `workflows/` stores scripts and run records. Native sessions and Jobs remain host-owned; this plugin adds no separate account or telemetry endpoint.

工作流可以派发会读写文件、运行命令或访问网络的子代理；实际访问由用户授权、宿主权限与所用工具决定。工作流 VM 本身不构成额外安全边界。

Workflows can delegate file access, commands and network operations. Actual access follows user authorization, host permissions and the selected tools. The workflow VM is not an additional security boundary.
