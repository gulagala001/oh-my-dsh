# DSH Workflow 0.1.6 · DSH 0.2.1-rc.5

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

完整双语发行说明 / Full bilingual release notes: [docs/releases.md](docs/releases.md).


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
