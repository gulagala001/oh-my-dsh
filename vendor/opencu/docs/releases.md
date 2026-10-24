# OpenCU 2.2.0 · DSH 0.2.1-rc.3

[中文](#zh-220) | [English](#en-220)

<a id="zh-220"></a>

## 中文

### 新增功能

- 浏览器文件选择器支持真实订阅、多文件选择和跨框架文件上传，独立浏览器提供隔离剪贴板。
- 定位点击支持修饰键和连续拖拽，元素滚动根据实时几何计算整页距离。

### 问题修复

- 成组修复导航、同文档历史、iframe 对话框、原生 WebMCP 和关闭回执的生命周期，超时或取消后可继续观察恢复。
- 修复原生控件、键盘编辑及跨框架输入被误记为人工操作的问题，以及展示窗口初始化和重试按钮事件。
- 修复 macOS 菜单和模态窗口的操作、截图与屏幕捕获权限保留。

<a id="en-220"></a>

## English

### New Features

- Adds real browser file-chooser subscriptions, multiple-file and cross-frame uploads, and an isolated clipboard for owned browsers.
- Adds modifier clicks, continuous drag paths and element page scrolling based on live geometry.

### Bug Fixes

- Fixes navigation, same-document history, iframe dialogs, native WebMCP and closure receipts together, allowing observation and recovery after timeouts or cancellation.
- Fixes native controls, keyboard editing and cross-frame input being mistaken for human activity, plus presentation initialization and retry controls.
- Fixes macOS menu and modal interaction, capture targeting and independent screen-capture permission retention.

## 安装 / Installation

在 **插件 → 添加插件** 使用下方固定包。精确宿主为 **DSH 0.2.1-rc.3**；保留原 profile、配置与数据，待任务结束后完整重启。

Install the fixed package through **Plugins → Add plugin** on **DSH 0.2.1-rc.3**. Preserve settings and data, then restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [OpenCU 2.2.0](https://github.com/gulagala001/opencu/releases/download/v2.2.0-dsh.0.2.1-rc.3/opencu-2.2.0-dsh.0.2.1-rc.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/opencu/releases/download/v2.2.0-dsh.0.2.1-rc.3/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/opencu/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/opencu/blob/main/docs/install_EN.md)
