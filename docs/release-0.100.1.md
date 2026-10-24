# OMD 0.100.1 · DSH 0.2.1-rc.3

[中文](#zh-01001) | [English](#en-01001)

<a id="zh-01001"></a>

## 中文

### 问题修复

- 对齐 rc.3 的原生更多菜单和草稿初始化；独立聊天找回匹配预设的未发送草稿，创建插件保留指定预设与追加语义。
- 统一插件卸载、会话总览、Dream、任务历史和更新预检的原生生命周期，修复迟到回执、取消与恢复交错。
- 减少重复依赖加载、长历史回查和后台预处理的重复工作，保留完整原文、附件与任务结果。

### 其他变更

- 精确适配 DSH 0.2.1-rc.3，同步匹配的 SDK、组件与冻结依赖；每份安装包仅用于对应宿主版本。

<a id="en-01001"></a>

## English

### Bug Fixes

- Aligns with rc.3 native More menus and draft initialization; projectless chats recover unsent drafts for the matching preset, and Create Plugin preserves the requested preset and append behavior.
- Aligns plugin unload, conversation overview, Dream, task history and update preflight with native lifecycles, fixing late receipts, cancellation and recovery races.
- Reduces repeated dependency loading, historical retrieval and background preparation while preserving full source text, attachments and task results.

### Other Changes

- Targets DSH 0.2.1-rc.3 exactly, with matching SDK, components and frozen dependencies; each package is specific to its host version.

## 安装 / Installation

在 **插件 → 添加插件** 使用下方固定包。精确宿主版本为 **DSH 0.2.1-rc.3**；保留原 profile、配置和数据，待任务结束后重启。

Install the fixed package through **Plugins → Add plugin** on **DSH 0.2.1-rc.3**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [OMD 0.100.1](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.0.100.1/oh-my-dsh-0.2.1-rc.3.omd.0.100.1.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.0.100.1/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install_EN.md)
