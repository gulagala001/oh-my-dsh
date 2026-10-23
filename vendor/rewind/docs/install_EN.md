# DSH Rewind — Installation and maintenance

[简体中文](install.md) · [README](../README_EN.md#readme-install)

**DSH 0.2.1-rc.2 · Node.js ≥22.19 · 0.1.0**

File restoration only covers retained checkpoints. Older messages may support conversation-only rewind. External changes are checked before restoration; double Esc during generation retains the host Stop behavior.

## Install in the current instance

Open **Plugins → Add plugin** in the instance you actually use and paste this fixed release address:

```text
https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.3-dsh.0.2.1-rc.2/gulagala001-dsh-undo-plugin-0.1.3-dsh.0.2.1-rc.2.tgz
```

Finish active tasks, follow the host’s activation/restart prompt, and keep your existing profile, DSH_HOME, model configuration and conversations.

Verify the archive with the release’s [SHA256SUMS](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.3-dsh.0.2.1-rc.2/SHA256SUMS).

### First success check

In an idle test conversation, enter `/rewind` or press **Esc twice**.

A rewind list opens above the composer. Selecting an entry shows the affected scope and confirmation before any file restoration.

<details>
<summary>Command-line installation</summary>

Use the CLI belonging to the same DSH instance; replace `web` with its actual profile.

```bash
dsh plugin --profile web add "https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.3-dsh.0.2.1-rc.2/gulagala001-dsh-undo-plugin-0.1.3-dsh.0.2.1-rc.2.tgz"
```

</details>

## Update, rollback and removal

Back up the existing profile and relevant data first. Update using a fixed release matching the host; do not replace or downgrade DSH to make a package install. If an update fails, keep the original data and preserve the first error. Use the previous matching archive only with its release-specific data guidance; restoring code alone does not undo data changes.

Remove from the current instance’s plugin page, or use:

```bash
dsh plugin --profile web remove @gulagala001/dsh-undo-plugin
```

Uninstall retains backups under `DSH_HOME/rewind-plus/v1`. Complete any needed undo first and do not delete backups during restoration.

Restart the same instance after removing the plugin. Report problems with the complete versions, profile type and a redacted first error.
