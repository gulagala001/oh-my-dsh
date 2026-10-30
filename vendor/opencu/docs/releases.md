# OpenCU 2.2.4 · DSH 0.2.1-rc.5 · 未发布 / Unreleased

[中文](#zh-224) | [English](#en-224)

<a id="zh-224"></a>

## 中文

本版适配与验收正在进行，尚未发布。

### 问题修复

- 修复 Chromium 返回零时区偏移时的发送失败，统一转换为宿主接受的 UTC；独立安装与共装均可使用。
- 修复图片、网页、文档和文字批注的聊天显示，保留原始消息、附件和模型输入。
- 修复精确宿主构建中检查工具的依赖定位，避免预打包隐式重装已核验的 SDK。

### 其他变更

- 精确适配 DSH **0.2.1-rc.5**，同步匹配的 SDK、构建输入和完整依赖锁。每份安装包仅用于对应宿主。

<a id="en-224"></a>

## English

This adaptation is under validation and has not been published.

### Bug Fixes

- Normalize Chromium’s zero-offset time zone to the host-supported UTC value, restoring message submission in standalone and shared installations.
- Fix chat rendering of image, page, document and text annotations while preserving original messages, attachments and model input.
- Resolve validation dependencies correctly in exact-host builds and prevent prepack from reinstalling the verified SDK.

### Other Changes

- Target DSH **0.2.1-rc.5** exactly with matching SDK, build inputs and complete dependency locks. Each package is specific to its host.

## 安装 / Installation

待发布构建精确匹配 **DSH 0.2.1-rc.5**。当前公开安装包仍用于 **DSH 0.2.1-rc.3**，请勿混用。

The unpublished build targets **DSH 0.2.1-rc.5** exactly. The current public package remains for **DSH 0.2.1-rc.3**.

[当前公开包 / Current published package](https://github.com/gulagala001/opencu/releases/download/v2.2.3-dsh.0.2.1-rc.3/opencu-2.2.3-dsh.0.2.1-rc.3.tgz) · [SHA256SUMS](https://github.com/gulagala001/opencu/releases/download/v2.2.3-dsh.0.2.1-rc.3/SHA256SUMS)

---

# OpenCU 2.2.3 · DSH 0.2.1-rc.3

[中文](#zh-223) | [English](#en-223)

<a id="zh-223"></a>

## 中文

### 问题修复

- 修复 CU／BU 验证机的 Linux 进程查询参数，避免正常结束的场景被错误判定为清理失败；继续验证泄漏进程、独立进程组和嵌套取消。

### 其他变更

- 进程清理失败时输出明确原因；CI 在构建前检查实际进程监督能力。

<a id="en-223"></a>

## English

### Bug Fixes

- Fix Linux process-inventory arguments in the CU/BU verifier so completed scenarios are not incorrectly reported as cleanup failures. Leaked descendants, detached groups and nested cancellation remain checked.

### Other Changes

- Report explicit cleanup failure reasons and check real process supervision before the CI build.

## 安装 / Installation

适用于 **DSH 0.2.1-rc.3**。在 **插件 → 添加插件** 中粘贴下方固定包地址。保留 profile、配置与会话，按宿主提示在任务结束后重新加载。

For **DSH 0.2.1-rc.3**. Paste the fixed package URL below into **Plugins → Add plugin**. Preserve profiles, configuration and conversations, and reload after active tasks finish if requested.

此前桌面侧栏的输入与关闭修复仍需使用本版附带的 `host/` 适配源码重建匹配的桌面宿主，并在任务结束后完整重启。

The desktop sidebar input and closure fixes still require rebuilding the matching desktop host with this release's `host/` adapter sources, followed by a full restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [OpenCU 2.2.3](https://github.com/gulagala001/opencu/releases/download/v2.2.3-dsh.0.2.1-rc.3/opencu-2.2.3-dsh.0.2.1-rc.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/opencu/releases/download/v2.2.3-dsh.0.2.1-rc.3/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/opencu/blob/main/docs/install.md)
