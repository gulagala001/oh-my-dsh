# Install DeepSeek Workbench

[简体中文](install.md) · [Back to README](../README_EN.md)

Requires DSH **0.2.2-rc.3** and Node.js **24.9.0+**.

## Install in DSH

Open **Plugins → Add plugin** and paste:

```text
https://github.com/gulagala001/dsh-deepseek-workbench/releases/download/v0.1.10-dsh.0.2.2-rc.3/dsh-deepseek-workbench-0.1.10-dsh.0.2.2-rc.3.tgz
```

When your current task finishes, enable the plugin or restart DSH when prompted. Checksums: [SHA256SUMS](https://github.com/gulagala001/dsh-deepseek-workbench/releases/download/v0.1.10-dsh.0.2.2-rc.3/SHA256SUMS).

## Install from the command line

Use the CLI that belongs to the same DSH, replacing `web` with your profile (`desktop` for the desktop app):

```bash
dsh plugin --profile web add "https://github.com/gulagala001/dsh-deepseek-workbench/releases/download/v0.1.10-dsh.0.2.2-rc.3/dsh-deepseek-workbench-0.1.10-dsh.0.2.2-rc.3.tgz"
```

## Upgrade and roll back

Back up your profile, then install the new package over the old one. DSH itself does not need to change. If the upgrade fails, your data is untouched; send the first error to [Issues](https://github.com/gulagala001/dsh-deepseek-workbench/issues).

To go back, install the previous package. Rolling back only replaces the code; data written by the newer version stays.

## Uninstall

Remove it on the Plugins page, or run:

```bash
dsh plugin --profile web remove dsh-deepseek-workbench
```

Then restart DSH. Converted DSH conversations and normal web chats stay. Before uninstalling, close the temporary sidebar and make sure it finished cleaning up.
