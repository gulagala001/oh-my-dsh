# Install DSH Workflow

[简体中文](install.md) · [Back to README](../README_EN.md)

Requires DSH **0.2.2-rc.3** and Node.js **24.9.0+**.

## Install in DSH

Open **Plugins → Add plugin** and paste:

```text
https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.11-dsh.0.2.2-rc.3/dsh-workflow-plus-0.1.11-dsh.0.2.2-rc.3.tgz
```

When your current task finishes, enable the plugin or restart DSH when prompted. Checksums: [SHA256SUMS](https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.11-dsh.0.2.2-rc.3/SHA256SUMS).

## Install from the command line

Use the CLI that belongs to the same DSH, replacing `web` with your profile (`desktop` for the desktop app):

```bash
dsh plugin --profile web add "https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.11-dsh.0.2.2-rc.3/dsh-workflow-plus-0.1.11-dsh.0.2.2-rc.3.tgz"
```

## Upgrade and roll back

Back up your profile and `DSH_HOME/dsh-workflow/`, then install the new package over the old one. DSH itself does not need to change. If the upgrade fails, your data is untouched; send the first error to [Issues](https://github.com/gulagala001/dsh-workflow/issues).

To go back, install the previous package. Rolling back only replaces the code; data written by the newer version stays.

## Uninstall

Remove it on the Plugins page, or run:

```bash
dsh plugin --profile web remove dsh-workflow-plus
```

Then restart DSH. Saved scripts (`.omd/workflows/`), worktrees (`.omd/worktrees/`), run records and budgets (`DSH_HOME/dsh-workflow/`) stay in place; delete them by hand if you no longer need them.
