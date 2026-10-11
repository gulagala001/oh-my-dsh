# Development and Source Runs

[简体中文](development.md) · [Documentation](README_EN.md) · [Usage](usage_EN.md) · [Contribution rules](../CONTRIBUTING.md)

For source trials and contributors. Ordinary users should install a [fixed release](upgrade_EN.md), without running engineering tests.

GitHub `main` is unpublished DSH alpha.2 / OMD `0.2.1-alpha.2.omd.0.16.0`, with an earlier OpenCU 1.6.1 snapshot. The latest local browser/runtime reconstruction has not merged; cloning main does not fetch unmerged contents.

## Running from Source

Use Node.js ≥22.19, Git, and the pnpm specified in the checkout's `package.json`. Public `0.10.0` uses 11.23.0; development uses its own pinned version.

```sh
git clone --branch v0.2.1-alpha.1.omd.0.10.0 https://github.com/gulagala001/oh-my-dsh.git
cd oh-my-dsh
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

Defaults are repository `data/dsh/`, profile `trisoul-x`, and port 3083; the first launch installs the local plugin. Open the complete login link and configure your model in DSH. No private data or credentials are supplied.

<details>
<summary>Ports, data, and local links</summary>

macOS/Linux:

```sh
PORT=3090 pnpm start
DSH_HOME=/absolute/path/to/dsh-data pnpm start
```

PowerShell:

```powershell
$env:PORT = '3090'
$env:DSH_HOME = 'C:\dsh-data'
pnpm start
```

After building, link an existing Web profile using its matching CLI:

```sh
dsh plugin --profile YOUR_PROFILE add link:/absolute/path/to/oh-my-dsh
```

Restart to apply. Desktop requires its [bundled CLI](upgrade_EN.md#desktop-cli); an ordinary CLI cannot write desktop. Prefer source paths without spaces.

On Mac, `node scripts/launch-macos.mjs` starts the background trial and opens its link. Closing the browser does not stop it; logs stay local. Use Ctrl+C for a foreground process.

</details>

## Build Responsibilities

| Path | Responsibility |
| --- | --- |
| `cordis.patch.yml`, `presets/` | Host/preset composition |
| `src/index.mjs`, `src/dsh-agent.mjs` | Lifecycle and tools |
| `src/context/` | Summaries, documents, replacement, recall |
| `src/tasks.mjs`, `src/todolist.mjs` | Anchors, tasks, evidence |
| `src/hub.mjs`, `src/hub-store.mjs` | Background work/monitoring |
| `src/codegraph.mjs` | Indexing/queries |
| `src/client/` | Conversation, workbench, settings, themes |
| `vendor/opencu/` | Fixed distribution snapshot; shared implementation belongs in OpenCU |
| `scripts/`, `test/` | Build, launch, checks |

Build generates OMD-PTC from the shared composition. Edit source configuration, not generated files.

## Verification and Contributions

Read [contribution rules](../CONTRIBUTING.md), then select checks for the risk. Conversation, tools, reminders, compression, Dream, deadlines, or recovery changes follow the [simulator guide](../scripts/simulator/README.md) using real-host scenarios. Frontend flows need actual Web checks.

```sh
pnpm exec playwright install --with-deps chromium
pnpm build
pnpm test
```

Checks use temporary data, controlled models, and a real host without API keys. Native desktop checks depend on platform, runtime, and permissions. Skips, exhausted budgets, or failed cleanup do not pass. Windows was not checked on hardware this round.

Host upgrades match SDKs, snapshots, and locks while preserving tools, skills, settings, and lifecycle. Test fixed plugins in both loading orders, enable/disable, restart, and removal. Retain native refusals; changing peers is not adaptation.

## Image and Context Budgets

Development batches removal of older image representations from requests while retaining files/attachments for rereading. Actual provider routing and hard limits still apply. Fewer replacements do not guarantee caching or savings.

Idle preprocessing defaults off, with 90 seconds when enabled. Normal/manual triggers and already-started tasks have their own boundaries. Failure or a full context window must not fabricate continuation or silently discard originals.

## Releases and Public Files

Use the complete DSH version prefix followed by `omd.major.feature.patch`, with package, tag, manifest, and docs consistent. Features increment the feature part and reset patch; fixes increment patch.

Before release, inspect actual Git files, history, tags, package contents, and licenses. Internal plans, agent records, raw research/acceptance material, real conversations, credentials, logs, and run outputs stay local. Retain maintenance source, synthetic fixtures, tests, and user docs for their purpose. Historical notes do not verify a new package.

Report actual versions and redacted errors. [Authors, sources, licenses](../THIRD_PARTY_NOTICES.md).
