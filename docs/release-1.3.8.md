# Oh My DSH 1.3.8 · DSH 0.2.2-rc.1

[中文](#zh-138) · [English](#en-138)

<a id="zh-138"></a>

## 中文

### 问题修复

- 用户要求变化后，中枢正在生成或等待应用的旧压缩方案会失效，保留原始资料并按新要求重新判断。
- 主回合中断或分叉不再把仍在执行的后台工作流误标为已中断；工作流与子任务状态以各自结束回执为准。
- 续传流内失败与断流进入冷却，保留父响应与取消语义；修复多行 SSE 终态识别。
- MCP 管理页跟随真实连接状态；旧连接释放失败时保留记录与重试入口，防止重复启动。内置 Response ID Reuse 0.1.7 与 DSH Extensions 0.1.5。

<a id="en-138"></a>

## English

### Bug Fixes

- Invalidate pending and in-flight coordinator compaction decisions when user requirements change, retaining source material for a fresh decision.
- Keep background workflow status independent of interruption or forking of its initiating turn. Workflow and member outcomes follow their own settlement receipts.
- Cool down continuation after in-stream failure or unexpected EOF, retaining parent responses and cancellation behavior; correctly recognize multiline SSE terminal events.
- Reflect actual MCP connection state and retain failed cleanup for retry before starting a replacement. Bundle Response ID Reuse 0.1.7 and DSH Extensions 0.1.5.

## 安装 / Installation

精确宿主为 **DSH 0.2.2-rc.1**，Node.js **24.9.0+**。在 **插件 → 添加插件** 使用固定包，保留现有 profile、配置与会话，按宿主提示完整重启。

Targets exactly **DSH 0.2.2-rc.1**, with Node.js **24.9.0+**. Add the fixed package in **Plugins → Add plugin**, retain the existing profile, settings and conversations, and fully restart when requested.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.2-rc.1 | [Oh My DSH 1.3.8](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.1.omd.1.3.8/oh-my-dsh-0.2.2-rc.1.omd.1.3.8.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.1.omd.1.3.8/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md)
