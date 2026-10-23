# OMD 0.100.0 · DSH 0.2.1-rc.1 / 0.2.1-rc.2

[中文](#zh-01000) | [English](#en-01000)

<a id="zh-01000"></a>

## 中文

### 新增功能

- 新增 OMD 默认、DSH 原生、Codex、Cursor、Pi、Grok、ZCode 七种系统提示词风格；支持全局设置和可选会话独立选择，修改从下一回合生效。
- 新增按渠道配置的多图请求修复，默认启用 CMD；仅在数量或总大小超限时卸载旧图片，保留最新未读批次、原附件及回查。
- 插件安装前默认运行隔离预检，检查启动与界面装载；失败时可取消、强行安装或复制 AI 修复信息。

### 体验优化

- 设置页新增窄文字目录、滚动高亮及窄窗口分组菜单，支持 Dream 快捷定位和高级分组自动展开。
- 减少监控历史重导入、旧累计补算、工作流历史读取与备份目录检查的重复工作，并复用插件预检宿主及原生工具缓存。

### 问题修复

- 修复扁平依赖安装下插件预检副本的依赖查找，启动诊断明确返回实际错误；补齐原文回查所需的原生会话依赖声明。

- 首批预处理按有效事实材料满窗触发，统一预算等待、回退和重启恢复；多图失败重建请求后继续发送，不重复执行工具。
- 修复 Dream 停止、自动开关、手动继续和跨进程控制的状态竞争；提示词优化保留完整草稿、版本和待应用结果。
- 为 PTC 准备、执行及收尾补齐超时和取消，实时显示当前模式；回退统一任务历史截点，备份锁等待有界且可取消。
- 修复 CodeGraph 失败探测与连接恢复归属，统一侧聊终止回执和取消收尾，并修复桌面扩展 ZIP 下载。

### 其他变更

- 更新内置 OpenCU 2.1.0、Workflow 0.1.4、Rewind 0.1.3 与 BTW 0.1.3；OpenCU 新增 Hyprland 原生控制。

<a id="en-01000"></a>

## English

### New Features

- Adds seven system-prompt styles: OMD Default, DSH Native, Codex, Cursor, Pi, Grok and ZCode, with global settings and optional per-conversation choices applied from the next turn.
- Adds provider-specific image-request repair, enabled for CMD by default; older images are unloaded only when count or total-size limits are exceeded, preserving the latest unread batch, original attachments and retrieval.
- Runs an isolated preflight before plugin installation to check startup and UI loading, with cancel, force-install and copy-for-AI-repair actions on failure.

### Improvements

- Adds a compact settings table of contents, scroll highlighting and a grouped menu in narrow windows, including Dream shortcuts and automatic expansion of advanced settings.
- Reduces duplicate work in monitor-history reimport, legacy-counter reconciliation, workflow-history reads and backup-directory checks, and reuses the preflight host and native tool caches.

### Bug Fixes

- Fixes dependency resolution for preflight copies of hoisted installations and reports actual startup diagnostics; declares the native Session dependency required by original-history search.

- Triggers initial preparation only after a full window of factual material, aligning budget waits and rewind/restart recovery; image-limit recovery rebuilds the request without rerunning tools.
- Fixes Dream state races involving stop, automatic mode, manual continuation and cross-process control; prompt optimization preserves complete drafts, versions and pending results.
- Adds timeouts and cancellation to PTC preparation, execution and settlement, and shows the current mode accurately; rewind shares task-history boundaries and backup lock waits are bounded and cancellable.
- Fixes CodeGraph failure ownership and reconnection, aligns side-chat terminal receipts and cancellation settlement, and repairs desktop extension ZIP downloads.

### Other Changes

- Updates bundled OpenCU to 2.1.0, Workflow to 0.1.4, Rewind to 0.1.3 and BTW to 0.1.3; OpenCU adds native Hyprland control.

## 安装 / Installation

在 **插件 → 添加插件** 使用与当前 DSH 完整版本一致的固定包，保留原 profile、配置和数据，待任务结束后重启。

Install the fixed package matching the complete DSH version through **Plugins → Add plugin**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.2 | [OMD 0.100.0](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.100.0/oh-my-dsh-0.2.1-rc.2.omd.0.100.0.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.100.0/SHA256SUMS) |
| 0.2.1-rc.1 | [OMD 0.100.0](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.100.0/oh-my-dsh-0.2.1-rc.1.omd.0.100.0.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.100.0/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install_EN.md)
