# Install DSH Extensions

[简体中文](install.md) · [Back to README](../README_EN.md)

Requires DSH **0.2.2-rc.2** and Node.js **24.9.0+**.

## Install in DSH

Open **Plugins → Add plugin** and paste:

```text
https://github.com/gulagala001/dsh-extensions/releases/download/v0.1.6-dsh.0.2.2-rc.2/dsh-extensions-0.1.6-dsh.0.2.2-rc.2.tgz
```

When your current task finishes, enable the plugin or restart DSH when prompted. Checksums: [SHA256SUMS](https://github.com/gulagala001/dsh-extensions/releases/download/v0.1.6-dsh.0.2.2-rc.2/SHA256SUMS).

## Install from the command line

Use the CLI that belongs to the same DSH, replacing `web` with your profile (`desktop` for the desktop app):

```bash
dsh plugin --profile web add "https://github.com/gulagala001/dsh-extensions/releases/download/v0.1.6-dsh.0.2.2-rc.2/dsh-extensions-0.1.6-dsh.0.2.2-rc.2.tgz"
```

## Upgrade and roll back

Back up your profile, then install the new package over the old one. DSH itself does not need to change. If the upgrade fails, your data is untouched; send the first error to [Issues](https://github.com/gulagala001/dsh-extensions/issues).

To go back, install the previous package. Rolling back only replaces the code; data written by the newer version stays.

## Uninstall

Remove it on the Plugins page, or run:

```bash
dsh plugin --profile web remove dsh-extensions
```

Then restart DSH. The following is your data and stays when you uninstall:

- Skill folders and their switch settings. DSH reads these itself, so they keep working.
- Instruction files such as AGENTS.md and CLAUDE.md, which DSH also reads itself.
- `~/.dsh/mcp.json`, `~/.dsh/commands/`, `<project>/.dsh/commands/` and `~/.dsh/hooks.json`. They stop loading after uninstalling and come back when you reinstall.
- The MCP tool description cache in `~/.dsh/dsh-extensions/`, which you can delete.
