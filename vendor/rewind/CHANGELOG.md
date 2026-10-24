# DSH Rewind 0.1.4 · DSH 0.2.1-rc.3

[中文](#zh-014) | [English](#en-014)

<a id="zh-014"></a>

## 中文

### 其他变更

- 精确适配 DSH 0.2.1-rc.3，同步匹配的 SDK、组件与冻结依赖；每份安装包仅用于对应宿主版本。

<a id="en-014"></a>

## English

### Other Changes

- Targets DSH 0.2.1-rc.3 exactly, with matching SDK, components and frozen dependencies; each package is specific to its host version.

## 安装 / Installation

在 **插件 → 添加插件** 使用下方固定包。精确宿主版本为 **DSH 0.2.1-rc.3**；保留原 profile、配置和数据，待任务结束后重启。

Install the fixed package through **Plugins → Add plugin** on **DSH 0.2.1-rc.3**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [DSH Rewind 0.1.4](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.4-dsh.0.2.1-rc.3/gulagala001-dsh-undo-plugin-0.1.4-dsh.0.2.1-rc.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.4-dsh.0.2.1-rc.3/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-undo-plugin/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/dsh-undo-plugin/blob/main/docs/install_EN.md)

---

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

---

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

---

# DSH Rewind 0.1.1 · DSH 0.2.1-rc.2

[中文](#zh-011) | [English](#en-011)

<a id="zh-011"></a>

## 中文

### 问题修复

- 修复撤回缓存遇到缺失投影值时的错误，保留正常对话与文件回退流程。

### 其他变更

- 更新双语功能与安装指南，使用固定发行包提供客户端构建产物。

<a id="en-011"></a>

## English

### Bug Fixes

- Handles missing projection values in the rewind cache while preserving conversation and file rollback.

### Other Changes

- Updates bilingual feature and installation guides and distributes built client assets through fixed releases.

## 安装 / Installation

在 **插件 → 添加插件** 安装与当前 DSH 完整版本一致的固定包，保留原 profile、配置和数据，待当前任务结束后重启。

Install the fixed package matching the complete DSH version through **Plugins → Add plugin**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.2 | [DSH Rewind 0.1.1](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.1-dsh.0.2.1-rc.2/gulagala001-dsh-undo-plugin-0.1.1-dsh.0.2.1-rc.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.1-dsh.0.2.1-rc.2/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-undo-plugin/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/dsh-undo-plugin/blob/main/docs/install_EN.md)
