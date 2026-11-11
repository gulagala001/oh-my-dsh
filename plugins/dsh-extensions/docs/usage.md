# DSH Extensions 使用说明

[English](usage_EN.md) · [返回首页](../README.md)

所有页面都在左侧栏 **插件** 页顶部的标签里：Skill、MCP、指令、命令、Hooks。Skill、指令和命令页左上角可以从 **全局** 切换到某个工作区，查看这个项目自己的文件，三个页面共用这个选择。

## Skill

- 列表按来源分组：项目（`.dsh/skills`、`.agents/skills`）、个人（`~/.dsh/skills`、`~/.agents/skills`）、自定义目录、内置、插件提供。哪些目录会被读取，以 DSH 自己的设置为准。
- 切到工作区后，会多显示这个项目里已打开会话用到的 Skill。项目里还没有会话时，也能管理默认目录下的文件。
- 行末开关同时控制"模型可调用"和"可手动调用"，详情页里可以分开设置。设置写进 `SKILL.md` 头信息的 `disable-model-invocation` 和 `user-invocable`，卸载插件后仍然有效。
- **新建 Skill**：填名称、描述和说明，生成 `<目录>/<名称>/SKILL.md`。名称只能用小写字母、数字和连字符。
- **导入**：复制一个包含 `SKILL.md` 的文件夹，`.git` 和 `node_modules` 会跳过。
- **编辑**：直接改整个 `SKILL.md`，保存前会检查头信息里的 `name` 和 `description`。格式不对时不会覆盖原文件。
- 新建和导入需要一个明确的个人或项目目录；没配置或配置了多个时，按钮不可用。
- **删除**：文件夹形式的 Skill 删除整个文件夹；单个 Markdown 文件只删这个文件；链接只删链接本身。内置和插件提供的 Skill 只读，可以复制到个人或项目目录后再改。
- 有同名 Skill 时可以分别管理，实际用哪个由 DSH 决定。

## MCP

- 服务器保存在 `~/.dsh/mcp.json`（设置了 `DSH_HOME` 时是 `$DSH_HOME/mcp.json`），格式是常见的：

  ```json
  {
    "mcpServers": {
      "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "~/Documents"] },
      "remote": { "type": "http", "url": "https://example.com/mcp", "headers": { "Authorization": "Bearer …" } }
    }
  }
  ```

- **添加服务器** 支持本地命令（stdio）和远程地址（Streamable HTTP），暂不支持 SSE。**粘贴 JSON** 可以把 MCP 服务器说明里给的配置一次加进来。
- 连上之后，工具以 `mcp__服务器名__工具名` 的名字提供给模型。详情页可以逐个关掉工具，关掉的记在这个服务器的 `disabledTools` 里。
- 关掉服务器会断开连接，并写入 `"disabled": true`。改了配置会自动重连；连不上时用菜单里的 **重新连接**。
- 显示 **释放未确认** 时，说明旧连接还没确认退出，用菜单里的 **重试释放**。旧连接退出前不会启动新的。
- 工具名和别的来源重名时，会显示冲突。
- 手动改了 `mcp.json`，回到页面或点刷新就会生效。
- profile 配置里本来就有的 MCP 服务器显示在"配置文件中的服务器"分组，只能开关。
- 环境变量和请求头的值不会显示出来。

## 指令

- 个人：`~/.dsh/AGENTS.md`，有 `~/.agents/AGENTS.md` 时也会显示。
- 项目：从项目根目录（含 `.git` 的那一级）到工作区目录，每一级的 `AGENTS.md`、`CLAUDE.md`，以及本地文件 `AGENTS.local.md`、`CLAUDE.local.md`。工作区目录里还没有 `AGENTS.md` 时，会显示 **创建** 按钮。
- 会读取哪些文件名、单个文件多大，以 DSH 当前的设置为准。在 DSH 里关掉指令加载后，就不再显示创建按钮。
- 本页最多编辑 1 MiB 的文件；DSH 设置的上限更低时按 DSH 的来。文件最终有多少进入模型上下文，由 DSH 决定。
- 编辑符号链接会改它指向的文件，删除只删链接。保存失败时原文件不变。

## 命令

- 个人命令存在 `~/.dsh/commands/<名称>.md`，项目命令存在 `<项目根>/.dsh/commands/<名称>.md`。同名时，在这个项目里优先用项目命令。
- 文件内容就是提示词模板，可以加头信息：

  ```markdown
  ---
  description: 审查改动
  argument-hint: <路径>
  ---

  审查 $ARGUMENTS 的改动，列出问题和修改建议。
  ```

- 在输入框输入 `/名称 参数` 发送。`$ARGUMENTS` 换成全部参数，`$1`…`$9` 换成按空格分开的单个参数（带空格的参数用引号包起来）。模板里没用到参数时，参数接在末尾。附件会一起发出去。
- 不能和 DSH 或其他插件已有的命令重名，重名的文件会标出冲突。
- "DSH 与插件提供"分组列出其他来源的命令，只读。
- 每次发送都读取当前文件。文件被删了、读不了或头信息有误时会直接报错，不会改用同名的个人命令。
- 保存后立即对所有会话生效，包括同一项目里已经打开的会话。

## Hooks

- 配置存在 `~/.dsh/hooks.json`，结构和 Claude Code 一样：

  ```json
  {
    "hooks": {
      "PreToolUse": [
        { "matcher": "bash", "hooks": [{ "type": "command", "command": "~/.dsh/hooks/check-bash.sh", "timeout": 30 }] }
      ]
    }
  }
  ```

- 支持的事件：

  | 事件 | 什么时候运行 | 能做什么 |
  | --- | --- | --- |
  | `SessionStart` | 新建、恢复、清空或压缩会话 | 标准输出作为上下文；匹配 `startup`、`resume`、`clear`、`compact` |
  | `UserPromptSubmit` | 消息发给模型前 | 退出码 2 拦下消息；标准输出作为上下文 |
  | `PreToolUse` | 工具执行前 | 退出码 2 拒绝并把标准错误告诉模型；JSON 里 `permissionDecision` 写 `deny` 或 `ask` |
  | `PostToolUse` | 工具执行后 | 退出码 2 把标准错误作为反馈；`additionalContext` 补充上下文 |
  | `Stop` | 模型准备结束回合时 | 退出码 2 或 `"decision": "block"` 让模型按原因继续，每回合最多 3 次 |
  | `SessionEnd` | 会话关闭 | 只运行，不影响会话 |

- 命令用系统 shell 运行，工作目录是会话目录。事件数据以 JSON 写进标准输入，包括 `session_id`、`cwd`、`hook_event_name` 和事件字段（如 `tool_name`、`tool_input`、`prompt`），另有环境变量 `DSH_PROJECT_DIR` 和 `CLAUDE_PROJECT_DIR`。默认超时 60 秒。
- 匹配规则里的工具名用 DSH 的工具名。`PreToolUse` 返回 `allow` 不会跳过 DSH 自己的审批。子代理不触发会话、消息和回合结束这几类事件。
- Hook 以你的系统账户直接运行命令，不经过 DSH 的沙箱。第一次添加时会要求确认，只添加你信任的命令。
- 编辑窗口里的 **测试运行** 用示例数据跑一次，不影响任何会话，可以中途取消。页面底部显示最近 50 次运行。
- 每条 Hook 可以单独关掉（写入 `"enabled": false`），顶部开关对应 `disableAllHooks`，一键停用全部。
- 保存时会保留文件里你手动加的其他字段；文件格式坏了时不会覆盖。
