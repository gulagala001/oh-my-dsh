# 系统提示词与 DSH 适配

[文档目录](README.md) · [项目介绍](../README.md#prompts) · [专属执行模式](workflow.md)

Oh My DSH 把主提示词、工具说明和动态提醒分别装配到 DSH 的原生执行流程。主代理与工作流参考 Claude Code 的固定版本材料；OpenCU 的目标选择、观察、动作和接管协议对照 Codex 的接口与实际交互。适配依据是宿主当前拥有的能力。

![系统级适配的结构](images/readme-prompt-adaptation.svg)

## 三个层次

| 层次 | 负责什么 | 当前入口 |
| --- | --- | --- |
| 主提示词 | 理解任务、代码工作、行动与结果、上下文管理、交付、纠错和验证 | [主提示词装配](../src/cc-adaptation/texts.mjs)与其中列出的模块 |
| 工具说明 | 把参考结构适配到当前 DSH 的工具、参数和调用形式 | [适配器](../src/cc-adaptation/adapter.mjs)与 [工具绑定](../src/cc-adaptation/bindings.json) |
| 动态层 | 当前执行模式、会话状态、任务提醒与工作流参考 | [运行状态](../src/runtime-state.mjs)、[Better Todo](../src/todolist.mjs)、[Ultracode](../src/ultracode.mjs) |

工具是否存在、参数如何填写、返回值有哪些字段，以当前运行时为准。适配器不会通过提示词声明不存在的能力，也不会替换宿主管理的可调用参数契约。

## 跟随实际执行模式

Native 模式使用原生工具调用。OMD-PTC 通过 `run_code` 组合工具；有活动工具 SDK 时，适配器按当前参数和返回结构重新生成说明。缺失工具、模式开关和子代理请求分别处理。

Ultracode 额外提供深入的 Workflow 执行策略与编写参考；普通模式仍遵循原有授权规则。[执行、保存与恢复](workflow.md)。

## 与草稿优化的关系

系统提示词影响智能体理解任务与执行工作的方式。输入框的提示词优化处理这一条用户草稿，提供轻润色、结构化和步骤规划，保留原稿与版本。两者分别发挥作用。[草稿优化说明](usage.md#提示词优化)。

模型是否完整遵循执行策略，仍取决于模型能力与任务条件。实际结果应通过代码、运行与证据核对。参考材料与第三方来源见 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。
