# DeepSeek Workbench

在 DeepSeek Harness 中使用 DeepSeek 网页聊天、临时侧栏聊天和 API 开放平台，并将网页历史迁移为可继续的 DSH 会话。

- 左侧 **DeepSeek 网页聊天** 打开主内容区的普通网页聊天，支持历史、深度思考、联网搜索和附件。
- `/侧栏（网页版）` 在右侧打开独立的临时网页聊天，关闭时删除本次官网对话；清理失败保留面板并允许重试。
- **设置 → 账号** 打开 API 开放平台；官网聊天登录与 DSH 的平台授权分别管理。
- 普通网页聊天中的 **在 DSH 中继续** 将可读取消息和附件迁移为新的 DSH 会话。

本版精确适配 **DSH 0.2.1-rc.2**、**Cordis 4.0.5**、**Node.js 22.19+**。标准桌面宿主支持隔离页面和读取；跨重启保留登录及官网下载使用配套桌面源码适配。浏览器版 DSH 提供外部网页入口。

[独立仓库与安装指南](https://github.com/gulagala001/dsh-deepseek-workbench) · [English](https://github.com/gulagala001/dsh-deepseek-workbench/blob/main/README_EN.md) · [固定发行版](https://github.com/gulagala001/dsh-deepseek-workbench/releases/tag/v0.1.0-dsh.0.2.1-rc.2)
