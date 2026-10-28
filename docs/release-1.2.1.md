# OMD 1.2.1 · DSH 0.2.1-rc.3

[中文](#zh-121) | [English](#en-121)

<a id="zh-121"></a>

## 中文

### 问题修复

- 集成 OpenCU 2.2.3。修复 CU／BU 验证机的 Linux 进程查询参数，避免正常结束的场景被错误判定为清理失败；继续验证泄漏进程、独立进程组和嵌套取消。

### 其他变更

- 进程清理失败时输出明确原因；CI 在构建前检查实际进程监督能力。

<a id="en-121"></a>

## English

### Bug Fixes

- Include OpenCU 2.2.3. Fix Linux process-inventory arguments in the CU/BU verifier so completed scenarios are not incorrectly reported as cleanup failures. Leaked descendants, detached groups and nested cancellation remain checked.

### Other Changes

- Report explicit cleanup failure reasons and check real process supervision before the CI build.

## 安装 / Installation

适用于 **DSH 0.2.1-rc.3**。在 **插件 → 添加插件** 中粘贴下方固定包地址。保留 profile、配置与会话，按宿主提示在任务结束后重新加载。

For **DSH 0.2.1-rc.3**. Paste the fixed package URL below into **Plugins → Add plugin**. Preserve profiles, configuration and conversations, and reload after active tasks finish if requested.

此前桌面侧栏的输入与关闭修复仍需使用本版附带的 `vendor/opencu/host/` 适配源码重建匹配的桌面宿主，并在任务结束后完整重启。

The desktop sidebar input and closure fixes still require rebuilding the matching desktop host with this release's `vendor/opencu/host/` adapter sources, followed by a full restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [OMD 1.2.1](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.1.2.1/oh-my-dsh-0.2.1-rc.3.omd.1.2.1.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.1.2.1/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md)
