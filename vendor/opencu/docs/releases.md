# OpenCU 2.0.7 · DSH 0.2.1-rc.1 / 0.2.1-rc.2

[中文](#zh-207) | [English](#en-207)

<a id="zh-207"></a>

## 中文

### 新增功能

- 前端按需加载浏览器、文档与预览组件，保留统一工作台和共享服务。

### 体验优化

- 复用浏览器活动监测、目标描述和已交付预览；精确选择目标时减少重复发现。
- 将连续浏览器预览合成移出界面线程，worker 进度只传新增文本，保留完整 AX、最终结果、附件与历史。

### 问题修复

- 贯通目标发现、扩展选择与聚焦的取消，修复目标替换、浏览器恢复和挂起读取之间的冲突。
- 失败或取消时收尾已派发调用；输入释放失败保留重试责任，空闲会话退出也处理待释放输入。
- 修复应用审批反馈、扩展目录与下载交互，完善 Windows 原生控件归属校验、读树超时和授权诊断。

### 其他变更

- 公开文件检查覆盖当前加载入口、前端分块、清单与逐文件哈希，测试夹具同步当前服务契约。

<a id="en-207"></a>

## English

### New Features

- Loads browser, document and preview components on demand while retaining the unified workspace and shared services.

### Improvements

- Reuses browser activity monitoring, target descriptors and delivered previews; exact target selection avoids repeated discovery.
- Moves continuous preview composition off the UI thread and transfers incremental worker progress while retaining complete AX, final results, attachments and history.

### Bug Fixes

- Connects cancellation across discovery, extension selection and focus, and resolves conflicts involving target replacement, browser recovery and stalled reads.
- Settles dispatched calls on failure or cancellation; failed input release remains retryable, including during idle-session shutdown.
- Fixes application-approval feedback and extension-folder/download interactions; improves Windows control ownership, tree-read timeouts and approval diagnostics.

### Other Changes

- Distribution checks cover the current loader, frontend chunks, manifests and file hashes; test fixtures follow the current service contract.

## 安装 / Installation

在 **插件 → 添加插件** 安装与当前 DSH 完整版本一致的固定包，保留原 profile、配置和数据，待当前任务结束后重启。

Install the fixed package matching the complete DSH version through **Plugins → Add plugin**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.1 | [OpenCU 2.0.7](https://github.com/gulagala001/opencu/releases/download/v2.0.7-dsh.0.2.1-rc.1/opencu-2.0.7-dsh.0.2.1-rc.1.tgz) | [SHA256SUMS](https://github.com/gulagala001/opencu/releases/download/v2.0.7-dsh.0.2.1-rc.1/SHA256SUMS) |
| 0.2.1-rc.2 | [OpenCU 2.0.7](https://github.com/gulagala001/opencu/releases/download/v2.0.7-dsh.0.2.1-rc.2/opencu-2.0.7-dsh.0.2.1-rc.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/opencu/releases/download/v2.0.7-dsh.0.2.1-rc.2/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/opencu/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/opencu/blob/main/docs/install_EN.md)
