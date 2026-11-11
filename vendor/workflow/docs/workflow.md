# Workflow 用法 / Usage

[中文首页](../README.md) · [English](../README_EN.md)

## 脚本 / Scripts

调用 `workflow` 时，`script`、`scriptPath`、`name` 三选一。脚本是 JavaScript，可以直接用顶层 `await`，最后用 `return` 返回 JSON。`meta` 可以写在脚本里（`export const meta = {...}`，只能是字面量），也可以作为单独参数传入。`args` 可以是数组或对象。

Pass exactly one of `script`, `scriptPath` or `name` to `workflow`. A script is JavaScript with top-level `await` that ends with `return` and a JSON value. Put `meta` in the script as a literal `export const meta = {...}` or pass it as a separate parameter. `args` can be an array or an object.

`agent(prompt, options)` 启动一个子代理：

- `label`：显示在进度和子会话标题里。
- `provider`、`model`、`effort`：为这个子代理单独指定模型。
- `agentType`：使用已注册的预设；`general-purpose` 沿用当前预设。
- `schema`：要求按 JSON Schema 返回结构化结果（只支持根节点为对象的子集）。

`agent(prompt, options)` starts a subagent:

- `label`: shown in progress and as the child conversation title.
- `provider`, `model`, `effort`: pick a model for this subagent.
- `agentType`: use a registered preset; `general-purpose` keeps the current one.
- `schema`: request structured output with a JSON Schema (object-root subset only).

`parallel()` 等所有分支完成后汇总；`pipeline()` 让每一项依次经过后面的阶段，不用等别的项；`phase()` 和 `log()` 报告进度。某个子代理失败时返回 `null`，失败详情记在 `failures` 里，所以脚本跑完后要检查有没有失败项。

`parallel()` waits for every branch; `pipeline()` moves each item through later stages without waiting for the others; `phase()` and `log()` report progress. A failed subagent returns `null` and its details go to `failures`, so check for failures after the script returns.

## 保存与嵌套 / Saving and nesting

每次运行都会返回 `runId`、`scriptPath` 和 `transcriptDir`。改好返回的脚本后可以用 `scriptPath` 再跑；存进项目 `.omd/workflows/<name>.js` 的脚本可以用 `name` 调用。

Every run returns `runId`, `scriptPath` and `transcriptDir`. Edit the returned script and run it again with `scriptPath`, or call a script saved as `.omd/workflows/<name>.js` by `name`.

脚本里可以用 `workflow('name', args)` 或 `workflow({ scriptPath }, args)` 再调用一层工作流，内外共用并发数、子代理总数、取消和预算。脚本里不能用 `Date.now()`、`Math.random()` 和不带参数的 `new Date()`，需要时间或随机数就通过 `args` 传进去，这样续跑时结果才一致。

A script can call one more level with `workflow('name', args)` or `workflow({ scriptPath }, args)`; both levels share concurrency, the subagent limit, cancellation and budget. `Date.now()`, `Math.random()` and argument-free `new Date()` are unavailable. Pass time or random values through `args` so resumed runs behave the same.

## 续跑 / Resume

在同一个会话里传入 `resumeFromRunId`。从第一个调用开始，只要连续成功且脚本没改过，就直接用上次的结果；从第一处改动、新增、失败或没跑完的调用起，后面全部重新执行。运行记录在 `transcriptDir/journal.jsonl`。

Pass `resumeFromRunId` in the same conversation. Starting from the first call, every call that succeeded and has not changed reuses its result. From the first changed, new, failed or unfinished call onward, everything runs again. The run record is `transcriptDir/journal.jsonl`.

续跑前先看看上次的产出和已经发生的外部操作。正在运行或正被另一次续跑占用的记录不能同时续跑。程序崩溃后，只有已经存到磁盘的成功结果会被复用；取消之后不会自动重启。

Before resuming, look at what the last run produced and which outside actions already happened. A run that is still active, or already being resumed, cannot be resumed again at the same time. After a crash only results saved to disk are reused, and cancelled work never restarts on its own.

如果运行记录写不进磁盘，工作流会报错并停止派发新任务，已经开始的任务会等它们结束。修好存储问题、确认没有遗留的副作用后，可以手动续跑。

If the run record cannot be saved, the workflow fails and stops starting new tasks while running ones finish. Fix the storage problem, check for side effects, then resume by hand.

## 隔离 / Worktree isolation

`agent(prompt, { isolation: 'worktree' })` 从当前仓库的 HEAD 在 `.omd/worktrees/` 下建一个独立的 Git worktree。父目录里没提交的改动不会带过去。没有改动的 worktree 会自动清理；有改动、新文件或新提交的会保留，并列在返回结果的 `worktrees` 里，由你检查后再合并。

`agent(prompt, { isolation: 'worktree' })` creates a Git worktree under `.omd/worktrees/` from the current HEAD. Uncommitted changes in the parent are not copied. Worktrees without changes are cleaned up; ones with changes, new files or new commits are kept and listed in `worktrees` for you to review and merge.

需要本地 Git 仓库和写权限，DSH 的沙箱设置照常生效。

This needs a local Git repository and write access. DSH sandbox settings still apply.

## 输出预算与后台 / Output budget and background runs

在消息末尾写 `+500k` 表示 500,000 个输出 token，`+1m` 表示 1,000,000。脚本里可以读 `budget.total`、`budget.spent()`、`budget.remaining()`。主回合和它派出的子代理共用这份预算。用完或拿不到可靠的用量数据时，不再派发新任务；正在跑的会跑完，所以实际用量可能略超。

End a message with `+500k` for 500,000 output tokens or `+1m` for 1,000,000. Scripts can read `budget.total`, `budget.spent()` and `budget.remaining()`. The turn and its subagents share the budget. Once it runs out, or usage can no longer be measured reliably, no new tasks start; running ones finish, so usage can go slightly over.

`run_in_background: true` 会返回一个 `jobId`。用 `job_output` 取结果，用 `job_kill` 取消，完成时 DSH 会通知你。后台任务沿用发起时的预算，之后你再发消息也不会重置它。

`run_in_background: true` returns a `jobId`. Read results with `job_output`, cancel with `job_kill`, and DSH notifies you when it finishes. A background run keeps the budget it started with, even if you send more messages.

## 数据与权限 / Data and permissions

插件数据在 `$DSH_HOME/dsh-workflow/`（默认 `~/.dsh/dsh-workflow/`）：`sessions/` 存预算，`workflows/` 存脚本和运行记录。会话和后台任务由 DSH 自己保存。插件不需要单独的账号，也不上报数据。

Plugin data lives in `$DSH_HOME/dsh-workflow/` (default `~/.dsh/dsh-workflow/`): `sessions/` holds budgets and `workflows/` holds scripts and run records. DSH stores conversations and background jobs itself. The plugin needs no separate account and sends no telemetry.

子代理能做的事（读写文件、运行命令、联网）由你给 DSH 的权限决定。工作流脚本本身不额外限制它们。

What subagents can do (read and write files, run commands, go online) depends on the permissions you give DSH. The workflow script adds no extra restrictions.
