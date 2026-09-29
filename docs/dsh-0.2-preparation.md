# DSH 0.2 适配准备

## 当前结论

已经完成公开 master 的源码适配、Oh My DSH / OpenCU 快照更新、发布工具准备，以及 macOS 上的原版宿主和真实桌面验证。正式 0.2 的最终标签、npm 包和桌面安装包发布后，仍需完成本文末尾的发行验收。

本次组件快照及发布工具已随 OMD `0.1.7-rc.2.20` 提供，并由 OMD `0.2.0` 继续沿用，安装仍配对 DSH `0.1.7-rc.2`。上游于 2026-09-28 发布 `dsh-v0.2.0-rc.1`（`4878cdabd87d4041bdaff61d04c966883b9fd07a`），较下述固定源码基线又增加 106 个提交。本版尚未纳入这批变更，不声明兼容 0.2.0-rc.1；后续需按其真实发行物完成独立验收。

## 可复现的源码基线

核对日期：2026-09-28。

| 项目 | 固定基线 |
| --- | --- |
| 现有公开宿主 | `dsh-v0.1.7-rc.2`，`477b4f420553e8a52c2fbccc464d7561b239c443` |
| 本次准备的公开 master | `21638c56315ae6a2b552d6091945d3144c9af32e` |
| master 自报版本 | `0.1.7-rc.2`；该提交没有对应正式 0.2 标签 |
| 上游差异 | 155 个提交，547 个文件；完整 Git 差异核对，未把 GitHub compare 的文件截断结果当作完整清单 |
| OMD 宿主组件快照 | `vendor/dsh.json`，记录完整提交、实际版本、逐文件 SHA-256 |
| 共享 Chat 快照 | OpenCU 的 `vendor/dsh-chat.json`，与 OMD 使用同一个宿主提交 |
| Computer Use | 在 OpenCU 源仓修改，OMD 用 `scripts/sync-opencu.mjs` 整体生成发行快照 |

