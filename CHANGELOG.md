# OMD 0.99.0 · DSH 0.2.1-rc.1 / 0.2.1-rc.2

[中文](#zh-0990) | [English](#en-0990)

<a id="zh-0990"></a>

## 中文

0.99.0 汇总自公开版 0.18.8 以来的功能与改进。本版尚未发布，以下为准备中的更新说明。此前 0.19.0 草稿不作为安装入口。

### 新增功能

- **上下文优化与原文档案**：默认精简受支持的只读工具结果；重复文件读取可复用本次请求中已有的完整基线。工具卡片提供“查看原文”，支持开头、结尾、行号、搜索与连续翻页，原文档案可导入、导出并随合法会话分支回查。
- **按需发现与内容视图**：`tool_find` 查找当前会话有权使用的可选工具；`context_view` 提供文件、网页及原文的读取、提纲和查询视图；`code_search` 支持 16 种随包语法的 AST 模式搜索，与 CodeGraph 索引和关系查询配合使用。
- **可选 Billion Context 压缩**：按会话选择 OMD 或 BC 管理上下文压缩，保留 Dream、归档、原文与附件回查、任务、人格、侧问、分支与回退。当前 BC 接线适配 DSH 0.2.1-rc.2／billion-context 0.1.202。
- **人格管理**：将身份与人格、语言风格、沟通方式、回答呈现分为四个模块，支持多个预设、复制修改、JSON 导入导出和 AI 创作提示词；可在主会话中继承全局、选择独立人设或关闭人格。
- **临时侧栏聊天**：`/侧栏` 使用当前模型开启独立文字讨论，关闭时停止并清空；`/侧栏（网页版）` 使用 DeepSeek 临时网页会话，关闭时删除对应官网对话，失败可重试。
- **完整回合撤回**：内置 DSH Rewind，提供消息旁撤回、空闲时双击 Esc、`/rewind` 和 `/undo`。确认后原地回退对话与已有检查点的文件修改，文字、图片和文件回填草稿；外部文件冲突保留现场，旧消息没有文件检查点时明确限定为对话回退。
- **扩展管理**：在插件页集中管理 Skill、MCP、指令文件、自定义命令与 Hooks，提供来源分组、服务器和工具开关、文件编辑、命令模板及 Hook 试运行记录。
- **Glyph 动态字符外观**：新增立体字符鲸鱼、局部扰动与波纹、字符控件和思考强度联动。可与 DSH 原生及另外四套主题切换，配合 29 套配色；已有外观偏好保留。
- **dsh-ops 接入**：第三方功能页提供匹配宿主的固定兼容包，署名原作者 T-Auto；支持文件、文档、命令和按需工具能力，PTC 可使用类型化工具及后台任务查询、输出与取消。

### 体验优化

- 提示词优化统一到一个 **✨** 入口：悬停展开，点击切换每次发送前自动轻润色；浮层保留模式、要求预设、手动开始／停止及版本操作，支持键盘进入与退出。
- 设置集中到一页，第三方功能使用独立子页；人格编辑对象与全局选择分开，会话设置和保存错误保持清晰。Ultra 记住子模式，Agent Team 随宿主原生能力可用，运行中变更在下一轮生效。
- 记忆范围移入主会话的权限菜单，首次发送后显示固定范围；人格选择与文件权限各自生效。Dream 设置回到统一设置页，历史加载条数移至“高级 → 其他”，版本与扩展更新集中在“关于”。
- 来源入口合并原生附件、OpenCU 网页、交付文件和 WebMCP 记录；保留已有来源标签页。控制台刷新保持当前阅读状态，Escape 只关闭最上层，BT 提醒使用原生勾选项。
- 减少长会话中的重复布局、外观扫描和不必要的初始客户端加载；Glyph 复用形变与遮挡计算，保留正文、动画、滚动、选中和输入行为。
- 监控概览复用用量、归因、计价和筛选结果，价格改变后更新计算；保留调用顺序、分页详情和未知用量的区分。
- OpenCU 复用已交付监看图片、活动监测脚本和同次目标描述，明确目标选择避免重复发现；worker 进度只传新增显示文本，保留完整 AX、最终输出、附件与界面历史。
- OpenCU 将连续浏览器预览合成移出 UI 线程，只在停靠交接等需要时读取浮动窗口图片；只请求截图时避免多余无障碍处理，按需观察仍保留完整 AX 和详情。图片基线丢失或窗口重载后恢复完整画面。

### 问题修复

- 修复独立聊天首次发送／新建草稿的服务作用域错误，以及切换会话时目录准备未及时取消的问题；保留草稿、附件和已获宿主接纳的发送结果。
- 修复模型与 Ultra 保存准备期间的并发变更、能力失效及失败后旧选择残留；保存结束核对当前状态，显式重试，不自动重放失败写入。
- 修复临时聊天发送、关闭和清理之间的竞态；网页聊天恢复独立脚本执行和原生窗口拖动行为。
- 修复原文保存／恢复、Dream 来源替换／撤回和上下文压缩事务的生命周期问题；写入失败保留原资料，已完成的部分成果和可重试状态继续保留。
- 修复设置与排队压缩尚未持久化就生效、取消后误丢队列，以及关闭整理时的释放问题；明确保存成功后再发布状态，Auto Compact 和手动整理继续使用一致的原文与事务边界。
- 修复旧会话迁移对同路径恢复文件的错误缓存，以及来源替换后 Dream 继续引用旧材料的问题；迁移记录、原始日志与失败恢复信息保留。
- 修复任务验证工作目录漂移、后续取消丢失前序结果和旧结果覆盖新任务；按真实执行状态记录证据。修复 CodeGraph 就绪后不刷新及退出清理问题。
- OpenCU 修复目标替换、浏览器恢复、挂起读取与输入释放之间的冲突，贯通扩展选择／聚焦取消；停止失败保留再次释放的机会，空闲会话退出也处理尚未确认释放的输入。
- OpenCU 在工具单元失败前收尾已派发调用，避免失败结果返回后遗留请求继续改变目标。目标发现、选择、恢复和扩展读取的取消按各自所有者隔离，迟到回执不覆盖新绑定。
- 改进 Windows 控件所属窗口校验、原生读树超时与授权等待诊断；修复顶栏拖动、侧栏分隔线及用量图悬停对布局的影响，并隔离可选组件启动失败。
- 插件安装／更新／停用依据原生管理器的实际回执展示状态，拒绝、失败与需重启不再混为成功；宿主适配在真实激活完成后确认设置，失败可用原值重试。

### 其他变更

- **独立插件架构**：Workflow、Rewind、Persona、Extensions 和 DeepSeek Workbench 各自承担执行、恢复、人格、扩展接入与网页工作台职责，拥有独立插件入口。OMD 组合这些能力；主题基座与 Glyph 作为不同产品提供主题管理和字符外观。[完整架构与发行状态](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/architecture.md)。
- **共装与生命周期**：匹配的内置／独立入口协调服务和界面归属，避免重复工具与按钮；停用一方保留仍启用方的能力。基础对话先建立，可选增强按独立作用域挂载，缺依赖或启动失败时保留基础会话与恢复提示。
- **数据与状态归属**：人格迁移到按 profile 保存的独立数据；撤回备份、工作流预算与项目脚本、网页导入各自保留。任务从原生 `todo/write` 恢复，监控从实际调用回执派生，工具精简视图保留可回查原文；完整备份需覆盖这些数据。
- **构建与交付**：源码主线不跟踪完整客户端编译产物，普通更新安装固定 Release 工件；体积较大的主题资源、Glyph 和 OpenCU 客户端能力按需加载。保留必要来源、许可和宿主依赖，不再提供旧 alpha／0.2.0 的当前构建入口。
- 包、预设与数据入口统一为 **oh-my-dsh**，升级自动迁移已有配置与会话，保留模型、凭据、附件、第三方插件和用户数据。见[包名迁移说明](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/upgrade.md#package-name)。
- 内置 OpenCU 保持 2.0.6，并整合后续质量与传输改进。dsh-ops 固定上游 0.4.1；原生工具替换、OPS 面板与 TUI 入口默认关闭，停用保留数据。
- 分别准备精确匹配 DSH 0.2.1-rc.1／rc.2 的包。完整内置浏览器、批注和原生监看继续需要对应宿主适配；BC 的已适配范围见上文。

<a id="en-0990"></a>

## English

Version 0.99.0 brings together the changes since public release 0.18.8. It is not yet published. These notes are being prepared, and the earlier 0.19.0 drafts are not installation targets.

### New Features

- **Context optimization and original-result archives**: shortens supported read-only tool results by default, reusing a complete file baseline only when it remains in the current request. Tool cards offer **View original** with head/tail, line ranges, search and continuous paging. Evidence archives support import, export and recall from legitimate conversation branches.
- **On-demand discovery and content views**: `tool_find` locates optional tools available to the current session; `context_view` offers raw, structured, article, outline and query views of files, pages and saved originals; `code_search` provides AST patterns across 16 bundled grammars alongside CodeGraph's index and relationship queries.
- **Optional Billion Context compaction**: choose OMD or BC per conversation while retaining Dream, archives, original and attachment recall, tasks, personalities, side questions, branches and rewind. The current BC integration targets DSH 0.2.1-rc.2 with billion-context 0.1.202.
- **Personality management**: separate identity, language style, communication and answer presentation; manage presets, duplicate and edit them, import/export JSON and use an AI creation prompt. Main conversations can inherit the global personality, select their own or turn it off.
- **Temporary sidebar chats**: `/侧栏` starts an independent text conversation using the current model and clears it when closed. `/侧栏（网页版）` opens a temporary DeepSeek website conversation; closing deletes that website conversation, with retry on cleanup failure.
- **Complete turn rewind**: includes DSH Rewind with message actions, double Escape while idle, `/rewind` and `/undo`. Confirmation rolls back the conversation in place and restores checkpointed file changes, returning text, images and files to the draft. External file conflicts preserve the current state; older turns without file checkpoints explicitly support conversation-only rollback.
- **Extension management**: manage skills, MCP, instruction files, custom commands and hooks from the plugin page, including source groups, server/tool switches, file editing, command templates and hook trial-run history.
- **Glyph character appearance**: a three-dimensional character whale, local ripples, character controls and reasoning-intensity effects. Switch between Glyph, native DSH and four other themes, with 29 palettes and retained appearance preferences.
- **dsh-ops integration**: install a fixed compatibility package for the matching host from Third-party features, crediting T-Auto. It provides file, document, shell and on-demand tool capabilities; PTC supports typed tools and background-job listing, output and cancellation.

### Improvements

- Unifies prompt optimization behind **✨**: hover to open the panel and click to toggle automatic light polishing before each send. Modes, saved requirements, manual start/stop, versions and keyboard navigation remain available.
- Consolidates settings into one page with a separate third-party page. Personality editing stays separate from the global selection. Ultra remembers its submode, follows native Team availability and applies changes on the next turn.
- Moves memory scope into the main-session permissions menu, showing the fixed scope after first send. Personality and filesystem permissions remain separate. Dream settings use the unified page, history page size moves to Advanced → Other, and versions/feature updates are grouped under About.
- Unifies sources across native attachments, OpenCU pages, delivered files and WebMCP records while retaining saved source tabs. Console refresh preserves reading state, Escape closes only the top layer, and BT reminders use native checked items.
- Reduces repeated long-history layout, appearance scans and initial client loading. Glyph reuses deformation and occlusion calculations while retaining content, animation, scrolling, selection and input.
- Reuses monitoring usage, attribution, pricing and filter calculations, refreshing costs when prices change while preserving call order, detail pagination and unknown-usage semantics.
- OpenCU reuses delivered preview images, installed activity scripts and same-request target metadata; exact target selection avoids repeated discovery. Worker progress transfers newly appended display text while retaining complete AX, final outputs, attachments and UI history.
- Moves continuous browser-preview composition off the UI thread and reads floating-window images when needed for dock handoffs. Screenshot-only observation avoids unnecessary accessibility processing; AX/detail requests retain their information. Lost image baselines and window reloads restore full frames.

### Bug Fixes

- Fixes service-scope failures during projectless first-send/draft creation and cancels remaining directory preparation when navigating away, preserving drafts, attachments and messages already accepted by the host.
- Handles concurrent model/Ultra changes, unavailable capabilities and stale choices after failed saves. Reconciles state after saving and supports explicit retry without replaying failed writes automatically.
- Fixes temporary-chat send/close/cleanup races, restores standalone webpage scripts and uses native drag behavior for web-chat headers.
- Fixes original-result publication/restoration, Dream source replacement/withdrawal and context-transaction lifecycle issues, retaining original material, completed progress and retryable state when writes fail.
- Fixes settings and queued compaction taking effect before persistence, queues lost on cancellation and cleanup during shutdown. State is published after successful persistence; Auto Compact and manual processing retain consistent original-data and transaction boundaries.
- Fixes stale migration caches after restoring files at the same path and Dream retaining replaced source material. Migration records, original logs and failure-recovery information are preserved.
- Keeps task verification tied to its starting directory, retains earlier results after cancellation and prevents old results from overwriting edited tasks. Fixes CodeGraph refresh and shutdown cleanup.
- OpenCU handles replaced targets, browser recovery, stalled reads and input release together, including cancellation through extension selection/focus. Failed stops retain release responsibility for an explicit retry, including idle-session shutdown.
- Settles dispatched computer calls before returning a failed cell, preventing leftover requests from changing targets after failure is reported. Discovery, selection, recovery and extension-read cancellation retain owner isolation; late receipts cannot replace a newer binding.
- Improves Windows control/window ownership checks, native-tree timeout and approval-wait diagnostics; fixes titlebar dragging, sidebar resizing and usage-chart hover layout, and isolates optional-component startup failures.
- Uses actual native-manager receipts for install/update/disable status, distinguishing rejection, failure and restart-required outcomes. Host adapters acknowledge settings after real activation and allow retrying unchanged values after failure.

### Other Changes

- **Independent plugin architecture**: Workflow, Rewind, Persona, Extensions and DeepSeek Workbench own execution, recovery, personalities, extension access and the web workspace through separate plugin entries. OMD composes these capabilities; theme management and Glyph remain distinct products. [Architecture and release status](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/architecture_EN.md).
- **Coinstallation and lifecycle**: matching embedded/independent entries coordinate service and UI ownership, avoiding duplicate tools and controls. A still-enabled owner retains the capability. Core conversations start first; optional features mount in separate scopes, preserving basic conversations and recovery notices on startup failure.
- **Data and state ownership**: personalities migrate into profile-scoped storage; rewind backups, workflow budgets/project scripts and website imports retain their locations. Tasks restore from native `todo/write`, monitoring derives from actual receipts, and compact tool views retain retrievable originals. Full backups include these stores.
- **Build and delivery**: the source branch no longer tracks complete compiled client artifacts; normal updates install fixed Release assets. Large theme resources, Glyph and heavier OpenCU capabilities load on demand. Required provenance, licenses and host dependencies remain; current build targets no longer include old alpha/0.2.0 hosts.
- Unifies the package, preset and data entry points under **oh-my-dsh**, automatically migrating existing configuration and conversations while retaining models, credentials, attachments, third-party plugins and user data. See the [package migration guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/upgrade_EN.md#package-name).
- Bundled OpenCU remains at 2.0.6 with subsequent quality and transport improvements. dsh-ops pins upstream 0.4.1; native-tool replacement, its panel and TUI entry remain off by default. Disabling retains data.
- Separate packages are planned for the exact DSH 0.2.1-rc.1 and rc.2 versions. Full embedded browsing, annotations and native monitoring still require matching host adapters; BC support is scoped above.

## 安装 / Installation

**待发布：以下固定地址在正式发布后生效。现在安装请使用 [0.18.8 公开发行](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.2.omd.0.18.8)。**

**Pending release: these fixed URLs become available when published. For installation now, use the [public 0.18.8 release](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.2.omd.0.18.8).**

打开 **插件 → ＋ 添加插件**，使用与当前 DSH **完整版本**一致的包；保留原 profile、配置和数据，等任务结束后重启对应实例。Open **Plugins → Add Plugin**, match the **complete DSH version**, retain the existing profile and data, and restart the instance after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.2 | [OMD 0.99.0](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.99.0/oh-my-dsh-0.2.1-rc.2.omd.0.99.0.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.99.0/SHA256SUMS) |
| 0.2.1-rc.1 | [OMD 0.99.0](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.99.0/oh-my-dsh-0.2.1-rc.1.omd.0.99.0.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.99.0/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install_EN.md) · [升级与包名迁移](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/upgrade.md#package-name) · [Upgrade and migration](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/upgrade_EN.md#package-name)

---

## 0.18.8（DSH 0.2.1-rc.1 / rc.2）

- 修复 `/btw` 侧问在 DSH 0.2.1 rc.1／rc.2 上启动失败（`ctx.subagents.start is not a function`）：宿主已移除一次性 fork 入口，改用 `startActivation` 以调用方交付启动原生 fork 子会话，答案只回到指令结果，取消时结束子运行。
- 其他功能与内置 OpenCU 2.0.6 不变。

- Fixes `/btw` side questions failing to start on DSH 0.2.1 rc.1/rc.2 with `ctx.subagents.start is not a function`: the one-shot fork entry no longer exists, so the native fork sub-context now starts through `startActivation` with caller delivery, keeps its answer in the command result, and ends the child when cancelled.
- No other functional or bundled OpenCU changes.

## 0.18.7（DSH 0.2.1-rc.1 / rc.2）

- 内置 OpenCU 2.0.6，为真实 REA 地址建议补齐当前会话的 ThreadScope／RouteScope，修复建议入口触发的 `Missing scope instance`。
- 保留地址建议选择、Escape 关闭和后续编辑，以及 DSH 原生输入与既有配置。

- Bundles OpenCU 2.0.6 with the current conversation's ThreadScope/RouteScope for the original REA address suggestions, fixing `Missing scope instance` in that suggestion entry.
- Preserves suggestion selection, Escape dismissal, continued editing, native DSH input and existing preferences.

## 0.18.6（DSH 0.2.1-rc.1 / rc.2）

- 默认直接复用 DSH 原生主题，移除独立默认皮肤对侧栏、顶栏、输入区、消息和过程区的额外视觉覆盖。
- 通用按钮、输入、选择器、开关、复选框、版本弹窗、状态标签、图标和上下文折叠使用 DSH 真实组件与必要薄适配。
- 保留四个可选主题及独立配色、背景、高级定制，兼容已有 `default` 设置；保留模型／Ultra、BT、记忆／Dream、优化器、控制台、总览、子会话和电脑操作。
- 保留现有配置、历史、附件、用户数据和第三方插件；内置 OpenCU 继续为 2.0.5，宿主不变。

- Uses the native DSH theme directly by default, removing extra visual overrides from the sidebar, header, composer, messages and process area.
- Shares real DSH controls, dialogs, status tags, icons and context disclosure rows through thin adapters.
- Preserves the four optional themes, palettes, backgrounds, advanced preferences and existing `default` settings, along with all functional extensions and third-party plugins.
- Keeps bundled OpenCU 2.0.5 and the matching host unchanged.

## 0.18.5（DSH 0.2.1-rc.1 / rc.2）

- 内置 OpenCU 2.0.5，修复 macOS 后台鼠标事件缺少目标窗口身份和局部坐标导致点击无效的问题，保留请求的修饰键与输入释放机制。
- 原生光标限制在目标窗口范围并跟随其层级，窗口被遮挡时光标也被遮挡；隐藏或移动目标后清除旧光标。
- 预览悬浮窗跟随 DSH 主窗口层级，任务更新、重新显示和转移动画不会将其独立提升为全局置顶。

- Bundles OpenCU 2.0.5 with correctly bound macOS background pointer events, preserving requested modifiers and input release.
- Clips the native cursor to its target window and follows its stacking order, hiding stale cursors when the target hides or moves.
- Keeps preview windows at their DSH owner's stacking level during updates, display and transfer animations.

## 0.18.4（DSH 0.2.1-rc.1 / rc.2）

- 2026-10-19 同版本修订：修复 Todo／验证工具在原生函数调用中因参数 schema 顶层不是 object 而被模型服务拒绝；保留 TypeScript／Python SDK 参数说明和每种操作的执行前校验。此前下载本版的用户需重新安装更新后的包。
- 恢复原 Workflow 的 Ultra 投入要求，将独立方案比较、多角度调查、迭代完善和覆盖说明完整共享到三种模式；明确所有参与代理负责实现至完成，不固定人数或流程。
- 修复本地搜索程序执行权限及 Todo／验证工具的 TypeScript 参数投影。
- 内置 OpenCU 2.0.4，补齐断线释放回执、旧连接明确确认恢复及冷启动恢复。

## 0.18.3（DSH 0.2.1-rc.1 / rc.2）

- Ultra 的 Workflow、Agent Team、自由共用同一质量与主动性要求；实质任务默认及时委派并持续完善，只区分协作方式，不固定人数或流程。
- 修复 Dream 项目／全局记忆重建时旧消费进度导致后续来源遗漏的问题。
- 内置 OpenCU 2.0.3：JavaScript 同步超时可终止，取消和重置隔离迟到结果，原生组合键保留已有持键。
- 整合会话热替换消费门控、文档保存排空与断线恢复的生命周期修复。

- Ultra Workflow, Agent Team and Free share the same quality and initiative requirements while retaining their own collaboration methods, without fixed team sizes or phases.
- Fixes stale consumption progress during project/global memory rebuilds.
- Bundles OpenCU 2.0.3 with terminable JavaScript execution, cancellation/reset isolation and held-key protection.
- Includes conversation hot-reload gating and document save/disconnect lifecycle fixes.

## 0.18.2（DSH 0.2.1-rc.1 / rc.2）

### 问题修复

- 后台进程页恢复 DSH 原生紧凑列表、任务分组、折叠与停止按钮；长命令单行截断，输出按需展开。修复原生插件重载后后台进程、Team 和 Workflow 总览样式丢失。
- 修复 Ultra 已保存子模式恢复、当前与下一轮状态显示，以及保存完成前读取旧设置的问题。
- 修复会话卸载时共享输入服务的生命周期与原生模型标签槽位归属，保留第三方控件和模型名称显示。
- 内置 OpenCU 2.0.2：审批绑定最终操作目标与身份；停止操作能取消控制器、macOS 只读观测和浏览器扩展观测，并释放输入。
- 固化 OpenCU 两套匹配宿主的 SDK／前端依赖锁，构建与安装包保持一致。
- 修复 Chrome／Edge 连接页说明被压成单字列，以及子智能体详情返回时新增标签的问题。
- Ultra 自由／Agent Team 与预算提醒统一使用英文指令；人格提示、提示词优化器、界面与用户输入保留原样。

### Bug fixes

- Restores the native DSH background-job list, compact grouping, collapse controls and stop buttons. Long commands stay on one line and output expands on demand. Overview styles survive native Jobs, Team and Workflow plugin reloads.
- Fixes saved Ultra submode restoration, current-versus-next-turn state and reads racing pending saves.
- Fixes shared input-service disposal and native model-label slot ownership while retaining third-party controls.
- Bundles OpenCU 2.0.2 with approval bound to the final target and identity, cancellable controller/macOS/browser observations, and input release on stop.
- Locks the matching OpenCU SDK and frontend dependencies for each host build.
- Fixes collapsed Chrome/Edge connection instructions and extra tabs when returning from a subagent detail.
- Uses English instructions for Ultra Free/Agent Team and budget reminders. Personality prompts, the prompt optimizer, UI and user content remain unchanged.

Separate packages target the complete DSH versions 0.2.1-rc.1 and 0.2.1-rc.2. Full desktop CU still requires matching host adapters.

## 0.18.1（DSH 0.2.1-rc.1 / rc.2）

[中文](#zh) | [English](#en)

<a id="zh"></a>

## 中文

本次更新包含自 0.17.4 以来的改进，并修复 0.18.0 的预设入口回归。0.18.0 已撤回，请直接使用 0.18.1。

### 新增功能

- 新增可选的记忆预处理缓存开关，位于“常用 → 预处理范围”，默认关闭；开启后复用成功主请求的前缀与模型路由。
- Ultra 提供 Workflow、Agent Team、自由三种子模式。首次默认自由；旧 Pro 设置迁移为 Workflow，Agent Team 仍遵循 DSH 原生开关。
- 扩充原生会话总览，集中查看产出、来源、后台命令、工作流、子智能体和电脑操作；子智能体可直接进入右侧真实会话。

### 体验优化

- Ultra 开启后可立即选择子模式，保存中的切换按顺序处理；跨工作区转交保留模式与已保存的子模式。
- 减少正文和右侧面板变化引发的无关侧栏扫描，以及预算结算的重复写入；保留同步落盘和失败恢复。
- Auto Compact 在同一批同步处理中复用上下文索引，异步边界后重新读取；子会话隐藏只适用于主会话的设置。

### 问题修复

- 修复预设选择器和会话标题旁预设名称消失：先建立原生扩展槽，再开放会话服务；服务就绪后才挂载会话内容。
- 修复打开子智能体或代码预览时会话正文横移、遮挡，以及内置与独立 OpenCU 共装时的总览组件归属冲突。
- 修复默认可见审批、取消及停止后的输入释放；恢复 Web CU 扩展连接与中断后的操作链路。
- 修复 Purge 共存时 shell 的 file URL 注册识别；重新加载后台任务服务后重新绑定其设置归属。
- 内置 OpenCU 修复高分屏图像批注坐标与 SVG 批注导出。计划模式只在明确 approved: true 时退出，工具提示遵循实际 programFormat。

### 其他变更

- 内置 OpenCU 2.0.1，MCP client 更新至 2.2.0。安装指南提供“复制给 AI”和“添加插件”两种路径。
- 分别提供匹配 DSH 0.2.1-rc.1 与 rc.2 的构建。完整内置浏览器和原生监看仍需对应宿主适配；插件不会自动替换宿主。

<a id="en"></a>

## English

This release includes the changes since 0.17.4 and fixes the missing preset controls in 0.18.0. The withdrawn 0.18.0 release is superseded by 0.18.1.

### New Features

- Optional memory preprocessing cache under General → Preprocessing scope. It is off by default and can reuse the prefix and model route from a successful main request.
- Ultra now offers Workflow, Agent Team and Free modes. Free is the initial default; legacy Pro selections migrate to Workflow, and Agent Team follows the native DSH setting.
- The native session overview brings together outputs, sources, background commands, workflows, subagents and computer activity. Subagent entries open their real conversations in the right pane.

### Improvements

- Ultra submodes are immediately selectable when enabled, with saves processed in order. Workspace transfers retain the mode and saved submode.
- Reduces unrelated sidebar scans and duplicate budget writes while retaining durable accounting and failure recovery.
- Auto Compact reuses its context index within a synchronous batch and refreshes it after asynchronous work. Main-session-only settings stay hidden in child conversations.

### Bug Fixes

- Restores the preset selector and preset name beside the session title. Native slots are declared before the conversation service becomes available, and session content waits for service readiness.
- Fixes displaced or clipped conversation content when opening subagents or code previews, and resolves overview ownership conflicts between bundled and standalone OpenCU.
- Fixes visible approval handling, cancellation and input release on stop, plus extension reconnection and recovery in Web CU.
- Fixes shell file-URL registration with Purge and rebinds background-job settings after the job service reloads.
- Bundled OpenCU fixes high-DPI annotation coordinates and annotated SVG export. Plan mode exits only with explicit approved: true, and tool instructions follow the actual programFormat.

### Other Changes

- Bundles OpenCU 2.0.1 and updates MCP client to 2.2.0. Installation guides cover both AI-assisted setup and the Add Plugin dialog.
- Separate builds target DSH 0.2.1-rc.1 and rc.2. Full embedded-browser and native-monitoring surfaces still require matching host adapters; installing a plugin does not replace the host.

## 0.18.0（已撤回；DSH 0.2.1-rc.1 / rc.2）

2026-10-18 因预设选择入口缺失撤回两套发行，安装入口已恢复为上一版。以下为撤回版本的变更，不代表重新发布。

- 新增默认关闭的记忆预处理缓存开关，整合 Ultra 子模式与原生会话总览。
- 修复审批、Web CU 停止与恢复、Purge shell 注册兼容、子智能体／代码预览导致会话横移。
- 内置 OpenCU 2.0.1，修复图像批注错位与 SVG 批注导出；Ultra 切换时即可选择子模式。
- 更新 MCP client 至 2.2.0；安装指南同时提供可复制给 AI 的完整指令和“添加插件”固定链接。

## 0.17.4（DSH 0.2.1-rc.1 / rc.2）

- 修复输入栏同时显示“OMD 思考强度”和原生模型按钮的问题，恢复合并的模型与思考强度入口。
- 兼容官方模型标签子槽，保留第三方模型控件的优先级和原生子槽归属。

## 0.17.3（发行版；DSH 0.2.1-rc.2）

- 对齐官方 `687f282e` 的精确 SDK、组件快照与依赖锁，保留原生 DeepSeek Search／Fetch API 与设置入口。
- 内置 OpenCU `2.0.0`，整合最新悬浮监看异步采集／隐藏修复，以及截图重试、后台按钮和签名 Helper 执行权限修复。
- 将当前未提交功能、性能成果和新版中英文介绍／视觉素材一并收拢；IUI `1.0.9`、OMAA `0.15.3` 配套独立发行。
- 仅做必要构建、类型与发行文件核对；未公开发布或部署，不改当前 DSH。

## 0.17.2（本地候选；DSH 0.2.1-rc.1）

- 对齐官方 rc.1 SDK、Chat／Conversation／宿主组件、Cordis `4.0.5`、Schemastery `3.18.5` 和依赖锁，不放宽版本检查；保留旧宿主独立构建入口与历史工件。
- 适配新版语义草稿和命令 chip 恢复，保留引用、附件及失败发送；Workbench 桥接保留当前 CU 异步释放保护。
- 内置 OpenCU `0.1.2`，与独立包使用同份完整核心及真实 REA 前端；IUI `1.0.8`、OMAA `0.15.2` 使用各自匹配 SDK 与锁。
- 当前版本尚未公开发布。

## 0.17.1（本地候选；DSH 0.2.0-rc.2 / 0.2.1-alpha.3）

- 保留 0.17 非 CU 成果，分别使用匹配 SDK、Cordis、Schemastery、官方 Chat/Conversation 组件与冻结锁构建；宿主差异集中管理。
- 对接 alpha.3 原生 Jobs、Loader 热替换及工作流身份；保留后台投递、草稿恢复、journal/resume、预算和 continuable 子代理增强。
- 内置新版 OpenCU 0.1.1；独立与共装复用相同核心，真实 REA 组件和各平台源码保留，桌面功能须使用匹配 OpenCU 宿主适配。
- 保留 OMAA 可选增强、独立基础预设、工作流组合及前端所有权。IUI 与 OMAA 独立发行，不塞入 OMD 包。
- 右侧栏 OMD 四页合并为单入口“OMD 控制台”：概览、上下文、记忆、调用日志、后台日志，窄栏顶部标签、宽栏／全屏左侧导航；任务证据改由 BT 菜单“查看任务证据”打开，旧标签自动转到对应分区。只用原生右侧栏注册与插槽，不改 DSH 预构建组件。
- 输入框下方信息栏：按宿主自带 id 同 id 替换统计项（alpha.3 `activity`／`usage`，rc.2 `stats`），读数、格式与“简洁／详细”设置同原生；弹窗加 OMD 后台另计用量和控制台跳转。新增“上下文整理”项（整理中、可替换预计与一键应用）和 Dream 作业项。
- 监控账本新增后台事件表（只加表，schema 版本不变）及 `/oh-my-dsh/api/monitor/events`、`/monitor/live`；上下文视图新增已准备替换与 `/compact-p` 的预计节省；趋势按宿主本地时间补齐空档。
- Auto Compact：按当前上下文 token 阈值（默认关，预填 400k）立即准备并应用，支持“摘要＋资料／仅摘要”。
- 当前版本尚未公开发布。

## 更早版本 / Earlier releases

0.17 之前的版本见 [GitHub Releases](https://github.com/gulagala001/oh-my-dsh/releases)。Earlier versions are listed on GitHub Releases.
