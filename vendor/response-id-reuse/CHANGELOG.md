# Response ID Reuse 0.1.0 · DSH 0.2.1-rc.3

[中文](#zh-010) | [English](#en-010)

<a id="zh-010"></a>

## 中文

### 新增功能

- 安装加载后默认启用 Responses ID 续传，支持已验证或有官方能力依据的百炼模型与 Command Code DeepSeek V4.1 Flash。
- 精确匹配历史，保留图片与工具结果；按端点、账号、模型、会话和参数隔离检查点。
- 明确拒绝续传时恢复完整请求；禁用／卸载自动撤销接管并清理内存缓存。

### 体验优化

- 纯后端无感运行，不添加界面、提醒、探测调用或生成停止限制。
- 未确认渠道保留原始请求，重复加载共享一份实例。

<a id="en-010"></a>

## English

### New Features

- Enable Responses ID continuation when loaded for verified or officially documented Bailian models and Command Code DeepSeek V4.1 Flash.
- Match exact history while retaining images and tool results; isolate checkpoints by endpoint, account, model, session and parameters.
- Recover full requests on explicit continuation rejection. Unloading releases interception and clears in-memory state.

### Experience Improvements

- Run entirely in the backend without UI, notifications, probe calls or generation stop limits.
- Preserve original requests for unverified routes and share one runtime across duplicate loads.

## 安装 / Installation

精确宿主为 **DSH 0.2.1-rc.3**。在 **插件 → 添加插件** 使用固定安装包；安装后启用，若宿主要求则待任务结束后重启。

Requires **DSH 0.2.1-rc.3** exactly. Install the fixed package through **Plugins → Add plugin**, enable it, and follow any host restart prompt after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [Response ID Reuse 0.1.0](https://github.com/gulagala001/dsh-response-id-reuse/releases/download/v0.1.0-dsh.0.2.1-rc.3/gulagala001-dsh-response-id-reuse-0.1.0-dsh.0.2.1-rc.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-response-id-reuse/releases/download/v0.1.0-dsh.0.2.1-rc.3/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-response-id-reuse/blob/main/README.md#安装与卸载) · [Installation guide](https://github.com/gulagala001/dsh-response-id-reuse/blob/main/README_EN.md#install-and-uninstall)
