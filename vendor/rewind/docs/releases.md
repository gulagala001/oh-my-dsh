# DSH Rewind 0.1.3 · DSH 0.2.1-rc.2

[中文](#zh-013) | [English](#en-013)

<a id="zh-013"></a>

## 中文

### 体验优化

- 合并同时在途的工作区目录检查，减少重复扫描；检查结束后立即释放，不保留过期路径判断。

### 问题修复

- 对话回退、撤销和失败补偿按同一原生日志截点恢复任务、节选与证据；首次任务之前恢复为空，历史输入不会重复计入本轮决定。
- 备份维护锁和工作区锁的等待最长 30 秒，排队可取消；取消不释放正在使用的锁，恢复期间不会误放行工具。

<a id="en-013"></a>

## English

### Improvements

- Coalesces concurrent workspace directory checks to reduce duplicate scans, releasing completed checks without retaining stale path decisions.

### Bug Fixes

- Restores tasks, excerpts and evidence at the same native history boundary during rewind, undo and failure compensation; rewinding before the first task restores an empty ledger and replayed input is not counted as a new decision.
- Bounds backup-maintenance and workspace lock waits to 30 seconds and allows queued cancellation; cancellation does not release an active owner and recovery does not admit tools prematurely.

## 安装 / Installation

在 **插件 → 添加插件** 使用与当前 DSH 完整版本一致的固定包，保留原 profile、配置和数据，待任务结束后重启。

Install the fixed package matching the complete DSH version through **Plugins → Add plugin**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.2 | [DSH Rewind 0.1.3](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.3-dsh.0.2.1-rc.2/gulagala001-dsh-undo-plugin-0.1.3-dsh.0.2.1-rc.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.3-dsh.0.2.1-rc.2/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-undo-plugin/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/dsh-undo-plugin/blob/main/docs/install_EN.md)
