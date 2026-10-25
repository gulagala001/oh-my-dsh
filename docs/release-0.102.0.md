# OMD 0.102.0 · DSH 0.2.1-rc.3

[中文](#zh-01020) | [English](#en-01020)

<a id="zh-01020"></a>

## 中文

### 新增功能

- BT 第二项“任务验证”改为“关闭／默认／开启”三档，初始选中间的“默认”。默认档保留验证工具与证据要求，不在收尾催促验证；开启档启用完整的缺证据提醒与文字证据复核。
- 关闭档从当前会话的 Native 工具列表与 PTC SDK 中移除 `verify_link`，停用证据要求、验证催促及文字证据复核。普通 Todo 和已有证据保留，重新开启可继续使用。
- 设置中的“智能体 → 任务验证默认档位”控制未在 BT 单独选择的会话；每个会话的显式选择独立保存。

### 体验优化

- 旧版验证提醒关闭／开启分别保留为“默认”／“开启”，不改动已有选择。三段控件支持鼠标和键盘，任务证据页明确显示关闭状态。

### 问题修复

- 切档同步工具可见性、执行权限与 Todo 说明，清除已停用的旧验证催促，避免 Native、PTC、提示词风格和会话之间出现状态不一致。
- 关闭后拒绝旧验证调用；已开始的验证命令允许结束并保存结果，尚未开始的检查不再执行。已发出的模型请求不能撤回。

<a id="en-01020"></a>

## English

### New Features

- The second BT control, task verification, now offers Off / Default / On, initially the middle Default position. Default keeps the verification tool and evidence instructions without turn-end prompts; On enables missing-evidence reminders and text-evidence review.
- Off removes `verify_link` from the conversation's native tool list and PTC SDK, disabling evidence requirements, verification reminders and text-evidence review. Ordinary Todo and existing evidence remain available for later use.
- Settings → Agent → Task verification default controls conversations without an explicit BT selection. Each conversation's explicit choice is saved independently.

### Experience Improvements

- Legacy verification reminders off/on retain their choices as Default/On. The segmented control supports pointer and keyboard input, and the evidence view shows when verification is disabled.

### Bug Fixes

- Mode changes synchronize discovery, execution and Todo instructions, and retire disabled verification prompts across native tools, PTC, prompt styles and conversation scopes.
- Stale verification calls are rejected after switching Off. Commands already running may finish and retain their results; remaining checks do not start. Model requests already sent cannot be recalled.

## 安装 / Installation

在 **插件 → 添加插件** 使用下方固定包。精确宿主为 **DSH 0.2.1-rc.3**；保留原 profile、配置和数据，待任务结束后完整重启。

Install the fixed package through **Plugins → Add plugin** on **DSH 0.2.1-rc.3**. Preserve settings and data, then restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [OMD 0.102.0](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.0.102.0/oh-my-dsh-0.2.1-rc.3.omd.0.102.0.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.0.102.0/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install_EN.md)
