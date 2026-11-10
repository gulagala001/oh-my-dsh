# DSH Undo 0.1.10 · DSH 0.2.2-rc.1 · 未发布 / Unreleased

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

本版尚未发布，目标为 **DSH 0.2.2-rc.1**、Node.js **24.9.0+**。公开安装入口仍指向 **DSH Undo 0.1.9**，不包含上述尚未发布的修复。

This release is not published yet. It targets **DSH 0.2.2-rc.1** and Node.js **24.9.0+**. Public installation links still point to **DSH Undo 0.1.9**, without the unreleased fixes above.

| DSH | 当前公开包 / Current public package | 校验 / Checksums |
| --- | --- | --- |
| 0.2.2-rc.1 | [DSH Undo 0.1.9](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.9-dsh.0.2.2-rc.1/gulagala001-dsh-undo-plugin-0.1.9-dsh.0.2.2-rc.1.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.9-dsh.0.2.2-rc.1/SHA256SUMS) |

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

# DSH Undo 0.1.8 · DSH 0.2.2-rc.1

[中文](#zh-0-1-8-dsh-0-2-2-rc-1) · [English](#en-0-1-8-dsh-0-2-2-rc-1)

<a id="zh-0-1-8-dsh-0-2-2-rc-1"></a>

## 中文

### 体验优化与问题修复

- 冷会话读取改用原生 Session Query，保留精确历史边界与分支继承记录；读取后释放观察句柄，取消与会话不存在的错误保持明确。读取历史不启动 Agent 或改写原始会话。
- 修复历史会话撤回状态与候选列表，保留检查点和恢复流程。

### 其他变更

- 精确适配 DSH **0.2.2-rc.1**、Cordis **4.1.0** 与 Schemastery **3.19.0**，使用对应 SDK 与冻结依赖；Node.js 最低版本为 **24.9.0**。
- 保留已有配置、会话与插件数据；原宿主的历史固定发行继续保留。

<a id="en-0-1-8-dsh-0-2-2-rc-1"></a>

## English

### Improvements and fixes

- Read cold sessions through native Session Query with exact history boundaries and inherited events. Release observation leases after reads, preserve cancellation and not-found errors, and avoid activating Agents or rewriting stored conversations.
- Fix rewind state and candidate lists for stored sessions while retaining checkpoints and recovery.

### Other changes

- Target exactly DSH **0.2.2-rc.1**, Cordis **4.1.0** and Schemastery **3.19.0**, with matching SDK packages and frozen dependencies; require Node.js **24.9.0** or later.
- Preserve settings, conversations and plugin data. Historical releases remain available for their original hosts.

## 安装 / Installation

| DSH | 固定安装包 / Fixed package | 校验 / Checksums |
| --- | --- | --- |
| 0.2.2-rc.1 | [DSH Undo 0.1.8](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.8-dsh.0.2.2-rc.1/gulagala001-dsh-undo-plugin-0.1.8-dsh.0.2.2-rc.1.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.8-dsh.0.2.2-rc.1/SHA256SUMS) |

在 **插件 → 添加插件** 使用匹配的固定包。保留原 profile、配置与数据，安装后按宿主提示重载。

Use the matching fixed package in **Plugins → Add plugin**. Retain your profile, settings and data, then reload when requested.

[安装指南 / Installation guide](https://github.com/gulagala001/dsh-undo-plugin/blob/main/docs/install.md)

---

# DSH Undo 0.1.7 · DSH 0.2.2-rc.1

[中文](#zh-0-1-7-dsh-0-2-2-rc-1) · [English](#en-0-1-7-dsh-0-2-2-rc-1)

<a id="zh-0-1-7-dsh-0-2-2-rc-1"></a>

## 中文

### 体验优化与问题修复

- 对齐原生会话和检查点接口，保留撤回、撤销撤回、草稿回填及文件恢复。

### 其他变更

- 精确适配 DSH **0.2.2-rc.1**、Cordis **4.1.0** 与 Schemastery **3.19.0**，使用对应 SDK 与冻结依赖；Node.js 最低版本为 **24.9.0**。
- 保留已有配置、会话与插件数据；原宿主的历史固定发行继续保留。

<a id="en-0-1-7-dsh-0-2-2-rc-1"></a>

## English

### Improvements and fixes

- Align native session and checkpoint interfaces while retaining rewind, redo, draft restoration and file recovery.

### Other changes

- Target exactly DSH **0.2.2-rc.1**, Cordis **4.1.0** and Schemastery **3.19.0**, with matching SDK packages and frozen dependencies; require Node.js **24.9.0** or later.
- Preserve settings, conversations and plugin data. Historical releases remain available for their original hosts.

## 安装 / Installation

| DSH | 固定安装包 / Fixed package | 校验 / Checksums |
| --- | --- | --- |
| 0.2.2-rc.1 | [DSH Undo 0.1.7](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.7-dsh.0.2.2-rc.1/gulagala001-dsh-undo-plugin-0.1.7-dsh.0.2.2-rc.1.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.7-dsh.0.2.2-rc.1/SHA256SUMS) |

在 **插件 → 添加插件** 使用匹配的固定包。保留原 profile、配置与数据，安装后按宿主提示重载。

Use the matching fixed package in **Plugins → Add plugin**. Retain your profile, settings and data, then reload when requested.

[安装指南 / Installation guide](https://github.com/gulagala001/dsh-undo-plugin/blob/main/docs/install.md)

---

## 未发布 · DSH 0.2.2-alpha.3

[中文](#alpha3-zh) | [English](#alpha3-en)

<a id="alpha3-zh"></a>

### 中文

- 增加 DSH 0.2.2-alpha.3 专用构建，精确对齐 SDK、Cordis 与依赖锁；保留当前主线功能和修复。此候选尚未发布，既有安装入口保持不变。

<a id="alpha3-en"></a>

### English

- Add a dedicated DSH 0.2.2-alpha.3 build with exact SDK, Cordis and dependency locks, retaining current features and fixes. This candidate is unpublished; existing installation links remain unchanged.

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
