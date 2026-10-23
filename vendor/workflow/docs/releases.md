# DSH Workflow 0.1.3 · DSH 0.2.1-rc.2

[中文](#zh-013) | [English](#en-013)

<a id="zh-013"></a>

## 中文

### 问题修复

- 子任务收尾失败会阻止继续派发新任务；所有已经派发的清理均等待完成，并保留完整错误信息。
- 停止子任务失败时保留占用与恢复锁，避免旧任务仍运行时重复执行。
- 磁盘保存和收尾错误传回调用方，不再把未落盘的结果当作成功；恢复前保留已有副作用的检查依据。

<a id="en-013"></a>

## English

### Bug Fixes

- Stops further task admission after a child settlement failure, awaits all admitted cleanup and retains complete diagnostics.
- Retains execution ownership and recovery locks when a child task cannot be stopped, preventing duplicate execution while it remains active.
- Propagates persistence and settlement errors instead of reporting unsaved results as successful, retaining the information needed to inspect existing effects before recovery.

## 安装 / Installation

在 **插件 → 添加插件** 使用与当前 DSH 完整版本一致的固定包，保留原 profile、配置和数据，待任务结束后重启。

Install the fixed package matching the complete DSH version through **Plugins → Add plugin**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.2 | [DSH Workflow 0.1.3](https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.3-dsh.0.2.1-rc.2/dsh-workflow-plus-0.1.3-dsh.0.2.1-rc.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.3-dsh.0.2.1-rc.2/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-workflow/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/dsh-workflow/blob/main/docs/install_EN.md)
