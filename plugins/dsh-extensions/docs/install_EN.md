# DSH Extensions — Installation and maintenance

[简体中文](install.md) · [Back to README](../README_EN.md#install)

**DSH 0.2.1-rc.2 · Node.js ≥22.19 · 0.1.0**

## Install into the current instance


In the instance you use, open **Plugins → + Add plugin** and paste the pinned release URL:

```text
https://github.com/gulagala001/dsh-extensions/releases/download/v0.1.0-dsh.0.2.1-rc.2/dsh-extensions-0.1.0-dsh.0.2.1-rc.2.tgz
```

After active tasks finish, enable the plugin or restart as the host asks. The existing profile, DSH_HOME, model settings and conversations are kept.

You can check the download against [SHA256SUMS](https://github.com/gulagala001/dsh-extensions/releases/download/v0.1.0-dsh.0.2.1-rc.2/SHA256SUMS) from the same release.

### First check

The **Plugins** page shows five tabs at the top: Skills, MCP, Instructions, Commands and Hooks. The Skills tab lists the skills available now.

<details>
<summary>Install from the command line</summary>

Use the CLI of the same DSH instance and replace `web` with your profile.

```bash
dsh plugin --profile web add "https://github.com/gulagala001/dsh-extensions/releases/download/v0.1.0-dsh.0.2.1-rc.2/dsh-extensions-0.1.0-dsh.0.2.1-rc.2.tgz"
```

</details>

## Upgrade, rollback and removal

Install the pinned build for your host to upgrade; installing the plugin never replaces or downgrades DSH. To roll back, install the earlier matching pinned package.

Remove it from the Plugins page of the instance, or run:

```bash
dsh plugin --profile web remove dsh-extensions
```

Restart the same instance afterwards. These files are your data and are kept on removal:

- Skill folders and their switches (read natively by DSH, still effective after removal);
- AGENTS.md / CLAUDE.md and other instruction files (read natively by DSH);
- `~/.dsh/mcp.json`, `~/.dsh/commands/`, `<project>/.dsh/commands/` and `~/.dsh/hooks.json` (no longer loaded after removal, restored on reinstall);
- the MCP tool description cache in `~/.dsh/dsh-extensions/`, which can be deleted.

When reporting a problem, include the full version, profile type and the first error with secrets removed.

<a id="build-from-source"></a>

## Build from source

With Node.js 22.19+ and pnpm 11.28.5 installed, run from the repository:

```sh
pnpm install --frozen-lockfile
pnpm build
npm pack
```

Add the generated `dsh-extensions-0.1.0-dsh.0.2.1-rc.2.tgz` through **Plugins → Add plugin** using its local absolute path.
