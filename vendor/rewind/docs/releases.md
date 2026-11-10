# DSH Undo 0.1.11 · DSH 0.2.2-rc.1

[中文](#zh-0111) · [English](#en-0111)

<a id="zh-0111"></a>

## 中文

### 问题修复

- 修复上下文压缩或提示替换后撤回被完整性校验拒绝、确认按钮不可用的问题。撤回按当前上下文的位置选取完整区间，保留前面的消息。
- 修复同一原因导致的部分消息撤回残留；撤销和中断恢复沿用同一修复，保留原生日志及文件保护。

<a id="en-0111"></a>

## English

### Bug Fixes

- Fix rewind being rejected and confirmation becoming unavailable after context compaction or prompt replacement. Select the complete range by its current context position while preserving earlier messages.
- Fix partial message residue caused by the same ordering error. Undo and interrupted-operation recovery share the correction, preserving the native log and file safeguards.

## 安装 / Installation

适用于 **DSH 0.2.2-rc.1**、Node.js **24.9.0+**。等当前任务结束后，按宿主提示重载。

Requires **DSH 0.2.2-rc.1** and Node.js **24.9.0+**. Finish active tasks, then reload when prompted.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.2-rc.1 | [DSH Undo 0.1.11](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.11-dsh.0.2.2-rc.1/gulagala001-dsh-undo-plugin-0.1.11-dsh.0.2.2-rc.1.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.11-dsh.0.2.2-rc.1/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/dsh-undo-plugin/blob/main/docs/install.md)

---

# DSH Undo 0.1.10 · DSH 0.2.2-rc.1

[中文](#zh-0-1-10-dsh-0-2-2-rc-1) · [English](#en-0-1-10-dsh-0-2-2-rc-1)

<a id="zh-0-1-10-dsh-0-2-2-rc-1"></a>

## 中文

### 问题修复

- 修复撤回用户输入后仍显示“已完成分析／运行状态已注入”的问题。撤回范围包含该输入的前置状态，旧撤回记录同步过滤残留分组；保留同一步较早输入和前面步骤，撤销可以完整恢复。

<a id="en-0-1-10-dsh-0-2-2-rc-1"></a>

## English

### Bug fixes

- Fix “analysis complete / runtime state injected” residue after rewinding a user input. Include that input’s prologue in the rewind boundary and filter leftover groups from existing rewinds, while preserving earlier inputs in the same step, previous steps and full undo restoration.

## 安装 / Installation

适用于 **DSH 0.2.2-rc.1**、Node.js **24.9.0+**。等当前任务结束后，按宿主提示重载。

Requires **DSH 0.2.2-rc.1** and Node.js **24.9.0+**. Finish active tasks, then reload when prompted.

| DSH | 固定安装包 / Fixed package | 校验 / Checksums |
| --- | --- | --- |
| 0.2.2-rc.1 | [DSH Undo 0.1.10](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.10-dsh.0.2.2-rc.1/gulagala001-dsh-undo-plugin-0.1.10-dsh.0.2.2-rc.1.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.10-dsh.0.2.2-rc.1/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/dsh-undo-plugin/blob/main/docs/install.md)

---

# DSH Undo 0.1.9 · DSH 0.2.2-rc.1

[中文](#zh-0-1-9-dsh-0-2-2-rc-1) · [English](#en-0-1-9-dsh-0-2-2-rc-1)

<a id="zh-0-1-9-dsh-0-2-2-rc-1"></a>

## 中文

### 问题修复

- 为工具前后的工作区备份增加可取消的时间预算。快照耗时过长时，跳过该段文件备份并记录缺口，工具继续执行。
- 取消会中止扫描、读取和备份写入等待。未发布的备份不会进入索引或被后续快照当作完整备份。

<a id="en-0-1-9-dsh-0-2-2-rc-1"></a>

## English

### Bug fixes

- Give before-and-after workspace snapshots a cancellable time budget. Slow snapshots record a file-backup gap while tools continue.
- Cancellation stops scanning, reading and waiting for backup writes. Unpublished data stays out of the index and later snapshots cannot mistake it for a complete backup.

## 安装 / Installation

| DSH | 固定安装包 / Fixed package | 校验 / Checksums |
| --- | --- | --- |
| 0.2.2-rc.1 | [DSH Undo 0.1.9](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.9-dsh.0.2.2-rc.1/gulagala001-dsh-undo-plugin-0.1.9-dsh.0.2.2-rc.1.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.9-dsh.0.2.2-rc.1/SHA256SUMS) |

在 **插件 → 添加插件** 使用匹配的固定包。等当前任务结束后，按宿主提示重载。

Use the matching fixed package in **Plugins → Add plugin**. Finish active tasks, then reload when prompted.

[安装指南 / Installation guide](https://github.com/gulagala001/dsh-undo-plugin/blob/main/docs/install.md)

---

# DSH Undo 0.1.6 · DSH 0.2.1-rc.5

## DSH Undo 0.1.8 · DSH 0.2.2-rc.1

[发行说明与固定安装包 / Release and fixed packages](https://github.com/gulagala001/dsh-undo-plugin/releases/tag/v0.1.8-dsh.0.2.2-rc.1)

## DSH Undo 0.1.7 · DSH 0.2.2-rc.1

[发行说明与固定安装包 / Release and fixed packages](https://github.com/gulagala001/dsh-undo-plugin/releases/tag/v0.1.7-dsh.0.2.2-rc.1)


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
