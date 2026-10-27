# OMD 1.1.1 · DSH 0.2.1-rc.3

[中文](#zh-111) | [English](#en-111)

<a id="zh-111"></a>

## 中文

### 问题修复

- 修复 Responses 在 ID 续传与全量回放之间切换时，旧思考重新计入输入、缓存用量突然跳变的问题。通过实际存储回执统一回放表示，覆盖冷恢复和历史变化；无法核验的内容及加密思考保留原生处理。
- 修复网络重试、后台预处理和并发分支过早消耗父响应 ID，造成不必要全量回传的问题。
- 修复历史匹配遗漏消息有效字段的问题；原始思考、会话日志、工具调用与结果保持完整。

### 体验优化

- 合并分散的回归检查，复用一次构建，移除重复计量、OPS 检查及旧独立检查工作流。
- 文档与版本更新不再安装浏览器；相关 UI 改动仍执行 Chromium 布局检查。文档更新通过检查后自动部署，发行附件按对应 tag 核验。

### 其他变更

- 内置 Response ID Reuse 更新至 **0.1.3**。

<a id="en-111"></a>

## English

### Bug Fixes

- Align reasoning replay with actual stored response receipts to prevent input and cache usage from jumping when Responses switches between ID continuation and full replay. This covers cold recovery and changed history while preserving native handling of unverified and encrypted reasoning.
- Retain reusable parent response IDs across network retries, background preparation and concurrent branches, avoiding unnecessary full-history requests.
- Preserve meaningful message fields during prefix matching. Original reasoning, conversation logs, tool calls and results remain intact.

### Improvements

- Consolidate regression checks around one build, removing duplicate metering and OPS checks and obsolete standalone workflows.
- Documentation and version updates no longer install a browser. Relevant UI changes still receive Chromium layout checks. Checked documentation updates deploy automatically, and release assets are checked against their own tag.

### Other Changes

- Update bundled Response ID Reuse to **0.1.3**.

## 安装 / Installation

本版精确匹配 DSH **0.2.1-rc.3**。在 **插件 → 添加插件** 中粘贴固定包地址。保留原 profile、配置与会话；按宿主提示在当前任务结束后重新加载。旧 rc.1／rc.2 宿主继续使用各自的固定历史构建。

This release targets DSH **0.2.1-rc.3** exactly. Paste the fixed package URL into **Plugins → Add plugin**, preserving your profile, configuration and conversations. Reload after active tasks finish if requested. Older rc.1/rc.2 hosts retain their matching historical builds.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [OMD 1.1.1](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.1.1.1/oh-my-dsh-0.2.1-rc.3.omd.1.1.1.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.1.1.1/SHA256SUMS) |

[安装指南](install.md) · [Installation guide](install_EN.md) · [版本与兼容范围 / Versions and compatibility](releases.md) · [完整桌面 CU 安装条件 / Full desktop CU requirements](install.md#computer-use)
