# Development and Source Runs

[简体中文](development.md) · [Documentation (Chinese)](README.md) · [Usage](usage_EN.md) · [Contributing](../CONTRIBUTING.md)

For source trials and contributors. Ordinary users should install a [installation guide](install_EN.md), without running engineering tests.
This checkout retains the fixed `0.10.0` base and later work. The default is the **OMD `0.2.1-rc.2.omd.0.19.0` / DSH `0.2.1-rc.2` release source**; 0.2.0-rc.2/alpha.3/0.2.1-rc.1 build paths, existing artifacts and data remain. [Package metadata](https://github.com/gulagala001/oh-my-dsh/blob/main/package.json) retains `private`; distribution uses GitHub Releases, not npm. Matching public Chat, Conversation and host components are pinned in the [DSH manifest](../vendor/dsh.json). [Rewritten OpenCU 2.0.6](../vendor/opencu.json) is fully bundled, supplying the core, tools and original REA frontend with OMD alone. The 0.2.1-rc.2 build uses Cordis `4.0.5`, Schemastery `3.18.5` and a frozen dependency lock without relaxed compatibility checks.

OMD tarballs omit the redundant standalone registration bundle `vendor/opencu/lib/client.js`: the integrated client is already in OMD’s main bundle, while `client.factory.mjs` remains available for offline rebuilds. The workspace snapshot and standalone OpenCU distribution are unchanged.

## Running from Source

Use Node.js ≥22.19, Git, and the pnpm specified in the checkout's `package.json`.
The example runs the published fixed `0.10.0` source, not this current `0.19.0` release.

```sh
git clone --branch v0.2.1-alpha.1.omd.0.10.0 https://github.com/gulagala001/oh-my-dsh.git
cd oh-my-dsh
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

**Local compatibility builds:** `scripts/host-targets.mjs` centralizes reviewed official commits and frameworks. `scripts/align-host.mjs <full host version> <official source directory>` aligns manifests, enum sources and framework overrides. `scripts/sync-dsh.mjs` accepts independent matching sources with real browser artifacts; `scripts/sync-opencu.mjs` accepts the matching rewritten tgz. Each build generates and checks its own frozen lock, peers and artifacts without relabeling another host's bytes. Projectless draft initialization is centralized in `src/client/projectless-state.mjs`: newer hosts use the native initializer; rc.2 uses the target Session's input facade while preserving existing drafts, attachment ownership and submission locks. Use `OMD_PNPM_ENTRY="$PNPM" node scripts/pack-local.mjs <output directory>` for local installation tarballs, preserving the bundled macOS helper's executable mode and signed bytes. Targeted runtime checks use isolated data/profiles; daily deployment and restart require explicit authorization.

Defaults are the repository's `data/dsh/` directory, profile `trisoul-x`, and port 3083; the first launch installs the local plugin.
Open the complete login link printed in the terminal and configure your model in DSH. The repository supplies no private data or credentials.

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

After building, link an existing Web profile using the CLI matching its host version:

```sh
dsh plugin --profile YOUR_PROFILE add link:/absolute/path/to/oh-my-dsh
```

Restart to apply. Desktop requires its [bundled CLI (Chinese)](upgrade.md#desktop); an ordinary CLI cannot write the desktop profile. Prefer source paths without spaces.
On macOS, `node scripts/launch-macos.mjs` uses the default data directory and port, starts in the background, and opens the login link; logs are in `data/dsh-stage.log`.
Closing the browser does not stop the background service. Use Ctrl+C to stop a foreground `pnpm start`.

</details>

## Build Responsibilities

| Path | Responsibility |
| --- | --- |
| `cordis.patch.yml`, `presets/` | Host/preset composition |
| `src/index.mjs`, `src/dsh-agent.mjs` | Lifecycle and tools |
| `src/context/` | Summaries, documents, replacement, recall |
| `src/tasks.mjs`, `src/todolist.mjs` | Anchors, tasks, evidence |
| `src/hub.mjs`, `src/hub-store.mjs`, `src/monitor-ledger.mjs` | Background work/persistent monitoring ledger |
| `src/dream/` | Isolation, sources, short memory, recovery |
| `src/codegraph.mjs` | Indexing/queries |
| `src/client/` | Conversation, workbench, settings, themes |
| `vendor/dsh/` | Public Chat, Conversation and host components matching the current build target |
| `vendor/opencu/` | Complete rewritten OpenCU distribution, synchronized from a matching tgz rather than edited in place |
| `scripts/`, `test/` | Build, launch, checks |

`pnpm build` builds the frontend and generates the standard and OMD-PTC presets from `presets/trisoul-x/agent.cordis.yml`. Edit source configuration, not generated files.

The host build uses [`host-const-enums.mjs`](../scripts/host-const-enums.mjs) with the source-verified TypeScript `6.0.3`, explicitly pinned in the root `devDependencies`, to inline official `const enum` members through AST and real symbol binding and eliminate runtime enum references. DSH/Cordis reuse the host SDK singleton rather than bundle a second copy; the official source commit, SHA-256, and complete enum declarations/members are checked against the [enum manifest](../scripts/host-const-enums.json). The default build does not rely on an undeclared compiler fallback from a desktop SDK path.

## Tests on Demand

Focus on implementation and delivery; keep testing minimal. Run minimal build/startup checks as needed, and use targeted verification (including CU) only for a concrete issue or an explicit user request. Improve the experience from user feedback. See [Contributing](../CONTRIBUTING.md).
- `pnpm test` (or `pnpm test:smoke`): 12 lightweight core files, without repeated host installations or a full desktop launch.
- Individual regression: `node --test test/<name>.test.mjs`; documentation: `node --test test/documentation.test.mjs`.
- `pnpm test:all`: explicit execution of the retained tests, not a default gate. Some historical fixtures still disagree with alpha.2; counts and pass rates do not establish product completeness.
- When runtime checks are needed, use isolated data and profiles and leave the working DSH instance unchanged.

See [context preparation and original recall (Chinese)](context-workflow.md) for images, context budgets, and idle preprocessing, and [third-party notices](../THIRD_PARTY_NOTICES.md) for sources and licenses.

**Bundled rewind:** `node scripts/sync-rewind.mjs ../rewind` synchronizes a completed standalone build and records the exact host and file hashes in `vendor/rewind.json`. Rebuild OMD after synchronization. The standalone and bundled owners share one runtime.
