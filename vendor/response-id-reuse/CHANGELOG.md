# Response ID Reuse 0.1.5 · DSH 0.2.1-rc.5

[中文](#zh-015) | [English](#en-015)

<a id="zh-015"></a>

## 中文

本版适配与验收正在进行，尚未发布。

### 其他变更

- 精确适配 DSH **0.2.1-rc.5**，同步匹配的 SDK、构建输入和完整依赖锁。每份安装包仅用于对应宿主。

<a id="en-015"></a>

## English

This adaptation is under validation and has not been published.

### Other Changes

- Target DSH **0.2.1-rc.5** exactly with matching SDK, build inputs and complete dependency locks. Each package is specific to its host.

## 安装 / Installation

精确宿主为 **DSH 0.2.1-rc.5**。在 **插件 → 添加插件** 中使用下方固定包，保留现有 profile、设置与会话；任务结束后按宿主提示重新加载。

The exact host is **DSH 0.2.1-rc.5**. Use the fixed package in **Plugins → Add plugin**, retaining profiles, settings and conversations; reload after active tasks finish if requested.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.5 | [Response ID Reuse 0.1.5](https://github.com/gulagala001/dsh-response-id-reuse/releases/download/v0.1.5-dsh.0.2.1-rc.5/gulagala001-dsh-response-id-reuse-0.1.5-dsh.0.2.1-rc.5.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-response-id-reuse/releases/download/v0.1.5-dsh.0.2.1-rc.5/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/dsh-response-id-reuse/blob/main/README.md)

---

# Response ID Reuse 0.1.4 · DSH 0.2.1-rc.3

[中文](#zh-014) | [English](#en-014)

<a id="zh-014"></a>

## 中文

### 问题修复

- 为流式 ID 续传设置自适应首个有效输出等待时间；超时或临时服务端错误时仅完整回退一次，不再因心跳或空消息无限等待。
- 临时故障保留父响应 ID，自动冷却后放行一条正常请求试恢复，避免长时间全量回传或并发请求相互清除故障状态。
- 限制失败正文的读取时间和大小，避免重试后的错误处理再次卡住。

### 体验优化

- 沿用实际请求的模型、参数、历史与取消语义，不增加设置或额外模型探测。

<a id="en-014"></a>

## English

### Bug Fixes

- Bound the first useful output of streamed ID continuation with an adaptive deadline. Timeouts and transient server errors allow one full replay; heartbeats and empty messages do not extend the wait indefinitely.
- Retain parent response IDs during transient failures, then allow one normal request after cooldown to test recovery without cross-request health-state resets.
- Bound error-body reads by time and size so failed fallback handling cannot hang again.

### Improvements

- Preserve the model, parameters, history and cancellation semantics of the real request, without new settings or extra model probes.

## 安装 / Installation

精确宿主为 **DSH 0.2.1-rc.3**。在 **插件 → 添加插件** 中粘贴下方固定包地址。保留 profile、配置与会话，按宿主提示在任务结束后重新加载。

The exact host is **DSH 0.2.1-rc.3**. Paste the fixed package URL below into **Plugins → Add plugin**. Preserve profiles, configuration and conversations, and reload after active tasks finish if requested.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [Response ID Reuse 0.1.4-dsh.0.2.1-rc.3](https://github.com/gulagala001/dsh-response-id-reuse/releases/download/v0.1.4-dsh.0.2.1-rc.3/gulagala001-dsh-response-id-reuse-0.1.4-dsh.0.2.1-rc.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-response-id-reuse/releases/download/v0.1.4-dsh.0.2.1-rc.3/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/dsh-response-id-reuse/blob/main/README.md)

---

# Response ID Reuse 0.1.3 · DSH 0.2.1-rc.3

[中文](#zh-013) | [English](#en-013)

<a id="zh-013"></a>

## 中文

### 问题修复

- 根据实际存储回执核对历史思考的回放表示，统一 ID 续传、全量回退与冷恢复，修复切换路径时旧思考重新计入输入、缓存前缀突变的问题。
- 保留可重复使用的父响应 ID，网络重试、后台整理与并发分支不再提前消耗彼此的续传历史；明确失效时仅清理对应 ID。
- 历史匹配保留消息的其他有效字段，避免不同内容误用同一续传前缀。

### 体验优化

- 自动回读已存储响应，无需渠道名单或新增设置，不启动额外模型推理。
- 未能核验的内容、未知来源和加密思考保持原生回传；原始会话日志保持完整。

<a id="en-013"></a>

## English

### Bug Fixes

- Verify reasoning replay against stored response receipts so ID continuation, full fallback and cold recovery use consistent history, avoiding reintroduced reasoning and unexpected cache-prefix changes.
- Keep reusable parent response IDs across network retries, background preparation and concurrent branches. Explicit invalidation removes only the rejected ID.
- Preserve additional meaningful message fields when matching history prefixes.

### Improvements

- Read stored responses automatically without a provider allowlist, new settings or additional model inference.
- Preserve native replay for unverified content, unknown origins and encrypted reasoning. Original conversation logs remain intact.

## 安装 / Installation

适用于 DSH **0.2.1-rc.3**。在 **插件 → 添加插件** 中粘贴固定包地址。更新保留 profile、配置和会话；按宿主提示在当前任务结束后重新加载。

For DSH **0.2.1-rc.3**. Paste the fixed package URL into **Plugins → Add plugin**. Profiles, configuration and conversations are preserved; reload after active tasks finish if requested by the host.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [Response ID Reuse 0.1.3](https://github.com/gulagala001/dsh-response-id-reuse/releases/download/v0.1.3-dsh.0.2.1-rc.3/gulagala001-dsh-response-id-reuse-0.1.3-dsh.0.2.1-rc.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-response-id-reuse/releases/download/v0.1.3-dsh.0.2.1-rc.3/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-response-id-reuse/blob/v0.1.3-dsh.0.2.1-rc.3/README.md#安装) · [Installation guide](https://github.com/gulagala001/dsh-response-id-reuse/blob/v0.1.3-dsh.0.2.1-rc.3/README_EN.md#install)

---

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
