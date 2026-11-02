# OMD 1.3.2 · DSH 0.2.1-rc.5

[中文](#zh-132) | [English](#en-132)

<a id="zh-132"></a>

## 中文

### 问题修复

- 在 Chrome / Edge 连接管理中可按目标重试释放输入，或在确认离线目标已永久关闭后清除其占用。
- 修复内置 OpenCU 的页面输入、截图、权限提示和预览恢复，改善慢导航和跨站重定向后的结果确认。
- 减少流式回复时 Claude Desktop 主题重复扫描聊天内容的开销，并跳过隐藏浏览器标签的无效绘制。
- 修复推荐插件下载失败后的恢复，以及冷启动时预设插件的安装。

<a id="en-132"></a>

## English

### Bug Fixes

- Retry input release for an individual target in Chrome / Edge connection settings, or clear its claim after confirming that an offline target is permanently closed.
- Fix page input, screenshots, permission notices and preview recovery in bundled OpenCU. Navigation receipts now account for slow loads and cross-site redirects.
- Reduce repeated transcript scans in the Claude Desktop theme during streaming replies and skip unnecessary rendering in hidden browser tabs.
- Recover failed recommended-plugin downloads and fix preset plugin installation on cold startup.

## 安装 / Installation

精确宿主为 **DSH 0.2.1-rc.5**。在 **插件 → 添加插件** 中使用下方固定包，保留原有 profile、设置与会话。

The exact host is **DSH 0.2.1-rc.5**. Use the fixed package in **Plugins → Add plugin**, retaining existing profiles, settings and conversations.

**终端、搜索与 Office 助手的桌面运行时修复需要同时用本版 `host-adapters.zip` 重建并重新封装匹配宿主，完成签名检查后完整重启；仅升级插件不会修复旧应用内的文件权限。**

**The desktop runtime fixes for terminal, search and Office helpers also require rebuilding and repacking the matching host with this release’s `host-adapters.zip`, verifying its signatures and fully restarting it. Updating only the plugin does not repair permissions inside an older app.**

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.5 | [OMD 1.3.2](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.5.omd.1.3.2/oh-my-dsh-0.2.1-rc.5.omd.1.3.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.5.omd.1.3.2/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md) · [宿主适配源码 / Host adapter sources](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.5.omd.1.3.2/host-adapters.zip)
