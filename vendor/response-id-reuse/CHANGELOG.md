# Response ID Reuse 0.1.2 · DSH 0.2.1-rc.3

[中文](#zh-012) | [English](#en-012)

<a id="zh-012"></a>

## 中文

### 问题修复

- 修复一次未存储回执或单个 ID 失效导致后续请求长时间全量重传的问题；普通请求可以重新建立续传，明确拒绝按请求类型隔离。
- 修复后台请求、不同历史和并发分支覆盖主对话续传链的问题；各自保留可用历史，按完整前缀精确匹配，同一 ID 不会被并发重复占用。
- ID 失效时在当次完整回退中重建存储，避免下一次再次全量发送；保留原始输入和模型参数。
- 修复共用运行实例被旧安装来源占用，导致升级后仍执行旧实现的问题；工具命名空间也参与历史匹配。

### 体验优化

- 减少大请求的重复序列化，降低本地处理和内存分配开销。
- 保留带图对话与工具往返的增量发送，后台请求不再挤掉主对话的续传候选。

<a id="en-012"></a>

## English

### Bug Fixes

- Prevent an unstored receipt or one expired ID from forcing extended full-history replay. Ordinary requests can establish continuation again, while explicit rejections stay scoped to the request shape.
- Preserve usable histories across background calls and concurrent branches. Match complete history prefixes and reserve each response ID only once at a time.
- Rebuild storage during the same full-history fallback after an expired ID, preserving original inputs and model parameters.
- Replace an older shared runtime when an updated installation loads, and include tool namespaces in history matching.

### Improvements

- Avoid repeated serialization of large requests to reduce local processing and allocations.
- Preserve incremental image and tool-result delivery without allowing background histories to displace main-dialogue candidates.

## 安装 / Installation

适用于 DSH **0.2.1-rc.3**。在 **插件 → 添加插件** 中粘贴固定包地址。更新保留原 profile、配置与数据；如宿主提示需要重启，请在当前任务结束后重启。

For DSH **0.2.1-rc.3**. Paste the fixed package URL into **Plugins → Add plugin**. Existing profiles, configuration and data are preserved; if the host requires a restart, finish active tasks before restarting.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [Response ID Reuse 0.1.2](https://github.com/gulagala001/dsh-response-id-reuse/releases/download/v0.1.2-dsh.0.2.1-rc.3/gulagala001-dsh-response-id-reuse-0.1.2-dsh.0.2.1-rc.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-response-id-reuse/releases/download/v0.1.2-dsh.0.2.1-rc.3/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-response-id-reuse/blob/main/README.md#安装) · [Installation guide](https://github.com/gulagala001/dsh-response-id-reuse/blob/main/README_EN.md#install)

---

# Response ID Reuse 0.1.1 · DSH 0.2.1-rc.3

[中文](#zh-011) | [English](#en-011)

<a id="zh-011"></a>

## 中文

### 问题修复

- 移除渠道和模型白名单，统一根据正常 Responses 回执确认存储能力并启用 ID 续传。
- 回退保留原始输入格式，历史匹配保留消息阶段信息。

### 体验优化

- 精简介绍、安装说明和发行文档。

<a id="en-011"></a>

## English

### Fixes

- Replace provider and model allowlists with storage confirmation from ordinary Responses receipts.
- Preserve original input formats on fallback and message phases during history matching.

### Improvements

- Simplify product, installation and release documentation.

## 安装 / Installation

在 DSH **0.2.1-rc.3** 的 **插件 → 添加插件** 中粘贴固定包地址。

Paste the fixed package URL into **Plugins → Add plugin** on DSH **0.2.1-rc.3**.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [Response ID Reuse 0.1.1](https://github.com/gulagala001/dsh-response-id-reuse/releases/download/v0.1.1-dsh.0.2.1-rc.3/gulagala001-dsh-response-id-reuse-0.1.1-dsh.0.2.1-rc.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-response-id-reuse/releases/download/v0.1.1-dsh.0.2.1-rc.3/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-response-id-reuse/blob/main/README.md#安装) · [Installation guide](https://github.com/gulagala001/dsh-response-id-reuse/blob/main/README_EN.md#install)

---

# Response ID Reuse 0.1.0 · DSH 0.2.1-rc.3

[中文](#zh-010) | [English](#en-010)

<a id="zh-010"></a>

## 中文

### 新增功能

- 提供 Responses ID 续传的初始实现，采用预设兼容规则。
- 保留图片、工具结果和完整请求回退，卸载自动撤销接管。

<a id="en-010"></a>

## English

### New Features

- Introduce Responses ID continuation with predefined compatibility rules.
- Preserve images, tool results and full-request fallback; release interception on uninstall.

## 安装 / Installation

在 DSH **0.2.1-rc.3** 的 **插件 → 添加插件** 中粘贴固定包地址。

Paste the fixed package URL into **Plugins → Add plugin** on DSH **0.2.1-rc.3**.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [Response ID Reuse 0.1.0](https://github.com/gulagala001/dsh-response-id-reuse/releases/download/v0.1.0-dsh.0.2.1-rc.3/gulagala001-dsh-response-id-reuse-0.1.0-dsh.0.2.1-rc.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-response-id-reuse/releases/download/v0.1.0-dsh.0.2.1-rc.3/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-response-id-reuse/blob/main/README.md#安装) · [Installation guide](https://github.com/gulagala001/dsh-response-id-reuse/blob/main/README_EN.md#install)
