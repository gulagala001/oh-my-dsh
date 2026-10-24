# 开发与源码运行

[English](development_EN.md) · [目录](README.md) · [用户指南](usage.md) · [贡献说明](../CONTRIBUTING.md)

供源码试用和贡献者使用。普通用户用[安装指南](install.md)，无需跑工程测试。
本 checkout 保留固定 `0.10.0` 底座与后续成果，默认为 **OMD `0.2.1-rc.3.omd.0.101.1` / DSH `0.2.1-rc.3` 适配源码**；构建入口精确区分 0.2.1-rc.1／rc.2／rc.3；旧宿主使用对应历史 tag 和工件。[包元数据](https://github.com/gulagala001/oh-my-dsh/blob/main/package.json)保留 `private`，使用 GitHub Release 分发而非 npm。匹配的公共 Chat、Conversation 与宿主组件来源见 [DSH manifest](../vendor/dsh.json)；[新版 OpenCU](../vendor/opencu.json)已整体内置，只装 OMD 即包含核心、工具与真实 REA 前端。0.2.1-rc.3 使用 Cordis `4.0.5`、Schemastery `3.18.5` 与冻结依赖锁，不放宽门禁。

OMD 发行包不重复携带 OpenCU 的独立注册包 `vendor/opencu/lib/client.js`：集成客户端已在 OMD 主包内，`client.factory.mjs` 由构建过程生成，连同独立注册包一起排除出最终安装包；工作区快照和独立 OpenCU 发行不受影响。

## 源码运行

需要 Node.js ≥22.19、Git，以及 checkout 的 `package.json` 指定的 pnpm。
下面只演示已公开的固定 `0.10.0` 源码运行，不是当前 `0.100.0` 版本的安装命令。

```sh
git clone --branch v0.2.1-alpha.1.omd.0.10.0 https://github.com/gulagala001/oh-my-dsh.git
cd oh-my-dsh
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

**本地兼容构建：** `scripts/host-targets.mjs` 集中定义已审阅宿主的官方提交与框架；`scripts/align-host.mjs <完整宿主版本> <官方源码目录>` 对齐清单、枚举来源和框架 overrides。`scripts/sync-dsh.mjs` 接收独立匹配源码及其真实浏览产物，`scripts/sync-opencu.mjs` 接收对应新版 tgz。每份构建单独生成并核对冻结锁、peer 与工件，不改版本号混装。独立聊天的草稿初始化集中在 `src/client/projectless-state.mjs`：rc.3 调用原生初始化接口并保留 keep／replace／append 语义，旧宿主使用同一目标 Session 的输入 facade，保留已有草稿、附件所有权及提交锁。准备过程共用导航与插件生命周期的取消信号，通过原生 `retain({ signal })` 取消就绪等待；每次已派发的设置写入等回执后再检查取消，消息提交后继续按真实接纳结果收尾，不因导航重放。本地安装包使用 `OMD_PNPM_ENTRY="$PNPM" node scripts/pack-local.mjs <输出目录>`，保留内置 macOS helper 的执行位与原签名字节。最小定点检查使用隔离数据/profile；日常部署与重启另需明确授权。

默认数据目录为仓库内的 `data/dsh/`，profile 为 `oh-my-dsh`，端口为 3083；首次启动安装本地插件。
打开终端输出的完整登录链接，在 DSH 中配置模型。仓库不提供私人数据或凭据。

<details>
<summary>端口、数据和本地链接</summary>

macOS／Linux：

```sh
PORT=3090 pnpm start
DSH_HOME=/absolute/path/to/dsh-data pnpm start
```

PowerShell：

```powershell
$env:PORT = '3090'
$env:DSH_HOME = 'C:\dsh-data'
pnpm start
```

构建后，用匹配宿主版本的 CLI 链接已有 Web profile：

```sh
dsh plugin --profile YOUR_PROFILE add link:/absolute/path/to/oh-my-dsh
```

重启生效；桌面用[自带 CLI](upgrade.md#desktop)，普通 CLI 不写 desktop profile。源码路径建议无空格。
macOS 的 `node scripts/launch-macos.mjs` 使用默认数据目录和端口，后台启动并打开登录链接，日志在 `data/dsh-stage.log`。
关闭浏览器不会停止后台服务；前台 `pnpm start` 用 Ctrl+C 停止。

</details>

## 构建和职责

产品边界、独立发行与共装行为见[插件架构](architecture.md)。发布包保留必要源码、对应编译资源与来源声明；普通用户从固定 Release 安装，源码主线不直接充当安装包。


| 路径 | 内容 |
| --- | --- |
| `cordis.patch.yml`、`presets/` | 宿主与预设组合 |
| `src/index.mjs`、`src/runtime.mjs`、`src/dsh-agent.mjs` | 轻量启动入口／增强运行时／工具 |
| `src/context/` | 摘要、资料、替换、回查 |
| `src/tasks.mjs`、`src/todolist.mjs` | 锚点、任务、证据 |
| `src/hub.mjs`、`src/hub-store.mjs`、`src/monitor-ledger.mjs` | 后台／持久监控账本 |
| `src/dream/` | 隔离归属、来源、短记忆与续跑 |
| `src/temporary-chat.mjs`、`src/client/temporary-chat-state.mjs` | 临时聊天回合与前端流式交互状态 |
| `src/codegraph.mjs` | 索引／查询；取消及初始化失败保留可读错误与原始 cause |
| `src/client/` | 对话、工作台、设置、主题 |
| `vendor/dsh/` | 匹配当前构建目标的公共 Chat、Conversation 与宿主组件 |
| `vendor/opencu/` | OpenCU 分发快照；由同步脚本维护源码、构建产物与摘要，不手改 |
| `scripts/`、`test/` | 构建／启动／检查 |

修改组件或价格来源的 `scripts/sync-*.mjs` 在同步完成后调用同一个来源清单生成器，更新设置页与公开来源文档；其他手工修改来源清单输入后运行 `npm run credits:write`。`npm run docs:check` 检查生成内容是否一致。

OpenCU 同版本的服务端 ESM、宿主源码与文档可运行 `node scripts/sync-opencu.mjs ../opencu --files src/dsh/downloads.mjs host/downloads.ts DEVELOPMENT.md docs/install.md docs/install_EN.md`，只替换列出的已提交、已分发文件并保留现有构建产物。入口拒绝未提交源文件、目标摘要不符、生成产物和新增文件；`vendor/opencu.json` 记录 `sourceCommit` 与逐文件摘要，并移除已不代表当前快照的 `archiveSha256`。新增／删除文件、变更版本、前端或生成输入时仍同步匹配宿主的完整包。宿主源码进入发行包不等于已经重建或更新桌面。

Persona 在独立仓库维护，`node scripts/sync-persona.mjs` 按实际 npm 分发清单同步至 `plugins/persona/`，包含公开文档与检查输入。人格设置写入仅使用 `/api/dsh-persona/settings`：GET 返回配置和 `ETag`，POST 通过 `If-Match` 提交读取时的标记；冲突返回 409 和当前配置，缺少标记返回 428。旧 OMD `/settings` 不再接受人格字段，已有配置字段仍用于迁移和读取。

Extensions 自定义命令在独立仓库维护，经 `scripts/sync-dsh-extensions.mjs` 同步。每代原生命令服务拥有自己的文件操作队列和注册记录，个人与项目命令按同一规则增量同步；原生 `definitionId` 区分自身注册和其他插件的同名命令，不借用无关会话判断冲突。注册表只保留菜单元数据，发送时读取当前文件并再次检查取消及注册归属；读取或解析失败不能使用旧模板。停用撤销全部所属注册，宿主重启从文件恢复。独立仓库检查模板与取消，OMD core 检查真实 rc.2 注册器的作用域、并发、启停与恢复。

Skill 管理同样在独立 Extensions 维护。固定 rc.2 的 `SkillRegistry.listLayerCandidates` 提供全部原生候选，保留被同名条目覆盖的文件；默认预设经 `agentPresets.acquireScope` 读取并释放，不创建 Agent。文件系统提供方的 `roots`／`get` 统一目录、解析及候选发布检查，正文读取和新建／导入不再另维护发现规则或等待文件监听器。更新宿主时须同时核对这几个接口和 `FileSystemSkillProvider` 类型识别；不支持的宿主明确失败。文件替换、整包发布及注册归属检查由同一写队列收尾，直接使原生目录缓存失效。原生作用域、冷预设、只读正文、根目录保护和发布失败回归在 `test/extensions-skills-native.test.mjs`，进入 core CI；网页验收还应核对技能与指令保存后正文立即刷新。

指令管理通过声明的 Loader 依赖导入宿主 `dsh-agent-instructions` 与 `dsh-scope`，从 Cordis 活跃 fiber 读取已校验配置，并调用 `discoverBaselineInstructionFiles`；不读取 profile 的首个声明或另设默认配置。默认预设租约及所选项目主会话的 scope chain 限定候选来源，提交前复查预设版本与取消状态。尚未创建的文件仍需同目录名称校验，项目根沿用共用的标记查找；这是公开发现接口只返回已有文件所需的适配。保存／删除共用一个队列和原子文件写入，链接编辑保留链接、删除不删目标；正文按编辑上限有界读取，JSON 请求预算覆盖转义膨胀。原生源文件上限与本页 1 MiB 编辑上限分别展示，总上下文预算与内容去重仍由宿主控制。`test/extensions-instructions-native.test.mjs` 在 core CI 检查配置、路径、启停、预设替换与恢复；宿主升级须复核 Loader／fiber／scope 和发现接口。

`pnpm build` 构建前端，并从 `presets/oh-my-dsh/agent.cordis.yml` 生成普通与 OMD-PTC 预设；修改源配置，不手改生成文件。

临时聊天以服务端内存中的完整回合为历史来源，原生消息及模型重放信息原样用于下一次请求。每个标签页的请求编号递增；`done` 回执确认提交，`stop` 只取消对应请求、阻止该编号迟到执行，并等待真实调用清理。断线时核对该次回合，未确认前保留草稿并暂停发送，恢复操作不重新调用模型。前端状态由标签页记录持有，组件只订阅视图；关闭后清空历史，移除标签页后停止保活。

推荐插件更新与 OMD 自更新都在 `withPluginPreflight` 的执行回调中复用各自的准入规则，覆盖排队、预检与人工继续之间的等待。原生安装清单、当前配置／任务和版本服务仍是权威来源；回调重读后才能开始变更，不根据预检前的启用状态覆盖新选择。自动更新不再满足条件时直接结束，手动冲突保留明确错误。预检仍只运行一次，原生方法负责自己的文件锁、失败恢复与 HMR；移除和安装仍是宿主的两个操作，不提供跨进程整包替换事务。自更新复用版本服务当前快照，不增加第二次网络查询。

会话总览的来源、输出和 Workflow 事实统一由 `omdOverview` 原生投影维护，前端不再扫描已加载历史或合并第二份工作流状态。原生投影存储负责序号、新旧回执、读取状态与重连；完整空值也不会从旧列表摘要补回。子会话目录和运行状态沿用宿主，当前回合结果与历史工作流结果分别展示；阶段键区分省略与空字符串。投影版本变更由宿主从原始日志重建缓存，不修改日志或新设存储。读取错误需明确重试，历史迁移仍由打开会话触发。

独立聊天的工作目录由 `src/projectless-workspaces.mjs` 分配。请求记录只有 `ready` 才确认路径；`pending` 只保留请求、日期和候选名称。首次分配和恢复共用排他 `mkdir`，已有目录、文件或符号链接均不接管；失败留下的未确认目录保留，改选编号后只清理本请求放弃的占名记录。既有跨进程锁、原子元数据写入与已确认路径的重试语义保留，磁盘错误直接返回，不自动重发消息。

宿主构建通过 [`host-const-enums.mjs`](../scripts/host-const-enums.mjs)，使用根 `devDependencies` 显式锁定、经来源清单核验的 TypeScript `6.0.3`，按 AST 与真实符号绑定内联官方 `const enum` 成员并消除运行时枚举引用。DSH／Cordis 复用宿主 SDK 单例，不打包第二份；官方来源提交、SHA-256 与完整枚举声明／成员按[枚举 manifest](../scripts/host-const-enums.json)校验。默认构建不依赖桌面 SDK 路径中的未声明编译器 fallback。

CodeGraph 的 `codegraph.json` 排除规则只作用于当前项目根，不会自动继承到独立子仓库。工作区与各子仓库分别排除隔离宿主、构建产物和 REA 提取包，查询保留手写适配层；调查提取包原件用定点文件读取。索引异常膨胀时先确认无活动写入者，再清理可重建的 `.codegraph` 数据库，执行 `codegraph_index` 并以实际查询确认；不得删除用户数据或源文件。

CodeGraph 目录探测与原生 MCP 适配器由运行时的同一个 catalog 作业持有，同一 revision 共用成功或失败回执；显式准备或重新启用才开启新 revision。Agent 只等待和注册工具，退出不取消共享探测。查询连接按项目／会话共享，握手失败由生产者移除，即使等待者已取消；已观察到断开的连接先收尾再替换，旧调用的迟到失败不能移除新连接，也不自动重放查询。

**内置回合撤回：** `node scripts/sync-rewind.mjs ../rewind` 从已完成构建的独立 `@gulagala001/dsh-undo-plugin` 包同步实际发布文件，核对精确宿主并生成 `vendor/rewind.json`。服务端通过 `oh-my-dsh/rewind` 加载同一模块，客户端直接编译快照入口；独立插件与内置方使用共同运行时所有权，不能额外注册另一套回退引擎或按钮。同步后运行 OMD 构建；不在构建期间隐式拉取或重写快照。

**运行边界：** 基础 Chat／Conversation 与可选客户端增强分开挂载，后台增强由轻量入口建立；依赖失败保留错误与恢复入口。任务状态从原生事件恢复，结果精简只投影请求并保存原文；共享模型回复处理保留取消、失败与原始回执。CommandCode 的请求兼容集中处理特定渠道的 reasoning／工具历史重放，保留原始会话日志，不改变其他提供方的请求。

## 按需测试

专注实现和交付，尽量少做测试。按需做最小构建／启动检查，仅为具体问题或用户明确要求做定点验证（含 CU）。依据用户实际使用反馈改进体验。贡献与发行要点见[贡献说明](../CONTRIBUTING.md)。
- `pnpm test`（或 `pnpm test:smoke`）：运行 `scripts/test-ci.mjs` 列出的核心回归，不反复安装宿主、不启动完整桌面。
- 单项回归：`node --test test/<name>.test.mjs`，仅指定实际保留的文件。
- `pnpm test:all`：兼容入口，运行同一组最小检查，不再另设重型全量套件；结果只说明这些检查的有限范围。
- 需要运行检查时，使用隔离数据/profile，保持当前工作 DSH 原状。

图片、上下文预算和空闲预处理见[上下文整理与原文回查](context-workflow.md)；来源与许可见[第三方声明](../THIRD_PARTY_NOTICES.md)。

内置 BTW 使用 `node scripts/sync-btw.mjs ../dsh-btw-plugin` 按 npm 实际分发清单同步独立插件的完整构建、文档清单和检查脚本；`vendor/btw.json` 记录来源提交、精确宿主及文件哈希。服务端与前端直接使用同一插件入口，匹配的独立与内置版本共用注册生命周期。
