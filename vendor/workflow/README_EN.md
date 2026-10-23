<a name="readme-top"></a>

<h1 align="center">DSH Workflow</h1>

<p align="center"><strong>Save, compose and resume workflows using native DSH subagents.</strong><br>DeepSeek Harness plugin</p>

<p align="center"><a href="README.md">简体中文</a> · <strong>English</strong></p>

<p align="center">
  <a href="https://github.com/gulagala001/dsh-workflow/releases/tag/v0.1.3-dsh.0.2.1-rc.2"><img alt="0.1.3" src="https://img.shields.io/badge/release-0.1.3-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/dsh-workflow/releases"><img alt="GitHub total downloads" src="https://img.shields.io/github/downloads/gulagala001/dsh-workflow/total?style=flat-square&amp;label=GitHub%20downloads&amp;color=0969da"></a>
  <a href="#readme-install"><img alt="DSH 0.2.1-rc.2" src="https://img.shields.io/badge/DSH-0.2.1--rc.2-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/dsh-workflow/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/gulagala001/dsh-workflow?style=flat-square&amp;color=0969da"></a>
</p>

<p align="center"><a href="#readme-install"><strong>Get started</strong></a> · <a href="docs/workflow.md">Docs</a> · <a href="https://github.com/gulagala001/dsh-workflow/issues">Report an issue</a></p>

<a name="readme-install"></a>

## Quick start

**Required environment：** DSH **0.2.1-rc.2**, Node.js **22.19+**.

Subagents use host models and permissions and incur normal model usage. Resume re-executes calls after the successful prefix; check existing artifacts and side effects first.

### 1. Install

Open **Plugins → Add plugin** in the DSH instance you use, then paste:

```text
https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.3-dsh.0.2.1-rc.2/dsh-workflow-plus-0.1.3-dsh.0.2.1-rc.2.tgz
```

Wait for active tasks to finish, then follow the host’s activation/restart prompt. Keep your existing profile and data. See the [installation guide](docs/install_EN.md) · [SHA256SUMS](https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.3-dsh.0.2.1-rc.2/SHA256SUMS).

### 2. Try this first

In a conversation with a configured model, ask:

```text
Use workflow to review auth and storage in parallel, then summarize the findings. Do not modify files.
```

**Success looks like：** The workflow panel shows actual phases, members and status, with agents running as native child conversations.

## Turn repeated work into resumable workflows

- **Compose steps**: use `parallel()`, `pipeline()`, `phase()` and `log()` to express actual dependencies and execution state.
- **Save and reuse**: submit a script directly, use `scriptPath`, or save named project workflows.
- **Resume and isolate**: resume after a successful call prefix. Use Git worktrees for file isolation and retain results for review and merging.

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

The workflow entry beside the conversation title shows phases and members; agents run as native child conversations. `run_in_background: true` uses native Jobs, with `job_output` for inspection and `job_kill` to stop. [Complete usage](docs/workflow.md)

## Runtime boundaries

| Capability | Conditions and behavior |
| --- | --- |
| Nested workflows | One level, sharing concurrency, call limits, cancellation and budget. |
| `resumeFromRunId` | Reuses an unchanged successful prefix in the same conversation; later calls execute again. |
| `isolation: 'worktree'` | Creates a separate checkout from current Git HEAD, retaining changes without automatic merging. |
| Shared output-token target | Add `+500k` or `+1m` to the user message. Reaching it stops new dispatch while active calls can finish. |

Without trustworthy usage, further dispatch stops. Model requests, network access and file permissions remain with the host and tool providers.

## FAQ

<details>
<summary>Does resuming repeat completed actions?</summary>

Only an eligible successful call prefix is reused; later calls execute again. Check existing artifacts and external side effects. Resume is not transactional replay of arbitrary actions.

</details>

<details>
<summary>Does uninstalling remove scripts or worktrees?</summary>

The plugin does not actively delete saved scripts, run records or worktrees. Project paths are `.omd/workflows/` and `.omd/worktrees/`; independent run and budget data lives under `DSH_HOME/dsh-workflow/`.

</details>

## Development and license

The package is `dsh-workflow-plus`, distributed through fixed GitHub Releases. Do not substitute another author’s similarly named npm package.

```bash
pnpm install --frozen-lockfile --ignore-scripts --config.strict-dep-builds=false
pnpm build
```

[Architecture](docs/architecture.md). Licensed under [MIT](LICENSE); see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for sources.

## Documentation and support

| I want to | Where to go |
| --- | --- |
| Install, update or remove | [Installation guide](docs/install_EN.md) |
| Learn the features and limits | [Documentation](docs/workflow.md) |
| Read release changes | [Releases](https://github.com/gulagala001/dsh-workflow/releases) |
| Report a problem | [Issues](https://github.com/gulagala001/dsh-workflow/issues) |

For a bug report, include the full DSH and plugin versions, the entry point, minimal reproduction steps, and expected versus actual behavior. Remove private data before sharing logs or screenshots.

<p align="center"><a href="#readme-top">Back to top</a> · <a href="https://github.com/gulagala001/dsh-workflow/releases">Versions and downloads</a> · <a href="https://github.com/gulagala001/dsh-workflow/issues">Feedback</a></p>

[Documentation structure and contributing](docs/documentation.md)
