# 工程会话模拟器

[返回贡献指南](../../CONTRIBUTING.md)

在临时数据目录中真实运行 DSH／OMD，用本地协议模型复现会话、工具、上下文、Dream、停止和恢复。按需要选择场景；它是调试工具，不是每次修改的必经流程。通过只证明本次断言，不证明真实模型质量、供应商行为或全部平台兼容。

## 运行入口

仓库依赖与客户端构建就绪后，在根目录执行；Node、pnpm 和宿主 SDK 版本见 [package.json](../../package.json)。

```sh
pnpm simulate --help
pnpm simulate --list
pnpm simulate --scenario full-lifecycle
pnpm simulate --all
```

`pnpm simulate` 默认运行 `full-lifecycle`；`pnpm simulate --all` 按需手动运行全部场景，不纳入默认测试。`OMD_DSH_CLI` 可指定宿主 CLI，默认使用当前依赖；换宿主后的结果单独判断。

## 场景

| 场景 ID | 主要检查 |
| --- | --- |
| `full-lifecycle` | 文件与工具事件、任务证据、上下文回查、Dream 隔离、工作流及崩溃恢复 |
| `stream-cancel` | 取消流式响应、迟到结果及继续执行 |
| `background-timeout` | 总期限与传输空闲期限的区别、真实作业清理 |
| `todo-reminder` | 收尾提醒、`pause_turn` 与有限调用 |
| `restart-checkpoint` | 工具副作用后崩溃、持久化恢复与旧执行器隔离 |
| `storage-failure` | 注入文件写入 `EIO`、错误结果与修复后的实际文件 |
| `context-enhancement` | 主动异步前缀、无工具副作用、引用与迟到结果、原文搜索 |
| `context-adaptive-auto` | 事件触发的后台整理、去重、用量与下次请求应用 |
| `ptc-background-controls` | PTC 实际任务控制、输出读取、停止与当前运行状态 |

## Web 界面与探索

```sh
pnpm exec playwright install chromium
pnpm simulate --scenario full-lifecycle --ui
pnpm simulate --explore --seed 7 --cases 12 --max-steps 12 --budget-ms 120000 --minimize
```

`--ui` 在隔离 Chromium 中检查实际点击、草稿及页面错误，保存明暗截图；不导入真实登录态，不代表官方桌面或所有交互通过。

探索按有限动作语法生成输入。seed 可重跑输入，但不固定全部 OS／I/O 调度；默认 seed=1、cases=12、max-steps=12、budget-ms=120000。预算耗尽或取消表示未完成。`--minimize` 另用一份同值预算、最多尝试16次，只缩减可稳定复现的失败，不保证全局最小。

## 输入重跑与实录

```sh
pnpm simulate --replay /path/to/scenario-0/input.json
pnpm simulate --replay /path/to/scenario-0/input.json --transcript /path/to/scenario-0/transcript.json
pnpm simulate --self-test
```

`input.json`（version=1、kind=`omd-simulation-input`）保存场景及环境选项，重跑时仍使用当前代码与独立断言。完整成功并通过录制校验的请求才产生 `transcript.json`；取消或失败流可能没有实录，报告写明原因。

实录逐 lane 顺序匹配完整请求，包括系统消息、工具和生成参数；未知、歧义、额外或未消费请求及截断响应失败。CLI 只替换录制中明确声明的临时目录、GUI origin 并恢复起始时间，不忽略正文或自动容忍跨版本差异。格式与库级 `modelMap`／受限 `volatileFields` 见 [replay.mjs](replay.mjs)。

`--self-test` 检查判定器能否拒绝损坏工具配对、系统消息和来源；不替代真实宿主场景。

## 隔离与时间

每次运行使用新 HOME、DSH_HOME、profile、workspace、模拟凭证和本地模型，不复制日常配置或材料。默认 `--isolation native` 使用 macOS 外层沙箱限制写入与出网；不可用时失败，不静默降级。宿主内层 full 权限仅属于一次性测试 profile，不取消外层限制。

`--isolation process` 使用模型路由校验和 Node 出网封锁，不提供 OS 沙箱，也不限制所有非 Node 子进程；外层沙箱同样不屏蔽所有可读文件。场景材料使用本次生成的数据。尚未验收的原生 PTY 在创建受控任务前拒绝（`SIM_CAPABILITY_UNVERIFIED`）。

进程清理核对 PID、父进程、进程组和启动身份，审计中的 PID 不直接授予杀进程权限。正常收尾共用五秒预算，残留、强制清理或迟到清理错误记录为失败。

默认 `--clock virtual` 控制 Date 与声明的定时器，由场景推进；文件 I/O、进程、浏览器、`AbortSignal.timeout` 和真实 watchdog 不随虚拟时间冻结。可用 `--clock real`，但 `background-timeout` 仅支持虚拟时间。虚拟推进量不是性能指标。

## 报告与调试

默认输出 `work/conversation-simulator/runs`，可用 `--report` 改位置。报告保存版本、平台、选项、断言、时间线、输入、宿主事件，以及适用时的实录和截图。

| 退出码 | 含义 |
| --- | --- |
| `0` | 本次检查及收尾通过 |
| `1` | 场景、协议、断言、清理或参数失败 |
| `2` | 探索未完整执行 |

失败的临时目录通过 `retainedWorkspace` 保留；成功清除临时目录但保留报告。Ctrl+C 取消并清理，不产生成功结论。录制过滤认证字段不等于任意文本匿名化；报告仅本地保留，使用合成材料分享复现。

扩展场景从 [scenarios.mjs](scenarios.mjs) 入手：通过 [host.mjs](host.mjs) 执行真实工具，用 [assertions.mjs](assertions.mjs) 核对磁盘和原生事件，不把模型说“完成”作为证据。协议、时钟、探索和运行器分别见 [provider.mjs](provider.mjs)、[clock.mjs](clock.mjs)、[explore.mjs](explore.mjs)、[run.mjs](run.mjs)；关键交错可用 [scene.mjs](scene.mjs) 的 Gate 固定因果关系。
