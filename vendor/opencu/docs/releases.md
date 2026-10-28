# OpenCU 2.2.2 · DSH 0.2.1-rc.3 · 未发布 / Unreleased

[中文](#zh-222) | [English](#en-222)

<a id="zh-222"></a>

## 中文

本版正在准备，尚未公开发布。

### 问题修复

- 修复权限、下载历史、审批和展示回调阻塞输入释放及后续操作的问题。
- 修复单个浏览器标签断开、命令超时或扩展冷恢复导致其他标签无法继续操作的问题，保留原目标的输入责任与恢复凭据。
- 修复取消、标签关闭和迟到回执之间的竞争，已关闭的浏览器视图不再被旧回调重新打开。
- 修复原生助手断流、异常响应及重新启动后的恢复；只释放 AI 自己持有的输入，不重放结果未知的操作。
- 人类点击、输入、滚动和切换窗口作为活动信息提供给 AI；是否让步由 AI 决定，明确停止仍立即取消执行。

### 其他变更

- 加入可重放的 CU／BU 故障验证入口、源码等待点登记和进程清理检查，并修复隔离宿主打包门禁的源码定位。

<a id="en-222"></a>

## English

This release is being prepared and has not been published.

### Bug Fixes

- Prevent permissions, download history, approval and presentation waits from blocking input release and subsequent operations.
- Keep healthy browser tabs usable after a single-tab disconnect, command timeout or extension restart, retaining the original target’s input obligations and recovery credentials.
- Resolve cancellation, tab closure and late-reply races without reopening closed browser surfaces.
- Recover native helpers after broken streams, invalid responses and restarts. Release only AI-owned input and never replay actions with unknown outcomes.
- Report human clicks, typing, scrolling and window changes to the AI without automatically stopping it. Explicit stop still cancels execution.

### Other Changes

- Add replayable CU/BU fault checks, asynchronous source inventory and process cleanup verification; fix source resolution for isolated host packaging.

## 安装 / Installation

精确宿主为 **DSH 0.2.1-rc.3**。待发布包名为 `opencu-2.2.2-dsh.0.2.1-rc.3.tgz`；当前公开安装入口继续使用下方已发布版本。保留 profile、配置与会话，按宿主提示在任务结束后重新加载。

The exact host is **DSH 0.2.1-rc.3**. The prepared package is `opencu-2.2.2-dsh.0.2.1-rc.3.tgz`; use the existing published package below until this release is available. Preserve profiles, configuration and conversations, and reload after active tasks finish if requested.

| DSH | 当前公开安装包 / Current published package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [OpenCU 2.2.1-dsh.0.2.1-rc.3](https://github.com/gulagala001/opencu/releases/download/v2.2.1-dsh.0.2.1-rc.3/opencu-2.2.1-dsh.0.2.1-rc.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/opencu/releases/download/v2.2.1-dsh.0.2.1-rc.3/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/opencu/blob/main/docs/install.md)
