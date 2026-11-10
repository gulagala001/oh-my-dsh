# 插件结构与共装

[English](architecture_EN.md) · [文档目录](README.md) · [插件兼容](plugin-compatibility.md) · [升级](upgrade.md)

OMD 是一套装好就能用的组合。里面的 Workflow、撤回、人格、扩展管理、网页工作台等，也都能作为独立插件单独装。

## 各部分也能单独装

| 产品 | 做什么 | 在 OMD 里 | 独立版 |
| --- | --- | --- | --- |
| [OpenCU](https://github.com/gulagala001/opencu/releases) | 操作浏览器和桌面应用、观察、批注、监看 | 内置 | 2.2.11 |
| [DSH Workflow](https://github.com/gulagala001/dsh-workflow/releases) · `dsh-workflow-plus` | 工作流脚本、子智能体、阶段面板、后台执行、预算和续跑 | Ultra 的 Workflow 模式和工作流工具 | 0.1.8 |
| [DSH Rewind](https://github.com/gulagala001/dsh-undo-plugin/releases) · `@gulagala001/dsh-undo-plugin` | 撤回消息和文件、撤销撤回、内容回填 | 内置：消息按钮、双击 Esc、`/rewind`、`/undo` | 0.1.11 |
| [DeepSeek Workbench](https://github.com/gulagala001/dsh-deepseek-workbench/releases) · `dsh-deepseek-workbench` | 网页聊天、网页侧栏、开放平台和历史导入 | 在 **设置 → Oh My DSH → 功能** 开关 | 0.1.5 |
| [DSH Extensions](https://github.com/gulagala001/dsh-extensions/releases) · `dsh-extensions` | Skill、MCP、指令文件、命令和 Hooks | 默认开启，在插件页 | 0.1.5 |
| [DSH Persona](https://github.com/gulagala001/dsh-persona-plugin/releases) · `@gulagala001/dsh-persona-plugin` | 人格预设、四个模块、导入导出和会话人设 | 在 OMD 设置里编辑，在主会话权限菜单里选 | 0.2.2 |
| [DSH Theme](https://github.com/gulagala001/dsh-theme-plugin/releases) · `@gulagala001/dsh-theme-plugin` | 外观设置、主题管理、主题市场和安装检查，含 Glyph | OMD 自带外观选择，主题管理可以另装 | 0.3.3 |
| [DSH BTW](https://github.com/gulagala001/dsh-btw/releases) · `@gulagala001/dsh-btw` | 旁聊、历史、追问和单独停止 | 内置，用 `/btw` | 0.1.8 |
| [DSH Response ID Reuse](https://github.com/gulagala001/dsh-response-id-reuse/releases) · `@gulagala001/dsh-response-id-reuse` | Responses 渠道的响应 ID 续传 | 内置，无需设置 | 0.1.7 |

独立版各自更新，表里是当前版本，都对应 DSH 0.2.2-rc.1。IUI、OMAA 一直是独立产品；dsh-ops 是第三方工具，在 OMD 的第三方功能页安装。

## 一起装时

- 要整套功能，装 OMD 就够了，不用再逐个补装里面已有的部分。
- 只要某一项，按那个产品自己的安装说明装。
- 同时装了 OMD 和某个独立插件时，两边会协调，不会出现重复的工具、服务或按钮。停用其中一个，另一个接着提供功能。
- 在 OMD 里关掉一个功能，只关 OMD 这边的入口；另装的独立插件仍在 DSH 插件页管理。
- 主题管理接管外观时，保留原来的主题和偏好；接管失败就保持现有外观并显示错误。

## 基础聊天先启动

基础聊天先加载，电脑操作、撤回、Workflow 等功能各自加载。某个功能缺依赖或启动失败，只有它显示错误，聊天照常可用。

有些功能还要看 DSH 本身：内嵌浏览器和原生监看需要配套的 DSH 桌面版，DeepSeek 网页的持久登录和下载需要桌面版。装插件不会升级或替换 DSH。

## 用到时才加载

较大的字体和样式、Glyph 动画、OpenCU 里较重的客户端都在用到时才加载，启动更快。只要截图的观察不做多余的界面结构读取；需要时才读取详细结构和差异。

## 原始记录和显示分开

任务的完成状态从会话里的 `todo_write` 记录恢复，刷新、恢复会话或取消验证都不会被一份空清单覆盖。监控数据来自每次调用时服务商返回的用量。

上下文优化只改送给模型的内容：先存好原文，再发精简版、差异或引用，原始会话和附件都能回查。OMD 和 Billion Context 只在压缩上二选一，Dream、档案和其他功能照常工作。

<a id="数据由对应功能保留"></a>

## 数据由对应功能保留

完整备份要包括整个 `DSH_HOME`、profile、会话和附件，以及外部项目和浏览器里的本地偏好。

| 数据 | 位置 |
| --- | --- |
| OMD 上下文、档案、Dream、监控 | `DSH_HOME/oh-my-dsh/`；会话原文和附件由 DSH 管理 |
| 人格和会话人设 | `DSH_HOME/dsh-persona-plugin/`，按 profile 分开 |
| 撤回备份 | 默认 `DSH_HOME/rewind-plus/v1/`，自定义位置另外备份 |
| Workflow | 预算在 `DSH_HOME/dsh-workflow/`，脚本和 worktree 在各自项目里 |
| 网页历史导入 | `DSH_HOME/deepseek-workbench/`；网站登录由桌面版管理 |
| 扩展配置 | MCP、命令、Hooks 在 DSH 配置里；Skill 和指令文件在个人或项目目录 |
| 外观和主题 | 浏览器里的外观和背景偏好，以及主题管理按 profile 保存的主题库和安装记录 |

停用插件不会删数据。导出 DSH 会话不包括各插件的数据：迁移会话时把原文档案一起带上，迁移人格时保留 Persona 数据或导出人格文件。见[升级与备份](upgrade.md)。
