<a name="readme-top"></a>

<h1 align="center">DSH Extensions</h1>

<p align="center"><strong>Manage skills, MCP servers, instruction files, custom commands and hooks from the DSH Plugins page.</strong><br>DeepSeek Harness plugin</p>

<p align="center"><a href="README.md">简体中文</a> · <strong>English</strong></p>

<p align="center">
  <a href="https://github.com/gulagala001/dsh-extensions/releases/tag/v0.1.7-dsh.0.2.2-rc.3"><img alt="0.1.7" src="https://img.shields.io/badge/release-0.1.7-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/dsh-extensions/releases"><img alt="GitHub release downloads" src="https://img.shields.io/github/downloads/gulagala001/dsh-extensions/total?style=flat-square&amp;label=GitHub%20release%20downloads"></a>
  <a href="#readme-install"><img alt="DSH 0.2.2-rc.3" src="https://img.shields.io/badge/DSH-0.2.2--rc.3-0969da?style=flat-square"></a>
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-0969da?style=flat-square"></a>
</p>

<p align="center"><a href="#readme-install"><strong>Get started</strong></a> · <a href="docs/usage_EN.md">Documentation</a> · <a href="https://github.com/gulagala001/dsh-extensions/issues">Feedback</a></p>

DSH already reads skills, MCP servers, AGENTS.md and similar extensions, but most of them can only be changed by editing files. DSH Extensions adds five tabs next to Installed and Discover on the **Plugins** page. They use DSH's own interface components to view, switch and edit these extensions, and add custom commands and hooks to the runtime.

<a name="readme-install"></a>

## Quick start

**Requires:** DSH **0.2.2-rc.3** and Node.js **24.9.0+**.

### 1. Install

In DSH, open **Plugins → Add plugin** and paste:

```text
https://github.com/gulagala001/dsh-extensions/releases/download/v0.1.7-dsh.0.2.2-rc.3/dsh-extensions-0.1.7-dsh.0.2.2-rc.3.tgz
```

When your current task finishes, enable the plugin or restart DSH when prompted. For command-line installs, upgrades and removal, see the [installation guide](docs/install_EN.md). Checksums: [SHA256SUMS](https://github.com/gulagala001/dsh-extensions/releases/download/v0.1.7-dsh.0.2.2-rc.3/SHA256SUMS).

### 2. Try it

Open **Plugins → Skills**, switch one skill off and start a new conversation.

The skill no longer appears in the model's skill catalog, and it returns when you switch it back on.

## Features

| Tab | What it does | Saved in |
| --- | --- | --- |
| **Skills** | Grouped by project, personal, custom folders, bundled and plugin sources; switch model and manual invocation; create, import, edit and delete | Each skill's `SKILL.md` |
| **MCP** | Add local-command or Streamable HTTP servers, paste the usual `mcpServers` JSON; see connection status and tools, switch tools individually, reconnect | `~/.dsh/mcp.json` |
| **Instructions** | See the AGENTS.md / CLAUDE.md files DSH loads, personal and at each project directory level; create, edit and delete | Their own locations |
| **Commands** | Save prompts as `/commands` with `$ARGUMENTS` and `$1`…`$9`; see the commands DSH and other plugins provide | `~/.dsh/commands/`, `<project>/.dsh/commands/` |
| **Hooks** | Run commands on session start, prompt submit, before and after tool use, turn stop and session end to block or add context; test runs and recent runs | `~/.dsh/hooks.json` |

The Skills, Instructions and Commands tabs switch between **Global** and a workspace to show that project's own files.

## Compatibility

- Skill switches write DSH's native `disable-model-invocation` and `user-invocable` frontmatter, so they keep working after the plugin is removed.
- MCP uses DSH's own MCP client with stdio and Streamable HTTP; SSE is not supported yet. MCP servers already defined in the profile configuration can only be switched on or off.
- `hooks.json` follows the Claude Code structure, exit codes and JSON output conventions; tool names in matchers are DSH tool names.
- Before-tool-use hooks can deny a call or ask for confirmation but never bypass DSH approvals.

## FAQ

<details>
<summary>When do new commands and hooks take effect?</summary>

Immediately, in every conversation. After a project command changes, open conversations in the same project are updated too.

</details>

<details>
<summary>Are hooks safe?</summary>

Hooks run commands directly with your system account, outside DSH's sandbox and approvals. The plugin asks for confirmation before the first hook is added; only add commands you trust. The switch at the top of the Hooks tab turns every hook off at once.

</details>

<details>
<summary>Why can't I change a skill?</summary>

Skills bundled with DSH or provided by other plugins are read-only. Copy them to a personal or project folder to change them.

</details>

## Development and license

The package name is `dsh-extensions`. Download it only from this repository's releases. You need Node.js 24.9.0+ and pnpm 11.28.5:

```sh
node scripts/prepare-host-sdk.mjs
pnpm install --frozen-lockfile
pnpm build
npm pack
```

Code is [MIT](LICENSE) licensed. When reporting a problem, include your DSH and plugin versions, the steps, and what you expected versus what happened. Remove personal data from logs and screenshots first: [Issues](https://github.com/gulagala001/dsh-extensions/issues).
