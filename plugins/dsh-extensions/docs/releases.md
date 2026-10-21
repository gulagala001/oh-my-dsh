# DSH Extensions 0.1.0 · DSH 0.2.1-rc.2

[中文](#zh) · [English](#en) · [安装 / Installation](#installation)

<a id="zh"></a>
## 中文

### 新增功能

- 在插件页加入 Skill 标签页：按来源分组查看 Skill，开关模型调用与手动调用，新建、导入、编辑和删除。
- 加入 MCP 标签页：添加 stdio 与 Streamable HTTP 服务器、粘贴 `mcpServers` JSON，查看连接状态与工具，逐个开关工具，重新连接；profile 配置中的服务器可开关。
- 加入指令标签页：查看、创建、编辑和删除 DSH 加载的个人与项目 AGENTS.md／CLAUDE.md。
- 加入自定义命令：把提示词模板存为 `/命令`，支持 `$ARGUMENTS`、`$1`…`$9`、个人与项目两级。
- 加入 Hooks：在会话开始、发送消息、工具调用前后、回合结束和会话关闭时运行命令，兼容 Claude Code 的 `hooks.json` 格式；支持试运行和最近运行记录。

### 其他变更

- 精确适配 DSH **0.2.1-rc.2**、Cordis **4.0.5** 与 Node.js **22.19+**。
- 使用 MIT 许可，通过固定 GitHub Release 包分发。

<a id="en"></a>
## English

### New features

- Skills tab on the Plugins page: skills grouped by source, model and manual invocation switches, create, import, edit and delete.
- MCP tab: add stdio and Streamable HTTP servers or paste `mcpServers` JSON, see connection status and tools, switch tools individually and reconnect; servers in the profile configuration can be switched on or off.
- Instructions tab: view, create, edit and delete the personal and project AGENTS.md / CLAUDE.md files DSH loads.
- Custom commands: save prompt templates as `/commands` with `$ARGUMENTS` and `$1`…`$9`, personal and per project.
- Hooks: run commands on session start, prompt submit, before and after tool use, turn stop and session end, compatible with the Claude Code `hooks.json` format; test runs and recent runs.

### Other changes

- Exact compatibility with DSH **0.2.1-rc.2**, Cordis **4.0.5** and Node.js **22.19+**.
- MIT licensed, distributed through pinned GitHub Release packages.

<a id="installation"></a>
## 安装 / Installation

**宿主 / Host:** DSH `0.2.1-rc.2` · **Cordis:** `4.0.5` · **Node.js:** `>=22.19`

```bash
dsh plugin --profile desktop add "https://github.com/gulagala001/dsh-extensions/releases/download/v0.1.0-dsh.0.2.1-rc.2/dsh-extensions-0.1.0-dsh.0.2.1-rc.2.tgz"
```

将 `desktop` 换成实际 profile，待当前任务结束后重启。Replace `desktop` with your actual profile and restart it after active tasks finish.

[固定安装包 / Pinned package](https://github.com/gulagala001/dsh-extensions/releases/download/v0.1.0-dsh.0.2.1-rc.2/dsh-extensions-0.1.0-dsh.0.2.1-rc.2.tgz) · [SHA256SUMS](https://github.com/gulagala001/dsh-extensions/releases/download/v0.1.0-dsh.0.2.1-rc.2/SHA256SUMS) · [安装指南](https://github.com/gulagala001/dsh-extensions/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/dsh-extensions/blob/main/docs/install_EN.md)
