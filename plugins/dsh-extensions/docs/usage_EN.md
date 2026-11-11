# DSH Extensions usage

[简体中文](usage.md) · [Back to README](../README_EN.md)

Every page is a tab at the top of the **Plugins** page in the left sidebar: Skills, MCP, Instructions, Commands and Hooks. On the Skills, Instructions and Commands tabs, the picker at the top left switches from **Global** to a workspace to show that project's own files. The three tabs share this choice.

## Skills

- Skills are grouped by source: project (`.dsh/skills`, `.agents/skills`), personal (`~/.dsh/skills`, `~/.agents/skills`), custom folders, bundled and plugin-provided. Which folders are read follows your DSH settings.
- In a workspace, the list also shows skills used by conversations open in that project. You can manage files in the default folders even before the project has a conversation.
- The row switch controls both "Model can invoke" and "You can invoke"; the detail view sets them separately. They are written to the `disable-model-invocation` and `user-invocable` frontmatter in `SKILL.md`, so they keep working after you uninstall the plugin.
- **New skill**: enter a name, description and instructions to create `<folder>/<name>/SKILL.md`. Names use lowercase letters, digits and hyphens.
- **Import**: copies a folder containing `SKILL.md`, skipping `.git` and `node_modules`.
- **Edit**: change the whole `SKILL.md`. The frontmatter `name` and `description` are checked before saving, and an invalid file never replaces the original.
- New and Import need one clear personal or project folder. If none or several are configured, the buttons are unavailable.
- **Delete**: a folder skill removes the folder, a single Markdown skill removes that file, and a link removes only the link. Bundled and plugin-provided skills are read-only; copy them to a personal or project folder to edit.
- Skills with the same name can be managed separately; DSH decides which one is used.

## MCP

- Servers are saved in `~/.dsh/mcp.json` (`$DSH_HOME/mcp.json` when `DSH_HOME` is set), in the usual format:

  ```json
  {
    "mcpServers": {
      "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "~/Documents"] },
      "remote": { "type": "http", "url": "https://example.com/mcp", "headers": { "Authorization": "Bearer …" } }
    }
  }
  ```

- **Add server** supports local commands (stdio) and remote URLs (Streamable HTTP); SSE is not supported yet. **Paste JSON** adds every server from an MCP server's setup instructions at once.
- Once connected, tools reach the model as `mcp__server__tool`. The detail view can switch off individual tools; they are recorded in that server's `disabledTools`.
- Switching a server off disconnects it and writes `"disabled": true`. Changed settings reconnect automatically; use **Reconnect** in the menu after a failure.
- **Cleanup unconfirmed** means the old connection has not confirmed it closed. Select **Retry cleanup**. No new connection starts until the old one is gone.
- A tool name already used by another source shows as a conflict.
- After editing `mcp.json` by hand, return to the page or click Refresh to apply it.
- MCP servers already defined in the profile configuration are listed under "Servers in profile configuration" and can only be switched on or off.
- Environment variable and header values are never shown.

## Instructions

- Personal: `~/.dsh/AGENTS.md`, plus `~/.agents/AGENTS.md` when it exists.
- Project: from the project root (the directory containing `.git`) down to the workspace directory, the `AGENTS.md` and `CLAUDE.md` at each level plus the local files `AGENTS.local.md` and `CLAUDE.local.md`. A missing `AGENTS.md` in the workspace directory shows a **Create** button.
- Which file names are read and how large each file may be follow your current DSH settings. If instruction loading is turned off in DSH, the Create button goes away.
- This page edits files up to 1 MiB, or less if DSH sets a lower limit. DSH decides how much of a file reaches the model.
- Editing a symlink changes the file it points to; deleting removes only the link. A failed save leaves the original file unchanged.

## Commands

- Personal commands are saved as `~/.dsh/commands/<name>.md` and project commands as `<project root>/.dsh/commands/<name>.md`. When names match, the project command wins inside that project.
- The file content is the prompt template, with optional frontmatter:

  ```markdown
  ---
  description: Review changes
  argument-hint: <path>
  ---

  Review the changes in $ARGUMENTS and list problems and suggested fixes.
  ```

- Type `/name arguments` in the composer to send it. `$ARGUMENTS` becomes all arguments and `$1`…`$9` become single space-separated arguments (quote an argument that contains spaces). If the template uses no arguments, they are appended at the end. Attachments are sent along.
- A command cannot reuse a name already taken by DSH or another plugin; such files are marked as conflicts.
- "From DSH and plugins" lists commands from other sources, read-only.
- Each send reads the current file. If the file was deleted, cannot be read or has invalid frontmatter, you get an error; the personal command with the same name is never sent instead.
- Saved commands apply right away in every conversation, including ones already open in the same project.

## Hooks

- The configuration lives in `~/.dsh/hooks.json`, with the same structure as Claude Code:

  ```json
  {
    "hooks": {
      "PreToolUse": [
        { "matcher": "bash", "hooks": [{ "type": "command", "command": "~/.dsh/hooks/check-bash.sh", "timeout": 30 }] }
      ]
    }
  }
  ```

- Supported events:

  | Event | When it runs | What it can do |
  | --- | --- | --- |
  | `SessionStart` | A conversation is created, resumed, cleared or compacted | Standard output becomes context; matches `startup`, `resume`, `clear`, `compact` |
  | `UserPromptSubmit` | Before a message goes to the model | Exit code 2 blocks it; standard output becomes context |
  | `PreToolUse` | Before a tool runs | Exit code 2 denies it and tells the model the standard error; JSON `permissionDecision` can be `deny` or `ask` |
  | `PostToolUse` | After a tool runs | Exit code 2 returns standard error as feedback; `additionalContext` adds context |
  | `Stop` | When the model is about to end its turn | Exit code 2 or `"decision": "block"` makes it continue with your reason, up to 3 times per turn |
  | `SessionEnd` | A conversation closes | Runs only; does not affect the conversation |

- Commands run in the system shell with the conversation directory as the working directory. Event data arrives as JSON on standard input, including `session_id`, `cwd`, `hook_event_name` and event fields such as `tool_name`, `tool_input` and `prompt`. The environment also has `DSH_PROJECT_DIR` and `CLAUDE_PROJECT_DIR`. The default timeout is 60 seconds.
- Matchers use DSH tool names. A `PreToolUse` result of `allow` does not skip DSH's own approval. Subagents do not trigger the conversation, message and end-of-turn events.
- Hooks run commands directly as your system user, outside the DSH sandbox. You are asked to confirm the first time you add one; only add commands you trust.
- **Test run** in the editor runs the command once with sample data and affects no conversation. You can cancel it midway. The bottom of the page lists the last 50 runs.
- Each Hook can be switched off on its own (writes `"enabled": false`). The switch at the top maps to `disableAllHooks` and turns off all of them.
- Saving keeps any other fields you added to the file by hand. If the file is malformed, it is not overwritten.
