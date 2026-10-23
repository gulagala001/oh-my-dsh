<a name="readme-top"></a>

<h1 align="center">DSH Rewind</h1>

<p align="center"><strong>回退对话与已记录文件，再按需撤销回退。</strong><br>DeepSeek Harness 插件</p>

<p align="center"><strong>简体中文</strong> · <a href="README_EN.md">English</a></p>

<p align="center">
  <a href="https://github.com/gulagala001/dsh-undo-plugin/releases/tag/v0.1.3-dsh.0.2.1-rc.2"><img alt="0.1.3" src="https://img.shields.io/badge/release-0.1.3-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/dsh-undo-plugin/releases"><img alt="GitHub 累计下载量" src="https://img.shields.io/github/downloads/gulagala001/dsh-undo-plugin/total?style=flat-square&amp;label=GitHub%20downloads&amp;color=0969da"></a>
  <a href="#readme-install"><img alt="DSH 0.2.1-rc.2" src="https://img.shields.io/badge/DSH-0.2.1--rc.2-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/dsh-undo-plugin/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/gulagala001/dsh-undo-plugin?style=flat-square&amp;color=0969da"></a>
</p>

<p align="center"><a href="#readme-install"><strong>开始使用</strong></a> · <a href="docs/usage.zh.md">完整文档</a> · <a href="https://github.com/gulagala001/dsh-undo-plugin/issues">反馈</a></p>

<p align="center"><a href="docs/images/rewind.jpg"><img src="docs/images/rewind.jpg" alt="原生消息回退列表 / Native rewind list" width="880"></a></p>

<a name="readme-install"></a>

## 快速开始

**适用环境：** DSH **0.2.1-rc.2**, Node.js **22.19+**.

文件恢复仅覆盖实际保留的检查点。旧消息可能只能回退对话；恢复前核对外部改动。正在生成时双击 Esc 仍执行宿主停止操作。

### 1. 安装

打开实际使用的 DSH 实例，在 **插件 → ＋ 添加插件** 中粘贴：

```text
https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.3-dsh.0.2.1-rc.2/gulagala001-dsh-undo-plugin-0.1.3-dsh.0.2.1-rc.2.tgz
```

等当前任务结束后，按宿主提示启用或完整重启该实例，沿用原 profile 与数据。其他宿主、升级和卸载见[安装指南](docs/install.md) · [SHA256SUMS](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.3-dsh.0.2.1-rc.2/SHA256SUMS).

### 2. 先试这一件事

在一个用于尝试的空闲会话里输入 `/rewind`，或连续按两次 **Esc**。

**成功标志：** 输入框上方出现可回退消息列表；选择一项后先显示影响范围与确认框，不会立即恢复文件。

## 回到一条消息之前

点击用户消息复制按钮旁的撤回箭头，检查受影响文件并确认。对话在原会话内回退，文字和附件回填输入框。需要恢复时，点击 **撤销撤回** 或输入 `/undo`。

- 检查点自动记录，不需要在每次操作前手动保存。
- 回退前显示实际文件覆盖范围，并检查外部修改冲突。
- 空闲时双击 Esc 或 `/rewind` 打开原生回退列表，所有恢复操作均需确认。

## 实际范围

| 情况 | 行为 |
| --- | --- |
| 保留了文件检查点 | 恢复记录覆盖的文件，并回退对话。 |
| 较早的消息没有文件快照 | 只回退对话，确认框说明实际范围。 |
| 文件在外部发生变化 | 恢复前检查冲突，不把外部改动当作插件拥有的内容。 |
| 正在生成回复 | 双击 Esc 保持 DSH 原生停止行为。 |

文件覆盖、保留与自动清理规则见[使用指南](docs/usage.zh.md)。它不是任意系统操作的完整快照，也不保证恢复未被记录的外部副作用。

## 常见问题

<details>
<summary>为什么某条消息不能恢复文件？</summary>

该消息可能早于插件安装，或相应快照已不在保留范围。查看确认框列出的实际范围；没有快照时只回退对话。

</details>

<details>
<summary>撤回后还能回到刚才的状态吗？</summary>

使用“撤销撤回”或 `/undo`，先检查确认框与冲突提示。撤销针对插件保留的上一次撤回记录。

</details>

## 开发与许可

安装标识为 `@gulagala001/dsh-undo-plugin`，由固定 GitHub Release 分发。开发命令和存储说明见[使用指南](docs/usage.zh.md)。

采用 [MIT](LICENSE)，来源与署名见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 文档与支持

| 我想做什么 | 去哪里 |
| --- | --- |
| 安装、升级、卸载 | [安装指南](docs/install.md) |
| 了解使用方法与边界 | [使用文档](docs/usage.zh.md) |
| 查看版本变化 | [Releases](https://github.com/gulagala001/dsh-undo-plugin/releases) |
| 反馈问题 | [Issues](https://github.com/gulagala001/dsh-undo-plugin/issues) |

反馈时请提供完整 DSH／插件版本、实际入口、最小复现步骤，以及预期和实际表现；日志与截图先移除私人数据。

<p align="center"><a href="#readme-top">返回顶部</a> · <a href="https://github.com/gulagala001/dsh-undo-plugin/releases">版本与下载</a> · <a href="https://github.com/gulagala001/dsh-undo-plugin/issues">反馈</a></p>

[文档结构与贡献](docs/documentation.md)
