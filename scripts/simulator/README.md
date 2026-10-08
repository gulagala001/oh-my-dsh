# 工程会话模拟器

[返回贡献指南](../../CONTRIBUTING.md)

这是项目内部的工程验证设施，由开发代理和维护者在实现、调试及验收中主动使用。提出需求的用户只需确认产品目标、查看结论与必要证据，运行测试、分析失败和修复回归由实施者负责。

实现、测试和 CI 配置纳入 Git；模拟器通过 `scripts/.npmignore` 排除出插件发行包，临时会话、报告、日志和本地工作约定也不进入提交或发行。

模拟器在隔离数据目录中真实运行 DSH／OMD，复现会话、原生工具、任务证据、上下文、Dream、停止与恢复的故障。模型请求由本地严格协议服务器提供响应；场景通过真实宿主 API 和工具循环推进，不复制 Agent 状态机。

最终目标是把已知故障回归、有限场景探索、故障注入、实录重放和独立判定连成可复现的开发流程。每次报告只证明实际执行的机器、宿主版本、路径与断言；不证明真实模型理解、供应商服务行为、摘要质量或所有可能的交错都正确。

## 接入工程流程

相关机制改动完成前，实施者按下表选择检查。修复缺陷先复现；现有场景没有覆盖触发条件时，补充明确输入、故障或交错以及独立判定，再修复和回归。普通文档修改不需要启动宿主。

| 改动范围 | 工程检查 |
| --- | --- |
| 会话、原生工具、工作流、上下文或 Dream | `full-lifecycle`，并补充此次改动的断言。 |
| 流式、停止、取消、迟到结果 | `stream-cancel`，加相关生成交错。 |
| 后台期限或定时器 | `background-timeout`，区分总期限与传输空闲期限。 |
| todo、收尾提醒或 pause_turn | `todo-reminder`。 |
| 恢复、持久化或存储失败 | `restart-checkpoint`、`storage-failure`。 |
| 前端会话或工作台流程 | 对相应场景加 `--ui`；保留真实点击与截图证据。 |
| 跨模块改动或宿主升级 | 构建当前代码后执行完整六场景基线；按风险加入有限探索和对应平台验收。 |
| 模拟器、判定器或隔离设施 | 模拟器测试和相应真实宿主路径；检查故意破坏能否被检出。 |

`pnpm test:simulator` 运行模拟器测试，`pnpm test:conversation` 运行六场景真实宿主基线。既有 `pnpm test` 也包含模拟器测试；其中的平台跳过不能替代原生宿主仿真。CI 在 macOS 单独执行这两个入口、固定 seed 42 的五个生成场景，以及 `full-lifecycle --ui`，报告作为内部工件保存。工作流配置见 [ci.yml](../../.github/workflows/ci.yml)；远端是否通过以实际 CI 结果为准。

失败时由实施者查看时间线和原生审计，用保存的输入复现，必要时最小化，再修复并重跑受影响路径。结束前核对资源清理和退出码，报告实际覆盖及未验证项；不要要求用户运行命令或代为整理证据。需要真实模型、其他设备或不可自动取得的系统授权时，才说明缺少的具体条件。

## 准备与首次运行

