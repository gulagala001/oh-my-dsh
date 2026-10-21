# Installation and Usage Troubleshooting

[简体中文](troubleshooting.md) · [Documentation](README_EN.md) · [First task](getting-started_EN.md) · [Installation](upgrade_EN.md)

Keep the first complete error. Check the installed version, running version and data directory separately. Current source is **`0.2.1-rc.2.omd.0.18.1`**, bundling OpenCU `2.0.1`. Check [version matching and host prerequisites](install_EN.md) before changing the installation.

<a id="check-the-running-environment"></a>

## Check the Running Environment

1. Read the actual DSH version and the version panel's **Current version**. Latest version is not installation success.
2. Desktop uses the reserved `desktop` profile; Web uses its launch profile. Installation state is separate.
3. Check the actual process's `DSH_HOME`. Web normally uses the user's `.dsh`; source runs default to repository `data/dsh/`, profile `oh-my-dsh`, and port 3083.
4. After finishing active work, fully restart desktop or the original Web service. Choose OMD in a new conversation, and check old models, conversations, attachments, and themes after upgrading.

<a id="package-source"></a>

### Check the Installation Source

Repository `gulagala001/oh-my-dsh`, package `oh-my-dsh`, preset `oh-my-dsh`. See [public pairs](upgrade_EN.md#versions-and-success-criteria). Display names do not establish identity; do not install an unrelated npm package with a similar name.

The current candidate is not publicly released. Do not guess with `latest` or relabel a package for another host. New OpenCU is bundled, but its complete UI requires matching Host, Client and preload adapters.

<a id="by-symptom"></a>

## By Symptom

| Symptom | Action | Result to check |
| --- | --- | --- |
| pnpm missing / old Node | Prepare the matching Web/source environment; desktop uses its bundled host. | Correct environment at the actual launch entry. |
| Incompatible DSH | Check the complete host and [matching package](upgrade_EN.md#versions-and-success-criteria); do not relax peers or use version exemptions. | Preserve a native refusal as a refusal; install only a matching build. |
| Install scripts need approval | Inspect the exact package, profile, and [build approval](upgrade_EN.md#build-approval) result. | Script completion and the component's actual behavior, not only download completion. |
| OMD controls missing | Check profile, enabled state, full restart, and preset. | A new OMD conversation shows Workbench. |
| Current version unchanged | Restart desktop App and Host / fully quit, or restart the original Web backend. | Current version changes to the package actually installed. |
| Models / old conversations missing | Check directory/profile and [migration](upgrade_EN.md#web-to-desktop). | Original data is visible; do not replace the profile with an empty one. |
| History fails to load | Preserve logs, error, and ID; follow [recovery](upgrade_EN.md#legacy-history-failure). | Original messages/attachments load; remaining failures are recorded. |
| Global background conflict | Read latest, compare/merge, then save. | Draft remains; save succeeds without overwriting unseen edits. |
| Recommended installation fails | Distinguish network, integrity, script, and host-version errors; check whether already installed. | Actual refusal or failure recorded, profile intact, native execution still works. |
| Monitoring shows `≥` or Unknown | Inspect the selected scope and missing receipts in [monitoring (Chinese)](monitoring.md). | Partial usage stays a lower bound; missing usage is not counted as zero. |
| Dream job failed or shared memory looks wrong | Inspect source scope and the failed job in [Dream (Chinese)](dream-memory.md). | Private Chat stays private; successful progress is retained and unfinished work can resume. |
| Theme makes the page unreadable | Use `?omd-skin=default` temporarily, then restore the default in Appearance. | Native controls remain usable; user settings/data are preserved. |
| Old public CU browser / desktop component fails | Follow the [fixed 0.10 guide](https://github.com/gulagala001/oh-my-dsh/blob/v0.2.1-alpha.1.omd.0.10.0/docs/usage.md#computer-use) for that package. | Capture, input, and permissions checked separately; not a prerequisite for non-CU work. |

Backend conditions and platform limitations are listed in the [computer-use guide (Chinese)](computer-use.md).

## Startup Failure, Blank Page, or `waiting for service`

Find the first `failed to import` or startup exception, preserving type, `cause`, package path, and stack.

Desktop: inspect Diagnostic report and use a provided third-party-disable recovery with backup if available. Web: inspect the original terminal and disable the suspect plugin if management opens. Source: check checkout, matching dependencies/build, and stale `link:` paths.

After recovery, diagnose the combination. An OMD UI cannot repair host failure before plugin loading. [Back up first](upgrade_EN.md#2-stop-and-back-up); do not delete `.dsh` or overwrite it with another machine's dependencies. Disabling or uninstalling OMD should preserve native tools, other plugins, configuration, and user data; report a violation rather than deleting evidence.

<details>
<summary>`ERR_PNPM_MISSING_TARBALL_INTEGRITY`</summary>

The package manager lacks remote archive integrity information. Recommended management verifies a fixed package before native local installation. For an old failed entry, obtain the matching package from that plugin's fixed Release, compare its checksum, and install locally in the current profile. Do not disable integrity checks. Investigate other dependencies' source/lockfiles separately.

</details>

<a id="offline"></a>

<a id="native-dependencies"></a>

## Missing Native Dependencies, `sharp`, or Windows `EPERM`

OMD loads its enhancement runtime separately from the basic Conversation/Chat providers. An enhancement import or initialization failure leaves the conversation UI available and displays the first error, its causes, paths, and stack. Undo, Computer Use, and workflow UI have independent lifecycles. CodeGraph and Computer Use load dependencies on demand; `sharp` loads when taking screenshots. Select another available Agent preset to continue chatting while repairing a failed enhancement. Damage to the host or basic conversation components still requires repairing that installation.

1. Fully quit the desktop application and its Host, then back up the actual profile, data, and configuration. A running process can hold native files open on Windows and cause `EPERM`. Stop further installation attempts after a failure and retain the first error.
2. Reinstall the fixed OMD package matching the exact host version through the original plugin management entry, retaining optionalDependencies. A directory and manifest do not prove its entry, `.node`, or DLL files are intact. `--lockfile-only` updates the lockfile and does not repair disk files. Do not combine dependency files from different versions or platforms or permanently override the official conversation entries to hide a failure.
3. With the same OS, architecture, and Node runtime as the affected host, run the read-only check against the installed directory (or use `pnpm runtime:check` in a source checkout):

   ```sh
   node /path/to/profile/node_modules/oh-my-dsh/scripts/check-runtime.mjs
   ```

   It imports the plugin and deferred dependencies independently and generates a PNG with the actual `sharp` instance. Any failure returns a nonzero status with the original error chain. For desktop, run it with the corresponding bundled Node runtime. If only a system Node result is available, record the runtime difference; it does not establish that Electron's runtime works. Offline transfers still require the complete offline check below.
4. Restart normally and check an existing conversation, a new conversation, and the affected feature. If it still fails, report the first error, exact versions, OS/architecture, profile, and dependency path without credentials or full conversations.

## Offline Transfer and Local Installation

Release `.tgz` files do not include every dependency/runtime. Prepare a complete directory online on the same operating system and architecture, then transfer it intact. Do not move it across platforms or zip an ordinary dependency tree containing absolute links.

<details>
<summary>Prepare a portable directory</summary>

Use the target source version, its pinned pnpm and matching lockfile. Prepare on the destination operating system and architecture, following the [source guide](development_EN.md#running-from-source). Choose a new output directory outside the source:

```sh
pnpm install --frozen-lockfile
node scripts/prepare-offline.mjs /absolute/path/to/omd-offline
```

PowerShell:

```powershell
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
node scripts/prepare-offline.mjs 'C:\omd-offline'
if ($LASTEXITCODE -ne 0) { throw 'Offline preparation failed' }
```

The script prepares distribution files, portable dependencies, builds, and import checks, without conversations or credentials. Failure produces no completed directory.

1. Archive everything, including hidden content and `node_modules`, then extract to a fixed destination.
2. Windows: `.\check-offline.cmd`. Other platforms: Node ≥22.19 with `node scripts/check-offline.mjs`.
3. Desktop's local plugin entry: `link:ABSOLUTE_DIRECTORY`. Web: its matching host CLI with that directory. Retain the directory; a tgz is not the full offline environment.
4. Match `offline-manifest.json`'s host, restart fully, and check a new conversation/tool call.

Model services must remain reachable; prepare optional components separately.

</details>

## Reporting a Problem

Use the [bug template](https://github.com/gulagala001/oh-my-dsh/issues/new?template=bug-report.yml):

- OS/architecture, desktop/Web/source, actual DSH and OMD current versions.
- Source, profile, and whether the data directory is custom; omit private full paths.
- Minimal steps, expected/actual result, frequency, and first affected version.
- First complete redacted error, screenshots, attempted actions and their real results.

Redact keys, tokens, and private text. Do not upload complete data or credentials. Write Unknown where needed.
