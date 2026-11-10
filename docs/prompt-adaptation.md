# 系统提示词

[文档目录](README.md) · [使用指南](usage.md#settings) · [Ultra 与 Workflow](workflow.md)

OMD 把主提示词、工具说明和动态提醒分别接进 DSH 的执行流程。默认的主代理和工作流提示词参考 Claude Code 的固定版本，按 DSH 实际有的能力适配。内置 OpenCU 用它自己的实时工具说明。

## 选择风格

在 **设置 → Oh My DSH → 智能体** 选 **OMD 默认、DSH 原生、Codex、Cursor、Pi、Grok、ZCode**，默认 OMD 默认。DSH 原生用 DSH 自己的提示词和工具说明。

打开 **启用会话提示词风格**（默认关）后，主会话的权限菜单里可以给单个会话换风格。没单独选的会话跟随全局；关掉开关时统一用全局，再打开会恢复各会话之前的选择。改动从下一轮开始生效。人格设置单独生效；子智能体、OMAA 和后台任务不受这个开关影响。

## 来源

原文放在 [`src/prompt-styles/upstream/`](../src/prompt-styles/upstream/)，逐个文件保留上游字节、固定提交、核对日期、SHA-256 和许可。适配只改身份、工具和参数、等待方式、界面格式、动态环境和 DSH 协议这些必须改的地方，行为要求、章节顺序和措辞保持原样。Pi 和 ZCode 从固定源码生成文本，没有移植它们的运行时。

2026-10-23 核对的来源：

| 风格 | 固定来源 | 用了什么 |
| --- | --- | --- |
| Codex | [0.164.0](https://github.com/openai/codex/releases/tag/rust-v0.164.0)，`6aaac694` | `gpt-6-astra` 的完整 `instructions_template`，不含需要单独开启的 persistent mode |
| Cursor | [公开样本](https://github.com/asgeirtj/system_prompts_leaks/blob/3d535771ea2a5c33bbc1c8cf7845caaf9b959a56/Cursor/cursor.md)，blob `f6951fa5` | 非官方资料，对应的产品版本和完整性无法确认 |
| Pi | [1.4.0](https://github.com/earendil-works/pi/releases/tag/v1.4.0)，`4a080252` | 原版的结构化系统提示词构建器 |
| Grok | [Grok Build](https://github.com/xai-org/grok-build/tree/2bdd1d6a6369de0e8c68132ea4539e9abd9e14a8)，`2bdd1d6a` | 交互式主模板，条件段按实际工具渲染 |
| ZCode | [3.16.2 源码](https://github.com/zai-org/ZCode/tree/3c5b227649371507ddc4eb46ac5133afe6db1cab)，`3c5b2276` | CLI 前缀、身份、沟通和行为、会话指导、上下文管理 |

各风格里依赖原产品的部分换成 DSH 的实际接口：Codex 的消息通道、编排和技能读取；Cursor 的代码引用、终端目录、MCP 描述和工具列表；Pi 的文档路径和工具列表。Grok 的文件记忆协议不启用，改用 OMD 的记忆；ZCode 的 token 统计不进入文本。工作目录、技能、仓库规则、权限、计划模式、任务、Ultra、Dream 和记忆照常由 DSH 和 OMD 提供。

许可和来源见[第三方声明](../THIRD_PARTY_NOTICES.md#system-prompt-style-sources)。维护方法见[贡献说明](../CONTRIBUTING.md)。

## 三层结构

| 层 | 管什么 | 源码 |
| --- | --- | --- |
| 主提示词 | 理解任务、写代码、行动和结果、上下文管理、交付、纠错和验证 | [texts.mjs](../src/cc-adaptation/texts.mjs) |
| 工具说明 | 把参考结构对到 DSH 现有的工具、参数和调用方式 | [adapter.mjs](../src/cc-adaptation/adapter.mjs)、[bindings.json](../src/cc-adaptation/bindings.json) |
| 动态层 | 当前执行模式、会话状态、任务提醒和工作流参考 | [runtime-state.mjs](../src/runtime-state.mjs)、[todolist.mjs](../src/todolist.mjs)、[ultracode.mjs](../src/ultracode.mjs) |

工具有没有、参数怎么填、返回什么字段，都以运行时为准。提示词不会声称有不存在的能力。

**任务验证** 的三档对普通模式和 PTC 都有效：关闭时从会话里撤掉 `verify_link`，任务说明不再要求证据；默认档保留工具和证据说明；开启档再加上收尾时的验证提醒。它对所有风格都生效。见[任务和进度](usage.md#任务和进度)。

## 执行模式

- **普通模式**：原生工具调用。
- **OMD-PTC**：业务工具在 `run_code` 里组合调用，`job_output`、`job_list`、`job_kill`、`runtime_status` 保持直接调用。说明文字按实际的 SDK 参数、返回值和运行时语法生成。
- `run_code` 没写外层 `timeoutMs` 时，从 DSH 默认预算开始，按里面工具声明的超时延长，但不超过上限；写了就按写的算。`runtime_status` 能看到当前预算和剩余时间。

**Ultra** 有 Workflow、Agent Team、自由三种方式，默认自由，推理档位优先 `xhigh`。三种共用一份质量要求：结果要充分、正确、有依据，能独立推进的工作及时派给子智能体，主代理负责整合。Workflow 按实际依赖安排顺序；Agent Team 用 DSH 自带的团队功能，DSH 没开时这个选项不显示，已保存的选择会暂时按自由处理。只有 Workflow 会注入工作流编写参考。见 [Ultra 与 Workflow](workflow.md)。

## 和 ✨ 的区别

系统提示词决定 AI 怎么理解和执行任务；输入框的 ✨ 只处理你这一条草稿。见[输入框的 ✨](usage.md#输入框的-)。

模型能不能完全照做，还取决于模型本身和任务条件，结果请用代码、运行和证据核对。
