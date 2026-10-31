# OMD 1.2.3 · DSH 0.2.1-rc.5

[中文](#zh-123) | [English](#en-123)

<a id="zh-123"></a>

## 中文

### 问题修复

- 集成 OpenCU 2.2.5，修复目标发现、初始化及原生只读查询的取消与故障隔离，并保留停止来源和输入释放明细。
- 改进上下文预处理的摘要与用户决定校验：明确失败字段、长度及原话引用问题，并将具体原因传给重试；保留原始材料与原有恢复机制。
- 修复取消错误首行显示为对象或重复笼统错误的问题，保留调用已经产生的有效输出。
- 同步匹配桌面宿主的 Office 生命周期、停止期间注册及欢迎页认证 Cookie 衔接修复。

<a id="en-123"></a>

## English

### Bug Fixes

- Include OpenCU 2.2.5 with cancellable discovery and initialization, isolated native read failures, and retained stop-source and input-release details.
- Improve context-preparation validation with precise field, length and source-quotation errors and pass those details to retries, preserving original material and recovery behavior.
- Fix cancellation messages that showed an object or repeated generic errors, while retaining useful output already produced by the call.
- Include matching desktop-host fixes for Office lifetime, registration during shutdown and authenticated Host cookie reuse by the welcome page.

## 安装 / Installation

精确宿主为 **DSH 0.2.1-rc.5**。在 **插件 → 添加插件** 中使用下方固定包，保留现有 profile、设置与会话；任务结束后按宿主提示重新加载。

The exact host is **DSH 0.2.1-rc.5**. Use the fixed package in **Plugins → Add plugin**, retaining profiles, settings and conversations; reload after active tasks finish if requested.

桌面启动认证、Office 生命周期及完整电脑操作增强需要使用本版 `host-adapters.zip` 重建匹配的桌面宿主后完整重启。

Desktop startup authentication, Office lifecycle and full computer-use enhancements require rebuilding the matching desktop host with this release’s `host-adapters.zip`, then restarting fully.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.5 | [OMD 1.2.3](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.5.omd.1.2.3/oh-my-dsh-0.2.1-rc.5.omd.1.2.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.5.omd.1.2.3/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md) · [宿主适配源码 / Host adapter sources](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.5.omd.1.2.3/host-adapters.zip)
