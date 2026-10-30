# DSH Undo 0.1.6 · DSH 0.2.1-rc.5

[中文](#zh-016) | [English](#en-016)

<a id="zh-016"></a>

## 中文

本版适配与验收正在进行，尚未发布。

### 其他变更

- 精确适配 DSH **0.2.1-rc.5**，同步匹配的 SDK、构建输入和完整依赖锁。每份安装包仅用于对应宿主。

<a id="en-016"></a>

## English

This adaptation is under validation and has not been published.

### Other Changes

- Target DSH **0.2.1-rc.5** exactly with matching SDK, build inputs and complete dependency locks. Each package is specific to its host.

## 安装 / Installation

精确宿主为 **DSH 0.2.1-rc.5**。在 **插件 → 添加插件** 中使用下方固定包，保留现有 profile、设置与会话；任务结束后按宿主提示重新加载。

The exact host is **DSH 0.2.1-rc.5**. Use the fixed package in **Plugins → Add plugin**, retaining profiles, settings and conversations; reload after active tasks finish if requested.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.5 | [DSH Undo 0.1.6](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.6-dsh.0.2.1-rc.5/gulagala001-dsh-undo-plugin-0.1.6-dsh.0.2.1-rc.5.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.6-dsh.0.2.1-rc.5/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/dsh-undo-plugin/blob/main/docs/install.md)

---

# DSH Rewind 0.1.5 · DSH 0.2.1-rc.3

[中文](#zh-015) | [English](#en-015)

<a id="zh-015"></a>

## 中文

### 问题修复

- 修复大工作区回退备份可能耗尽磁盘的问题：保留 2 GiB 空闲清理目标，新增默认 4 GiB 内容与索引写入上限，并在写入前预留 512 MiB 可用空间。达到限制时记录文件备份缺口，正常工具继续执行。
- 修复短操作后不触发清理、连续操作反复推迟清理和其他实例忙碌后不再重试的问题；低空间时先回收无引用内容，再按可用空间整理备份。
- 修复磁盘满时空闲标记写入失败导致清理永久受阻，以及失败写入遗留临时文件、部分备份包的问题；索引已提交的恢复内容继续保留。
- 修复路径别名绕过工作区与备份目录重叠保护、旧格式备份未计入清理目标，以及备份失败后重复扫描整个工作区的问题。
- 多实例在同一写锁内核对实际备份占用；大恢复元数据和恢复临时文件同样检查磁盘余量，已有恢复记录、中断事务及外部文件改动保护保持有效。

<a id="en-015"></a>

## English

### Bug Fixes

- Prevents workspace backups from exhausting the disk: retains the 2 GiB idle collection target, adds a default 4 GiB content/index write ceiling, and reserves 512 MiB of free space before writes. Hitting a limit records a file-backup gap while normal tools continue.
- Fixes missed cleanup after short operations, repeated cleanup postponement by continuous activity, and missing retries after a peer instance was busy. Low-space cleanup reclaims unreferenced data before attempting compaction.
- Fixes an ENOSPC idle-marker failure that could permanently block collection, and removes temporary files and unpublished partial packs after failed writes. Recovery data already published in the index remains intact.
- Fixes workspace/backup overlap checks bypassed through path aliases, legacy backup bytes omitted from the retention target, and redundant workspace scans after a failed pre-image capture.
- Concurrent instances check physical backup usage under the same writer lock. Large recovery metadata and restore temporary files also check disk headroom, while existing recovery records, interrupted transactions and external-edit protection remain preserved.

## 安装 / Installation

在 **插件 → 添加插件** 使用下方固定包。精确宿主版本为 **DSH 0.2.1-rc.3**；保留原 profile、配置和数据，待任务结束后完整重启。新保护在加载新版本后生效；已有备份由安全清理处理，不要在恢复期间手动删除备份目录。

Install the fixed package through **Plugins → Add plugin** on **DSH 0.2.1-rc.3**. Preserve settings and data, then restart after active tasks finish. Protection takes effect when the new version is loaded; existing backups use safe collection. Do not manually delete backup storage during recovery.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [DSH Rewind 0.1.5](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.5-dsh.0.2.1-rc.3/gulagala001-dsh-undo-plugin-0.1.5-dsh.0.2.1-rc.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.5-dsh.0.2.1-rc.3/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-undo-plugin/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/dsh-undo-plugin/blob/main/docs/install_EN.md)

---

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
