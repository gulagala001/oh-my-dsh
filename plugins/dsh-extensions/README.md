<a name="readme-top"></a>

<h1 align="center">DSH Extensions</h1>

<p align="center"><strong>在 DSH 插件页管理 Skill、MCP、指令文件、自定义命令和 Hooks。</strong><br>DeepSeek Harness 插件</p>

<p align="center"><strong>简体中文</strong> · <a href="README_EN.md">English</a></p>

<p align="center">
  <a href="https://github.com/gulagala001/dsh-extensions/releases/tag/v0.1.0-dsh.0.2.1-rc.2"><img alt="0.1.0" src="https://img.shields.io/badge/release-0.1.0-0969da?style=flat-square"></a>
  <a href="#readme-install"><img alt="DSH 0.2.1-rc.2" src="https://img.shields.io/badge/DSH-0.2.1--rc.2-0969da?style=flat-square"></a>
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-0969da?style=flat-square"></a>
</p>

<p align="center"><a href="#readme-install"><strong>开始使用</strong></a> · <a href="docs/usage.md">完整文档</a> · <a href="https://github.com/gulagala001/dsh-extensions/issues">反馈</a></p>

DSH 已经能读取 Skill、MCP 服务器、AGENTS.md 等扩展，但大多只能手改文件。DSH Extensions 在左侧栏 **插件** 页的“已安装”“发现”旁边加入五个标签页，用 DSH 自带的界面组件查看、开关和编辑它们，并补上自定义命令与 Hooks 两项运行能力。

<a name="readme-install"></a>

## 快速开始

**适用环境：** DSH **0.2.1-rc.2**，Node.js **22.19+**。

### 1. 安装


打开实际使用的 DSH 实例，在 **插件 → ＋ 添加插件** 中粘贴：

```text
https://github.com/gulagala001/dsh-extensions/releases/download/v0.1.0-dsh.0.2.1-rc.2/dsh-extensions-0.1.0-dsh.0.2.1-rc.2.tgz
```

等当前任务结束后，按宿主提示启用或重启该实例。其他方式、升级和卸载见[安装指南](docs/install.md) · [SHA256SUMS](https://github.com/gulagala001/dsh-extensions/releases/download/v0.1.0-dsh.0.2.1-rc.2/SHA256SUMS)。

### 2. 先试这一件事

打开 **插件 → Skill**，选一个 Skill 关掉开关，再新建一个会话。

**成功标志：** 这个 Skill 不再出现在模型的 Skill 目录里；重新打开开关后恢复。

## 功能

| 标签页 | 能做什么 | 保存位置 |
| --- | --- | --- |
| **Skill** | 按项目、个人、自定义目录、内置和插件来源分组查看；开关模型调用与手动调用；新建、导入、编辑、删除 | 各 Skill 的 `SKILL.md` |
| **MCP** | 添加本地命令或 Streamable HTTP 服务器，粘贴常见的 `mcpServers` JSON；查看连接状态和工具，逐个开关工具，重新连接 | `~/.dsh/mcp.json` |
| **指令** | 查看 DSH 会加载的 AGENTS.md／CLAUDE.md，包括个人文件和项目各级目录中的文件；创建、编辑、删除 | 原文件位置 |
| **命令** | 把常用提示词存成 `/命令`，支持 `$ARGUMENTS` 和 `$1`…`$9`；查看 DSH 与其他插件提供的命令 | `~/.dsh/commands/`、`<项目>/.dsh/commands/` |
| **Hooks** | 在会话开始、发送消息、工具调用前后、回合结束、会话关闭时运行命令，用于拦截或补充上下文；试运行和最近运行记录 | `~/.dsh/hooks.json` |

Skill、指令和命令页可在 **全局** 与某个工作区之间切换，查看该项目自己的文件。

## 兼容范围

- Skill 开关写入 DSH 原生的 `disable-model-invocation` 与 `user-invocable` 头信息，卸载插件后仍然生效。
- MCP 使用 DSH 自带的 MCP 客户端，支持 stdio 与 Streamable HTTP；暂不支持 SSE。profile 配置里已有的 MCP 服务器只能开关。
- Hooks 的 `hooks.json` 使用与 Claude Code 相同的结构、退出码和 JSON 输出约定；匹配规则中的工具名是 DSH 的工具名。
- Hooks 中的工具调用前事件只能拒绝或要求确认，不会绕过 DSH 的审批。

## 常见问题

<details>
<summary>新建的命令或 Hook 什么时候生效？</summary>

保存后立即对所有会话生效。修改项目命令后，同一项目中已打开的会话也会更新。

</details>

<details>
<summary>Hook 安全吗？</summary>

Hook 会以你的系统账户直接运行命令，不经过 DSH 的沙箱和审批。首次添加时插件会要求确认；只添加你信任的命令。可在 Hooks 页顶部一键停用全部 Hook。

</details>

<details>
<summary>为什么某个 Skill 不能修改？</summary>

DSH 内置或由其他插件提供的 Skill 只读。可以复制到个人或项目目录后再修改。

</details>

## 许可

[MIT](LICENSE)

[文档结构与贡献](docs/documentation.md)
