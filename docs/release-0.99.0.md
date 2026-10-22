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

- 修复 Glyph 在工作台放大、浮窗移动／动画和关闭后残留字符或分隔线的问题；背景字符避让内嵌原生预览，隐藏控件、图标与点击光圈及时清除，停用后立即清空画布。
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

- Fixes lingering Glyph characters and dividers when expanding the workbench or moving, animating and closing floating panels. Background characters respect embedded native previews; hidden controls, icons and click rings are cleared, and disabling Glyph immediately clears its canvas.
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
