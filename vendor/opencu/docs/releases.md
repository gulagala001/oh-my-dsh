# OpenCU 2.1.0 · DSH 0.2.1-rc.1 / 0.2.1-rc.2

[中文](#zh-210) | [English](#en-210)

<a id="zh-210"></a>

## 中文

### 新增功能

- 新增 Linux Hyprland 原生控制后端，通过 compositor IPC 操作受控窗口，提供独立工作区和当前步骤控制条。

### 问题修复

- 修复桌面协议转发省略 Content-Length 时扩展 ZIP 无法下载的问题，兼容分块和压缩响应；保留类型、ETag、大小及完整性检查。
- 下载取消、错误及迟到响应统一释放读取流，拒绝非法长度、部分响应、空包和超过 8 MiB 的内容。
- Hyprland 控制支持取消和连接断开收尾，切换工作区后等待画面稳定；模型让出控制或发生拒绝时可靠交还桌面。

<a id="en-210"></a>

## English

### New Features

- Adds a native Linux Hyprland backend using compositor IPC to control windows, with an isolated workspace and a current-step control bar.

### Bug Fixes

- Fixes extension ZIP downloads when desktop protocol forwarding omits Content-Length, supports chunked and compressed responses, and retains type, ETag, size and completeness checks.
- Releases response streams on cancellation, errors and late responses, rejecting invalid lengths, partial responses, empty archives and content exceeding 8 MiB.
- Makes Hyprland control cancellable, cleans up disconnected sessions, waits for workspace transitions before capture and returns the desktop when the model yields or a control request is refused.

## 安装 / Installation

在 **插件 → 添加插件** 使用与当前 DSH 完整版本一致的固定包，保留原 profile、配置和数据，待任务结束后重启。

Install the fixed package matching the complete DSH version through **Plugins → Add plugin**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.2 | [OpenCU 2.1.0](https://github.com/gulagala001/opencu/releases/download/v2.1.0-dsh.0.2.1-rc.2/opencu-2.1.0-dsh.0.2.1-rc.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/opencu/releases/download/v2.1.0-dsh.0.2.1-rc.2/SHA256SUMS) |
| 0.2.1-rc.1 | [OpenCU 2.1.0](https://github.com/gulagala001/opencu/releases/download/v2.1.0-dsh.0.2.1-rc.1/opencu-2.1.0-dsh.0.2.1-rc.1.tgz) | [SHA256SUMS](https://github.com/gulagala001/opencu/releases/download/v2.1.0-dsh.0.2.1-rc.1/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/opencu/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/opencu/blob/main/docs/install_EN.md)
