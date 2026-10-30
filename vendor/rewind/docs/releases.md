# DSH Undo 0.1.6 · DSH 0.2.1-rc.5 · 未发布 / Unreleased

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

待发布构建精确匹配 **DSH 0.2.1-rc.5**。当前公开安装包仍用于 **DSH 0.2.1-rc.3**，请勿混用。

The unpublished build targets **DSH 0.2.1-rc.5** exactly. The current public package remains for **DSH 0.2.1-rc.3**.

[当前公开包 / Current published package](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.5-dsh.0.2.1-rc.3/gulagala001-dsh-undo-plugin-0.1.5-dsh.0.2.1-rc.3.tgz) · [SHA256SUMS](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.5-dsh.0.2.1-rc.3/SHA256SUMS)

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
