# OMD 1.3.1 · DSH 0.2.1-rc.5

[中文](#zh-131) | [English](#en-131)

<a id="zh-131"></a>

## 中文

### 问题修复

- 修复 macOS 打开终端时可能导致宿主退出的问题：会话迁移与内置 Workflow 保留原本的延迟导入，避免提前加载 Windows 专用原生模块。
- 集成 DSH Workflow 0.1.7 与 OpenCU 2.2.7；匹配的桌面宿主适配隔离原生符号，并修复终端、搜索和 Office 助手在重打包后丢失执行权限的同类问题。
- 终端助手路径与启动失败经过显式检查，宿主打包验证实际终端收发、缩放、退出及原生错误返回。

<a id="en-131"></a>

## English

### Bug Fixes

- Fix a macOS terminal-opening crash by preserving lazy imports in session migration and bundled Workflow, avoiding premature loading of Windows-only native modules.
- Include DSH Workflow 0.1.7 and OpenCU 2.2.7. Matching desktop adapters isolate native symbols and restore terminal, search and Office helper executable permissions after repacking.
- Validate terminal helper paths and startup failures, and check real terminal input, output, resize, exit and native error handling during host packaging.

## 安装 / Installation

精确宿主为 **DSH 0.2.1-rc.5**。在 **插件 → 添加插件** 中使用下方固定包，保留原有 profile、设置与会话。

The exact host is **DSH 0.2.1-rc.5**. Use the fixed package in **Plugins → Add plugin**, retaining existing profiles, settings and conversations.

**终端、搜索与 Office 助手的桌面运行时修复需要同时用本版 `host-adapters.zip` 重建并重新封装匹配宿主，完成签名检查后完整重启；仅升级插件不会修复旧应用内的文件权限。**

**The desktop runtime fixes for terminal, search and Office helpers also require rebuilding and repacking the matching host with this release’s `host-adapters.zip`, verifying its signatures and fully restarting it. Updating only the plugin does not repair permissions inside an older app.**

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.5 | [OMD 1.3.1](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.5.omd.1.3.1/oh-my-dsh-0.2.1-rc.5.omd.1.3.1.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.5.omd.1.3.1/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md) · [宿主适配源码 / Host adapter sources](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.5.omd.1.3.1/host-adapters.zip)
