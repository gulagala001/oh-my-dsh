# 开发与源码运行

[English](development_EN.md) · [目录](README.md) · [用户指南](usage.md) · [贡献说明](../CONTRIBUTING.md)

供源码试用和贡献者使用。普通用户用[安装指南](install.md)，无需跑工程测试。
本 checkout 保留固定 `0.10.0` 底座与后续成果，默认为 **OMD `0.2.1-rc.3.omd.1.1.0` / DSH `0.2.1-rc.3` 适配源码**；构建入口精确区分 0.2.1-rc.1／rc.2／rc.3；旧宿主使用对应历史 tag 和工件。[包元数据](https://github.com/gulagala001/oh-my-dsh/blob/main/package.json)保留 `private`，使用 GitHub Release 分发而非 npm。匹配的公共 Chat、Conversation 与宿主组件来源见 [DSH manifest](../vendor/dsh.json)；[新版 OpenCU](../vendor/opencu.json)已整体内置，只装 OMD 即包含核心、工具与真实 REA 前端。0.2.1-rc.3 使用 Cordis `4.0.5`、Schemastery `3.18.5` 与冻结依赖锁，不放宽门禁。

OMD 发行包不重复携带 OpenCU 的独立注册包 `vendor/opencu/lib/client.js`：集成客户端已在 OMD 主包内，`client.factory.mjs` 由构建过程生成，连同独立注册包一起排除出最终安装包；工作区快照和独立 OpenCU 发行不受影响。

## 源码运行

需要 Node.js ≥22.19、Git，以及 checkout 的 `package.json` 指定的 pnpm。
下面只演示已公开的固定 `0.10.0` 源码运行，不是当前源码版本的安装命令。

```sh
git clone --branch v0.2.1-alpha.1.omd.0.10.0 https://github.com/gulagala001/oh-my-dsh.git
cd oh-my-dsh
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

**本地兼容构建：** `scripts/host-targets.mjs` 集中定义已审阅宿主的官方提交与框架；`scripts/align-host.mjs <完整宿主版本> <官方源码目录>` 对齐清单、枚举来源和框架 overrides。`scripts/sync-dsh.mjs` 接收独立匹配源码及其真实浏览产物，`scripts/sync-opencu.mjs` 接收对应新版 tgz。每份构建单独生成并核对冻结锁、peer 与工件，不改版本号混装。独立聊天的草稿初始化集中在 `src/client/projectless-state.mjs`：rc.3 调用原生初始化接口并保留 keep／replace／append 语义，旧宿主使用同一目标 Session 的输入 facade，保留已有草稿、附件所有权及提交锁。准备过程共用导航与插件生命周期的取消信号，通过原生 `retain({ signal })` 取消就绪等待；新聊天打开输入框前准备独立权限根与原生 Session，首次发送直接由同一原生输入 owner 处理；首条用户消息在系统提示组装前经 `workingDirectory.set` 选择该根目录内的具名子目录。`src/projectless-directory.mjs` 只负责一次性命名，原生事件负责持久化、后续切换和子代理继承，原始 cwd 继续限定权限；不要在提交时替换 Session 或增设逐插件设置迁移。取消保留创建请求身份供幂等重试，每个范围复用一份未发送草稿。无工作区目录的分配请求 ID 必须等于最终 Session ID；复用空白会话时同时核对该身份与目录分配记录，不能把“此目录由 OMD 创建”当作任意会话的归属证明。显式工作区还须匹配原生登记的实际目录。Finder 与打开目录快捷键保留 rc.3 原生 `ui-open-in-app` 客户端；`scripts/build-open-in-app.mjs` 核对原 bundle SHA256，只将两个初始 cwd 选择器改接原生 `workingDirectory` 投影，再由 OMD 挂载。原生菜单、快捷键注册、后端路径验证和打开动作不变；升级宿主须重新核对来源与替换点，并实跑首次发送、重启、权限及 Finder 定位。本地安装包使用 `OMD_PNPM_ENTRY="$PNPM" node scripts/pack-local.mjs <输出目录>`，保留内置 macOS helper 的执行位与原签名字节。最小定点检查使用隔离数据/profile；日常部署与重启另需明确授权。

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

自有工具经 `src/tool-contract.mjs` 使用同一份受宿主支持的参数定义进行展示和执行校验；`npm run tools:check` 检查 Native、TypeScript 与 Python SDK，已接入构建、CI 和 prepack。工具上下文优化复用原生执行器、请求投影及监控账本，参数定义、目录裁剪和计量必须一起检查 Native／PTC 路径。

修改组件或价格来源的 `scripts/sync-*.mjs` 在同步完成后调用同一个来源清单生成器，更新设置页与公开来源文档；其他手工修改来源清单输入后运行 `npm run credits:write`。`npm run docs:check` 检查生成内容是否一致。

OpenCU 同版本的服务端 ESM、宿主源码与文档可运行 `node scripts/sync-opencu.mjs ../opencu --files src/dsh/downloads.mjs host/downloads.ts DEVELOPMENT.md docs/install.md docs/install_EN.md`，只替换列出的已提交、已分发文件并保留现有构建产物。该模式拒绝未提交源文件、目标摘要不符、生成产物和新增文件。同版本客户端修改在完成受影响构建、更新扩展摘要并提交源码后，可用 `node scripts/sync-opencu.mjs ../opencu --client` 同步客户端、内容哈希分块和扩展光标／ZIP，校验资源摘要并清理被替代的分块，无需重新打完整包。两种模式均在 `vendor/opencu.json` 记录 `sourceCommit` 与逐文件摘要，并移除已不代表当前快照的 `archiveSha256`。其他文件成员、版本或构建输入变更仍同步匹配宿主的完整包。同步源码或客户端不等于已经重建或更新桌面。

Persona 在独立仓库维护，`node scripts/sync-persona.mjs` 按实际 npm 分发清单同步至 `plugins/persona/`，包含公开文档与检查输入。人格设置写入仅使用 `/api/dsh-persona/settings`：GET 返回配置和 `ETag`，POST 通过 `If-Match` 提交读取时的标记；冲突返回 409 和当前配置，缺少标记返回 428。旧 OMD `/settings` 不再接受人格字段，已有配置字段仍用于迁移和读取。

Extensions 自定义命令在独立仓库维护，经 `scripts/sync-dsh-extensions.mjs` 同步。每代原生命令服务拥有自己的文件操作队列和注册记录，个人与项目命令按同一规则增量同步；原生 `definitionId` 区分自身注册和其他插件的同名命令，不借用无关会话判断冲突。注册表只保留菜单元数据，发送时读取当前文件并再次检查取消及注册归属；读取或解析失败不能使用旧模板。停用撤销全部所属注册，宿主重启从文件恢复。独立仓库检查模板与取消，OMD core 检查真实 rc.2 注册器的作用域、并发、启停与恢复。

Skill 管理同样在独立 Extensions 维护。固定 rc.2 的 `SkillRegistry.listLayerCandidates` 提供全部原生候选，保留被同名条目覆盖的文件；默认预设经 `agentPresets.acquireScope` 读取并释放，不创建 Agent。文件系统提供方的 `roots`／`get` 统一目录、解析及候选发布检查，正文读取和新建／导入不再另维护发现规则或等待文件监听器。更新宿主时须同时核对这几个接口和 `FileSystemSkillProvider` 类型识别；不支持的宿主明确失败。文件替换、整包发布及注册归属检查由同一写队列收尾，直接使原生目录缓存失效。原生作用域、冷预设、只读正文、根目录保护和发布失败回归在 `test/extensions-skills-native.test.mjs`，进入 core CI；网页验收还应核对技能与指令保存后正文立即刷新。

指令管理通过声明的 Loader 依赖导入宿主 `dsh-agent-instructions` 与 `dsh-scope`，从 Cordis 活跃 fiber 读取已校验配置，并调用 `discoverBaselineInstructionFiles`；不读取 profile 的首个声明或另设默认配置。默认预设租约及所选项目主会话的 scope chain 限定候选来源，提交前复查预设版本与取消状态。尚未创建的文件仍需同目录名称校验，项目根沿用共用的标记查找；这是公开发现接口只返回已有文件所需的适配。保存／删除共用一个队列和原子文件写入，链接编辑保留链接、删除不删目标；正文按编辑上限有界读取，JSON 请求预算覆盖转义膨胀。原生源文件上限与本页 1 MiB 编辑上限分别展示，总上下文预算与内容去重仍由宿主控制。`test/extensions-instructions-native.test.mjs` 在 core CI 检查配置、路径、启停、预设替换与恢复；宿主升级须复核 Loader／fiber／scope 和发现接口。

`pnpm build` 构建前端，并从 `presets/oh-my-dsh/agent.cordis.yml` 生成普通与 OMD-PTC 预设；修改源配置，不手改生成文件。

临时聊天以服务端内存中的完整回合为历史来源，原生消息及模型重放信息原样用于下一次请求。每个标签页的请求编号递增；`done` 回执确认提交，`stop` 只取消对应请求、阻止该编号迟到执行，并等待真实调用清理。断线时核对该次回合，未确认前保留草稿并暂停发送，恢复操作不重新调用模型。前端状态由标签页记录持有，组件只订阅视图；关闭后清空历史，移除标签页后停止保活。

推荐插件更新与 OMD 自更新都在 `withPluginPreflight` 的执行回调中复用各自的准入规则，覆盖排队、预检与人工继续之间的等待。原生安装清单、当前配置／任务和版本服务仍是权威来源；回调重读后才能开始变更，不根据预检前的启用状态覆盖新选择。自动更新不再满足条件时直接结束，手动冲突保留明确错误。预检仍只运行一次，原生方法负责自己的文件锁、失败恢复与 HMR；移除和安装仍是宿主的两个操作，不提供跨进程整包替换事务。自更新复用版本服务当前快照，不增加第二次网络查询。

会话总览的来源、输出和 Workflow 事实统一由 `omdOverview` 原生投影维护，前端不再扫描已加载历史或合并第二份工作流状态。原生投影存储负责序号、新旧回执、读取状态与重连；完整空值也不会从旧列表摘要补回。子会话目录和运行状态沿用宿主，当前回合结果与历史工作流结果分别展示；阶段键区分省略与空字符串。投影版本变更由宿主从原始日志重建缓存，不修改日志或新设存储。读取错误需明确重试，历史迁移仍由打开会话触发。

独立聊天的工作目录由 `src/projectless-workspaces.mjs` 分配。请求记录只有 `ready` 才确认路径；`pending` 只保留请求、日期和候选名称。首次分配和恢复共用排他 `mkdir`，已有目录、文件或符号链接均不接管；失败留下的未确认目录保留，改选编号后只清理本请求放弃的占名记录。既有跨进程锁、原子元数据写入与已确认路径的重试语义保留，磁盘错误直接返回，不自动重发消息。

首次命名由 `src/projectless-directory.mjs` 在原生请求组装前完成。rc.3 的 `workingDirectory.set` 会提交目录事件并注入下一步通知；首轮请求已有发送前刷新的必需 `working-directory:current` 快照，因此初始化采用局部 Agent 通知适配对象，仅阻止这次调用产生的 `working-directory` 通知入队，其他消息照常转交真实 Agent。原生目录验证、串行化、取消和持久投影继续生效，模型直接获得准确的当前目录。真实 Agent 方法与共享服务不改写，不接管 inbox、不自行消费或发出 claimed 事件；手动切换及目录失效恢复仍产生原生通知，拒绝步骤后的冷恢复继续读取持久目录事件。`test/projectless-directory-native.test.mjs` 通过真实 rc.3 循环、目录服务及本地模型适配器检查静默首发、并发、取消、其他输入的原生调度、拒绝后冷恢复、上下文抑制及实际相对路径写入／shell 目录，已接入 core CI。

宿主构建通过 [`host-const-enums.mjs`](../scripts/host-const-enums.mjs)，使用根 `devDependencies` 显式锁定、经来源清单核验的 TypeScript `6.0.3`，按 AST 与真实符号绑定内联官方 `const enum` 成员并消除运行时枚举引用。DSH／Cordis 复用宿主 SDK 单例，不打包第二份；官方来源提交、SHA-256 与完整枚举声明／成员按[枚举 manifest](../scripts/host-const-enums.json)校验。默认构建不依赖桌面 SDK 路径中的未声明编译器 fallback。

CodeGraph 的 `codegraph.json` 排除规则只作用于当前项目根，不会自动继承到独立子仓库。工作区与各子仓库分别排除隔离宿主、构建产物和 REA 提取包，查询保留手写适配层；调查提取包原件用定点文件读取。索引异常膨胀时先确认无活动写入者，再清理可重建的 `.codegraph` 数据库，执行 `codegraph_index` 并以实际查询确认；不得删除用户数据或源文件。

CodeGraph 目录探测与原生 MCP 适配器由运行时的同一个 catalog 作业持有，同一 revision 共用成功或失败回执；显式准备或重新启用才开启新 revision。Agent 只等待和注册工具，退出不取消共享探测。查询连接按项目／会话共享，握手失败由生产者移除，即使等待者已取消；已观察到断开的连接先收尾再替换，旧调用的迟到失败不能移除新连接，也不自动重放查询。

**内置回合撤回：** `node scripts/sync-rewind.mjs ../rewind` 从已完成构建的独立 `@gulagala001/dsh-undo-plugin` 包同步实际发布文件，核对精确宿主并生成 `vendor/rewind.json`。服务端通过 `oh-my-dsh/rewind` 加载同一模块，客户端直接编译快照入口；独立插件与内置方使用共同运行时所有权，不能额外注册另一套回退引擎或按钮。同步后运行 OMD 构建；不在构建期间隐式拉取或重写快照。

**运行边界：** 基础 Chat／Conversation 与可选客户端增强分开挂载，后台增强由轻量入口建立；依赖失败保留错误与恢复入口。任务状态从原生事件恢复，结果精简只投影请求并保存原文；共享模型回复处理保留取消、失败与原始回执。CommandCode 的请求兼容集中处理特定渠道的 reasoning／工具历史重放，保留原始会话日志，不改变其他提供方的请求。

## 按需测试

专注实现和交付，尽量少做测试。按需做最小构建／启动检查，仅为具体问题或用户明确要求做定点验证（含 CU）。依据用户实际使用反馈改进体验。贡献与发行要点见[贡献说明](../CONTRIBUTING.md)。

DeepSWE 的本地适配器位于 `scripts/deepswe/`，通过固定版本的 [Pier](https://github.com/datacurve-ai/pier) 在官方 Linux 任务环境中运行实际 DSH／OMD PTC。`snapshot.mjs <已安装 profile> <本地私有 bundle 目录>` 保存模型、插件和配置快照，不复制聊天或记忆；`run.py <评测目录> doctor` 核对环境，`run --task <任务名>`、`run --sample 10 --seed 0` 或 `run --all` 选择范围，`report` 查看回执。评测目录须包含固定的任务集、Pier 虚拟环境、Linux 运行包和 `config/local.json`；凭据、任务原文、参考答案、镜像与运行结果全部留在工作区 `.local/`。每题独立配置与数据，模型运行前比对实际 OMD 配置，官方评分器只在独立干净容器中验证提交的补丁。保留插件配置，但 Linux 环境不提供 macOS 桌面或 Blender 服务；网络遵循任务隔离规则，仅放行已选推理端点。Apple Silicon 上的本地 Colima 环境使用 QEMU，避免 Rosetta 执行宿主原生扩展时卡住；`start`／`stop` 管理专用评测虚拟机。默认串行、一次尝试，失败单列；真实调用消耗所选渠道额度，单题结果不代表全量成绩。该流程按需运行，不接入日常 CI。

防作弊边界位于独立 TLS 网关和容器层：真实凭据不进入任务容器，只放行指定模型的 Responses 请求与本题响应回读；阻止托管搜索、远程媒体、跨题响应、更换主 PTC 强度及普通外网／DNS 出站。任务不能访问控制器、参考答案或 Docker 接口。配置与插件文件在结束时再次核验；官方测试报告在另一个无网络、只读容器中复算，可疑补丁、分数不一致和缺失证据单列待复核，不计可信通过，原始结果保留。可信通过率以请求的全部任务为分母。`probe.py <评测目录>`、`--positive`、`--scoring` 分别验证攻击边界、真实 OMD 调用及评分审计。此流程不保证识别所有运行时测试取巧。

- `pnpm test`（或 `pnpm test:smoke`）：运行 `scripts/test-ci.mjs` 列出的核心回归，不反复安装宿主、不启动完整桌面。
- 单项回归：`node --test test/<name>.test.mjs`，仅指定实际保留的文件。
- `pnpm test:all`：兼容入口，运行同一组最小检查，不再另设重型全量套件；结果只说明这些检查的有限范围。
- 需要运行检查时，使用隔离数据/profile，保持当前工作 DSH 原状。

工具执行性能可用 `npm run perf:tools -- --root <源码根> --out <本地 .local/report.json> --repeats 7` 按需评测。先准备匹配 SDK 依赖及计量生成物；真实宿主 Workflow 场景还需模拟器已有构建，截图场景使用已安装 Chromium，不自动下载。基线和候选使用同一份评测工具、宿主、环境及 `size`／`repeats`／`idle-ms`，候选附 `--baseline <基线 JSON>`；`--cases` 可限定场景。报告分列新进程初始化后的首次操作与热操作，记录完整耗时、首个有效回执、局部阶段、事件循环延迟、CPU、采样进程树 RSS、闲置、取消清理和结果等价性；没有观测到的指标保留 null。21 个系列逐项注明实际覆盖层级，隔离宿主使用本地协议模型，不代表远端模型或 GUI 性能。嵌套阶段不可相加，小样本 p95 只描述本次样本，未清空操作系统缓存。`--idle-ms 31000 --cases article` 可观察正文计算 worker 的自动回收，显式关闭耗时另列；AST 场景会先执行取消检查，其闲置数据不单独证明自动回收。`node scripts/tool-performance/native-candidates.mjs --root <源码根> --out <本地 .local/candidates.json>` 单独测原生写入／编辑的大差异回执与持久 Bash 的实际轮询、就绪等待和取消；其中 worker 只是等价计算候选，不会安装到宿主。

工具内部优化保持模型工具契约、提示词、agent loop、跨工具调度及 PTC 状态模式不变。大段 AST 和所有正文解析使用同一算法的单个懒加载计算 worker，闲置 30 秒回收；小段 AST 直接计算。正文依赖检查也执行同一个 worker 入口，避免桌面宿主的模块路由干扰 jsdom 内部加载。AST 树按内容和语言有界复用，取消会结束当前纯计算。原文查询仅缓存已确认深冻结的日志前缀，按原算法匹配和校验游标；缓存不保持整个 Session，最多三个有界前缀并在闲置后释放，可变快照仍完整扫描。原生匿名网页读取沿 Loader 解析的同一 provider 接入 Undici 连接池，每次仍做原生 DNS 校验，改变的地址集合重新建立连接；代理、跳转、字节上限、超时与第三方 provider 保持原实现。卸载恢复原方法并清理连接。

图片、上下文预算和空闲预处理见[上下文整理与原文回查](context-workflow.md)；来源与许可见[第三方声明](../THIRD_PARTY_NOTICES.md)。

内置 BTW 使用 `node scripts/sync-btw.mjs ../dsh-btw-plugin` 按 npm 实际分发清单同步独立插件的完整构建、文档清单和检查脚本；`vendor/btw.json` 记录来源提交、精确宿主及文件哈希。服务端与前端直接使用同一插件入口，匹配的独立与内置版本共用注册生命周期。


当前 token 计量由一个 `tokenMeter` 服务负责原生上下文／用量投影，OMD 预处理、压缩收益、工具结果、Dream 和预算共用 `src/metering` 的请求与回执契约。真实回执、估算、保守预占和未知字段分别处理；输出属于累计消费，但不直接加进下一次请求的上下文。压缩和回退使旧前缀回执失效，模型路由及图片投影沿用原生 LLM 服务。原生压缩继续使用 `BasicCompactionEngine` 的事务、工具配对和恢复；公开摘要钩子负责把超窗输入分段为完整、受预算约束的请求。没有缓存快照时也可整理。

`node scripts/build-metering.mjs` 只构建受影响的宿主计量与摘要适配。原生函数来源固定于 `src/metering/native/source.json`；工厂通过原有 Loader 解析 SDK，原注册项由 bundle 暂停，卸载后恢复。投影版本由计量源码和原生来源摘要生成，避免算法更新后继续读取旧缓存。`pnpm metering:check` 检查估算／回执解析归属、原生来源摘要和内置 Workflow 同源清单，已接入宿主构建、CI 与 prepack；`test/metering-contract.test.mjs` 覆盖部分回执、实测基准失效、原生日志重放、小窗口及分段摘要。改动后先执行上述受影响构建，再运行定点测试。

插件预检的页面适配位于 `src/plugin-preflight/page.mjs`，按原生加载清单和实际可交互页面判断，不把可选账号引导作为必经步骤。改动此处可定点运行 `test/plugin-preflight-page.test.mjs`（已有浏览器，`OMD_TEST_BROWSER` 指定路径）；通常无需重复完整宿主矩阵。第三方适配包使用固定输入构建器，保持精确宿主声明、完整功能与来源许可。

## 检查与发布流程

源码 CI 先执行 `npm run build`，再执行 `node scripts/test-ci.mjs run core --built`，复用同一份产物并一次汇总回归失败；独立 `npm test` 会准备计量模块。真实安装包仍单独核验。Chromium 布局检查仅跟随相关 UI、宿主源码和依赖锁变更，手动 CI 可用 `layout` 开启。公开文件与文档结构共用快速工作流；main 的文档变更检查、构建并自动发布到 Pages。

文档构建通过 `OMD_DOCS_CHROMIUM` 复用 runner 预装的 Chrome 渲染静态 Mermaid，不下载另一份浏览器。旧桌面／rc.2 热安装验收报告验证器不再随每次 PR 自动运行，真实宿主验收时按需调用；实际源码的 OpenCU 导入和会话控制器就绪检查已合并进 core。Release 附件工作流仅在发布／编辑 Release 或手动触发时核对对应 tag，不随无关源码推送重复下载旧包。
