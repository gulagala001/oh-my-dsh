# Installation and Usage Troubleshooting

[简体中文](troubleshooting.md) · [Documentation](README_EN.md) · [First task](getting-started_EN.md) · [Installation](upgrade_EN.md)

Keep the first complete error. Check the installed version, running version, and data directory separately.

<a id="check-the-running-environment"></a>

## Check the Running Environment

1. Read actual DSH and the version panel's **Current version**. Latest version is not installation success.
2. Desktop has reserved `desktop`; Web uses its launch profile. Installation state is separate.
3. Check `DSH_HOME`. Web normally uses the user's `.dsh`; source defaults to repository `data/dsh/`, `trisoul-x`, and port 3083.
4. Fully restart desktop or the original Web service. Choose OMD in a new conversation, and check old models/conversations/themes after upgrading.

<a id="package-source"></a>

### Check the Installation Source

Repository `gulagala001/oh-my-dsh`, package `trisoul_x`, preset `trisoul-x`. See [public pairs](upgrade_EN.md#versions-and-success-criteria). Display names do not establish identity; do not install an unrelated npm package with a similar name.

GitHub alpha.2 OMD `0.16.0` is unpublished. Main includes the OpenCU 1.6.1 browser and runtime reconstruction. Do not guess using `latest` or invent alpha.2 download links.

## By Symptom

| Symptom | Action | Result to check |
| --- | --- | --- |
| pnpm missing / old Node | Prepare the matching Web/source environment; desktop uses its bundled host. | Correct environment at the actual launch entry. |
| Incompatible DSH | Check complete host and [matching package](upgrade_EN.md#versions-and-success-criteria); do not relax peers. | Native installation succeeds and can restart. |
| Install scripts need approval | Inspect the package and action in native Plugins, then check its result. | The component actually works. |
| OMD controls missing | Check profile, enabled state, full restart, and preset. | New OMD conversation shows Workbench. |
| Current version unchanged | Restart desktop App and Host / fully quit, or restart Web backend. | Current version changes. |
| Models / old conversations missing | Check directory/profile and [migration](upgrade_EN.md#web-to-desktop). | Original data is visible. |
| History fails to load | Preserve logs, error, ID; follow [recovery](upgrade_EN.md#legacy-history-failure). | Original messages/attachments load; remaining failures are recorded. |
| Global background conflict | Read latest, compare/merge, save. | Draft remains; save succeeds. |
| Recommended installation fails | Check whether already installed; distinguish network, integrity, script, and version errors. | State is clear; restart when needed. |
| Browser / desktop component fails | Inspect that component in Base components / Runtime and permissions. | The target is observable and operable. |
| Mac shows window but cannot type | Check Accessibility; missing capture needs Screen Recording. Reopen runtime. | Capture and input work separately. |
| New tab needs login | Rebind the original tab and check browser profile/site session. | Original tab continues or site login is renewed. |
| Download finished but no file | Save from Downloads, or inspect the extension browser's original location. | File opens and contents are checked. |

Latest local complete packages include prebuilt browser/native components; a missing component requires a matching complete package. Old public `0.10.0` still requires compilation SDKs. Windows was not tested on hardware this round.

## Startup Failure, Blank Page, or `waiting for service`

Find the first `failed to import` or startup exception, preserving type, `cause`, package path, and stack.

Desktop: inspect Diagnostic report and use a provided third-party-disable recovery with backup if available. Web: inspect the original terminal and disable the suspect plugin if management opens. Source: check checkout, dependencies, build, and stale `link:` paths.

After recovery, diagnose the combination. An OMD UI cannot repair host failure before plugin loading. [Back up first](upgrade_EN.md#2-stop-and-back-up); do not delete `.dsh` or overwrite it with another machine's dependencies.

<details>
<summary>`ERR_PNPM_MISSING_TARBALL_INTEGRITY`</summary>

The package manager lacks remote archive integrity information. Recommended management verifies a fixed package before native local installation. For an old failed entry, obtain the matching package from that plugin's fixed Release, compare its checksum, and install locally in the current profile. Do not disable integrity checks. Investigate other dependencies' source/lockfiles separately.

</details>

<a id="offline"></a>

## Offline Transfer and Local Installation

Release `.tgz` files do not include every dependency/runtime. Prepare a complete directory online on the same operating system and architecture, then transfer it intact. Do not move it across platforms or zip an ordinary dependency tree containing absolute links.

<details>
<summary>Prepare a portable directory</summary>

Use the target source version and its pinned pnpm. Choose a new output directory outside the source:

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
3. Desktop's local plugin entry: `link:ABSOLUTE_DIRECTORY`. Web: matching host CLI with that directory. Retain the directory; a tgz is not the full offline environment.
4. Match `offline-manifest.json`'s host, restart fully, and check a new conversation/tool call.

Model services must remain reachable; prepare optional components separately. Import checks do not establish all destination-machine features.

</details>

## Reporting a Problem

Use the [bug template](https://github.com/gulagala001/oh-my-dsh/issues/new?template=bug-report.yml):

- OS/architecture, desktop/Web/source, actual DSH and OMD current versions.
- Source, profile, and whether the data directory is custom; omit private full paths.
- Minimal steps, expected/actual result, frequency, and first affected version.
- First complete redacted error, screenshots, attempted actions and results.

Redact keys, tokens, and private text. Do not upload complete data or credentials. Write Unknown where needed.
