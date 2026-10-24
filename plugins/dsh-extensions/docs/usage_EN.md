# DSH Extensions — Usage

[简体中文](usage.md) · [Back to README](../README_EN.md)

Every page is a tab at the top of the **Plugins** page in the left sidebar: Skills, MCP, Instructions, Commands and Hooks. On the Skills, Instructions and Commands tabs, the scope picker at the top left switches to a workspace to show that project's files; the choice is shared across these tabs.

## Skills

- Skills are grouped by source: project (`.dsh/skills`, `.agents/skills`), personal (`~/.dsh/skills`, `~/.agents/skills`), custom folders, bundled and plugin-provided.
- DSH's native providers own discovery and frontmatter rules, including configured personal/custom directories and disabled default roots. Global shows the host and current default preset; a workspace also includes skills from its own open conversations, without borrowing another project's conversation. Default-preset files remain manageable before any conversation exists.
- Same-name files remain individually manageable; DSH determines invocation precedence. Plugin skills without local files open through their provider and stay read-only. Incomplete discovery reports an error and can be retried with Refresh.
- The row switch controls both "Model can invoke" and "You can invoke"; the detail view sets them separately. They are written to the `disable-model-invocation` and `user-invocable` frontmatter in `SKILL.md`.
- **New skill** takes a name, description and instructions and creates `<folder>/<name>/SKILL.md`. Names use lowercase letters, digits and hyphens.
- **Import** copies a folder containing `SKILL.md` (skipping `.git` and `node_modules`).
- **Edit** changes the whole `SKILL.md`; `name` and `description` in the frontmatter are checked before saving.
- Saves and imports validate candidate files through the actual provider, including invocation fields, before replacing existing content. Imports appear only after copying finishes; failures clean up staging so you can correct the source and try again. Writes are ordered within one host, and unloading prevents unpublished candidates from committing and waits for cleanup.
- Creation and import require one unambiguous native personal/project directory; their buttons are unavailable when none is configured or several destinations conflict. Each individual invocation switch changes only its own field.
- Deleting a directory bundle removes that folder; a flat Markdown skill removes only its file, and a linked folder removes only the link. Skill roots are protected. Bundled and plugin-provided skills are read-only.

## MCP

- Servers are saved in `~/.dsh/mcp.json` (`$DSH_HOME/mcp.json` when `DSH_HOME` is set) in the usual format:

  ```json
  {
    "mcpServers": {
      "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "~/Documents"] },
      "remote": { "type": "http", "url": "https://example.com/mcp", "headers": { "Authorization": "Bearer …" } }
    }
  }
  ```

- **Add server** supports local commands (stdio) and remote URLs (Streamable HTTP). **Paste JSON** adds every server from an MCP server's setup instructions at once.
- Once connected, tools are offered to the model as `mcp__server__tool`. The detail view switches tools individually; switched-off tools are recorded in the server's `disabledTools`.
- Switching a server off disconnects it and writes `"disabled": true`. Changed settings reconnect automatically; use **Reconnect** in the menu after a failure.
- If another provider already owns the tool namespace, the connection reports a conflict. Failed or disabled connections do not apply their tool switches to other providers; reconnecting restores the saved switches.
- After editing `mcp.json` by hand, return to the page or refresh to apply it.
- MCP servers already defined in the profile configuration are listed under "Servers in profile configuration" and can only be switched on or off.
- Environment and header values are never shown.

## Instructions

- Personal: `~/.dsh/AGENTS.md`; `~/.agents/AGENTS.md` is shown when it exists.
- Project: from the project root (the directory containing `.git`) down to the workspace directory, the `AGENTS.md` and `CLAUDE.md` at each level plus the local files `AGENTS.local.md` and `CLAUDE.local.md`. A missing `AGENTS.md` in the workspace directory shows a **Create** button.
- File names and the project root marker follow DSH's current instruction settings. DSH does not load files larger than 1 MiB, and the page does not open them for editing.

## Commands

- Personal commands are saved in `~/.dsh/commands/<name>.md` and project commands in `<project root>/.dsh/commands/<name>.md`. With the same name, the project command wins in that project's conversations.
- The file content is the prompt template, with optional frontmatter:

  ```markdown
  ---
  description: Review changes
  argument-hint: <path>
  ---

  Review the changes in $ARGUMENTS and list problems with suggested fixes.
  ```

- Type `/name arguments` in the composer to send it. `$ARGUMENTS` becomes the whole input and `$1`…`$9` single space-separated words (quote words that contain spaces); when the template uses no arguments, they are appended. Attachments are sent along.
- Commands cannot replace names already provided by DSH or another plugin in the same scope; conflicting files are marked. One conversation's preset does not reserve names in other projects. The global page shows global commands; a workspace also includes commands from that project's open conversations.
- "From DSH and plugins" lists other commands in the selected scope, read-only. Refresh reconciles files with the menu and preserves unchanged registrations.
- Each send reads the current file. Deleted, unreadable or malformed files report an error; an invalid project file never falls back to a personal template of the same name. Cancelling a request or disabling the plugin prevents messages not yet handed to the conversation. Use the conversation's Stop control for messages already accepted.
- Within one host, saves, renames, deletions and refreshes run in order; only one concurrent creation of the same name succeeds. Re-enabling the plugin or restarting the host restores commands from existing files. The first command waits for project registration to finish.

## Hooks

- Settings are saved in `~/.dsh/hooks.json` in the Claude Code structure:

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

  | Event | Runs when | What it can do |
  | --- | --- | --- |
  | `SessionStart` | A session is created, resumed, cleared or compacted | Standard output becomes context; matches `startup`, `resume`, `clear`, `compact` |
  | `UserPromptSubmit` | Before a message reaches the model | Exit code 2 blocks it; standard output becomes context |
  | `PreToolUse` | Before a tool executes | Exit code 2 denies the call and tells the model standard error; JSON `permissionDecision` of `deny` or `ask` |
  | `PostToolUse` | After a tool executes | Exit code 2 gives standard error as feedback; `additionalContext` adds context |
  | `Stop` | The model is about to finish its turn | Exit code 2 or `"decision": "block"` makes it continue with the reason, up to 3 times per turn |
  | `SessionEnd` | A session closes | Runs only; does not affect the session |

- Commands run in the system shell with the event as JSON on standard input (`session_id`, `cwd`, `hook_event_name` and event fields such as `tool_name`, `tool_input`, `prompt`), in the session directory, with `DSH_PROJECT_DIR` and `CLAUDE_PROJECT_DIR` set. The default timeout is 60 seconds.
- A `PreToolUse` `allow` never skips DSH's own approvals. Subagents do not run session, prompt or turn-stop hooks.
- **Test run** in the editor runs the command once with sample data and affects no conversation. You can cancel a running test; closing the editor also cancels its request. Disabling the plugin cancels active Hooks and waits for their commands to exit. The bottom of the page lists the last 50 runs.
- Configuration edits within one host are saved in order, reading the current file each time. Other fields already saved externally are retained; malformed files are never overwritten.
- Each hook can be switched off on its own (written as `"enabled": false`); the switch at the top maps to `disableAllHooks`.
