<a name="readme-top"></a>

<h1 align="center">DSH BTW</h1>

<p align="center"><strong>主任务继续，旁边随时问一句。</strong><br>DeepSeek Harness 插件</p>

<p align="center"><strong>简体中文</strong> · <a href="README_EN.md">English</a></p>

<p align="center">
  <a href="https://github.com/gulagala001/dsh-btw/releases/tag/v0.1.5-dsh.0.2.1-rc.5"><img alt="0.1.3" src="https://img.shields.io/badge/release-0.1.5-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/dsh-btw/releases"><img alt="GitHub 累计下载量" src="https://img.shields.io/github/downloads/gulagala001/dsh-btw/total?style=flat-square&amp;label=GitHub%20downloads&amp;color=0969da"></a>
  <a href="#readme-install"><img alt="DSH 0.2.1-rc.5" src="https://img.shields.io/badge/DSH-0.2.1--rc.5-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/dsh-btw/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/gulagala001/dsh-btw?style=flat-square&amp;color=0969da"></a>
</p>

<p align="center"><a href="#readme-install"><strong>开始使用</strong></a> · <a href="docs/install.zh.md">完整文档</a> · <a href="https://github.com/gulagala001/dsh-btw/issues">反馈</a></p>

<p align="center"><a href="docs/images/side-chat.png"><img src="docs/images/side-chat.png" alt="旁聊与历史列表 / Side chat and history" width="880"></a></p>

<a name="readme-install"></a>

## 快速开始

**适用环境：** DSH **0.2.1-rc.5**, Node.js **22.19+**.

旁聊使用现有模型服务并产生正常用量，不执行工具。记录仅保存在当前窗口内存，刷新后消失。

### 1. 安装

打开实际使用的 DSH 实例，在 **插件 → ＋ 添加插件** 中粘贴：

```text
https://github.com/gulagala001/dsh-btw/releases/download/v0.1.5-dsh.0.2.1-rc.5/gulagala001-dsh-btw-0.1.5-dsh.0.2.1-rc.5.tgz
```

等当前任务结束后，按宿主提示启用或完整重启该实例，沿用原 profile 与数据。其他宿主、升级和卸载见[安装指南](docs/install.zh.md) · [SHA256SUMS](https://github.com/gulagala001/dsh-btw/releases/download/v0.1.5-dsh.0.2.1-rc.5/SHA256SUMS).

### 2. 先试这一件事

先在主会话发送过一条消息，再输入：

```text
/btw 用两句话解释刚才方案里最重要的取舍。
```

**成功标志：** 输入框上方出现旁聊回复；主任务继续运行，旁聊不写入主对话历史。

## 不打断主任务的旁聊

- 输入 `/btw 问题` 直接提问；只输入 `/btw` 打开弹窗与历史列表。
- 弹窗支持 Markdown、代码复制和继续提问，使用当前主会话已有上下文。
- 停止旁聊只取消旁聊请求；Esc 或关闭按钮仅隐藏窗口，主任务继续。

上下文快照包含已完成的工具结果，不包含正在生成的主回复。请求保留主会话的消息前缀、上次实际模型配置、工具声明及缓存关联，只追加旁聊内容；实际缓存命中由模型服务决定。旁聊不执行工具，也不写入主对话历史。

## 常见问题

<details>
<summary>旁聊记录能保留多久？</summary>

按主会话隔离，最多保留最近 20 条。记录只在当前窗口内存中，刷新、关闭窗口或停用插件后消失。

</details>

<details>
<summary>为什么首次提问或带附件时不能直接旁聊？</summary>

需先在主会话发送过消息以建立上下文。旁聊仅接收文字；输入框带附件时会保留草稿并提示，不丢弃附件。

</details>

<details>
<summary>关闭弹窗后回答还在继续？</summary>

关闭只隐藏界面。使用弹窗内停止操作取消该旁聊；不会停止主任务。

</details>

## 兼容、开发与许可

匹配 DSH 0.2.1-rc.5、Cordis 4.0.5。已验证 macOS 原生 Web 客户端；Windows、Linux 与 Electron 桌面外壳未完成实机验证。安装标识为 `@gulagala001/dsh-btw`，从固定 GitHub Release 分发。

```bash
npm ci
npm run build
npm test
```

前端使用 DSH 原生组件和输入扩展，后端读取只读上下文快照并发起独立流式请求。采用 [MIT](LICENSE)。

## 文档与支持

| 我想做什么 | 去哪里 |
| --- | --- |
| 安装、升级、卸载 | [安装指南](docs/install.zh.md) |
| 了解使用方法与边界 | [使用文档](docs/install.zh.md) |
| 查看版本变化 | [Releases](https://github.com/gulagala001/dsh-btw/releases) |
| 反馈问题 | [Issues](https://github.com/gulagala001/dsh-btw/issues) |

反馈时请提供完整 DSH／插件版本、实际入口、最小复现步骤，以及预期和实际表现；日志与截图先移除私人数据。

<p align="center"><a href="#readme-top">返回顶部</a> · <a href="https://github.com/gulagala001/dsh-btw/releases">版本与下载</a> · <a href="https://github.com/gulagala001/dsh-btw/issues">反馈</a></p>

[文档结构与贡献](docs/documentation.md)
