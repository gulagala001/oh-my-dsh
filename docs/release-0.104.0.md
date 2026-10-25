# OMD 0.104.0 · DSH 0.2.1-rc.3

[中文](#zh-01040) | [English](#en-01040)

<a id="zh-01040"></a>

## 中文

### 新增功能

- 内置通用 Responses ID 自动续传，根据正常请求回执启用，减少历史图片与消息重复传输；与独立插件共装只接管一次。
- 内置人格调整为默认、超频、精算，会话人设默认开启；保留明确关闭设置和用户自定义内容。

### 体验优化

- 设置说明与控件按实际面板宽度换行；长选项在控件内滚动，保留原生选择指示器与键盘操作。

### 问题修复

- 修复空通知门户覆盖页面、导致所有点击无响应的问题，同时保护原生浏览器透明容器、网页光标和 Glyph 装饰层。
- 修复通知 Portal 更换后仍引用旧容器、人格设置窄面板规则未生效及多组分段控件重复 ID。

<a id="en-01040"></a>

## English

### New Features

- Adds generic Responses ID continuation from normal request receipts, reducing repeated image and message transmission. Standalone and bundled installations share one runtime.
- Built-in personas are now Default, Overclock and Economical, with session personalities enabled by default. Explicit opt-outs and custom content are preserved.

### Experience Improvements

- Settings descriptions and controls wrap based on panel space. Long choices scroll within the control while preserving the native indicator and keyboard navigation.

### Bug Fixes

- Fixes empty notification portals intercepting every page click, and protects native browser carriers, page cursors and Glyph decorations.
- Fixes stale notification portal targets, inactive narrow-panel rules in persona settings and duplicate segmented-control IDs.

## 安装 / Installation

在 **插件 → 添加插件** 使用下方固定包。精确宿主为 **DSH 0.2.1-rc.3**；保留原 profile、配置和会话，待任务结束后完整重启。

Install the fixed package through **Plugins → Add plugin** on **DSH 0.2.1-rc.3**. Preserve the profile, settings and conversations, then restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [OMD 0.104.0](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.0.104.0/oh-my-dsh-0.2.1-rc.3.omd.0.104.0.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.0.104.0/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install_EN.md)
