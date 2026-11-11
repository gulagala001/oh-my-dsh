<a name="readme-top"></a>

<h1 align="center">DSH Workflow</h1>

<p align="center"><strong>Write multi-step work as a script, run it across parallel subagents, and pick up where it stopped.</strong><br>A DeepSeek Harness plugin</p>

<p align="center"><a href="README.md">简体中文</a> · <strong>English</strong></p>

<p align="center">
  <a href="https://github.com/gulagala001/dsh-workflow/releases/tag/v0.1.9-dsh.0.2.2-rc.2"><img alt="DSH Workflow 0.1.9" src="https://img.shields.io/badge/release-0.1.9-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/dsh-workflow/releases"><img alt="GitHub downloads" src="https://img.shields.io/github/downloads/gulagala001/dsh-workflow/total?style=flat-square&amp;label=GitHub%20downloads&amp;color=0969da"></a>
  <a href="#readme-install"><img alt="DSH 0.2.2-rc.2" src="https://img.shields.io/badge/DSH-0.2.2--rc.2-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/dsh-workflow/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/gulagala001/dsh-workflow?style=flat-square&amp;color=0969da"></a>
</p>

<p align="center"><a href="#readme-install"><strong>Get started</strong></a> · <a href="docs/workflow.md">Full usage</a> · <a href="https://github.com/gulagala001/dsh-workflow/issues">Feedback</a></p>

<a name="readme-install"></a>

## Quick start

**Requires:** DSH **0.2.2-rc.2** and Node.js **24.9.0+**. Subagents use the models and permissions configured in DSH and are billed as normal usage.

### 1. Install

In DSH, open **Plugins → Add plugin** and paste:

```text
https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.9-dsh.0.2.2-rc.2/dsh-workflow-plus-0.1.9-dsh.0.2.2-rc.2.tgz
```

When your current task finishes, enable the plugin or restart DSH when prompted. Your settings and conversations stay as they were. For command-line installs, upgrades and removal, see the [installation guide](docs/install_EN.md). Checksums: [SHA256SUMS](https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.9-dsh.0.2.2-rc.2/SHA256SUMS).

### 2. Try it

In a project, ask:

```text
Use workflow to review auth and storage in parallel, then summarize the findings. Do not modify files.
```

A workflow panel appears next to the conversation title with the progress of each phase and subagent. Each subagent runs in its own child conversation, which you can open.

## What it does

- **Compose steps**: `parallel()` runs branches side by side, `pipeline()` moves each item through later stages, and `phase()` and `log()` report progress.
- **Save and reuse**: pass a script directly, or save it in the project's `.omd/workflows/` and call it by name.
- **Resume**: pass the previous `resumeFromRunId`. Calls that already succeeded and have not changed reuse their results; work restarts at the first change or failure.
- **Isolate changes**: add `isolation: 'worktree'` to a subagent and it edits code in a separate Git worktree, left for you to review and merge.
- **Output budget**: end your message with `+500k` or `+1m`. No new tasks start once the budget is used.
- **Background runs**: `run_in_background: true` moves the run to the background. Read results with `job_output` and stop it with `job_kill`.

### A minimal workflow

```js
export const meta = {
  name: 'review-modules',
  description: 'Review two modules',
  phases: [{ title: 'Review' }],
};
phase('Review');
return await parallel([
  () => agent('Review auth for correctness. Do not edit files.', { label: 'auth' }),
  () => agent('Review storage for correctness. Do not edit files.', { label: 'storage' }),
]);
```

## Scope

| Case | Notes |
| --- | --- |
| Nested workflows | One level deep, sharing concurrency, budget and cancellation with the outer run |
| Resume | Works within the same conversation; every call after the first change runs again |
| Worktree isolation | Needs a local Git repository; uncommitted changes are not copied into the worktree |
| Output budget | New tasks stop at the target, running ones finish, so usage can go slightly over |

## FAQ

<details>
<summary>Does resuming repeat work that already happened?</summary>

Calls that succeeded and did not change are not repeated; calls after the first change are. If the task sends messages or writes to a database, check how far the last run got before resuming.

</details>

<details>
<summary>Does uninstalling delete scripts or worktrees?</summary>

No. Scripts live in the project's `.omd/workflows/`, worktrees in `.omd/worktrees/`, and run records and budgets in `DSH_HOME/dsh-workflow/`.

</details>

## Development and license

The package name is `dsh-workflow-plus`. Download it only from this repository's releases; similarly named npm packages are not this project.

```bash
node scripts/prepare-host-sdk.mjs
pnpm install --frozen-lockfile --ignore-scripts --config.strict-dep-builds=false
pnpm build
```

[Architecture](docs/architecture.md). Code is [MIT](LICENSE) licensed; third-party sources are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

When reporting a problem, include your DSH and plugin versions, the steps, and what you expected versus what happened. Remove personal data from logs and screenshots first: [Issues](https://github.com/gulagala001/dsh-workflow/issues).
