<p align="center">
  <img src="docs/images/logo.svg" width="80" height="80" alt="Oh My DSH" />
</p>

<h1 align="center">Oh My DSH</h1>

<p align="center">
  <strong>让 Agent 记住项目，跟进任务，操作网页与应用。</strong>
</p>

<p align="center">
  项目摘要 · 上下文替换 · 任务验证 · Computer Use<br />
  为 DeepSeek Harness 打造的单主模型插件
</p>

<p align="center">
  <a href="https://github.com/gulagala001/oh-my-dsh/releases/tag/v1.3.0-alpha.3"><img src="https://img.shields.io/badge/version-1.3.0--alpha.3-3478F6?style=flat-square" alt="Version 1.3.0-alpha.3" /></a>
  <a href="https://github.com/deepseek-ai/deepseek-harness"><img src="https://img.shields.io/badge/DSH-0.1.6--alpha.1-475569?style=flat-square" alt="DSH 0.1.6-alpha.1" /></a>
  <a href="#support"><img src="https://img.shields.io/badge/status-early_access-64748B?style=flat-square" alt="Early access" /></a>
</p>

<p align="center">
  <a href="#quickstart"><strong>安装插件</strong></a> ·
  <a href="#features">功能亮点</a> ·
  <a href="#computer-use">Computer Use</a> ·
  <a href="docs/usage.md">使用指南</a> ·
  <a href="https://github.com/gulagala001/oh-my-dsh/releases/tag/v1.3.0-alpha.3">版本说明</a> ·
  <a href="https://github.com/gulagala001/oh-my-dsh/issues">反馈问题</a>
</p>

<p align="center">
  <img src="docs/images/context-records.png" width="100%" alt="Oh My DSH：在对话旁查看上下文分段与项目摘要" />
</p>

Oh My DSH 把任务、上下文、摘要、电脑和监控放进同一个工作台。后台归档对话片段，在后续请求中使用已准备好的摘要或详细文档；你可以回查原文、关联任务与验证结果，也能操作网页和 Windows、Mac 应用。

作为 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness) 插件运行，沿用已有的模型配置、会话、文件、工具与技能。

<a id="quickstart"></a>

## 快速开始

