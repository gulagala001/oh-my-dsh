# DSH Workflow 0.1.10 · DSH 0.2.2-rc.2

[中文](#zh-0110) · [English](#en-0110)

<a id="zh-0110"></a>

## 中文

### 问题修复

- 续跑时拒绝使用运行结束后出现的子任务结果。

<a id="en-0110"></a>

## English

### Bug fixes

- Resume rejects child results recorded after the workflow ended.

## 安装 / Installation

DSH **0.2.2-rc.2** · Node.js **24.9.0+**

[固定安装包 / Install package](https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.10-dsh.0.2.2-rc.2/dsh-workflow-plus-0.1.10-dsh.0.2.2-rc.2.tgz) · [安装指南 / Installation guide](https://github.com/gulagala001/dsh-workflow/blob/main/docs/install.md) · [SHA256SUMS](https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.10-dsh.0.2.2-rc.2/SHA256SUMS)

---

# DSH Workflow 0.1.9 · DSH 0.2.2-rc.2

[中文](#zh-019) · [English](#en-019)

<a id="zh-019"></a>

## 中文

### 问题修复

- 停止工作流后，运行详情会显示停止请求；重新加载插件后，预算只计算一次会话事件。

<a id="en-019"></a>

## English

### Bug fixes

- Run details show a stop request as soon as it is accepted. Reloading the plugin keeps session events from being counted twice.

已撤回。 / Withdrawn.

---

# DSH Workflow 0.1.8 · DSH 0.2.2-rc.1

[中文](#zh-0-1-8-dsh-0-2-2-rc-1) · [English](#en-0-1-8-dsh-0-2-2-rc-1)

<a id="zh-0-1-8-dsh-0-2-2-rc-1"></a>

## 中文

### 体验优化与问题修复

- 复用匹配宿主的 Workflow、PTC、子会话和生命周期；保留预算、后台运行、取消及冷恢复。

### 其他变更

- 精确适配 DSH **0.2.2-rc.1**、Cordis **4.1.0** 与 Schemastery **3.19.0**，使用对应 SDK 与冻结依赖；Node.js 最低版本为 **24.9.0**。
- 保留已有配置、会话与插件数据；原宿主的历史固定发行继续保留。

<a id="en-0-1-8-dsh-0-2-2-rc-1"></a>

## English

### Improvements and fixes

- Use matching native Workflow, PTC, child sessions and lifecycle while retaining budgets, background execution, cancellation and cold recovery.

### Other changes

- Target exactly DSH **0.2.2-rc.1**, Cordis **4.1.0** and Schemastery **3.19.0**, with matching SDK packages and frozen dependencies; require Node.js **24.9.0** or later.
- Preserve settings, conversations and plugin data. Historical releases remain available for their original hosts.

## 安装 / Installation

| DSH | 固定安装包 / Fixed package | 校验 / Checksums |
| --- | --- | --- |
| 0.2.2-rc.1 | [DSH Workflow 0.1.8](https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.8-dsh.0.2.2-rc.1/dsh-workflow-plus-0.1.8-dsh.0.2.2-rc.1.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.8-dsh.0.2.2-rc.1/SHA256SUMS) |

在 **插件 → 添加插件** 使用匹配的固定包。保留原 profile、配置与数据，安装后按宿主提示重载。

Use the matching fixed package in **Plugins → Add plugin**. Retain your profile, settings and data, then reload when requested.

[安装指南 / Installation guide](https://github.com/gulagala001/dsh-workflow/blob/main/docs/install.md)

---

## 未发布 · DSH 0.2.2-alpha.3

[中文](#alpha3-zh) | [English](#alpha3-en)

<a id="alpha3-zh"></a>

### 中文

- 增加 DSH 0.2.2-alpha.3 专用构建，精确对齐 SDK、Cordis 与依赖锁；保留当前主线功能和修复。此候选尚未发布，既有安装入口保持不变。

<a id="alpha3-en"></a>

### English

- Add a dedicated DSH 0.2.2-alpha.3 build with exact SDK, Cordis and dependency locks, retaining current features and fixes. This candidate is unpublished; existing installation links remain unchanged.

# DSH Workflow 0.1.7 · DSH 0.2.1-rc.5

[中文](#zh-017) | [English](#en-017)

<a id="zh-017"></a>

## 中文

### 问题修复

- 修复宿主模块工厂将延迟依赖提前加载的问题，避免 macOS 启动时载入 Windows 专用原生模块并干扰终端异常处理。
- 动态导入继续通过原组件的 Loader 树解析，保留宿主服务身份、按需加载与失败重试。

<a id="en-017"></a>

## English

### Bug Fixes

- Fix host factories eagerly loading deferred dependencies, which loaded Windows-only native modules on macOS and interfered with terminal error handling.
- Keep dynamic imports on the original component Loader tree, preserving host service identity, on-demand loading and retry after load failures.

## 安装 / Installation

精确宿主为 **DSH 0.2.1-rc.5**。在 **插件 → 添加插件** 中使用下方固定包，保留原有 profile、设置与会话。

The exact host is **DSH 0.2.1-rc.5**. Use the fixed package in **Plugins → Add plugin**, retaining existing profiles, settings and conversations.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.5 | [DSH Workflow 0.1.7](https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.7-dsh.0.2.1-rc.5/dsh-workflow-plus-0.1.7-dsh.0.2.1-rc.5.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.7-dsh.0.2.1-rc.5/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/dsh-workflow/blob/main/docs/install.md)

---

# DSH Workflow 0.1.6 · DSH 0.2.1-rc.5

[中文](#zh-016) | [English](#en-016)

<a id="zh-016"></a>

## 中文

### 其他变更

- 精确适配 DSH **0.2.1-rc.5**，同步匹配的 SDK、构建输入和完整依赖锁。每份安装包仅用于对应宿主。

<a id="en-016"></a>

## English

### Other Changes

- Target DSH **0.2.1-rc.5** exactly with matching SDK, build inputs and complete dependency locks. Each package is specific to its host.

## 安装 / Installation

精确宿主为 **DSH 0.2.1-rc.5**。在 **插件 → 添加插件** 中使用下方固定包，保留现有 profile、设置与会话；任务结束后按宿主提示重新加载。

The exact host is **DSH 0.2.1-rc.5**. Use the fixed package in **Plugins → Add plugin**, retaining profiles, settings and conversations; reload after active tasks finish if requested.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.5 | [DSH Workflow 0.1.6](https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.6-dsh.0.2.1-rc.5/dsh-workflow-plus-0.1.6-dsh.0.2.1-rc.5.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.6-dsh.0.2.1-rc.5/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/dsh-workflow/blob/main/docs/install.md)

---

# DSH Workflow 0.1.5 · DSH 0.2.1-rc.3

[中文](#zh-015) | [English](#en-015)

<a id="zh-015"></a>

## 中文

### 其他变更

- 精确适配 DSH 0.2.1-rc.3，同步匹配的 SDK、组件与冻结依赖；每份安装包仅用于对应宿主版本。

<a id="en-015"></a>

## English

### Other Changes

- Targets DSH 0.2.1-rc.3 exactly, with matching SDK, components and frozen dependencies; each package is specific to its host version.

## 安装 / Installation

在 **插件 → 添加插件** 使用下方固定包。精确宿主版本为 **DSH 0.2.1-rc.3**；保留原 profile、配置和数据，待任务结束后重启。

Install the fixed package through **Plugins → Add plugin** on **DSH 0.2.1-rc.3**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [DSH Workflow 0.1.5](https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.5-dsh.0.2.1-rc.3/dsh-workflow-plus-0.1.5-dsh.0.2.1-rc.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.5-dsh.0.2.1-rc.3/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-workflow/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/dsh-workflow/blob/main/docs/install_EN.md)

---

# DSH Workflow 0.1.4 · DSH 0.2.1-rc.2

[中文](#zh-014) | [English](#en-014)

<a id="zh-014"></a>

## 中文

### 体验优化

- 读取工作流历史时先判断工具归属，跳过无关工具正文，保留完整的任务结果与恢复材料。

<a id="en-014"></a>

## English

### Improvements

- Checks tool ownership before reading workflow history, skipping unrelated tool bodies while retaining complete task results and recovery material.

## 安装 / Installation

在 **插件 → 添加插件** 使用与当前 DSH 完整版本一致的固定包，保留原 profile、配置和数据，待任务结束后重启。

Install the fixed package matching the complete DSH version through **Plugins → Add plugin**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.2 | [DSH Workflow 0.1.4](https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.4-dsh.0.2.1-rc.2/dsh-workflow-plus-0.1.4-dsh.0.2.1-rc.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.4-dsh.0.2.1-rc.2/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-workflow/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/dsh-workflow/blob/main/docs/install_EN.md)

---

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

---

# DSH Workflow 0.1.2 · DSH 0.2.1-rc.2

[中文](#zh-012) | [English](#en-012)

<a id="zh-012"></a>

## 中文

### 其他变更

- 更新插件服务标识和双语安装文档，保持工作流执行、预算与恢复行为。
- 源码与编译产物分开维护，正式发行包含完整客户端和宿主模块。

<a id="en-012"></a>

## English

### Other Changes

- Updates service identities and bilingual installation documentation while retaining workflow execution, budgets and resumption.
- Maintains source separately from build output; formal releases include the complete client and host modules.

## 安装 / Installation

在 **插件 → 添加插件** 安装与当前 DSH 完整版本一致的固定包，保留原 profile、配置和数据，待当前任务结束后重启。

Install the fixed package matching the complete DSH version through **Plugins → Add plugin**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.2 | [DSH Workflow 0.1.2](https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.2-dsh.0.2.1-rc.2/dsh-workflow-plus-0.1.2-dsh.0.2.1-rc.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.2-dsh.0.2.1-rc.2/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-workflow/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/dsh-workflow/blob/main/docs/install_EN.md)

---

# Changelog

## 0.1.1-dsh.0.2.1-rc.2

- Declare the direct `@deepseek-ai/dsh-brand` guest build dependency for clean builds.
- Supersedes 0.1.0; runtime behavior and DSH 0.2.1-rc.2 compatibility are unchanged.


## 0.1.0-dsh.0.2.1-rc.2 — 2026-10-20

- 发布 Workflow 插件：保存脚本、一层嵌套、成功前缀续跑、共享输出目标、worktree、原生 Jobs 与工作流面板。
- 精确适配 DSH 0.2.1-rc.2；包名 `dsh-workflow-plus`，MIT 许可，固定 GitHub Release 分发。
- Workflow plugin: saved scripts, one nested level, successful-prefix resume, shared output targets, worktrees, native Jobs and workflow panels.
- Exact DSH 0.2.1-rc.2 support; package `dsh-workflow-plus`, MIT license and pinned GitHub Release distribution.

完整双语发行说明 / Full bilingual release notes: [docs/releases.md](https://github.com/gulagala001/dsh-workflow/releases).


# DSH Workflow 未发布 / Unreleased · DSH 0.2.1-rc.3

[中文](#zh-unreleased) | [English](#en-unreleased)

<a id="zh-unreleased"></a>

## 中文

### 问题修复

- 通过原生流解析读取 V4 嵌套用量回执，避免已有输出计量仍被当作未计量而阻止派发；同一次尝试的累计回执替换旧值，真正重试独立计量；记账保存失败不提交内存状态。内置同步记录源码提交。

<a id="en-unreleased"></a>

## English

### Bug Fixes

- Reads V4 nested usage through the native stream reader so measured output no longer blocks dispatch as unmetered. Cumulative receipts replace prior samples, actual retries are charged separately, and failed persistence does not commit in-memory accounting. Embedded synchronization records the source commit.

## 安装 / Installation

适用宿主 / Target host: **DSH 0.2.1-rc.3**。本节改动尚未发布安装包。 / No installation artifact has been published for these changes.
