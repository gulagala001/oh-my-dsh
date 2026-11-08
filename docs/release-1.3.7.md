# Oh My DSH 1.3.7 · DSH 0.2.2-rc.1

[中文](#zh-137) · [English](#en-137)

<a id="zh-137"></a>

## 中文

### 问题修复

- 修复 macOS Electron 原生窗口的辅助功能语义树初始化，使按钮与标签可以后台点击；保留目标身份核验、取消和历史释放义务隔离。
- 统一电脑操作的坐标参数与 Retina 截图换算，修复多窗口精确绑定，并明确显示未确认输入回执和 REPL 重复声明提示。
- 修复 BTW 发送、停止、历史及关闭按钮的悬停提示错位；修复内置旁聊服务被宿主生命周期卸载导致发送 404 的问题。
- 同步 OpenCU 2.2.11 与 DSH BTW 0.1.8。

<a id="en-137"></a>

## English

### Bug Fixes

- Fix accessibility initialization for native macOS Electron windows so buttons and tabs support background clicks, retaining target identity, cancellation and isolation of historical release obligations.
- Unify computer-use coordinate arguments and Retina screenshot mapping, fix exact multi-window binding, and expose unconfirmed input receipts and actionable REPL redeclaration errors.
- Fix BTW action tooltip positioning and an embedded side-chat lifecycle error that unloaded its service and caused HTTP 404 on send.
- Update bundled OpenCU to 2.2.11 and DSH BTW to 0.1.8.

## 安装 / Installation

精确宿主为 **DSH 0.2.2-rc.1**，Node.js **24.9.0+**。在 **插件 → 添加插件** 中使用固定安装包，沿用现有 profile、设置与会话，按宿主提示完整重启。

Targets exactly **DSH 0.2.2-rc.1**, with Node.js **24.9.0+**. Add the fixed package in **Plugins → Add plugin**, keep the existing profile, settings and conversations, and fully restart when prompted.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.2-rc.1 | [Oh My DSH 1.3.7](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.1.omd.1.3.7/oh-my-dsh-0.2.2-rc.1.omd.1.3.7.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.1.omd.1.3.7/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md) · [宿主适配源码 / Host adapter sources](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.1.omd.1.3.7/host-adapters.zip)
