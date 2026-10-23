# DSH Rewind 0.1.2 · DSH 0.2.1-rc.2

[中文](#zh-012) | [English](#en-012)

<a id="zh-012"></a>

## 中文

### 问题修复

- 撤回恢复使用真实文件身份和版本，恢复期间文件被外部修改时拒绝覆盖。
- 修复特殊文件名的比较与会话事件序号检查，保留完整回合撤回及输入草稿恢复。

<a id="en-012"></a>

## English

### Bug Fixes

- Uses actual file identity and version during rewind and refuses to overwrite files changed externally during recovery.
- Fixes special filename comparisons and conversation event sequence checks while preserving complete-turn rewind and input-draft restoration.

## 安装 / Installation

在 **插件 → 添加插件** 使用与当前 DSH 完整版本一致的固定包，保留原 profile、配置和数据，待任务结束后重启。

Install the fixed package matching the complete DSH version through **Plugins → Add plugin**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.2 | [DSH Rewind 0.1.2](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.2-dsh.0.2.1-rc.2/gulagala001-dsh-undo-plugin-0.1.2-dsh.0.2.1-rc.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.2-dsh.0.2.1-rc.2/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-undo-plugin/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/dsh-undo-plugin/blob/main/docs/install_EN.md)
