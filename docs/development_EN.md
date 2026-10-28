# Development and Source Runs

[简体中文](development.md) · [Documentation (Chinese)](README.md) · [Usage](usage_EN.md) · [Contributing](../CONTRIBUTING.md)

For source trials and contributors. Ordinary users should install a [installation guide](install_EN.md), without running engineering tests.
This checkout retains the fixed `0.10.0` base and later work. The default is the **OMD `0.2.1-rc.3.omd.1.1.0` / DSH `0.2.1-rc.3` source build**; build targets are pinned separately to 0.2.1-rc.1, rc.2 and rc.3; older hosts retain their historical tags and artifacts. [Package metadata](https://github.com/gulagala001/oh-my-dsh/blob/main/package.json) retains `private`; distribution uses GitHub Releases, not npm. Matching public Chat, Conversation and host components are pinned in the [DSH manifest](../vendor/dsh.json). [Rewritten OpenCU](../vendor/opencu.json) is fully bundled, supplying the core, tools and original REA frontend with OMD alone. The 0.2.1-rc.3 build uses Cordis `4.0.5`, Schemastery `3.18.5` and a frozen dependency lock without relaxed compatibility checks.

OMD tarballs omit the redundant standalone registration bundle `vendor/opencu/lib/client.js`: the integrated client is already in OMD’s main bundle, and `client.factory.mjs` is generated during the build and also excluded from the final tarball. The workspace snapshot and standalone OpenCU distribution are unchanged.

## Running from Source

Use Node.js ≥22.19, Git, and the pnpm specified in the checkout's `package.json`.
The example runs the published fixed `0.10.0` source, not the current source version.

```sh
git clone --branch v0.2.1-alpha.1.omd.0.10.0 https://github.com/gulagala001/oh-my-dsh.git
cd oh-my-dsh
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

**Local compatibility builds:** `scripts/host-targets.mjs` centralizes reviewed official commits and frameworks. `scripts/align-host.mjs <full host version> <official source directory>` aligns manifests, enum sources and framework overrides. `scripts/sync-dsh.mjs` accepts independent matching sources with real browser artifacts; `scripts/sync-opencu.mjs` accepts the matching rewritten tgz. Each build generates and checks its own frozen lock, peers and artifacts without relabeling another host's bytes. Projectless draft initialization is centralized in `src/client/projectless-state.mjs`: newer hosts use the native initializer; rc.2 uses the target Session's input facade while preserving existing drafts, attachment ownership and submission locks. Preparation shares navigation and plugin cancellation through native `retain({ signal })` readiness waits. Projectless creation prepares its final directory and native Session before the composer is shown. First send uses the same native input owner; do not add per-plugin setting copies or substitute a new Session at submission. Keep navigation cancellation, idempotent creation retries and one unsent draft per scope. A projectless allocation request ID must equal the final Session ID. Reusing a blank requires both that identity and the matching directory allocation record; directory provenance alone is not session ownership. Explicit workspaces must also match their registered directory. Use `OMD_PNPM_ENTRY="$PNPM" node scripts/pack-local.mjs <output directory>` for local installation tarballs, preserving the bundled macOS helper's executable mode and signed bytes. Targeted runtime checks use isolated data/profiles; daily deployment and restart require explicit authorization.

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
| `vendor/opencu/` | OpenCU distribution snapshot; source, built assets and digests maintained by the sync script |
| `scripts/`, `test/` | Build, launch, checks |

The component and price `scripts/sync-*.mjs` commands finish by running the shared credits generator to update the settings catalog and public source documentation. Run `npm run credits:write` after manually changing other catalog inputs. `npm run docs:check` verifies the generated content.

Custom commands are maintained in the standalone Extensions repository and synchronized with `scripts/sync-dsh-extensions.mjs`. Each native command-service generation owns its file-operation queue and registrations. Personal and project commands share incremental reconciliation; native `definitionId` values distinguish owned registrations from foreign names without borrowing an unrelated conversation's scope. Registrations retain menu metadata only. Sending reads the current file and rechecks cancellation and ownership; read or parse failures never use an older template. Unloading removes owned registrations and host restart rebuilds them from files. Standalone tests cover templates and cancellation; OMD core exercises scopes, concurrency, unload and recovery through the real rc.2 registry.

Skill management is also maintained in standalone Extensions. The pinned rc.2 `SkillRegistry.listLayerCandidates` supplies every native candidate, including shadowed files. `agentPresets.acquireScope` reads and releases the default preset without creating an Agent. The filesystem provider's `roots` and `get` own directory selection, parsing and candidate validation before publication; there is no separate discovery implementation or watcher delay. Host upgrades must check these interfaces and the `FileSystemSkillProvider` type identification together; unsupported hosts fail explicitly. One write queue owns file replacement, bundle publication, registration checks and native cache invalidation. `test/extensions-skills-native.test.mjs` covers native scopes, cold presets, read-only content, root protection and publication failures in core CI. Browser validation should also check that skill and instruction content refresh immediately after saving.

Instruction management imports the host's `dsh-agent-instructions` and `dsh-scope` through its declared Loader dependency, reads validated config from active Cordis fibers, and calls `discoverBaselineInstructionFiles`. It no longer uses the first profile declaration or separate fallback defaults. The default-preset lease and selected workspace's main-conversation scope chains determine the candidates; publication rechecks preset revisions and cancellation. Creation still validates same-directory names and uses the shared root-marker lookup because the public discovery API returns existing files only. One queue and atomic file writer own saves and deletions. Link edits preserve the link, deletion preserves its target, content reads are bounded, and the JSON request budget covers escape expansion. Native source limits and the page's 1 MiB editing limit are distinct; the host retains total-context budgeting and content deduplication. `test/extensions-instructions-native.test.mjs` covers config, paths, shutdown, preset replacement and recovery in core CI. Host upgrades must recheck the Loader, fiber, scope and discovery interfaces.

For same-version server ESM, host source and documentation changes, use `node scripts/sync-opencu.mjs ../opencu --files src/dsh/downloads.mjs host/downloads.ts DEVELOPMENT.md docs/install.md docs/install_EN.md`. This copies only the listed committed distribution files and preserves existing built assets. That mode rejects dirty source, mismatched destination digests, generated assets and new package members. For same-version client changes, finish the affected build, update extension hashes and commit the source, then run `node scripts/sync-opencu.mjs ../opencu --client`. It synchronizes client output, content-hashed chunks and the extension cursor/ZIP, validates resource hashes and removes superseded chunks without repacking the entire plugin. Both modes record `sourceCommit` and actual file hashes in `vendor/opencu.json`, removing the old `archiveSha256` because it no longer describes the snapshot. Other membership, version or build-input changes still require a matching full package. Synchronizing source or client output does not rebuild or update the desktop.

`pnpm build` builds the frontend and generates the standard and OMD-PTC presets from `presets/oh-my-dsh/agent.cordis.yml`. Edit source configuration, not generated files.

Temporary chat history comes from complete turns held in server memory. Native messages and model replay information are reused unchanged in the next request. Request numbers increase within each tab: a `done` receipt confirms commitment, while `stop` cancels only that request, fences its late arrival, and waits for real producer cleanup. After a disconnect, the client reconciles that turn and preserves the draft with sending paused until confirmation; recovery never repeats the model call. Tab entries own frontend state and components subscribe to their views. Closing erases history, and removing a tab stops its keepalive.

Recommended updates and OMD self-updates reuse their own admission rules inside the `withPluginPreflight` continuation, covering queues, probes and manual continuation. Native inventory, current configuration/tasks and the version service remain authoritative. The callback rereads them before mutation instead of overwriting a new choice with old enablement. Ineligible automatic updates end without mutation; manual conflicts retain an actionable error. Each attempt still probes once. Native methods own their file locks, failure recovery and HMR; removal and installation remain two host operations, without a cross-process replacement transaction. Self-update uses the version service's current snapshot without another network check.

The native `omdOverview` projection owns source, output and Workflow facts. The frontend does not rescan loaded history or merge a second workflow state. Native projection stores arbitrate sequence numbers, receipts, read state and reconnects; an empty replacement is never refilled from an older list summary. Child catalogs and running state remain host-owned. Current turn outcomes and historical workflow outcomes are displayed separately, and phase keys distinguish omission from an empty string. Projection version changes rebuild caches from original logs without rewriting them or adding another store. Read failures require explicit retry; opening a session still owns history migration.

Projectless working directories are allocated by `src/projectless-workspaces.mjs`. Only a `ready` request record confirms a path; `pending` retains the request, date and candidate name. Initial allocation and recovery share exclusive `mkdir`: existing directories, files and symlinks are never adopted. Unconfirmed directories left by failures remain intact; another numbered name is selected and only that request's abandoned name claim is removed. Cross-process locking, atomic metadata writes and retries of confirmed paths remain unchanged. Disk errors propagate without automatically resending messages.

The host build uses [`host-const-enums.mjs`](../scripts/host-const-enums.mjs) with the source-verified TypeScript `6.0.3`, explicitly pinned in the root `devDependencies`, to inline official `const enum` members through AST and real symbol binding and eliminate runtime enum references. DSH/Cordis reuse the host SDK singleton rather than bundle a second copy; the official source commit, SHA-256, and complete enum declarations/members are checked against the [enum manifest](../scripts/host-const-enums.json). The default build does not rely on an undeclared compiler fallback from a desktop SDK path.

CodeGraph's runtime catalog job owns both metadata discovery and the native MCP adapter. Each revision shares its successful or failed receipt; explicit preparation or re-enabling starts a new revision. Agents only wait and register tools, so their disposal does not cancel shared discovery. Query connections are shared by project/session. The handshake producer removes failures even after its waiters cancel. An observed disconnection is retired before replacement; late failures from old calls cannot remove the replacement or automatically replay queries.

**Runtime boundaries:** core Chat/Conversation and optional UI enhancements mount separately behind a lightweight backend entry, retaining errors and recovery controls when dependencies fail. Tasks restore from native events; result shortening projects requests while preserving originals. Shared model-reply handling retains cancellation, failure and actual receipts. CommandCode compatibility centralizes the specific gateway's reasoning/tool-history replay without rewriting durable sessions or changing other providers' requests.

## Tests on Demand

Focus on implementation and delivery; keep testing minimal. Run minimal build/startup checks as needed, and use targeted verification (including CU) only for a concrete issue or an explicit user request. Improve the experience from user feedback. See [Contributing](../CONTRIBUTING.md).

The local DeepSWE adapter in `scripts/deepswe/` runs the actual DSH/OMD PTC stack in official Linux task environments through a pinned [Pier](https://github.com/datacurve-ai/pier) checkout. `snapshot.mjs <installed profile> <private local bundle directory>` captures models, plugins and configuration without copying chats or memory. Use `run.py <evaluation directory> doctor`, then `run --task <task>`, `run --sample 10 --seed 0` or `run --all`; `report` reads receipts. The evaluation directory must contain pinned tasks, a Pier virtual environment, the Linux runtime archive and `config/local.json`. Keep credentials, benchmark content, reference solutions, images and results under the workspace's `.local/`. Each task gets fresh state; the adapter checks effective OMD configuration before model execution, and the official verifier grades committed patches in a separate pristine container. Plugin settings are retained, but Linux has no macOS desktop or Blender server; task networking permits only the selected inference endpoint. On Apple Silicon, the local Colima environment uses QEMU to avoid a Rosetta hang in host native extensions; `start`/`stop` manage the dedicated evaluation VM. Runs are serial with one attempt and separately reported failures. Real calls consume the selected provider's quota; one task is not a full benchmark score. This is an on-demand workflow, outside routine CI.

`order` freezes alternating higher/lower estimated difficulty using public instructions only. Explicit ordered dispatch claims each task once with zero retries; interrupted tasks are not automatically rerun. `monitor` serves a read-only dashboard on `127.0.0.1:8765`; `report` exports the same JSON. Per-task audits update provisional pass rates, cost/token trends, cache usage, duration and queue state. Historical probes remain outside benchmark scores. Gateway POST receipts are deduplicated; GET retrievals are not billed again, cached input and reasoning output are subsets, and missing usage remains unknown. Public prices frozen in `config/monitor.json` (or `monitor-defaults.json`) produce estimates, not account debits. The official max baseline is an external reference with approximate chart costs and unpublished usage marked explicitly. Offline checks: `python -m unittest discover -s scripts/deepswe -p test_monitor.py`.

Anti-cheating boundaries live in the independent TLS gateway and containers. Real credentials stay outside task containers; only the configured Responses model and current-trial response reads are forwarded. Hosted search, remote media, cross-trial references, main PTC effort substitution and ordinary external/DNS egress are blocked. Tasks cannot access controller files, reference answers or Docker. Configuration and plugin files are checked again at completion. Official reports are recomputed in another networkless, read-only container. Suspicious patches, mismatched scores and missing evidence require review and do not count as trusted passes; raw results remain intact. Trusted pass rate uses all requested tasks as its denominator. Use `probe.py <evaluation directory>`, `--positive` and `--scoring` for boundary, actual OMD and score-audit probes. This is not a guarantee against every runtime test exploit.

- `pnpm test` (or `pnpm test:smoke`): the core regressions listed in `scripts/test-ci.mjs`, without repeated host installations or a full desktop launch.
- Individual regression: `node --test test/<name>.test.mjs` for an existing test file.
- `pnpm test:all`: a compatibility entry point for the same core suite, without a separate heavyweight full suite; results describe only the checks that ran.
- When runtime checks are needed, use isolated data and profiles and leave the working DSH instance unchanged.

Run tool performance checks on demand with `npm run perf:tools -- --root <source-root> --out <local .local/report.json> --repeats 7`. Prepare matching SDK dependencies and metering outputs; the real host Workflow case also needs the existing simulator build, and screenshots require an already installed Chromium. Compare identical harness, host, environment and `size`/`repeats`/`idle-ms` options using `--baseline`; narrow scenarios with `--cases`. Reports separate first-after-setup and warm samples, inclusive stages, first useful receipts, event-loop delay, CPU, sampled process-tree RSS, idle state, cancellation/cleanup and result equivalence. Missing measurements remain null. All 21 families identify actual coverage levels; the isolated host uses a local protocol model rather than a remote provider or GUI timing. Do not sum nested spans or treat small-sample p95 as a stable tail estimate; OS caches are not flushed. Use `--idle-ms 31000 --cases article` to observe automatic article-worker retirement; explicit cleanup is reported separately. The AST case performs cancellation first, so its idle sample alone does not prove automatic retirement. Separately run `node scripts/tool-performance/native-candidates.mjs --root <source-root> --out <local .local/candidates.json>` to measure native write/edit diff receipts and persistent Bash polling, readiness and cancellation. Its equivalent diff worker is a measured candidate, not an installed host change.

Execution optimizations preserve tool contracts, prompts, the agent loop, cross-tool scheduling and PTC state modes. Large AST and all article transformations use the same algorithms in one lazy compute worker, retired after 30 idle seconds; small AST inputs run directly. Article dependency checks use that same worker entry, avoiding interference from Desktop module routing with jsdom internals. AST reuse is bounded by source content and language, and cancellation ends the active pure computation. Original recall reuses only proven deeply frozen log prefixes with unchanged matching and cursor validation; bounded caches do not retain whole Sessions, expire when idle and fall back to scanning mutable snapshots. The native anonymous fetch provider shares Undici connections through the same Loader-resolved SDK, revalidating DNS for every request and separating changed address sets. Proxy routing, redirects, limits, timeouts and foreign providers remain native. Unloading restores methods and releases connections.

See [context preparation and original recall (Chinese)](context-workflow.md) for images, context budgets, and idle preprocessing, and [third-party notices](../THIRD_PARTY_NOTICES.md) for sources and licenses.

**Bundled rewind:** `node scripts/sync-rewind.mjs ../rewind` synchronizes a completed standalone build and records the exact host and file hashes in `vendor/rewind.json`. Rebuild OMD after synchronization. The standalone and bundled owners share one runtime.

Sync bundled BTW with `node scripts/sync-btw.mjs ../dsh-btw-plugin` after building the standalone plugin. The actual npm distribution inventory supplies the complete build, documentation inventory and check scripts. `vendor/btw.json` records the source commit, exact host and file hashes. Both server and client use the same plugin entries; matching standalone and embedded versions share registration ownership.


One `tokenMeter` service owns native context and usage projections. Preparation, replacement estimates, tool-result reduction, Dream and budgets share the request/receipt contracts in `src/metering`. Provider receipts, estimates, conservative reservations and unknown fields remain distinct. Output contributes to consumed usage, but only its replayed representation contributes to the next request. Replacement, rewind, route changes and image offload invalidate an obsolete measured prefix. Native `BasicCompactionEngine` still owns transactions, tool pairing and recovery; its public summarizer hook submits bounded complete requests, splitting over-window material when needed. Cache snapshots are optional.

`node scripts/build-metering.mjs` builds only the affected host metering and summarization adapters. Upstream functions are pinned in `src/metering/native/source.json`; factories resolve SDKs through the original Loader tree. Bundle removal restores the native registrations. Projection cache versions are generated from metering source and upstream hashes. `pnpm metering:check` enforces estimator/receipt ownership, upstream provenance and the Workflow distribution inventory, and runs in host builds, CI and prepack. `test/metering-contract.test.mjs` covers partial receipts, stale-prefix invalidation, native replay, small windows and bounded summaries. Build these adapters before running focused tests.

Owned tools use the shared contract in `src/tool-contract.mjs` for presentation and execution validation. `npm run tools:check` checks Native, TypeScript and Python contracts in builds, CI and prepack. Tool context optimization retains the host executor and request projection and records summaries in the existing Monitor ledger; validate both Native and PTC paths.

Plugin preflight page checks live in `src/plugin-preflight/page.mjs`. They use native activation inventory and the interactive page rather than requiring optional account onboarding. Run `test/plugin-preflight-page.test.mjs` on demand with an existing browser (`OMD_TEST_BROWSER` selects its executable). Compatibility builders use fixed inputs and retain exact host requirements, complete functionality and source licenses.
