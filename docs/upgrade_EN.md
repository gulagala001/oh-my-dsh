# Upgrade, migrate and roll back

[中文](upgrade.md) · [Install](install_EN.md) · [Troubleshooting](troubleshooting_EN.md)

For a first install, see the [installation guide](install_EN.md). This page is for existing OMD users: upgrading, moving from the web version to the desktop app, and restoring data. Upgrading OMD never upgrades DSH.

<a id="target-version"></a>

## 1. Check which DSH you use

Note the full DSH version, desktop or web, the data directory (`DSH_HOME`) and the profile. The desktop profile is `desktop`; the web version keeps the profile in your start command. The `dsh` on your terminal path may not be the one you actually use.

OMD 1.3.12 is for DSH 0.2.2-rc.1. For older DSH versions, see the [older versions list](install_EN.md#older-dsh-versions). If there is no matching version, keep your setup as it is; do not downgrade DSH to install a plugin.

<a id="backup"></a>

## 2. Stop and back up everything

Stop tasks, services and anything that restarts DSH automatically, then copy the whole `DSH_HOME` to a new timestamped folder, including hidden keys, profiles, conversations, attachments and OMD data. Back up external projects and custom data separately.

<details>
<summary>Backup commands</summary>

Replace the path with your actual absolute path. macOS / Linux:

```sh
omdDataDir='/absolute/path/to/dsh-data'
omdBackupDir="${omdDataDir:?}.backup-$(date +%Y%m%d-%H%M%S)"
test -d "$omdDataDir" && test ! -e "$omdBackupDir" && cp -a "$omdDataDir" "$omdBackupDir"
```

PowerShell 7:

```powershell
$omdDataDir = 'C:\dsh-data'
$omdBackupDir = "$omdDataDir.backup-$(Get-Date -Format yyyyMMdd-HHmmss)"
if (!(Test-Path -LiteralPath $omdDataDir -PathType Container)) { throw 'Check the data directory' }
if (Test-Path -LiteralPath $omdBackupDir) { throw 'Backup destination already exists' }
Copy-Item -LiteralPath $omdDataDir -Destination $omdBackupDir -Recurse -ErrorAction Stop
```

Check that the copy succeeded and the key folders are there. Keep the backup on your own machine.

</details>

<a id="desktop"></a>
<a id="desktop-cli"></a>

## 3. Install the new version

After backing up, open DSH, paste the package address from the [installation guide](install_EN.md#gui) into **Plugins → Add plugin** and install over the old version; there is no need to remove it first. You can also give the [AI install prompt](install_EN.md#ai) to an AI, or stop the service and use the [command line](install_EN.md#cli). Fully restart DSH afterwards.

Updates from **Settings → Oh My DSH → About** only replace OMD in the current profile; they never upgrade DSH.

Then check: the version is right, OMD is enabled, new sessions can pick Oh My DSH, and your models, conversations, attachments, appearance and other plugins are all there. If something is missing, check the data directory and profile before deleting or rebuilding anything.

<a id="package-name"></a>

### Upgrading from the old package name

The package is now called `oh-my-dsh`. Early versions used another name, so the Plugins page shows two plugins:

1. After backing up, install the new package directly without removing the old one.
2. On start, the new version disables the old one if it is still running (its data stays) and asks you to restart. After a full restart, remove the old one on the Plugins page. If the notice remains, disable the old one by hand and restart.
3. After the restart, data moves to `DSH_HOME/oh-my-dsh` with a link left at the old location. OMD settings and the default preset in your profile are updated, and old sessions open as before.
4. Model channel names and key variable names you created are never changed.

### Data of bundled plugins

OMD already includes Workflow, Rewind, Persona, Extensions and Workbench, so you do not need to install them separately when upgrading. Personality data is in `DSH_HOME/dsh-persona-plugin/`. A full backup also needs rewind backups, Workflow budgets and project scripts, web imports and appearance data; see the [data list](architecture_EN.md#data-retains-its-owner).

<a id="build-approval"></a>

## Install scripts were blocked

Use this section only when installing reports `ERR_PNPM_IGNORED_BUILDS` or says build scripts were not approved.

Finish your tasks, fully quit DSH and back up. Use this DSH's own command line with the same `DSH_HOME` and profile (the desktop app must use its bundled command line), and retry the same verified `.tgz` that was blocked:

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop ignored-builds
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop approve-builds '<full dependency key copied from the previous output>'
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add 'file:/absolute/path/to/verified-package.tgz'
```

Copy the dependency key in full from the output (it may contain `@file:`); do not guess it from the package name. Approving runs that package's install scripts, so only approve a package whose source, DSH version and SHA-256 you checked. If `ignored-builds` does not list the package, check the profile and the package; do not work around it with `--all` or by turning off script checks.

<a id="web-to-desktop"></a>

## Moving from the web version to the desktop app

The desktop app only sees your web data if both use the same `DSH_HOME`.

1. Note the old version, how you start it, the data directory, web profile, port, needed plugins and external data.
2. Stop the web version and anything that restarts it, fully quit the desktop app, and back up all data.
3. Point the desktop app at the same data directory. The web default is `.dsh` in your user folder; for a custom directory, set `DSH_HOME` in the desktop app's real launch entry.
4. Install the matching desktop app and OMD, enable it and fully restart before opening old OMD sessions. Do not copy the whole web profile over `profiles/desktop`.
5. Check the desktop app's model channels, plugins, OMD settings and appearance. Old plain-DSH sessions do not become OMD sessions automatically.
6. Open a few old sessions to check text, attachments and tasks, then create a session and read a file.

To move to the default folder, copy the whole directory only if the target does not exist, keep the original, and never merge two sets of data. After switching, stop writing to that directory from the old web version.

<a id="legacy-history-failure"></a>

### An old session shows "History failed to load"

Note the full error and the session ID, keep the data, and follow [troubleshooting](troubleshooting_EN.md). Old records OMD recognizes get a compatible copy, and the original `session.jsonl` stays. After restarting, open that session again and check its text, attachments and tasks. A load failure is no reason to delete data or edit the original log by hand.

<a id="rollback"></a>

## Rolling back

Stop the new version and open a copy of the pre-upgrade backup with the old DSH and OMD, using its own `DSH_HOME`. Keep the upgraded data, and never let old and new versions take turns writing the same directory.

<a id="candidate-install"></a>

## Locally built packages

Check which DSH version it is for, where it came from and its checksum. A local package may share a version number with a public release but differ in content, and fixes on main are not in a release until one is published. See [development](development_EN.md) for building.
