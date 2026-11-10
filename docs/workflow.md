# Ultra 与 Workflow

[文档目录](README.md) · [运行状态与后台选项](runtime-state-background.md) · [插件结构](architecture.md)

Workflow 用 DSH 原生的子智能体、工具循环、会话和后台任务，让 AI 用一段脚本组织读取、实现、验证等阶段，子智能体可以直接改代码。普通模式下，AI 要得到你的授权才会用工作流或多智能体协作。

工作流的运行时、工具、阶段面板和输出预算来自 [DSH Workflow](https://github.com/gulagala001/dsh-workflow/releases)（`dsh-workflow-plus`），OMD 把它接进 Ultra 和工具入口。单独装的和 OMD 内置的共用一套运行时。

会话标题旁的子智能体入口显示任务名和 Workflow 当前阶段，展开能看到阶段分组、成员和执行状态。`agent()` 的 `label` 同时是进度名和子智能体名，不写就用任务摘要。

## Ultra

在输入框的模型面板里，普通推理档位之后是 **Ultra**。开启后选 Workflow、Agent Team 或自由，默认自由。面板里的 **思考强度** 单独设置 Ultra 的推理档位，默认 `xhigh`，模型不支持时用它的最高档。

- 这些选择按全局或工作区、渠道和模型分别记住，刷新、新聊天、重启后都在，调普通档位不会覆盖它。
- 选回普通档位或恢复默认就退出 Ultra，下次开启时恢复之前的子模式和强度。
- 换模型时保留模式，优先用这个模型记住的档位。
- 每一轮开始时固定当前模式，运行中改的从下一轮生效。

三种方式共用一份[质量要求](../src/cc-adaptation/prompts/runtime/ultra-quality.md)：结果要充分、正确、有依据，不为省 Token 砍掉必要的工作；能独立推进的及时派出去，主动处理难点。你明确给的范围和预算仍然有效。

- **Workflow**：用工作流委派具体工作，按实际依赖安排调用和并行分支。只有这个模式会加载工作流编写参考。
- **Agent Team**：用 DSH 自带的团队成员、通信和任务板协作。需要先在 DSH 里打开 Agent Team；没开时这个选项不显示，之前选过的会暂时按自由处理。
- **自由**：AI 按任务选普通子智能体、团队或工作流。闲聊、简单问答和机械操作直接做。

模式不改变权限。普通文字里出现 `pro`、`ultracode` 不会触发模式。切到非 OMD 预设时模式暂停，切回来恢复。

装了 [Subscription Login](https://github.com/V1ki/dsh-plugin-subscriptions) 的 ChatGPT 订阅渠道，支持 Fast 的模型旁会显示闪电。

停用 OMD 后，普通 DSH 会话照常可用，已有的 OMD 历史也能读；用 OMD 预设的会话要重新启用插件才能继续。

## 写脚本

AI 调用 `workflow` 时直接在 `script` 里写 JavaScript，不用先存文件：

```js
export const meta = {
  name: 'review-modules',
  description: '按模块查找并验证问题',
  phases: [{ title: 'Review' }],
};
phase('Review');
return await pipeline(args, name => agent(`检查模块 ${name}`, { label: name }));
```

- `args` 直接传数组或对象，比如 `['auth', 'storage']`。`meta` 必须是纯字面量，也可以作为单独参数传。
- 支持顶层 `await`，用 `return` 返回 JSON 值。
- 子智能体默认用主会话的模型，也可以单独指定 `provider`、`model`、`effort`。
- `pipeline` 让每一项独立走完后续阶段；`parallel` 等所有分支都完成。
- 子智能体失败时返回 `null`，失败记录单独放在 `failures` 里，包括调用序号、子会话、原因和错误类型，脚本过滤掉 `null` 也还在。脚本跑完不代表子任务都成功了，界面会显示失败状态。
- 结构化结果用 DSH 支持的 JSON Schema 子集。

## 隔离工作区

`agent(prompt, {isolation: 'worktree'})` 在当前仓库的 HEAD 建一个独立工作区，放在 `.omd/worktrees/`。父目录未提交的改动不会带过去。子智能体结束后，没改动的目录自动删除；有改动、新文件或新提交的会保留，路径在返回的 `worktrees` 里，由你检查和合并，不会自动合并。

隔离工作区沿用发起会话的记忆范围。需要本地 Git 仓库和写权限，原来的沙箱限制不变。

`agentType` 填 DSH 注册过的智能体预设 id，`general-purpose` 继承当前预设，比如 `omd-ptc` 用 PTC 工具。未注册的会直接报错。

## 保存、嵌套与续跑

每次调用返回 `runId`、`scriptPath` 和 `transcriptDir`。改完返回的脚本可以用 `scriptPath` 再调；放在 `.omd/workflows/<name>.js` 的脚本可以用 `name` 调。`script`、`scriptPath`、`name` 每次只选一个。

脚本里可以用 `workflow('name', args)` 或 `workflow({scriptPath}, args)` 嵌套一层，共享并发数、总调用数、取消和预算。`Date.now()`、`Math.random()` 和不带参数的 `new Date()` 不能用，需要时间或随机数就从 `args` 传进去。

取消、失败或改了脚本之后，可以带 `resumeFromRunId` 续跑：从头开始，按调用顺序，没改动且已经成功的调用直接用缓存，从第一个改动、新增、失败或没跑完的调用起重新执行。返回空字符串也可能是有效缓存，可以看 `transcriptDir` 下的 `journal.jsonl` 核对。

- 续跑前先看失败原因、已有产物和副作用。重新执行的部分里可能有之前已经做过的工作。
- 你取消的不会自动重启；额度用完、网络错误各自保留原因，不会无限重试。
- 正在运行或正在被续跑的工作流不能同时再续跑。
- 进程崩溃后，可以从已经保存的成功调用接着跑，没跑完的不会算成功。
- 保存子任务结果或 worktree 记录失败时，工作流报错并停止派发新任务。修好存储、检查过副作用后可以手动续跑。

## 输出 Token 目标

在你的消息末尾加 `+500k`，本轮的共享输出目标就是 500,000 tokens。脚本里用 `budget.total`、`budget.spent()`、`budget.remaining()` 读取。不设置就没有目标，但 DSH 的并发和总调用数限制仍在。

- 达到目标后不再启动新的子智能体，已经在跑的会跑完，所以最终数字可能超过目标。
- 主会话和子智能体的输出一起算，推理 Token 不重复计算，用缓存的调用不算。
- 服务商没报用量时会明确标出来，设了目标的工作流会停止派发。
- 后台工作沿用发起时的预算，你发新消息不会重置。
- 这个目标和 `/预算` 的会话用量提示是两套，互不影响。
- 分出的分支有自己的目标和用量，不占父会话的预算；分支里发起的子智能体共用分支的预算。

## 后台运行

`run_in_background: true` 返回 DSH 的任务 id 和脚本路径。用 `job_output` 读结果，`job_kill` 取消，完成通知和 DSH 的后台任务一样。子任务失败时，后台任务标为失败，已经返回的结果、失败明细、运行 ID、脚本和 journal 路径都保留。

跑完、结果已读、验证通过是三件不同的事。执行证据在 BT 菜单的 **查看任务证据**；真实调用、用量和耗时在 **OMD 控制台 → 调用日志**。
