# OpenCU 2.2.1 · DSH 0.2.1-rc.3

[中文](#zh-221) | [English](#en-221)

<a id="zh-221"></a>

## 中文

### 问题修复

- 通知随隐藏浏览器宿主进入带样式的隔离 Portal，避免空通知层拦截整页点击。
- 透明 Portal、原生浏览器容器和网页光标在挂载时保护点击穿透，不再依赖宿主或网页样式的存在与优先级。
- 修复通知 Portal 更换时继续引用旧容器的问题，保留通知关闭、键盘操作和正常交互。

<a id="en-221"></a>

## English

### Bug Fixes

- Mounts hidden-browser notifications inside styled isolated portals, preventing empty notification layers from blocking page input.
- Protects hit transparency when portals, native browser carriers and page cursors mount, independently of host or page stylesheet precedence.
- Updates notification targets when their portal changes, preserving notification dismissal, keyboard access and normal interaction.

## 安装 / Installation

在 **插件 → 添加插件** 使用下方固定包。精确宿主为 **DSH 0.2.1-rc.3**；保留原 profile、配置和会话，待任务结束后完整重启。

Install the fixed package through **Plugins → Add plugin** on **DSH 0.2.1-rc.3**. Preserve the profile, settings and conversations, then restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [OpenCU 2.2.1](https://github.com/gulagala001/opencu/releases/download/v2.2.1-dsh.0.2.1-rc.3/opencu-2.2.1-dsh.0.2.1-rc.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/opencu/releases/download/v2.2.1-dsh.0.2.1-rc.3/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/opencu/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/opencu/blob/main/docs/install_EN.md)
