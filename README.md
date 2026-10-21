<a id="readme-top"></a>

<h1 align="center">Oh My DSH</h1>

<p align="center"><strong>更顺手的 DSH 工作台，更连贯的长任务。</strong><br>DeepSeek Harness 插件</p>

<p align="center"><strong>简体中文</strong> · <a href="README_EN.md">English</a></p>

<p align="center">
  <a href="https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.2.omd.0.19.0"><img alt="OMD 0.19.0" src="https://img.shields.io/badge/release-OMD%200.19.0-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/oh-my-dsh/releases"><img alt="GitHub 累计下载量" src="https://img.shields.io/github/downloads/gulagala001/oh-my-dsh/total?style=flat-square&amp;label=GitHub%20downloads&amp;color=0969da"></a>
  <a href="#readme-install"><img alt="DSH 0.2.1-rc.2" src="https://img.shields.io/badge/DSH-0.2.1--rc.2-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/oh-my-dsh/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/gulagala001/oh-my-dsh?style=flat-square&amp;color=0969da"></a>
</p>

<p align="center"><a href="#readme-install"><strong>开始使用</strong></a> · <a href="docs/README.md">完整文档</a> · <a href="https://github.com/gulagala001/oh-my-dsh/issues">反馈</a></p>

<p align="center"><a href="docs/images/omd-hero-zh.png"><img src="docs/images/omd-hero-zh.png" alt="Oh My DSH · 从对话到交付" width="880"></a></p>

<a id="quickstart"></a>
<a id="desktop"></a>
<a id="features"></a>
<a id="prompts"></a>
<a id="themes"></a>
<a id="computer-use"></a>
<a id="memory"></a>
<a id="tools"></a>
<a id="support"></a>
<a id="plugins"></a>
<a id="docs"></a>
<a id="readme-install"></a>

## 快速开始

**适用环境：** DSH **0.2.1-rc.2**, Node.js **22.19+**.

模型沿用 DSH 配置。默认安装配置包含完整文件／命令访问并关闭执行审批；已有 profile 的显式设置优先。OpenCU 已内置，完整内置浏览器与原生监看另需匹配的宿主适配及系统权限。

### 1. 安装

打开实际使用的 DSH 实例，在 **插件 → ＋ 添加插件** 中粘贴：

```text
https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.19.0/trisoul_x-0.2.1-rc.2.omd.0.19.0.tgz
```

等当前任务结束后，按宿主提示启用或完整重启该实例，沿用原 profile 与数据。其他宿主、升级和卸载见[安装指南](docs/install.md) · [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.19.0/SHA256SUMS).

### 2. 先试这一件事

新建会话，选择 **Oh My DSH**，使用已配置的模型，在一个可分享的项目中输入：

```text
读取这个项目的 README，说明用途与启动步骤；只引用实际读到的信息，不修改文件。
```

**成功标志：** 回复包含真实读取结果；右侧 OMD 控制台可查看上下文与调用记录。

## 把任务、上下文和结果放在一起

- **持续推进任务**：系统提示词与实际工具、模式和权限共同装配；保留需求、来源与核验结果，适合需要多轮执行的工作。
- **整理长对话**：上下文整理、Auto Compact 与 Dream 各自负责压缩和长期记忆，原话、附件与来源仍可回查。
- **看见实际过程**：OMD 控制台集中展示上下文、记忆、调用用量与后台活动；内置电脑操作、任务证据和网页聊天入口。

### 按自己的习惯安排工作空间

原生、Codex Desktop、iOS Liquid Glass、Claude CLI 与 Google Material 提供不同布局和材质，搭配 29 套配色、自定义背景、字体与分区颜色。当前源码还包含 Glyph 动态字符外观；固定发行包的功能以对应 Release 为准。

![外观示例](docs/images/release/themes.jpg)

### 长任务保留背景，结果保留依据

| 能力 | 行为与条件 |
| --- | --- |
| 上下文整理 | 按需保存事实摘要、用户决定与详细资料，仍可通过 `recall` 回查原始信息。 |
| Auto Compact | 默认关闭；达到设置的 Token 阈值后压缩，可选择摘要＋资料或仅摘要。 |
| Dream | 自动整理默认关闭；保存会话、项目与全局短记忆，沿用用户选择的共享范围。 |
| Better Todo | 将需求、任务与证据关联；待办提醒默认开，验证提醒可单独选择。 |
| 调用统计 | 来自实际回执；未知不是零，`≥` 表示已知下界，后台模型调用也计费。 |

[上下文机制](docs/context-workflow.md) · [Dream 记忆](docs/dream-memory.md) · [统计口径](docs/monitoring.md)

## 使用范围

| 场景 | 条件 |
| --- | --- |
| 对话、外观、任务和记忆 | 匹配版本的 DSH 与可用模型。 |
| 浏览器／电脑操作 | OpenCU 后端与系统权限；完整内嵌 UI 另需匹配宿主适配。 |
| 网页聊天与历史导入 | DeepSeek Workbench 对应桌面能力与官网登录；只迁移可读取的消息和附件。 |
| 其他 DSH 版本 | 仅使用对应独立构建；rc.1 与 rc.2 不能混装。 |

源码主干可能包含尚未进入固定 Release 的改进。公共下载地址不会随着 `main` 改动而更新；当前安装包、校验值与升级说明见[发行包说明](docs/releases.md)。

## 常见问题

<details>
<summary>安装后没看到 Oh My DSH 或新设置？</summary>

确认安装的是当前实例对应的 profile，完整重启后检查插件启用状态。新会话选择 Oh My DSH；已有会话保留原预设。[症状排障](docs/troubleshooting.md)

</details>

<details>
<summary>为什么装好插件后没有完整内置浏览器？</summary>

内嵌浏览器、原生监看与侧栏批注依赖匹配的宿主适配。固定 Release 提供相关源码材料，不是完整桌面安装器。[Computer Use 条件](docs/computer-use.md)

</details>

<details>
<summary>怎样升级或恢复？</summary>

先等待任务结束并备份，使用同一宿主对应的固定包，保留原数据目录和 profile。不要以清空数据或改版本门禁解决安装问题。[升级说明](docs/upgrade.md)

</details>

## 参与与来源

欢迎提交最小复现、文档修订与实际使用示例。[贡献说明](CONTRIBUTING.md) · [开发与构建](docs/development.md)

本仓库包含不同来源的代码与材料，不以统一 MIT 声明覆盖全部文件。请按具体文件和[第三方声明](THIRD_PARTY_NOTICES.md)确认许可。OMD 是社区项目，与界面中提及的产品品牌无官方隶属或背书关系。

## 文档与支持

| 我想做什么 | 去哪里 |
| --- | --- |
| 安装、升级、卸载 | [安装指南](docs/install.md) |
| 了解使用方法与边界 | [使用文档](docs/README.md) |
| 查看版本变化 | [Releases](https://github.com/gulagala001/oh-my-dsh/releases) |
| 反馈问题 | [Issues](https://github.com/gulagala001/oh-my-dsh/issues) |

反馈时请提供完整 DSH／插件版本、实际入口、最小复现步骤，以及预期和实际表现；日志与截图先移除私人数据。

<p align="center"><a href="#readme-top">返回顶部</a> · <a href="https://github.com/gulagala001/oh-my-dsh/releases">版本与下载</a> · <a href="https://github.com/gulagala001/oh-my-dsh/issues">反馈</a></p>
