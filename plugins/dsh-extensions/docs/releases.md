# DSH Extensions 0.1.1 · DSH 0.2.1-rc.2

[中文](#zh-011) | [English](#en-011)

<a id="zh-011"></a>

## 中文

### 问题修复

- 串行保存扩展配置，防止并发编辑覆盖彼此的结果，并修正 MCP 配置归属。
- 扩展停用或请求取消时终止其命令与运行任务，完整收尾已派发工作，避免旧实例继续写入状态。

<a id="en-011"></a>

## English

### Bug Fixes

- Serializes extension configuration updates to prevent concurrent edits from overwriting one another and corrects MCP configuration ownership.
- Stops owned commands and runtime tasks on extension shutdown or request cancellation, settling dispatched work so retired instances cannot keep updating state.

## 安装 / Installation

在 **插件 → 添加插件** 使用与当前 DSH 完整版本一致的固定包，保留原 profile、配置和数据，待任务结束后重启。

Install the fixed package matching the complete DSH version through **Plugins → Add plugin**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.2 | [DSH Extensions 0.1.1](https://github.com/gulagala001/dsh-extensions/releases/download/v0.1.1-dsh.0.2.1-rc.2/dsh-extensions-0.1.1-dsh.0.2.1-rc.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-extensions/releases/download/v0.1.1-dsh.0.2.1-rc.2/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-extensions/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/dsh-extensions/blob/main/docs/install_EN.md)