当前 **1.3.0-alpha.3** 为预发布版，使用 **DSH 0.1.6-alpha.1**。下面的安装命令固定到该版本；使用旧版 DSH 0.1.5-rc.1 时，请保留 [v1.1.1](https://github.com/gulagala001/oh-my-dsh/releases/tag/v1.1.1)。升级宿主请沿用原来的安装方式、profile 和 `DSH_HOME`。

Oh My DSH 通过 **DSH 的插件管理器**安装。已有 **DSH 0.1.6-alpha.1 Web** 时，先停止服务，然后在终端或 PowerShell 中运行：

```sh
dsh plugin --profile web add github:gulagala001/oh-my-dsh#v1.3.0-alpha.3
```

按原来的方式启动：

```sh
dsh web
```

打开启动时打印的登录链接，新建会话并选择 **Oh My DSH**。输入区下方的 **工作台** 和 **电脑** 就是主要入口。

为兼容已有安装，插件 ID 与 Agent preset 继续使用 `trisoul_x` / `trisoul-x`。

需要 **Node.js ≥22.19、pnpm 11.23.0 和 Git**；Windows 使用 **PowerShell 7**。模型需支持原生工具调用，理解截图还需要图像输入能力。自定义 profile 和 `DSH_HOME` 应沿用原配置。

插件会设置 Oh My DSH 为默认 Agent preset，并应用完整文件／命令访问、关闭执行审批的配置；profile 自己的覆盖配置优先。

[Windows 安装说明](docs/windows.md#安装与试用) · [更新与卸载](docs/usage.md#安装到现有-dsh推荐) · [模型与后台配置](docs/usage.md#日常使用)

<details>
<summary>源码下载与独立开发</summary>

[1.3.0-alpha.3 源码 ZIP](https://github.com/gulagala001/oh-my-dsh/releases/download/v1.3.0-alpha.3/oh-my-dsh-v1.3.0-alpha.3.zip) 用于保存源码、手动部署或二次开发，包含已构建的界面。普通插件安装直接使用上面的命令即可。

[从源码试用](docs/usage.md#本地开发或独立试用) · [版本说明与校验文件](https://github.com/gulagala001/oh-my-dsh/releases/tag/v1.3.0-alpha.3)

</details>

## 1.3.0-alpha.3 更新

修复预处理频率计数与中枢重试串扰，避免因历史积压连续调用；同时修复 Windows 上下文档案刷盘失败。已有会话保留原文和档案，旧频率计数会一次性校正。

- **上下文档案**：后台生成事实摘要与详细文档，中枢选择保留、详细替换、简要替换或合并；请求边界应用已完成结果，原始事件仍可回查。
- **私有与项目共享**：会话隔离仅查看自己的档案；项目共享按会话和事件时间展示摘要。全局背景由用户手填，旧自动记忆与状态提炼停止运行，旧数据保留。
- **新版设置与侧栏**：频繁、适中、较少、自定义四档；支持摘要筛选、文档阅读、后台路由、身份恢复，以及浅深色与窄栏布局。
- **环境说明中性化**：统一主模型与 Computer Use 的环境措辞，保留真实路径、工具契约和用户内容。内置 OpenCU 1.0.2。

当前版本：默认整窗预处理。用户消息、提醒、旧摘要和附件不会切断窗口；系统提示词及前置 CoT 原位保留，工具往返与近期保留区仍受保护。

基础摘要只写范围内实际操作、改动与观察到的结果，简短平铺直叙，不复述需求或前文，不写未来计划和未完成事项。用户原话由程序逐字、按顺序归档；文档、图片、附件统一为“详细资料”。详细模式一起携带，简要模式一起退出上下文并保留回查索引。合并默认简要模式，不自动恢复全部文档；`recall({id, asset: 1})` 可重新打开第一个原始附件。

设置提供“按消息边界分段”（默认关闭，开启恢复兼容行为）。默认每次触发最多处理 2 个窗口、单窗输入预算约 48,000 tokens、摘要目标 1,200 字符、后台并发最多 2 个、失败最多自动重试 2 次。积压单独记录，不因一次触发完成而丢失，也不会无限清理闲置会话。后续窗口需装满新的实际消息，或达到续跑文本门槛（默认约 8,000 tokens），不因几个零碎事件继续调用。失败重试只重试一窗，不另领整批额度。中枢回答过期会直接作废，不计失败或强制重试，新的判断仍遵守频率设置。空闲预处理仍默认关闭。

替换前后使用同口径估算，计入历史推理、文本、工具往返与路由附件成本；这不是提供方的精确 token 账单。界面分别展示当前消息数、原始事件覆盖数、资料数量、剩余积压和估算节省量。图片接近请求上限时仍批量卸载旧图，原件保留。

### 版本与更新提醒

左上角品牌旁的 **ⓘ** 可查看当前版本、最新版本和更新说明，并手动检查更新。**绿点**表示有普通更新，**红点**表示尚未安装的版本中包含必要修复；查看通知不会消除更新标记，安装对应修复后才会变为绿点或消失。

客户端在页面可见时定期读取版本状态，服务端共享检查结果，正常情况下最多每 6 小时检查一次 GitHub。手动检查间隔至少 30 秒。网络失败会明确提示；同一服务进程中保留上次成功结果并标为过期，不把检查失败当作“已是最新版”。此功能仅检查公开发布信息，不调用模型、不发送会话内容、不自动安装或重启。

发布时同步更新 `package.json` 版本和 `release-manifest.json`，在清单头部添加该版本的 `version`、`severity`、`title`、`notes`，再更新 [更新记录](CHANGELOG.md)。普通更新使用 `severity: "normal"`；必须提醒用户安装的重要修复使用 `severity: "required"`。保留历史必要更新条目，避免后续普通版本掩盖仍未安装的必要修复。分级由维护者明确标记，不靠标题关键词猜测。版本判断支持数字预发布版本；正式版安装不提示升级到预览版。

### 手动压缩

右侧工作台 → **上下文 → 手动压缩** 提供与输入框一致的操作：

| 命令 | 范围 | 是否调用模型 |
| --- | --- | --- |
| `/compact` | 保留原行为：应用已准备的替换结果 | 否 |
| `/compact-p` | 全部已准备片段（包括尚为原文或已经详细替换的片段）切换为仅摘要；未处理原文不变 | 否 |
| `/compact-f` | 将当前完整对话、用户消息、工具结果、旧摘要和历史思考重新汇总为一份摘要；保留前置 Trace，不保留近期原文窗口 | 是，使用中枢的后台模型配置 |

全量模式保留系统提示词、前置 CoT、当前工具定义和用户手写全局背景，不删除原始日志或详细资料存档。图片与文件保存原始引用并可回查，不凭空生成视觉描述。全量模式可能损失细节；失败或摘要未缩短时不替换原文，写入中断使用现有事务恢复。

执行中的会话会将命令排队，在下一次请求边界执行；侧栏显示排队、生成中、失败和完成状态。手动压缩会取消本会话未完成的旧预处理/中枢请求，防止旧结果覆盖手动选择。已归档的用户原文和详细资料不会仅因合并而重新灌入；保留的前置 Trace 仍位于摘要之前。

升级前备份原 DSH 数据目录。上下文后台调用仍会产生用量，摘要不保证无损；请保留原始事件与必要的外部验证。

[完整版本说明与下载](https://github.com/gulagala001/oh-my-dsh/releases/tag/v1.3.0-alpha.3) · [身份设置说明](docs/usage.md#自定义身份认知)

<a id="features"></a>

## 为持续工作的 Agent 准备

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>记住项目约定</h3>
      <p>会话私有档案与同项目共享摘要，按时间归档。详细文档按编号回查，全局固定背景由用户手动维护。</p>
    </td>
    <td width="50%" valign="top">
      <h3>让长对话继续工作</h3>
      <p>后台准备摘要与事实文档，再应用已完成的替换决定；需要细节时，可取回详细文档或原始事件。</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>让任务有据可查</h3>
      <p>任务对应需求摘录与锚点，验证关联测试或文字证据。修改任务时撤销完成状态与旧证据，进度和结果一起查看。</p>
    </td>
    <td width="50%" valign="top">
      <h3>操作网页与应用</h3>
      <p>控制内置浏览器、已连接的 Chrome 标签与 Windows／Mac 应用。读取控件、截图、点击和输入，在实时预览中查看进展。</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>用画面说明问题</h3>
      <p>分享窗口、圈选页面、标注元素，预览宽高与颜色等样式变化；把截图和说明加入草稿，继续和助手讨论。</p>
    </td>
    <td width="50%" valign="top">
      <h3>看清每一步的开销</h3>
      <p>集中查看主模型与后台调用的 Token 用量、缓存和耗时，追踪上下文变化、摘要准备与替换记录。</p>
    </td>
  </tr>
</table>

### 一个工作台，五个入口

**任务 · 上下文 · 摘要 · 电脑 · 监控** 复用同一个右侧标签，切换时保留未保存的编辑。界面采用 DSH 与 Codex 的融合风格，统一浅色／深色主题与窄窗布局。

操作记录按 **总摘要 → 操作列表 → 单项结果／缩略图 → 大图** 逐层展开。思考、上下文注入和压缩记录统一收纳，收起再打开时保留各项展开选择；对话正文与交付结果始终是阅读重点。

输入区保留记忆范围和 **BT（Better Todo）**：待办完成提醒默认开启，验证完成提醒默认关闭，两个开关按会话独立保存。

<a id="computer-use"></a>

## 让助手操作网页与应用

Computer Use 由 [OpenCU](https://github.com/gulagala001/opencu) 提供，安装 Oh My DSH 时自动包含全部能力。只需要浏览器与桌面操控时，也可以独立安装 OpenCU；同时安装共用一套工具、连接和预览。

当前 main 源码支持 **Chrome 原生会话标签分组**：AI 控制的网页自动归入「OMD · 会话名称」，用颜色区分会话，停止后保留状态标记。需要将浏览器扩展更新到 0.1.4 并重新加载；只查看预览不接管标签，内置 `@Browser` 标签栏保持原样。

在输入区用 **`@Browser`**、已连接的 **`@Chrome`** 或应用引用选择目标，然后描述任务：

> 打开这个表单，填写我提供的内容，完成后截图并保留页面。

助手选择目标后，对话页内自动出现实时预览。拖动顶部标题栏可移动预览，点击卡片只放大查看，不改变操控目标或暂停助手。多个网页或应用以卡片堆叠；需要手动操作时，可单独停止助手，操作后再恢复控制。

![对话页内的双窗口堆叠预览与右侧实时画面](vendor/opencu/docs/images/native-preview-stack.png)

- **实时观察**：画面与助手光标同步显示；停止后仍可看图，也可选择独立弹出预览。
- **浏览器协作**：紧凑地址栏与标签页、页面查找、历史记录、下载面板和外部浏览器打开；内置页面随侧栏实际重新排版。
- **设备预览**：设置页面尺寸、旋转、调整预览比例或自动适应；拖动边框调整尺寸，支持方向键微调与 Esc 取消。
- **查看与接管**：查看其他标签时保留助手当前目标；需要手动输入时停止并接管，完成后恢复助手控制。
- **文件交付**：导出当前页 MHTML 快照，保存已加载的图片、字体、样式与视频资源，结果成为持久会话附件。
- **页面工具**：兼容的 Chromium 153+ 可发现并调用网页公开的 WebMCP 工具。

首次使用，打开 **电脑 → 运行环境与权限** 检查连接。Mac 桌面控制需要 **macOS 14+**、辅助功能与屏幕录制权限；其他平台的支持范围见下方。

### 圈出问题，再给出修改方向

用 **分享窗口** 把 Windows／Mac 窗口截图与文字加入草稿；用 **批注页面** 圈选区域或点选元素，附上修改说明。元素批注支持跨源嵌套框架。

选择元素后，可预览宽高、字号、颜色与间距。插件在真实网页临时应用样式，采集图片后恢复；把预览交给助手后，再继续修改项目源码。

<details>
<summary>查看页面批注与样式预览</summary>

<p align="center">
  <img src="vendor/opencu/docs/images/page-annotation-style.png" width="760" alt="选择页面元素、调整样式并将真实预览加入草稿" />
</p>

截图、元素上下文与说明加入现有草稿，由你检查后发送。临时样式预览本身不会修改源码。

</details>

[Computer Use 使用说明](docs/usage.md#computer-use预览版) · [平台与运行条件](docs/usage.md#平台与运行条件)

<a id="support"></a>

## 平台与运行环境

当前预发布版本为 **1.3.0-alpha.3**，适配 **DSH 0.1.6-alpha.1**。

| 功能 | 当前支持 |
| --- | --- |
| 任务、记忆、上下文与监控 | Windows、macOS、Linux 共用插件入口，独立于桌面控制。 |
| 内置浏览器 | 使用独立配置控制 Chrome／Chromium，提供实时预览、网页操作和文件交付；内置无头浏览器隐藏滚动条以保持截图布局稳定。 |
| 已有 Chrome 扩展 | 提供 Windows、macOS、Linux 的本机连接与注册，连接已有标签页，见 [Windows 使用说明](docs/windows.md)。 |
| 原生桌面与窗口分享 | macOS 14+、Windows 10 2004+。首次安装分别需要 Apple Command Line Tools 或 .NET 10 SDK；在电脑面板中完成安装、更新与连接管理。 |
| 独立弹出预览 | 需要 Document Picture-in-Picture 支持；默认页内预览不依赖该 API。 |

[Windows 安装与使用](docs/windows.md) · [完整使用指南](docs/usage.md) · [版本说明](https://github.com/gulagala001/oh-my-dsh/releases)

<details>
<summary>1.0 正式先行版 · 2026-09-13</summary>

- Windows 原生桌面、已有 Chrome 连接、应用发现与启动、中文输入、剪贴板和常用显示缩放。
- 操作记录分层展开、思考与上下文收纳，大图查看、页面批注、窗口分享与可拖动悬浮预览。
- 浏览器自适应排版、设备边框拖动、页面查找、历史记录与下载面板。
- 统一工作台和对话工具栏，完善浅色／深色主题与窄窗布局。
- 网页与 Windows／Mac 应用操控、多目标堆叠预览、窗口分享、批注和样式预览。
- 接入页面／素材导出与 WebMCP。
- 保留任务摘录、锚点和验证记录，支持原版 Agent 与 Oh My DSH 在同一宿主中切换。

</details>

## 文档与参与

- [使用与开发指南](docs/usage.md)：安装、日常操作、模型与频率配置、数据备份及测试。
- [开发与验证](docs/usage.md#开发与验证)：源码入口、运行环境与自动化测试。
- [提交问题或建议](https://github.com/gulagala001/oh-my-dsh/issues)：请附上 DSH／Node.js 版本、复现步骤与脱敏错误。

## 来源与许可

核心机制与提示词源自 trisoul；宿主与基础 Agent preset 基于 DeepSeek Harness。项目代码许可暂未指定。上游许可和来源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

<sub>截图摄于 2026-09-12，来自实际 DSH 界面的隔离测试会话，网页与窗口内容均为测试示例。</sub>