在仓库根目录执行。Node 与 pnpm 版本要求以 [package.json](../../package.json) 为准，宿主依赖需要已安装，客户端需要已构建：

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm simulate --help
pnpm simulate --list
pnpm simulate
```

`pnpm simulate` 等价于运行默认 `full-lifecycle` 场景，默认 `--clock virtual --isolation native`。也可以直接使用 `node scripts/simulate.mjs`，参数相同。

宿主目标以当前源码 `package.json` 中的 SDK／DSH 版本为准，默认 CLI 为 `node_modules/@deepseek-ai/dsh/lib/bin.js`。官方 SDK 从实际启动的宿主安装解析，避免把项目另一版本的 SDK 混入该进程。`OMD_DSH_CLI` 可以指定其他 CLI 路径，但切换路径或版本后必须重新执行场景；现有结果不外推到官方桌面、其他 DSH 版本、Windows 或 Linux。

## 隔离与模型出口

默认 `native` 模式使用 macOS 的外层 `sandbox-exec`，宿主出站连接只允许本次本地模型替身的明确端口，拒绝其他外网、回环端口和 Unix socket；同时限制文件写入到本次临时目录、独立扩展目录及必要的设备文件。宿主内层 DSH 权限使用 `danger-full-access`、`approval: never`，因为 macOS 不能在已有 Seatbelt 沙箱内再次应用嵌套沙箱；实际出网和写入限制由外层执行。这里的 full 权限只属于一次性的测试 profile。本地 Web 认证／RPC 由外层运行器连接宿主，不能把模型端口白名单解释为整个模拟器只能访问一个端口。

每次运行建立新的 HOME、DSH_HOME、profile 和 workspace，使用模拟凭证与本地 `openai-completions` Provider，不复制个人配置、会话、登录态或材料。外层策略限制出网和写入，不代表所有系统可读文件都被屏蔽；新增场景应继续只使用本次 workspace 内明确生成的材料。

其他环境可以显式选择：

```sh
pnpm simulate --scenario storage-failure --isolation process
```

`process` 模式有模型路由校验及 Node 网络封锁，宿主 Node 出站同样只许本次模型替身端口；它不提供 OS 沙箱，也不保证非 Node 子进程的出网或文件写入受阻。Windows／Linux 的运行结果和隔离能力需要单独实际验收，不能把提供该参数当作平台已经通过。默认 `native` 在无法提供 macOS 隔离时会失败，不会静默降级。

POSIX 进程清理由外层运行器通过 OS 进程快照核实 PID、父进程、进程组及启动身份，再允许受控工具进程继续执行或发出清理信号；可写审计日志中的 PID 不会直接成为杀进程权限。身份变化、无法核实、清理失败或残留进程都应使运行失败。监控、重启及恶意输入的实际覆盖以本次进程监控报告和测试为准，不声称所有 OS 竞态已经穷尽。

原生 PTY 会绕过当前 Node 进程门控，其独立进程所有权路径尚未验收。模拟器遇到该能力会在创建未受控任务前明确拒绝（`SIM_CAPABILITY_UNVERIFIED`），不会降级绕过；当前结果不包含 PTY、官方桌面终端或其他设备验收。

## 已实现的六个场景

```sh
pnpm simulate --scenario full-lifecycle
pnpm simulate --all
```

| 场景 ID | 真实执行与独立核对 |
| --- | --- |
| `full-lifecycle` | 原生文件读写、任务与测试证据、交付、预处理／压缩与原文回查、Dream 三级发布及独立会话隔离、workflow 子会话、真实进程崩溃后持久化恢复。 |
| `stream-cancel` | 取消真实流式响应，实际产生有界迟到结果，核对其没有提交到会话，再继续并回读原生持久化事件。 |
| `background-timeout` | 用虚拟时间分别检查期限前与十分钟期限点，触发真实后台作业超时与清理；传输心跳避免把总期限误测成流空闲超时。 |
| `todo-reminder` | 任务未完成时尝试提前结束，检查真实收尾提醒、`pause_turn` 与有限调用次数。 |
| `restart-checkpoint` | 在工具副作用已经发生的检查点崩溃并重启，核对文件和原生持久化恢复，拒绝旧执行器迟到内容。 |
| `storage-failure` | 对本次 workspace 的一次原生文件写入注入 `EIO`，检查故障确实命中、错误工具结果、修复后的文件和工具事件配对。 |

表格说明实现的检查范围，是否通过以本次报告为准。文件故障注入覆盖声明的 Node 文件 API 包装，不模拟磁盘硬件、断电或所有原生 I/O 入口。独立操作系统调度、真实服务和设备行为也不会因六个场景通过而自动获得验收。

## 真实 Web UI

UI 检查需要 Playwright Chromium：

```sh
pnpm exec playwright install chromium
pnpm simulate --scenario full-lifecycle --ui
```

这会用隔离的无头 Chromium 打开真实本地 Web 客户端，点击首次使用入口、选择会话、打开工作台，核对草稿输入与页面异常，并保存 `web-light.png`、`web-dark.png`。浏览器使用模拟钥匙串设置和本次宿主认证，不导入真实登录态。外部浏览器请求被阻止，本地版本查询使用明确的模拟响应。

浏览器计时仍是真实时间。该入口验证实际 Web 渲染和所列点击，不代表官方桌面、全部布局、交互和设备都已经验收。

## 有限探索与失败最小化

```sh
pnpm simulate --explore --seed 7 --cases 12 --max-steps 12 --budget-ms 120000
pnpm simulate --explore --seed 7 --cases 12 --max-steps 12 --budget-ms 120000 --minimize
```

探索根据已声明的有限动作语法生成输入，再驱动真实宿主。当前动作族包括普通提示、文件写入与读取、流式取消后继续、写入／读取检查点重启、完成与取消的先后次序。文本、Unicode 分片位置、数值、迟到块数量和有界延迟也参与组合；`max-steps` 较小时会减少可生成的动作族。

`seed` 控制生成选择和明确安排的因果屏障，不控制全部原生 I/O、进程调度、UUID 或浏览器时序。同一 seed 便于重跑指定输入，不能保证机器上每个事件都以相同顺序发生。纯生成／映射库测试也不算真实宿主覆盖。

`--cases` 限制生成数量，`--max-steps` 限制单个输入动作数，`--budget-ms` 是探索阶段的真实耗时预算。预算耗尽或取消会报告未完成，不能标为通过；资源关闭仍需真实时间。启用 `--minimize` 后，对首个失败另用该预算值进行有限缩减，当前 CLI 最多尝试 16 次。因此探索加最小化的总时间可能超过一个 `budget-ms`。

默认值为 seed `1`、cases `12`、max-steps `12`、budget-ms `120000`。

最小化先重复确认失败签名，再尝试删动作和缩减参数，并重新执行宿主。破坏因果前置条件的候选记为非法，不当作产品故障；不稳定失败或预算不足会明确报告，不能声称得到全局最小复现。

## 场景输入重跑与严格实录重放

每个场景报告目录都有 `input.json`。它记录场景、参数、时钟、隔离、UI 选项，以及生成场景的明确动作；用它重新执行原来的场景逻辑：

```sh
pnpm simulate --replay /path/to/scenario-0/input.json
```

该输入的格式为 `version: 1`、`kind: "omd-simulation-input"`。它描述要执行的场景，不是模型流实录。重跑使用输入中保存的选项；修改宿主、插件或场景后，新的执行仍由当前独立断言判定。

只有模型请求账本完整成功、没有取消或错误且通过录制校验时，才生成 `transcript.json`。严格重放需要对应的输入与实录：

```sh
pnpm simulate --replay /path/to/scenario-0/input.json --transcript /path/to/scenario-0/transcript.json
```

严格实录格式如下，示例仅说明结构；实际宿主请求必须保存完整 payload：

```json
{
  "version": 1,
  "entries": [
    {
      "lane": "main",
      "request": {
        "model": "simulation",
        "messages": [{ "role": "user", "content": "隔离模拟材料" }],
        "stream": true
      },
      "response": {
        "chunks": [{ "delta": { "content": "完成" }, "finish_reason": "stop" }]
      }
    }
  ]
}
```

各 lane 独立顺序消费；未显式指定 lane 时，必须恰好有一个 lane 的下一条契约匹配。`model`、全部 `messages`（包括首个 system）、`tools`、生成参数和其他请求字段都参与比较。未知请求、歧义、额外请求、未消费条目、缺少 `finish_reason` 的截断响应、非法格式和过大输入均失败。

输入中的 `recording` 明确记录旧临时 root、workspace、home、本地 GUI `origin` 和时钟 epoch。重放先核对一次性目录关系和回环 origin 格式，再把这些已声明的完整文字逐字替换成本次宿主的规范目录与 GUI origin，并恢复声明的起始时间。GUI 使用随机端口，因此替换完整 origin 是显式环境绑定；它不会忽略 system／content，也不会对其他内容做模糊匹配。原生文件结果、动态标识或当前提示词与实录不同，仍会产生明确的契约偏离，而不是自动回退到脚本响应。没有声明 origin 的旧录制不会自动获得端口替换例外。

严格响应帧来自实录，原场景的独立 `expect` 与因果屏障仍需真实推进；仅把 SSE 播放完不能算场景通过。时间线中的 `model/request` 保存实际模型 payload，`replay/literal-bindings` 列出具体文字替换，可据此定位原／新请求差异。

库级 `createReplayModel` 支持显式 `modelMap`（录制名称 → 当前名称）及受限 `volatileFields`。后者只允许声明的 metadata ID／时间和 tool call ID 叶子，并检查一致的双向绑定；不能用它忽略消息正文、工具定义或生成参数。CLI 不会自动增加这些例外。

取消、失败和不完整流可能没有完整实录；查看报告的 `transcript.status` 与 `reason`。这不妨碍用 `input.json` 重跑原场景。实录只重放已录行为，不预测新模型决策，也不承诺跨版本请求仍能匹配。

## 负面对照

```sh
pnpm simulate --self-test
```

该入口故意给独立判定器输入孤立工具结果、未完成工具调用、错误系统消息位置和私有来源污染，要求全部检出。这里的通过表示判定器拒绝了这些损坏输入；它不替代真实宿主场景，也不代表已对全部产品逻辑做变异测试。`storage-failure` 等场景才通过真实宿主路径执行相应故障注入。

## 报告、退出码与失败材料

默认报告父目录为 `work/conversation-simulator/runs`。使用 `--report` 可以指定其他目录：

```sh
pnpm simulate --all --report work/conversation-simulator/local-runs
```

CLI 会打印本次 `report.html` 路径。套件报告包含各子场景结果；具体场景目录保存 `report.json`、`report.html`、`timeline.jsonl`、`input.json`、宿主日志／事件，以及适用时的实录和 UI 截图。报告包含实际宿主／OMD／Node 版本、平台、选项、独立断言、模型路线、错误与耗时；探索报告还保存 seed、生成输入、执行预算与最小化结果。以子报告和时间线核对实际证据，不用测试数量推算完成率。

| 退出码 | 含义 |
| --- | --- |
| `0` | 本次要求的检查通过，收尾检查无隐藏错误。 |
| `1` | 场景、协议、断言、清理失败，或者参数／输入非法。 |
| `2` | 探索因预算或取消等原因未完整执行。 |

失败报告的 `retainedWorkspace` 指向保留的独立临时目录；成功后该临时目录会清除，报告仍保留。工具执行、原生持久化和故障材料都由场景明确生成，不自动导入用户文件。模型录制不会保存 headers，并拒绝认证字段或可识别的真实凭证；这不等于任意文本都能自动匿名化。分享工件前继续只使用隔离模拟材料。

最终状态在宿主、浏览器与 Provider 收尾后核对。未合作的响应／迭代器会标为 abandoned，清理超时或迟到清理错误使健康检查失败；关闭连接不代表无法终止的 JavaScript Promise 已协作退出。按 `Ctrl+C` 会取消本次执行并进入资源清理，不能产生成功结论。

## 受控时间与真实执行边界

默认虚拟时钟在宿主启动后启用，控制 `Date.now`、无参数 Date、timeout／interval 及 `node:timers/promises.setTimeout`，由场景显式推进。注册的定时器迁移、取消、周期行为和重启时钟都有独立测试；异步回调完成不被假定为一个完全确定的调度器。

文件 I/O、进程启动／崩溃、`setImmediate`、`AbortSignal.timeout`、部分 promises 定时 API、浏览器时钟和 OS 调度保留真实行为。真实 watchdog、预算与清理期限不随宿主虚拟时间冻结。报告中的虚拟期限推进量不能作为真实性能指标，也不给未经基准的加速保证。

```sh
pnpm simulate --scenario storage-failure --clock real
```

`background-timeout` 必须使用虚拟时间，选择 `--clock real` 会明确失败。其他场景可以另做真实时间执行，但同样需要检查本次结果；切换时钟不是自动新增验收证据。

## 新增场景与开发验证

从 [scenarios.mjs](scenarios.mjs) 的定义入手，在 `SCENARIOS` 注册唯一 ID／标题和 `create({trace, parameters})`，返回严格模型、`run`，以及实际需要的 OMD 配置、gates 或 `requiresVirtual`。

1. 使用 [scene.mjs](scene.mjs) 的 `ScriptedModel` 分开主会话、子会话、后台和无工具请求路线；每条匹配必须唯一，步骤有限，`expect` 核对触发它的真实材料与工具结果。可选步骤也不能接纳未知请求。
2. 通过 [host.mjs](host.mjs) 的 `SimulationHost` 创建会话、发送提示、调用实际 RPC／API、取消或重启。让宿主执行原生工具；不在模型替身中直接写入预期文件来冒充工具成功。
3. 用 [assertions.mjs](assertions.mjs) 的 `Checks` 独立核对磁盘副作用、真实工具事件、任务账本、原生持久化和隔离标记。模型说“完成”不能作为验收证据。需要故障时说明注入入口与未覆盖边界，并加能检出该故障的负对照。
4. 用 `Gate` 固定关键因果屏障，保留真实 I/O 不确定性；阻塞响应必须处理 AbortSignal，场景所有出口都能释放 gate 和资源。先运行单场景，再运行相关基础测试及必要的 UI／组合场景。

常用库入口见 [provider.mjs](provider.mjs)（本地协议与健康检查）、[replay.mjs](replay.mjs)（格式、匹配与录制）、[clock.mjs](clock.mjs)／[clock-preload.mjs](clock-preload.mjs)（显式推进与宿主桥接）、[explore.mjs](explore.mjs)／[generated-scenario.mjs](generated-scenario.mjs)（有限生成、预算与真实动作映射）、[run.mjs](run.mjs)（整合运行及报告）和 [ui.mjs](ui.mjs)（真实 Web 检查）。

运行基础测试与文档检查：

```sh
node --test test/simulator-*.test.mjs
node --test test/documentation.test.mjs
```

这些库测试验证协议、时钟、场景映射、故障入口、探索与重放的边界。真实宿主验收仍需执行 `pnpm simulate`、所需单场景／`--all`、`--ui` 和探索命令，再检查报告。提交说明应分别列出库测试、真实程序执行及未验证的平台，保留能复现失败的场景输入。
