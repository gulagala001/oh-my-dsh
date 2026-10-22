# 扩展管理

在左侧栏 **插件** 页的“已安装”旁边管理 Skill、MCP、指令文件、自定义命令和 Hooks，界面使用 DSH 原生组件。

- **Skill**：按项目、个人、自定义目录、内置和插件来源分组；开关模型调用与手动调用（写入 `SKILL.md` 原生头信息），新建、导入、编辑、删除。
- **MCP**：服务器保存在 `~/.dsh/mcp.json`；支持本地命令与 Streamable HTTP、粘贴 `mcpServers` JSON、查看连接状态与工具、逐个开关工具、重新连接；profile 配置中的服务器可开关。
- **指令**：查看、创建、编辑、删除 DSH 加载的个人与项目 AGENTS.md／CLAUDE.md。
- **命令**：把提示词模板存为 `/命令`（`~/.dsh/commands/`、`<项目>/.dsh/commands/`），支持 `$ARGUMENTS` 与 `$1`…`$9`。
- **Hooks**：`~/.dsh/hooks.json` 使用 Claude Code 格式，在会话开始、发送消息、工具调用前后、回合结束、会话关闭时运行命令；支持试运行与最近运行记录。Hook 直接运行命令，不经过沙箱与审批。

内置默认启用，可在 **设置 → Oh My DSH → 功能** 关闭。独立源码已就绪，公开安装入口仍在准备；匹配的独立与内置入口共用一份服务。[独立产品与安装状态](architecture.md)。

[完整用法](https://github.com/gulagala001/oh-my-dsh/blob/main/plugins/dsh-extensions/docs/usage.md) · [English](https://github.com/gulagala001/oh-my-dsh/blob/main/plugins/dsh-extensions/docs/usage_EN.md)
