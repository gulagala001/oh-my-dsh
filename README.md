# trisoul_x

从最小核心构建的通用 Agent。一个主模型负责执行，上下文与记忆维持长任务连续性。

## 运行

需要 Node.js ≥22.19 和 pnpm。

```sh
pnpm install
pnpm start
```

打开 [本地页面](http://127.0.0.1:3082)，在设置中填写 API 地址、模型和密钥。默认一个模型同时负责主对话与后台整理，也可以单独配置后台模型。`PORT` 可改端口，`TRISOUL_X_DATA` 可改数据目录。

也可通过 `TRISOUL_X_BASE_URL`、`TRISOUL_X_MODEL`、`TRISOUL_X_API_KEY` 提供初始配置，页面保存的配置优先。默认协议为 OpenAI Chat Completions。协议适配还接入 Responses、Anthropic Messages 和 Google Gemini；本轮真实联调使用 Chat Completions + DeepSeek v4 flash。

## 当前能力

- 自然语言流式对话、原生工具循环、停止执行、会话持久化与恢复。
- `read` / `write` / `edit` / `bash` / `web_fetch`，以及按需使用的 `tasks` / `note` / `recall`。
- 后台通过一次原生工具提交，同时维护长期记忆、工作状态与区间摘要。
- 全局、跨项目、本项目三层记忆；覆盖历史保留，支持页面编辑、删除及按需检索。
- 工作状态按版本追加；优先整理已消化且释放的区间，上下文压力较大时整理较早内容；保留用户原话和最近工具往返，原文可按序号回捞。
- 对话为主的 UI，可展开上下文、记忆和任务；支持窄屏及系统明暗主题。

当前聚焦文本对话、本地工具与上下文记忆。

## 结构

单包，无构建步骤。Node HTTP 服务提供 API 和静态页面；唯一直接运行依赖是原项目使用的模型适配库 `@earendil-works/pi-ai`。

| 文件 | 职责 |
| --- | --- |
| `src/agent.mjs` | 单模型执行循环 |
| `src/llm.mjs` | 原生模型协议适配 |
| `src/tools.mjs` | 普通工具 |
| `src/context.mjs` | 记忆、工作状态与区域整理 |
| `src/store.mjs` | 会话事件与记忆存储 |
| `src/prompts.mjs` | 从原文融合的提示词 |
| `src/server.mjs` | HTTP / SSE |
| `web/` | 页面、样式与交互 |

`data/` 存放本机配置（含密钥）、会话与记忆，已被 Git 忽略。原 trisoul 的运行数据与配置未迁入。`patches/` 只保留模型适配库大工具参数的解析性能修补。

## 提示词与验证

原文基准为 trisoul 提交 `4189f90305e545dbb82654f561fc4d83eed96d03`。遵循 [AGENTS.md](AGENTS.md)，逐项变更和理由见 [PROMPT_CHANGES.md](PROMPT_CHANGES.md)；原文快照仅用于对照测试。

`pnpm test` 覆盖真实文件执行、HTTP 与 SDK 流式衔接、停止与截断处理、会话恢复、记忆覆盖与区间回捞，以及提示词原文保留。测试使用临时目录与本地模型端点，不调用付费 API。
