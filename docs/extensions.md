# 扩展管理

[文档目录](README.md) · [使用指南](usage.md)

在左侧 **插件** 页，"已安装"旁边多出五个标签页，用来管理 Skill、MCP、指令文件、自定义命令和 Hooks，不用手改配置文件。OMD 默认内置并开启，可以在 **设置 → Oh My DSH → 功能** 关掉。

- **Skill**：按项目、个人、自定义目录、内置和插件分组。可以分别开关模型调用和手动调用（写进 `SKILL.md` 的头信息），也能新建、导入、编辑、删除。
- **MCP**：服务器存在 `~/.dsh/mcp.json`。支持本地命令和 Streamable HTTP，可以直接粘贴 `mcpServers` JSON，查看连接状态和工具，逐个开关工具，重新连接。profile 配置里的服务器也能开关。
- **指令**：查看、新建、编辑、删除 DSH 加载的个人和项目 AGENTS.md／CLAUDE.md。
- **命令**：把提示词模板存成 `/命令`（`~/.dsh/commands/` 或 `<项目>/.dsh/commands/`），支持 `$ARGUMENTS` 和 `$1`…`$9`。
- **Hooks**：`~/.dsh/hooks.json` 用 Claude Code 的格式，在会话开始、发消息、工具调用前后、回合结束和会话关闭时运行命令，可以试运行，能看最近的运行记录。Hook 直接运行命令，不经过沙箱和审批。

也可以单独安装 [DSH Extensions](https://github.com/gulagala001/dsh-extensions)，和 OMD 共装时共用一份服务。完整用法见它的[使用指南](https://github.com/gulagala001/dsh-extensions/blob/main/docs/usage.md)（[English](https://github.com/gulagala001/dsh-extensions/blob/main/docs/usage_EN.md)）。
