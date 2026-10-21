# OMD 0.19.0 · DSH 0.2.1-rc.1 / 0.2.1-rc.2

[中文](#zh-0190) | [English](#en-0190)

<a id="zh-0190"></a>

## 中文

### 新增功能

- “Oh My DSH → 第三方功能”新增 dsh-ops，署名原作者 T-Auto。开启后安装与当前完整宿主版本匹配的固定兼容包，提供文件、文档、命令操作和按需工具加载。
- 普通模式保留 DSH 原生工具；PTC 模式支持 OPS 类型化工具及后台任务查询、输出与取消。

### 问题修复

- 统一 PTC 工具探测与实际请求的展示结果，避免 OPS 工具反复发布、撤回；业务工具仍通过 run_code 调用。
- 修复固定 OPS 工件中的宿主作用域模块解析、POSIX worker 执行权限和兼容版本的来源回执校验。

### 其他变更

- 固定上游 dsh-ops 0.4.1，分别提供精确匹配 DSH rc.1／rc.2 的兼容工件并校验 SHA-256；目录更新不跟随 latest。
- 原生工具替换、OPS 面板和 TUI 入口默认关闭。停用保留配置与数据；不支持的宿主或原生运行时目标不提供安装入口。
- 内置 OpenCU 继续为 2.0.6。

<a id="en-0190"></a>

## English

### New Features

- Adds dsh-ops under Oh My DSH → Third-party features, crediting T-Auto. Enabling it installs a fixed compatibility package for the exact host version, providing file, document, shell and on-demand tool capabilities.
- Native mode retains DSH tools; PTC supports typed OPS tools and background-job listing, output and cancellation.

### Bug Fixes

- Makes PTC presentation probes and real requests expose the same controls, avoiding repeated OPS publication and withdrawal. Business operations still use run_code.
- Fixes host scope-module resolution, POSIX worker executable permissions and provenance validation for the fixed OPS compatibility packages.

### Other Changes

- Pins upstream dsh-ops 0.4.1 with separate, SHA-256-verified packages for DSH rc.1 and rc.2. Catalog updates do not follow latest.
- Native-tool replacement, the OPS panel and TUI entry remain disabled by default. Disabling retains settings and data; unsupported hosts and native runtime targets cannot install through the catalog.
- Bundled OpenCU remains at 2.0.6.

## 安装 / Installation

仅使用与当前 DSH **完整版本**匹配的包。打开 **插件 → ＋ 添加插件**，粘贴对应地址；保留原 profile、配置和数据，当前任务结束后重启对应实例。

Use the package matching the **complete DSH version**. Open **Plugins → Add Plugin**, paste the matching URL, keep the existing profile and data, and restart the instance after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.2 | [OMD 0.19.0](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.19.0/trisoul_x-0.2.1-rc.2.omd.0.19.0.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.19.0/SHA256SUMS) |
| 0.2.1-rc.1 | [OMD 0.19.0](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.19.0/trisoul_x-0.2.1-rc.1.omd.0.19.0.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.19.0/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md) · [dsh-ops 使用指南 / dsh-ops guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/dsh-ops.md)

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
- 监控账本新增后台事件表（只加表，schema 版本不变）及 `/trisoul-x/api/monitor/events`、`/monitor/live`；上下文视图新增已准备替换与 `/compact-p` 的预计节省；趋势按宿主本地时间补齐空档。
- Auto Compact：按当前上下文 token 阈值（默认关，预填 400k）立即准备并应用，支持“摘要＋资料／仅摘要”。
- 当前版本尚未公开发布。

## 更早版本 / Earlier releases

0.17 之前的版本见 [GitHub Releases](https://github.com/gulagala001/oh-my-dsh/releases)。Earlier versions are listed on GitHub Releases.
