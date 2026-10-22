# Upgrade, Migration, and Rollback

[简体中文](upgrade.md) · [Installation](install_EN.md) · [Backup](#2-stop-and-back-up) · [Web to desktop](#web-to-desktop) · [Troubleshooting](troubleshooting_EN.md)

**For a first installation, use [AI instructions](install_EN.md#ai) or [Add Plugin](install_EN.md#gui).** This page covers an existing installation. Upgrading OMD does not upgrade DSH or install desktop host adapters.

<a id="versions-and-success-criteria"></a>

## 1. Identify the Running Environment

Check the actual DSH version, desktop/Web mode, data directory (DSH_HOME), and profile. Desktop uses desktop; Web uses the profile in its original launch command. A different CLI on PATH may belong to a different installation.

DSH **0.2.1-rc.2** uses OMD **0.99.0**; DSH **0.2.1-rc.1** also uses OMD **0.99.0**. Select the matching package from [downloads](releases.md); DSH 0.2.0-rc.2 is a different host. Keep a newer or customized installation unchanged until a matching upgrade is available.

## 2. Stop and Back Up

Stop tasks, services, and automatic restart entries. Copy the entire actual `DSH_HOME` into a new timestamped directory, including hidden credentials, profiles, conversations, attachments, and OMD material. Back up external projects/custom data separately.

<details>
<summary>Backup commands</summary>

Replace with the actual absolute path. macOS/Linux:

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

Confirm success and important directories. Backups contain credentials; keep them local. On a new install without data, skip and state that.

</details>

<a id="desktop"></a>
<a id="desktop-cli"></a>

## 3. Use Your Original Install Method

After the backup, reopen the desktop app or original Web service and use **Plugins → ＋ Add Plugin** with the matching fixed package URL from [the installation page](install_EN.md#gui). The dialog is also suitable for changing the install source of the same plugin. If your DSH version specifically requires removing the previous plugin first, follow that version's message after backing up; do not delete its user data.

Alternatively, give an AI the [installation/upgrade instructions](install_EN.md#ai), or use the [optional CLI commands](install_EN.md#cli) with the service stopped. Keep the original profile, data directory, and Web port. After installation, fully restart the updated application/service.

OMD's version panel updates the plugin in the current profile; it does not update DSH itself. A remote Latest label is not the installed version.

<a id="package-name"></a>

### Upgrading Earlier Versions to the `oh-my-dsh` Package Name

The plugin package is now named `oh-my-dsh`. Earlier versions used a different package name, so the Plugins page lists them as two plugins:

1. After the backup, install the new package directly; there is no need to remove the earlier version first.
2. If the new version finds the earlier one still running, it disables the earlier one (data is kept) and prompts for a restart. After a full restart you can remove the earlier Oh My DSH on the Plugins page. If the prompt persists, disable the earlier version on the Plugins page yourself, then fully restart.
3. After the restart, migration runs automatically: the data directory becomes `DSH_HOME/oh-my-dsh` and the old location keeps a compatibility link to it; OMD settings, the default preset and the settings import record in the profile are updated; earlier conversations still open as Oh My DSH with their tasks, archives and records.
4. Model channels and key variable names you created yourself are personal configuration and are left unchanged.

To return to an earlier version, follow [Roll Back](#roll-back) with the complete pre-upgrade backup; do not let old and new versions alternate writes to one data directory.

### Independent plugins and data migration

Version 0.99.0 composes Workflow, Rewind, Persona, Extensions and Workbench capabilities. Existing OMD users upgrade the full package without duplicate installations; separately installed products remain managed by the native plugin page. Match each independent package to its own complete host version.

Persona imports existing global and session choices on first use, retaining conflicting preset content. Subsequent data is scoped by profile under `DSH_HOME/dsh-persona-plugin/`. Backups also include rewind backups, Workflow budgets and project scripts, website imports and local appearance data. Keep native session exports together with their original-result archives, restoring sessions before importing the archives. [Data locations](architecture_EN.md#data-retains-its-owner)

## 4. Handle Relevant Version Differences

When changing DSH versions, prepare matching versions of all required plugins and any desktop host adapters. Keep model channels, permission settings, data, and third-party plugins. Follow the relevant DSH release's migration instructions; do not relabel an incompatible package to make it install.

For an old host that you want to retain, use [its historical release and documentation](releases.md#旧版用户--older-hosts).

## 5. Check the Result

Confirm the installed version, an enabled Oh My DSH preset for new conversations, and the presence of your original models, conversations/attachments, appearance, and other plugins. If anything is missing, check the data directory and profile before changing or deleting data.

<a id="build-approval"></a>

### Install Scripts Blocked with No Approval Button

Use this only for `ERR_PNPM_IGNORED_BUILDS` or an explicit unapproved-build-script error. An empty approval list does not mean scripts ran; not every OMD package has an installation script.

Finish work, fully quit, and back up. Use the original host CLI, actual `DSH_HOME`, and same profile; desktop requires its bundled CLI. The example retries the same verified local `.tgz` that was just blocked. If changing from a URL to `file:`, try that local package first; if blocked, copy its dependency key rather than reuse the URL key:

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop ignored-builds
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop approve-builds '<complete dependency key copied from the preceding output>'
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add 'file:/absolute/path/to/verified-package.tgz'
```

Replace both placeholders. Select only the intended package after checking its source, complete host version, and SHA-256. The complete key may contain `@file:`; do not guess from its name. Approval runs the selected package’s installation scripts; approve only the package whose source you have checked. Confirm exit code 0 and script completion before retrying the same archive one package at a time, retaining allow/deny rules. Web uses the running service's matching CLI and original profile; Windows uses its actual desktop entry.

If `ignored-builds` does not list the target, retain the error and check profile/archive. Do not bypass with `--all`, `ignoreScripts`, an empty profile, or version exemptions. After exit code 0, fully restart and check a first real operation. Record native refusals as refusals.

<a id="web-to-desktop"></a>

## Moving from Web to Desktop

Only the same actual `DSH_HOME` shares product data. Treat data-directory selection, profile configuration, and conversation-format migration separately; OMD does not perform the entire migration for you.

1. Record old versions, launch method, directory, Web profile, port, required plugins, and external custom data.
2. Stop Web and automatic restart services, fully quit desktop, and back up all actual data.
3. Make the desktop process use the intended directory. Default Web is `~/.dsh`, or the user's `.dsh` on Windows. For custom directories, set `DSH_HOME` in the real desktop launch entry. Variables in another terminal do not establish inheritance from Dock/Start.
4. Install matching desktop and OMD, enable and restart fully, then open old OMD conversations, so native log conversion does not precede OMD association migration. Do not overwrite `profiles/desktop` with an entire Web profile, dependencies, or lockfile.
5. Check desktop channels, required plugins, OMD settings, and appearance. Shared credentials alone do not configure channels. Old native DSH conversations do not automatically become OMD.
6. Inspect old messages/attachments and OMD context/tasks, then complete a new short conversation and file read. Reopen through the long-term desktop entry to check data selection.

If copying into the default directory, back up an existing destination and copy only when absent. Keep the source; do not overwrite-merge data sets. Stop old Web writing upgraded data. If associations disagree, preserve the scene and investigate a backup copy instead of deleting migration records to force a rerun.

<details>
<summary>Automatic migration boundaries</summary>

DSH handles supported old formats. OMD migrates recognizable conversations and associations; V3 → V4 retains original logs and `omd-v4-migration.json`. Existing V4 is not migrated repeatedly.

Imported `settings.yaml` becomes `settings.yaml.imported`. This does not mean desktop has all another profile's configuration. Explicit current overrides win; do not rename it to force reimport. Test earlier/custom environments on backup copies rather than promising every combination.

</details>

<a id="legacy-history-failure"></a>

### Old Conversation History Fails to Load

Public pairs include early V0 compatibility fixes, but the symptom can have other causes. Keep the full error, conversation ID, and data, then [diagnose](troubleshooting_EN.md#by-symptom). Current preset names alone do not identify historical formats.

Recognized records produce a compatible copy while retaining `session.jsonl`/`session.jsonl.zstd`. Retired fields may not reappear as current interface features; conflicting events can still fail. After restart, actually open the affected conversation and inspect messages, attachments, tasks, and records. Keep diagnostics for each remaining failure; do not delete original logs/migration records or manually renumber events. Failure to load is not a reason to delete data automatically.

## Roll Back

Stop the new version. Run the previous host/plugin with a copy of the complete pre-upgrade backup and a separate DSH_HOME. Keep the upgraded data; do not let old and new versions alternate writes to one directory.

<a id="candidate-install"></a>

## If You Received a Local Build

Check its full host version, source, and archive checksum. A local archive and a public Release can have the same version label but different bytes. Follow that build's instructions; do not assume a repository main change is already present in a fixed Release. See [release scope](releases.md) and [development](development_EN.md).
