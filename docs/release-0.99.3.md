# OMD 0.99.3 · DSH 0.2.1-rc.1 / 0.2.1-rc.2

[中文](#zh-0993) | [English](#en-0993)

<a id="zh-0993"></a>

## 中文

### 问题修复

- 人格保存原子检查读取版本，防止多窗口旧列表覆盖新增预设；冲突草稿保留，被删除预设的草稿可另存。
- 停用人格组件时关闭旧实例写权限，修复排队导入、迟到读取和旧请求覆盖重新启用后数据的问题，并移除旧人格写入口。
- 工作流子任务收尾失败后阻止继续派发任务，并等待全部清理完成；停止失败时保留占用与恢复锁，已确认停止的任务即使保存失败也能释放锁，磁盘及收尾错误明确返回。

### 其他变更

- 同步内置 OpenCU 2.0.8、Workflow 0.1.3、Rewind 0.1.2、DeepSeek Workbench 0.1.2、Extensions 0.1.1 与 Persona 0.1.1，统一当前源码、分发清单和组件来源。

<a id="en-0993"></a>

## English

### Bug Fixes

- Atomically checks the version read by personality editors, preventing stale lists from overwriting new presets across windows. Conflicting drafts are retained and drafts of deleted presets can be saved separately.
- Revokes retired personality-instance write access and fixes queued imports, late reads and old requests overwriting reactivated data. Removes the legacy personality write entry point.
- Stops further workflow task admission after child settlement fails and awaits all cleanup. Failed stops retain ownership and recovery locks; confirmed stopped tasks release their locks even if persistence fails. Persistence and settlement errors are reported to the caller.

### Other Changes

- Updates bundled OpenCU to 2.0.8, Workflow to 0.1.3, Rewind to 0.1.2, DeepSeek Workbench to 0.1.2, Extensions to 0.1.1 and Persona to 0.1.1, aligning current source, distribution inventories and component provenance.

## 安装 / Installation

在 **插件 → 添加插件** 使用与当前 DSH 完整版本一致的固定包，保留原 profile、配置和数据，待任务结束后重启。

Install the fixed package matching the complete DSH version through **Plugins → Add plugin**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.2 | [OMD 0.99.3](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.99.3/oh-my-dsh-0.2.1-rc.2.omd.0.99.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.99.3/SHA256SUMS) |
| 0.2.1-rc.1 | [OMD 0.99.3](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.99.3/oh-my-dsh-0.2.1-rc.1.omd.0.99.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.99.3/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install_EN.md)
