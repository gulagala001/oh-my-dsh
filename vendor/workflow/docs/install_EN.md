# DSH Workflow — Installation and maintenance

[简体中文](install.md) · [README](../README_EN.md#readme-install)

**DSH 0.2.1-rc.2 · Node.js ≥22.19 · 0.1.1**

Subagents use host models and permissions and incur normal model usage. Resume re-executes calls after the successful prefix; check existing artifacts and side effects first.

## Install in the current instance

Open **Plugins → Add plugin** in the instance you actually use and paste this fixed release address:

```text
https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.4-dsh.0.2.1-rc.2/dsh-workflow-plus-0.1.4-dsh.0.2.1-rc.2.tgz
```

Finish active tasks, follow the host’s activation/restart prompt, and keep your existing profile, DSH_HOME, model configuration and conversations.

Verify the archive with the release’s [SHA256SUMS](https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.4-dsh.0.2.1-rc.2/SHA256SUMS).

### First success check

In a conversation with a configured model, ask:

```text
Use workflow to review auth and storage in parallel, then summarize the findings. Do not modify files.
```

The workflow panel shows actual phases, members and status, with agents running as native child conversations.

<details>
<summary>Command-line installation</summary>

Use the CLI belonging to the same DSH instance; replace `web` with its actual profile.

```bash
dsh plugin --profile web add "https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.4-dsh.0.2.1-rc.2/dsh-workflow-plus-0.1.4-dsh.0.2.1-rc.2.tgz"
```

</details>

## Update, rollback and removal

Back up the existing profile and relevant data first. Update using a fixed release matching the host; do not replace or downgrade DSH to make a package install. If an update fails, keep the original data and preserve the first error. Use the previous matching archive only with its release-specific data guidance; restoring code alone does not undo data changes.

Remove from the current instance’s plugin page, or use:

```bash
dsh plugin --profile web remove dsh-workflow-plus
```

Scripts, run records and worktrees are not actively deleted. Run/budget data lives under `DSH_HOME/dsh-workflow/`; project paths remain `.omd/workflows/` and `.omd/worktrees/`.

Restart the same instance after removing the plugin. Report problems with the complete versions, profile type and a redacted first error.
