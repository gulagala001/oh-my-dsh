# OMD 1.2.0 · DSH 0.2.1-rc.3

[中文](#zh-120) | [English](#en-120)

<a id="zh-120"></a>

## 中文

### 新增功能

- 新增 Claude Desktop 外观，完善消息、输入、模型选择、附件、权限与工作台交互。

### 问题修复

- 集成 OpenCU 2.2.2，修复浏览器、原生助手、审批、输入释放和冷恢复之间的阻塞与取消竞争；单个标签故障不再拖住其他标签。
- 聊天创建时即固定独立目录，首次及后续发送保持同一会话与目录；历史文件链接按消息当时的目录打开。
- 集成 Response ID Reuse 0.1.4，续传首个输出自动限时，临时错误只完整回退一次，冷却后自动尝试恢复。
- 修复离线依赖布局和原生 composer 控件构建定位，缺失或不匹配的宿主输入会明确阻止构建。

### 体验优化

- 人类操作只作为活动信息交给 AI，自主决定是否让步；明确停止保留原生取消行为。
- 运行安装包移除网站媒体和维护专用评测工具，完整展示仍保留在仓库与网站。

<a id="en-120"></a>

## English

### New Features

- Add the Claude Desktop appearance with refined conversation, composer, model, attachment, permission and workbench interaction.

### Bug Fixes

- Include OpenCU 2.2.2 to resolve blocking and cancellation races across browsers, native helpers, approvals, input release and cold recovery. A single-tab failure no longer stalls healthy tabs.
- Assign a stable independent directory when a chat is created, preserving the same session and directory across sends. Historical file links resolve against their message-time directory.
- Include Response ID Reuse 0.1.4 with adaptive first-output deadlines, a single full fallback for transient continuation failures and automatic recovery after cooldown.
- Fix native composer extraction and offline dependency layouts, explicitly rejecting missing or mismatched host build inputs.

### Improvements

- Report human activity to the AI, leaving yielding decisions to it while preserving explicit stop and cancellation.
- Exclude website media and maintenance-only evaluation tools from runtime packages, retaining full presentation in the repository and website.

## 安装 / Installation

精确宿主为 **DSH 0.2.1-rc.3**。在 **插件 → 添加插件** 中粘贴下方固定包地址。保留 profile、配置与会话，按宿主提示在任务结束后重新加载。

The exact host is **DSH 0.2.1-rc.3**. Paste the fixed package URL below into **Plugins → Add plugin**. Preserve profiles, configuration and conversations, and reload after active tasks finish if requested.

桌面侧栏的输入与关闭修复还需使用本版附带的 `vendor/opencu/host/` 适配源码重建匹配的桌面宿主，并在任务结束后完整重启。

The desktop sidebar input and closure fixes also require rebuilding the matching desktop host with this release’s `vendor/opencu/host/` adapter sources, followed by a full restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [OMD 0.2.1-rc.3.omd.1.2.0](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.1.2.0/oh-my-dsh-0.2.1-rc.3.omd.1.2.0.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.1.2.0/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md)