来源：[官方提交](https://github.com/deepseek-ai/deepseek-harness/commit/21638c56315ae6a2b552d6091945d3144c9af32e)、[与 rc.2 的对比](https://github.com/deepseek-ai/deepseek-harness/compare/477b4f420553e8a52c2fbccc464d7561b239c443...21638c56315ae6a2b552d6091945d3144c9af32e)、[官方发行页](https://github.com/deepseek-ai/deepseek-harness/releases)。未来 master 移动时，应以清单中的完整 SHA 重现本次结果。

## 已落实的适配项

### 1. 原生输入与提交信息

- 同步 Conversation 的提交契约、草稿编辑器、输入机、提交来源与分析辅助模块。
- 提示词优化器完整透传原生 `submit(mode, ...args)` 参数。自动优化完成后仅提交一次；命令、仅附件、关闭优化、组件释放后的保留引用同样保留原生参数。
- 时间、模型与模式由宿主在实际提交时捕获。异步优化没有冒充宿主的提交信息生成器。
- 真实界面验证模型选择、忙碌时 Enter 的排队/插话、模式切换、优化后的发送、附件和草稿恢复。

### 2. Chat 显示与设置

- 同步四种工作过程模式、Web/桌面默认值、性能与用量显示、运行状态、分组/节点、滚动与披露契约。
- 新 Web 默认详细、桌面默认标准；已有明确设置保留。旧偏好迁移保留一次性语义，替换 provider 后不重复保存。
- OpenCU 继续拥有唯一 Chat factory；保留操作分组、连续推理合并、实时动作说明、历史计数与失败状态。两包不各自启动一套分组执行器。
- 界面测试通过公共设置入口触发变更，分别验证新安装默认值和明确旧设置。

### 3. 原生工具循环与失败恢复

- 继续复用宿主 Session、Scheduler、工具循环、原生权限、原生预算与工具协议；不恢复旧执行器。
- 新增真实故障测试：工具副作用已经发生、finalizer 失败时，原生 `ToolCallRecovery` 为该 call 写入唯一 `TOOL_OUTCOME_UNKNOWN`，并在 step/turn 结束前补齐配对。
- 验证恢复后的继续对话、历史回放和会话 fork 保留失败结果；实际工具写入只发生一次。
- 原版 `standard`、`ptc`、`cordis` 与 OMD、OMD-PTC 反复切换，原生 todos 与 OMD 账本、上下文、预算和提示词各按实际契约运行。
- Workflow/PTC、后台 Jobs、会话关闭/重载、子任务 effort 与 worktree 写入范围完成真实宿主检查。

### 4. 外观与桌面

- 修复 Codex 布局在“仅对话区域背景”下右栏覆盖顶栏折叠按钮的问题；关闭的右栏不再拦截左栏按钮，打开的右栏仍可交互。
- 几何定位使用宿主公开 `data-*` 边界，减少对编译后 CSS 类名的依赖。
- 原生标题能识别本地构建的中英文品牌名称，保留会话标题；卸载后恢复实际原生名称。
- 已用真实 Electron master 和当前官方 macOS rc.2 桌面包检查安装、发送、停止/恢复、Computer Use 浏览器画面、工作台、明暗主题、配色、背景作用范围、重启/草稿/设置保留与卸载恢复。
- Codex 窄屏、左右栏、全屏、预览和背景点击回归包含在专门的界面测试中。

### 5. 快照和构建

- Conversation、Chat、Tools、Jobs、Shell、JSONL 与 Workflow 配套源、补丁、产物和哈希一起保留。
- 同步脚本默认核对清单中的完整提交；变更基线须显式传入 `--commit <full SHA>`。只有版本标签确实指向 HEAD 才记录 `tag`，未发布 master 的 `tag` 为 `null`。
- 上游未修改宿主完成锁文件安装和全量构建；客户端补丁完成上游 TypeScript 检查。
- OMD Workflow 扩展通过独立 factory 构建和运行验证。把整个扩展补丁直接套进上游 monorepo 的全量 TypeScript 构建，会出现跨项目引用与扩展类型诊断；该尝试不计为通过，也不宣称完整补丁树通过了上游类型检查。
- 上游测试宿主仅规范化 CSS 模块文件名，以重现官方构建路径的哈希；测试时没有给原生宿主预装 OMD 功能补丁。
- OMD 构建比较普通目录、带空格目录和重复构建的客户端/Workflow guest 字节，规范化依赖位置注释后保持一致。

### 6. 发布与升级机制

- OMD 从 `0.2.0` 开始独立编号，当前仍配对 DSH `0.1.7-rc.2`；不会因 OMD 编号更新而自动扩大宿主兼容范围。
- 发布清单保留既有 `dsh-aligned` 协议字段，兼容旧版更新检查器及历史编号迁移；通用 SemVer 比较保持原语义。
- `scripts/desktop-releases.json` 保存已核验桌面版本的大小与 SHA-512。准备脚本从当前 DSH 依赖选版本，并支持明确版本/清单；未知版本在下载前报错。
- `scripts/dsh-release-plan.mjs` 只读列出 OMD/OpenCU 的 DSH 依赖、dev/peer、源码快照、桌面元数据与发行文件缺项。
- `.github/workflows/host-compatibility.yml` 已准备 Linux/macOS/Windows × npm 宿主/指定源码宿主的六格矩阵；已执行结果和失败复验范围见对应 Release 的 `verification.log`。

## 验证入口与证据

本次原始日志、桌面截图、发布计划和机器可读结果集中保存在本地忽略目录 `.context-upgrade/dsh-0.2-preparation/`。`verification.json` 逐项记录源码、命令、通过/失败/跳过、证据路径及限制；修复前的失败证据也保留，不能将旧失败与修复后的通过混为同一版本。

主要验证范围如下；准确数量与末次运行以 `verification.json` 为准。

| 范围 | 当前本机结果 |
| --- | --- |
| 干净上游构建、客户端 TypeScript | macOS 通过 |
| 上游工具配对、修复、输入信息、Chat 默认值与运行状态 | 针对性测试通过 |
| OMD 提示词/上下文/任务/预算/Workflow 核心 | 通过；Windows 专用测试在 macOS 明确跳过 |
| Node 22.19 最低版本 | 核心、实际 master 启停和失败恢复通过 |
| 实际 master 安装、模式、会话 fork/持久化、后台任务 | 通过 |
| 实际 master 偏好、优化器、模型、推理、主题与布局 | 通过 |
| macOS master Electron 与官方 rc.2 桌面 | 实际安装、重启、卸载流程通过 |
| 两包安装顺序与单一工具/界面所有权 | 两种顺序、重启、逐个卸载和所有权检查通过 |
| Windows/Linux 新宿主与官方 0.2 桌面 | 尚未实测 |

复现前在干净的官方 checkout 固定上述 SHA，使用上游锁文件安装并构建。可从 OMD 的补丁中只应用 CSS 路径规范化：

```sh
git apply --include=packages/client/tsdown.client.ts /path/to/oh-my-dsh/vendor/dsh/changes.patch
pnpm install --frozen-lockfile
pnpm run build
```

在 OMD 中执行：

```sh
pnpm install --frozen-lockfile
pnpm build
node scripts/dsh-release-plan.mjs 0.2.0
OMD_DSH_CLI=/path/to/deepseek-harness/apps/cli/lib/bin.js node --test --test-concurrency=1 \
  test/dsh-install.test.mjs test/host-lifecycle.test.mjs test/dsh-master-recovery.test.mjs \
  test/context-persistence.test.mjs test/task-budget-native.test.mjs test/workflow-integration.test.mjs \
  test/host-preferences-ui.test.mjs test/prompt-optimizer-ui.test.mjs test/model-panel-ui.test.mjs \
  test/codex-desktop-ui.test.mjs test/codex-wallpaper-controls-ui.test.mjs test/computer-use-ui.test.mjs
```

在 OpenCU 源仓验证两种共存顺序：

```sh
OMD_DSH_CLI=/path/to/deepseek-harness/apps/cli/lib/bin.js \
OPENCU_OHMY_SOURCE=file:/path/to/oh-my-dsh \
node --test --test-concurrency=1 test/dsh-install.test.mjs test/integration-ownership.test.mjs
```

默认不设置 `OMD_DSH_CLI` 时使用包中锁定的现有 npm 宿主。测试用独立 home、工作区、浏览器与模型 fixture，不读取真实账号密钥。master 的故障恢复测试在缺少原生 `ToolCallRecovery` 的旧 rc.2 上会明确跳过。

## 正式 0.2 发布后必须完成的项目

1. **固定正式标签。** 获取真实 `dsh-v0.2.0`（或实际发布版本）及完整 SHA，比较本次 master 与该标签的增量；重新核对提交信息、Chat/输入/Slot、Session 恢复、Loader、todos、权限、桌面引导和默认设置。不能仅把版本号替换后沿用旧结论。
2. **更新 SDK 和锁文件。** 在 OMD 与 OpenCU 源仓同时更新全部 DSH dependencies/devDependencies/peerDependencies，安装并锁定实际发布包；仍须核实 cordis/schemastery 与其他依赖的实际版本，不凭推测扩大 peer 范围。
3. **重建两个源码快照。** 在固定标签上重放补丁、解决新增冲突、检查客户端类型；先更新 OpenCU Chat，再整体打包同步 OpenCU，随后更新 OMD Conversation/host factories。逐文件哈希、Chat 单一所有权、源码补丁与产物必须一致。
4. **准备发布版本和更新清单。** 使用只读发布计划确认遗漏，设置合法 OMD 版本；同步 package/lock、`release-manifest.json`、CHANGELOG、README 徽章、安装/升级/使用文档。实际发行时再更新用户兼容声明与第三方插件验证范围。
5. **核验官方桌面资产。** 从官方更新 feed 与 GitHub 资产核对每个平台的文件名、大小、SHA-512、平台和架构，填入桌面清单。验证下载/解包/安装/升级和签名状态；不得沿用 rc.2 的校验值或将源码 Electron 当作签名发行包。
6. **执行最终平台矩阵。** 在 Linux/macOS/Windows 的 npm 与源码宿主上实际跑安装、启停/卸载、模式切换、原生工具、故障恢复、上下文/账本/预算、输入/偏好、主题、Computer Use 和两包共存。保留失败原始协议，不用重试次数掩盖失败。
7. **验收 Windows 当前范围。** 正式 Windows x64 包，常见单屏 125%/150%/200%，浏览器冷启动/截图/输入、预览、停止/恢复、重启与子进程清理。PowerShell 专用门禁也须在 Windows 运行；macOS 的通过不能替代。多屏混合缩放、锁屏及明确后置生态按已有基线安排。
8. **检查实际发行内容。** `npm pack`/发行 archive 确认 runtime 依赖、预设、factory、快照、校验与许可证齐全，排除 AGENTS、本地交接/提示词审定记录、密钥、用户设置和会话、机器缓存。从 archive 实际安装并卸载，保持现有用户数据。
9. **复核回退。** 升级前复制 DSH home 与工作区中相关用户数据；失败时停止 Host、恢复备份并安装旧宿主/插件。原版 UI 恢复、会话/设置保留须有实际结果；不把卸载插件等同于回退宿主数据格式。
10. **发布。** 上述实际门禁通过后再生成正式发行物、发布更新清单和兼容说明。本版的准备材料不代表新版宿主已经完成发行验收。

## 当前无法提前证明的范围

本次固定基线不包含后来发布的 0.2.0-rc.1 内容及其 npm、签名桌面包与更新 feed；新宿主 Windows/Linux 实测与远端矩阵尚未执行。真实桌面权限、真实登录、所有应用/站点流程和后置生态也没有因一次模型 fixture 的成功而自动通过。这些项目保留为明确的发行门禁，已有准备与 macOS 证据可以直接复用。
