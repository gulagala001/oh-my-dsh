# 插件架构与安装方式

[English](architecture_EN.md) · [文档目录](README.md) · [插件共用](plugin-compatibility.md) · [0.99.1 更新说明](release-0.99.1.md#zh-0991)

OMD 0.99.1 同时整理了功能和插件边界：工作流、回合撤回、人格、扩展管理与网页工作台都有各自的插件入口；主题管理和 Glyph 也有独立产品形态。OMD 继续提供组合好的工作台，独立插件则按自己的定位、宿主范围和版本发行。

本页介绍 OMD 0.99.1 的插件结构与对应正式发行。Glyph 随主题插件提供。

## 哪些能力可以独立选择

| 产品 | 负责的能力 | 在 OMD 中怎样使用 | 独立分发状态 |
| --- | --- | --- | --- |
| **OpenCU** | 浏览器与原生应用操作、观察、批注、监看和来源 | 已内置，沿用独立插件与内置方共用的入口 | [2.0.7](https://github.com/gulagala001/opencu/releases/tag/v2.0.7-dsh.0.2.1-rc.2)，分别有 rc.1／rc.2 包 |
| **DSH Workflow** · `dsh-workflow-plus` | 工作流脚本、子代理、阶段面板、后台执行、预算与续跑 | Ultra 的 Workflow 路径及工作流工具使用该能力；原生团队仍由 DSH 提供 | [0.1.2，DSH rc.2](https://github.com/gulagala001/dsh-workflow/releases/tag/v0.1.2-dsh.0.2.1-rc.2) |
| **DSH Rewind** · `@gulagala001/dsh-undo-plugin` | 回合撤回、已有检查点的文件恢复、撤销撤回与草稿回填 | 已内置，通过消息按钮、双击 Esc、`/rewind` 与 `/undo` 使用 | [0.1.1，DSH rc.2](https://github.com/gulagala001/dsh-undo-plugin/releases/tag/v0.1.1-dsh.0.2.1-rc.2) |
| **DeepSeek Workbench** · `dsh-deepseek-workbench` | 网页聊天、临时网页侧栏、开放平台及历史导入 | 在 **Oh My DSH → 功能** 中开关，保留网页聊天与账号入口 | [0.1.1，DSH rc.2](https://github.com/gulagala001/dsh-deepseek-workbench/releases/tag/v0.1.1-dsh.0.2.1-rc.2) |
| **Extensions** · `dsh-extensions` | Skill、MCP、指令文件、自定义命令和 Hooks | 默认内置启用，入口在插件页 | [0.1.0](https://github.com/gulagala001/dsh-extensions/releases/tag/v0.1.0-dsh.0.2.1-rc.2) |
| **Persona** · `@gulagala001/dsh-persona-plugin` | 人格预设、四个表达模块、文件交换及会话人设 | 在 OMD 设置中编辑，在主会话权限菜单选择 | [0.1.0](https://github.com/gulagala001/dsh-persona-plugin/releases/tag/v0.1.0-dsh.0.2.1-rc.2) |
| **dsh-theme-plugin** | 外观设置、主题管理、主题市场与安装预检 | 可另行选择主题管理产品；OMD 本身保留内置外观选择 | [0.2.1，DSH rc.2](https://github.com/gulagala001/dsh-theme-plugin/releases/tag/v0.2.1-dsh.0.2.1-rc.2) |
| **DSH BTW** · `@gulagala001/dsh-btw` | 原生弹窗旁聊、历史、追问与独立取消 | 已内置，使用 `/btw`，主任务继续运行 | [0.1.2，DSH rc.2](https://github.com/gulagala001/dsh-btw/releases/tag/v0.1.2-dsh.0.2.1-rc.2) |
| **Glyph** · `dsh-glyph-theme` | 字符鲸鱼、字符控件、波纹与思考强度动效 | OMD 外观中的可选主题，新外观配置默认采用 Glyph | 随 Theme 0.2.1 提供，本次无独立发行 |

独立包按自己的版本更新。一个独立产品已经发布，不代表其旧固定包包含 OMD 当前源码的全部后续修复；请核对该产品的固定 Release 与完整宿主版本。

Intelligent UI、OMAA 等继续按各自独立产品使用；它们不是这次才变为独立插件。dsh-ops 是第三方工具产品，通过 OMD 的第三方功能页选择匹配的兼容包。

## 整套安装与共装

- 需要 OMD 工作台时，安装对应完整宿主的 OMD 包即可使用其中已内置的能力，不必逐个补装同一功能。
- 只需要某个独立产品时，按该产品的安装指南选择固定包。表中仅列 rc.2 的独立发行不能用 OMD 的 rc.1 支持范围替它担保。
- OpenCU、Workflow、Rewind、BTW、Persona、Extensions 和 DeepSeek Workbench 在匹配版本与同一宿主作用域内协调运行时和界面归属，避免重复工具、服务或按钮。停用一方时，仍启用的一方继续持有其能力。
- 在 OMD 内关闭一个功能，操作的是 OMD 的功能入口；另外安装的独立插件仍由 DSH 插件页管理。查看实际启用来源后再更新或卸载。
- 主题基座接管外观管理时保留主题与用户偏好的归属；无法完成接管会保留现有外观并显示错误。Glyph 主题包与主题管理产品是不同的安装选择。

## 核心对话与可选增强分开启动

基础 Chat／Conversation 先建立，可选的电脑操作、回合撤回、工作流及其他界面增强在各自作用域挂载。某个可选组件缺依赖或启动失败时，界面显示对应错误，并保留基础会话和恢复入口。

能力仍受真实宿主服务与系统权限约束。例如，OpenCU 的内置浏览器和原生监看需要匹配宿主适配；DeepSeek 网页持久登录与下载依赖对应桌面能力。独立插件入口不会自动升级 DSH 或替换桌面程序。

## 资源按使用场景加载

主题的较大字体／样式资源、Glyph 绘制器以及 OpenCU 中较重的客户端能力按需加载，减少启动时同步准备的内容。固定安装包携带匹配资源，切换主题和打开功能继续使用原有界面。

电脑观察按请求需要处理：只要截图的观察避免额外 AX 工作；需要 AX、差分或详情时仍保留相应信息。浮动监看复用已确认交付的图片，窗口重载或图片基线丢失时恢复完整画面。

## 原生记录与展示视图分开

任务完成状态从原生会话中的 `todo/write` 恢复，需求摘录和验证结果沿同一任务记录关联；刷新、恢复会话或取消验证不会以另一份空清单覆盖原状态。监控根据真实调用回执生成概览与明细，价格或筛选变化后重新核对派生结果。

上下文优化作用于送入模型的视图，先保存获准原文，再提供精简、差异或引用。PTC 的程序返回值保留原样，原始会话和附件仍可回查。OMD 与 BC 只协调被替代的压缩职责，Dream、档案及其他会话功能继续沿各自的数据边界工作。

## 数据由对应功能保留

独立化之后，完整备份应覆盖实际 `DSH_HOME`、profile、会话与附件，以及外部项目和浏览器本地偏好。

| 数据 | 位置或归属 |
| --- | --- |
| OMD 上下文、档案、Dream、监控 | `DSH_HOME/oh-my-dsh/`；会话原始记录和附件仍由 DSH 管理 |
| 人格与会话人设 | `DSH_HOME/dsh-persona-plugin/` 下按 profile 区分；首次接入迁移已有 OMD 人格，同名冲突保留内容 |
| 回合文件备份与恢复状态 | 默认 `DSH_HOME/rewind-plus/v1/`；自定义存储位置另行保留 |
| Workflow | 原生会话／执行记录保留原归属；独立预算在 `DSH_HOME/dsh-workflow/`，脚本与 worktree 在相应项目中 |
| 网页历史导入 | `DSH_HOME/deepseek-workbench/`；网站登录由桌面会话管理 |
| 扩展配置 | MCP、命令、Hooks 使用对应 DSH 配置；Skill 与指令文件仍在其个人／项目目录 |
| 外观与主题管理 | 浏览器本地外观／背景偏好，以及主题基座按 profile 保存的库与安装记录 |

停用插件保留用户数据。原生会话导出不等于导出了所有独立插件的数据：迁移精简结果的会话时同时携带原文档案，迁移人格时保留 Persona 数据或导出人格文件。详见[升级与备份](upgrade.md)。
