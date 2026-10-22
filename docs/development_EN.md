# Development and Source Runs

[简体中文](development.md) · [Documentation (Chinese)](README.md) · [Usage](usage_EN.md) · [Contributing](../CONTRIBUTING.md)

For source trials and contributors. Ordinary users should install a [installation guide](install_EN.md), without running engineering tests.
This checkout retains the fixed `0.10.0` base and later work. The default is the **OMD `0.2.1-rc.2.omd.0.99.1` / DSH `0.2.1-rc.2` release source**; current build targets are 0.2.1-rc.1 and rc.2; older hosts retain their historical tags and artifacts. [Package metadata](https://github.com/gulagala001/oh-my-dsh/blob/main/package.json) retains `private`; distribution uses GitHub Releases, not npm. Matching public Chat, Conversation and host components are pinned in the [DSH manifest](../vendor/dsh.json). [Rewritten OpenCU 2.0.7](../vendor/opencu.json) is fully bundled, supplying the core, tools and original REA frontend with OMD alone. The 0.2.1-rc.2 build uses Cordis `4.0.5`, Schemastery `3.18.5` and a frozen dependency lock without relaxed compatibility checks.

OMD tarballs omit the redundant standalone registration bundle `vendor/opencu/lib/client.js`: the integrated client is already in OMD’s main bundle, and `client.factory.mjs` is generated during the build and also excluded from the final tarball. The workspace snapshot and standalone OpenCU distribution are unchanged.

## Running from Source

Use Node.js ≥22.19, Git, and the pnpm specified in the checkout's `package.json`.
The example runs the published fixed `0.10.0` source, not this current `0.99.1` release.

```sh
git clone --branch v0.2.1-alpha.1.omd.0.10.0 https://github.com/gulagala001/oh-my-dsh.git
cd oh-my-dsh
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

**Local compatibility builds:** `scripts/host-targets.mjs` centralizes reviewed official commits and frameworks. `scripts/align-host.mjs <full host version> <official source directory>` aligns manifests, enum sources and framework overrides. `scripts/sync-dsh.mjs` accepts independent matching sources with real browser artifacts; `scripts/sync-opencu.mjs` accepts the matching rewritten tgz. Each build generates and checks its own frozen lock, peers and artifacts without relabeling another host's bytes. Projectless draft initialization is centralized in `src/client/projectless-state.mjs`: newer hosts use the native initializer; rc.2 uses the target Session's input facade while preserving existing drafts, attachment ownership and submission locks. Preparation shares navigation and plugin cancellation through native `retain({ signal })` readiness waits. Accepted settings writes settle before checking cancellation; submitted messages retain their actual admission lifecycle and are never replayed by navigation. Use `OMD_PNPM_ENTRY="$PNPM" node scripts/pack-local.mjs <output directory>` for local installation tarballs, preserving the bundled macOS helper's executable mode and signed bytes. Targeted runtime checks use isolated data/profiles; daily deployment and restart require explicit authorization.

Defaults are the repository's `data/dsh/` directory, profile `oh-my-dsh`, and port 3083; the first launch installs the local plugin.
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

See [plugin architecture](architecture_EN.md) for product boundaries, independent releases and coinstallation. Fixed packages retain required source, matching compiled resources and provenance. End users install fixed Release assets; the source branch is not an installation package.


| Path | Responsibility |
| --- | --- |
| `cordis.patch.yml`, `presets/` | Host/preset composition |
| `src/index.mjs`, `src/runtime.mjs`, `src/dsh-agent.mjs` | Lightweight startup, enhancement runtime, and tools |
| `src/context/` | Summaries, documents, replacement, recall |
| `src/tasks.mjs`, `src/todolist.mjs` | Anchors, tasks, evidence |
| `src/hub.mjs`, `src/hub-store.mjs`, `src/monitor-ledger.mjs` | Background work/persistent monitoring ledger |
| `src/dream/` | Isolation, sources, short memory, recovery |
| `src/temporary-chat.mjs`, `src/client/temporary-chat-state.mjs` | Temporary chat turns and frontend streaming interaction state |
| `src/codegraph.mjs` | Indexing/queries |
| `src/client/` | Conversation, workbench, settings, themes |
| `vendor/dsh/` | Public Chat, Conversation and host components matching the current build target |
| `vendor/opencu/` | Complete rewritten OpenCU distribution, synchronized from a matching tgz rather than edited in place |
| `scripts/`, `test/` | Build, launch, checks |

`pnpm build` builds the frontend and generates the standard and OMD-PTC presets from `presets/oh-my-dsh/agent.cordis.yml`. Edit source configuration, not generated files.

Temporary chat history comes from complete turns held in server memory. Native messages and model replay information are reused unchanged in the next request. Request numbers increase within each tab: a `done` receipt confirms commitment, while `stop` cancels only that request, fences its late arrival, and waits for real producer cleanup. After a disconnect, the client reconciles that turn and preserves the draft with sending paused until confirmation; recovery never repeats the model call. Tab entries own frontend state and components subscribe to their views. Closing erases history, and removing a tab stops its keepalive.

The host build uses [`host-const-enums.mjs`](../scripts/host-const-enums.mjs) with the source-verified TypeScript `6.0.3`, explicitly pinned in the root `devDependencies`, to inline official `const enum` members through AST and real symbol binding and eliminate runtime enum references. DSH/Cordis reuse the host SDK singleton rather than bundle a second copy; the official source commit, SHA-256, and complete enum declarations/members are checked against the [enum manifest](../scripts/host-const-enums.json). The default build does not rely on an undeclared compiler fallback from a desktop SDK path.

**Runtime boundaries:** core Chat/Conversation and optional UI enhancements mount separately behind a lightweight backend entry, retaining errors and recovery controls when dependencies fail. Tasks restore from native events; result shortening projects requests while preserving originals. Shared model-reply handling retains cancellation, failure and actual receipts. CommandCode compatibility centralizes the specific gateway's reasoning/tool-history replay without rewriting durable sessions or changing other providers' requests.

## Tests on Demand

Focus on implementation and delivery; keep testing minimal. Run minimal build/startup checks as needed, and use targeted verification (including CU) only for a concrete issue or an explicit user request. Improve the experience from user feedback. See [Contributing](../CONTRIBUTING.md).
- `pnpm test` (or `pnpm test:smoke`): the core regressions listed in `scripts/test-ci.mjs`, without repeated host installations or a full desktop launch.
- Individual regression: `node --test test/<name>.test.mjs` for an existing test file.
- `pnpm test:all`: a compatibility entry point for the same core suite, without a separate heavyweight full suite; results describe only the checks that ran.
- When runtime checks are needed, use isolated data and profiles and leave the working DSH instance unchanged.

See [context preparation and original recall (Chinese)](context-workflow.md) for images, context budgets, and idle preprocessing, and [third-party notices](../THIRD_PARTY_NOTICES.md) for sources and licenses.

**Bundled rewind:** `node scripts/sync-rewind.mjs ../rewind` synchronizes a completed standalone build and records the exact host and file hashes in `vendor/rewind.json`. Rebuild OMD after synchronization. The standalone and bundled owners share one runtime.

Sync bundled BTW with `node scripts/sync-btw.mjs ../dsh-btw-plugin` after building the standalone plugin. `vendor/btw.json` records the source commit, exact host and file hashes. Both server and client use the same plugin entries; matching standalone and embedded versions share registration ownership.
