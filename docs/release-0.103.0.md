# OMD 0.103.0 · DSH 0.2.1-rc.3

[中文](#zh-01030) | [English](#en-01030)

<a id="zh-01030"></a>

## 中文

### 新增功能

- 各工作区与全局独立记住最后手动选择的模型渠道、模型和思考档位；查看旧会话与自动恢复设置不覆盖偏好。

### 体验优化

- 每个工作区和全局分别复用一份未发送草稿，保留文字与附件；切换预设不再另建草稿。独立聊天发送成功后继续复用原草稿载体。

### 问题修复

- 模型名称、思考档位和可用性统一跟随原生选择，修复旧模型缓存与已消费选择导致的错误提示。失效渠道直接显示可重新选择的模型列表。
- 修复 rc.3 多主题顶栏中的标题挤压、按钮越界、视图标签间距和空占位，调整 macOS 顶栏预留。
- 移除新建时复制当前会话整套设置的旧路径，并阻止全局草稿发送期间额外创建载体。

<a id="en-01030"></a>

## English

### New Features

- Each workspace and the global scope independently remember the last manually selected provider, model and reasoning effort. Viewing old conversations and automatic restoration do not overwrite preferences.

### Experience Improvements

- Reuse one unsent draft per workspace and one global draft, preserving text and attachments across preset changes. Successful projectless sends reuse the original draft carrier.

### Bug Fixes

- Model names, reasoning effort and availability follow native selection, fixing stale cached and consumed choices. Unavailable routes open the actionable model picker.
- Fix squeezed titles, overflowing actions, view-tab spacing and empty leading slots across rc.3 themes, including macOS header clearance.
- Remove the old new-chat path that copied all settings from the viewed conversation, and prevent extra global carriers while a first send is pending.

## 安装 / Installation

在 **插件 → 添加插件** 使用下方固定包。精确宿主为 **DSH 0.2.1-rc.3**；保留原 profile、配置和正式会话，待任务结束后完整重启。

Install the fixed package through **Plugins → Add plugin** on **DSH 0.2.1-rc.3**. Preserve the profile, settings and existing conversations, then restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [OMD 0.103.0](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.0.103.0/oh-my-dsh-0.2.1-rc.3.omd.0.103.0.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.0.103.0/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install_EN.md)
