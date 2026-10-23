# DeepSeek Workbench — Installation and maintenance

[简体中文](install.md) · [README](../README_EN.md#readme-install)

**DSH 0.2.1-rc.2 · Node.js ≥22.19 · 0.1.0**

Embedded web chat requires DSH Desktop. Persistent login, website downloads and extended platform pages need matching desktop adapters. DSH Web provides external links. Web-chat login and API-platform authorization are separate.

## Install in the current instance

Open **Plugins → Add plugin** in the instance you actually use and paste this fixed release address:

```text
https://github.com/gulagala001/dsh-deepseek-workbench/releases/download/v0.1.2-dsh.0.2.1-rc.2/dsh-deepseek-workbench-0.1.2-dsh.0.2.1-rc.2.tgz
```

Finish active tasks, follow the host’s activation/restart prompt, and keep your existing profile, DSH_HOME, model configuration and conversations.

Verify the archive with the release’s [SHA256SUMS](https://github.com/gulagala001/dsh-deepseek-workbench/releases/download/v0.1.2-dsh.0.2.1-rc.2/SHA256SUMS).

### First success check

Choose **DeepSeek web chat** in the sidebar, sign in to the official chat service and open a regular conversation.

You can browse web history. “Continue in DSH” creates a native conversation; you decide when to send the next message.

<details>
<summary>Command-line installation</summary>

Use the CLI belonging to the same DSH instance; replace `web` with its actual profile.

```bash
dsh plugin --profile web add "https://github.com/gulagala001/dsh-deepseek-workbench/releases/download/v0.1.2-dsh.0.2.1-rc.2/dsh-deepseek-workbench-0.1.2-dsh.0.2.1-rc.2.tgz"
```

</details>

## Update, rollback and removal

Back up the existing profile and relevant data first. Update using a fixed release matching the host; do not replace or downgrade DSH to make a package install. If an update fails, keep the original data and preserve the first error. Use the previous matching archive only with its release-specific data guidance; restoring code alone does not undo data changes.

Remove from the current instance’s plugin page, or use:

```bash
dsh plugin --profile web remove dsh-deepseek-workbench
```

Close temporary sidebars and confirm website cleanup before uninstalling. Migrated DSH conversations and regular website history remain with their services; the desktop host owns website login data.

Restart the same instance after removing the plugin. Report problems with the complete versions, profile type and a redacted first error.
