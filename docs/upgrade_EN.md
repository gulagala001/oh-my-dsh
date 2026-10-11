# Installing and Upgrading Oh My DSH

[简体中文](upgrade.md) · [Documentation](README_EN.md) · [Desktop](#desktop) · [Web](#3-use-your-original-install-method) · [Migration](#web-to-desktop) · [Backup](#2-stop-and-back-up) · [Troubleshooting](troubleshooting_EN.md)

Match the plugin to the actual DSH version. Retain existing launch method, data directory, profile, and port. Finish work, stop the service or fully quit the app, and back up before upgrading.

You can give an AI with computer/terminal access [this guide's URL](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/upgrade_EN.md), specifying desktop or Web and installation or upgrade. It should identify the environment, back up, install, restart, and check the result.

## Versions and Success Criteria

| Environment | DSH | Public OMD / fixed tag |
| --- | --- | --- |
| Web alpha.1 | `0.2.1-alpha.1` | [v0.2.1-alpha.1.omd.0.10.0 package](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-alpha.1.omd.0.10.0/trisoul_x-0.2.1-alpha.1.omd.0.10.0.tgz) |
| Web rc.2 / desktop in this guide | `0.2.0-rc.2` | [v0.2.0-rc.2.omd.0.10.0 package](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.0-rc.2.omd.0.10.0/trisoul_x-0.2.0-rc.2.omd.0.10.0.tgz) |

Packages are `trisoul_x-0.2.1-alpha.1.omd.0.10.0.tgz` and `trisoul_x-0.2.0-rc.2.omd.0.10.0.tgz`, from the [alpha.1 release](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-alpha.1.omd.0.10.0) and [rc.2 release](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.0-rc.2.omd.0.10.0). Repository: `gulagala001/oh-my-dsh`. Package: `trisoul_x`.

GitHub `main`'s `0.2.1-alpha.2.omd.0.16.0` is **unpublished**, with no public alpha.2 artifact. Main includes an earlier OpenCU 1.6.1 snapshot; the latest local reconstruction with the same version is not merged into it. Do not equate development sources, local packages, and public `0.10.0`, or use `latest` to choose a package.

Defaults are the Oh My DSH preset, full file/command access, and no execution approvals. **Explicit profile overrides win.** Existing conversations keep presets. Success requires a running chosen environment, matching current versions, and a new OMD conversation; upgrades also check old models, conversations/attachments, and appearance. Without a usable model, report dialogue verification as incomplete.

<a id="desktop"></a>

## Desktop: Installation and Upgrade

This guide provides the fixed official rc.2 desktop pair. For another host, inspect its desktop assets and matching OMD release. Missing newer desktop packages are not a reason to switch silently to Web.

| Computer | Fixed official installer |
| --- | --- |
| Windows x64 | [rc.2 EXE](https://download.deepseek.com/dsh-desk/bin/win-x64/deepseek-harness-0.2.0-rc.2-win-x64.exe) |
| Apple-silicon Mac | [rc.2 ZIP](https://download.deepseek.com/dsh-desk/bin/mac-arm64/deepseek-harness-0.2.0-rc.2-mac-arm64.zip) |

Check [official notes](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.2) for other architectures. Do not directly downgrade a newer existing host.

1. [Back up existing data](#2-stop-and-back-up). Run the Windows installer, or unzip and move the Mac app to Applications.
2. Open the app and retain/configure model channels and credentials in its settings. Native tools are required; screenshot interpretation requires image input. Enter secrets in the app.
3. Install the source below on the **Plugins** page and enable it.
4. Fully quit and reopen, or use **Restart App and Host**. Closing a window or refreshing is insufficient.
5. Check DSH `0.2.0-rc.2` and OMD **Current version** `0.2.0-rc.2.omd.0.10.0`. Create an Oh My DSH conversation, send a short message, and perform a tool call without side effects.

```text
https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.0-rc.2.omd.0.10.0/trisoul_x-0.2.0-rc.2.omd.0.10.0.tgz
```

Desktop has a separate `desktop` profile. Web installations do not transfer automatically. Terminal installation must use the app's bundled CLI; npm/npx Web CLIs cannot write this reserved profile, and global npm cannot replace the desktop host.

<a id="desktop-cli"></a>

<details>
<summary>Mac desktop's bundled CLI</summary>

For the default Applications location, check the desktop host and install its matching plugin:

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" --version
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.0-rc.2.omd.0.10.0/trisoul_x-0.2.0-rc.2.omd.0.10.0.tgz
```

If the actual host is not rc.2, select its matching release first. Adjust the app path for other install locations and retain the desktop's actual `DSH_HOME`. This is a Mac layout, not a Windows path; Windows users can use the Plugins page. Fully restart and check afterward.

</details>

Prepare [computer runtime and permissions](usage_EN.md#platforms-and-requirements) when needed; they are not prerequisites for installing the desktop app.

<a id="web-to-desktop"></a>

## Moving from Web to Desktop

Only the same actual `DSH_HOME` shares product data. Treat data-directory selection, profile configuration, and conversation-format migration separately.

1. Record old versions, launch method, directory, Web profile, port, required plugins, and external custom data.
2. Stop Web and services that restart it, fully quit desktop, and back up all actual data.
3. Make the desktop process use the intended directory. Default Web is `~/.dsh`, or the user's `.dsh` on Windows. For a custom directory, set `DSH_HOME` in the real desktop launch entry. Variables in another terminal do not establish inheritance from Dock/Start.
4. Install matching desktop and OMD, restart, then open old OMD conversations. Do not overwrite `profiles/desktop` with an entire Web profile, dependencies, or lockfile.
5. Check desktop channels, required plugins, OMD settings, and appearance. Shared credentials alone do not configure channels. Old native DSH conversations do not automatically become OMD.
6. Inspect old messages/attachments and OMD context/tasks, then complete a new short conversation and file read. Reopen through the long-term desktop entry to check data selection.

If copying into the default directory, back up an existing destination and copy only when the destination is absent. Keep the source; do not overwrite-merge two data sets. Stop the old Web environment writing to upgraded data.

<details>
<summary>Automatic migration boundaries</summary>

DSH handles supported old formats. OMD migrates recognizable conversations and associations; V3 → V4 retains original logs and `omd-v4-migration.json`. Existing V4 is not migrated repeatedly.

Imported `settings.yaml` becomes `settings.yaml.imported`. This does not mean desktop has all another profile's configuration. Explicit current overrides win; do not rename it to force reimport. Test earlier/custom environments on a backup copy rather than promising every combination.

</details>

<a id="legacy-history-failure"></a>

### Old Conversation History Fails to Load

Public pairs include early V0 compatibility fixes, but this symptom can have other causes. Keep the full error, conversation ID, and data, then [diagnose](troubleshooting_EN.md#by-symptom).

Recognized records produce a compatible copy while retaining `session.jsonl`/`session.jsonl.zstd`. Retired fields may not reappear as current interface features, and conflicting events can still fail. After restart, open the affected conversation and check it. Do not delete original logs/migration records or manually renumber events.

## 1. Identify the Running Environment

For Web/source, inspect the process or service's actual executable, versions, `DSH_HOME`, profile, and port. Another `dsh --version` on PATH may describe a different installation.

Web defaults to the user's `.dsh`; source runs default to repository `data/dsh/`, profile `trisoul-x`, port 3083. Retain parameters, proxy, and overrides rather than using an empty profile as an upgrade.

An assisting AI should read only needed installation information, not expose credentials, login tokens, or private conversation text. Once authorized, complete the work continuously; explain decisive missing information or permission limits when encountered.

## 2. Stop and Back Up

Stop tasks, services, and automatic restart entries. Copy the entire actual `DSH_HOME` into a new timestamped directory, including hidden credentials, profiles, conversations, attachments, and OMD material. Back up external projects/custom data separately.

<details>
<summary>Backup commands</summary>

Replace the path with the real directory. macOS/Linux:

```sh
omdDataDir='/absolute/path/to/dsh-data'
omdBackupDir="$omdDataDir.backup-$(date +%Y%m%d-%H%M%S)"
test -d "$omdDataDir" && cp -a "$omdDataDir" "$omdBackupDir"
```

PowerShell 7:

```powershell
$omdDataDir = 'C:\dsh-data'
$omdBackupDir = "$omdDataDir.backup-$(Get-Date -Format yyyyMMdd-HHmmss)"
if (!(Test-Path -LiteralPath $omdDataDir -PathType Container)) { throw 'Check the data directory' }
Copy-Item -LiteralPath $omdDataDir -Destination $omdBackupDir -Recurse -Force -ErrorAction Stop
```

Confirm success and important directories. Backups contain credentials; keep them local. On a new install without data, skip and state that.

</details>

## 3. Use Your Original Install Method

These are Web commands. Use actual `DSH_HOME`, replace `web` with the original profile, retain the port, and avoid two writing instances.

### npx or First Installation

alpha.1:

```sh
npx --yes @deepseek-ai/dsh@0.2.1-alpha.1 --version
npx --yes @deepseek-ai/dsh@0.2.1-alpha.1 plugin --profile web add https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-alpha.1.omd.0.10.0/trisoul_x-0.2.1-alpha.1.omd.0.10.0.tgz
npx --yes @deepseek-ai/dsh@0.2.1-alpha.1 --profile web
```

For retained rc.2 Web:

```sh
npx --yes @deepseek-ai/dsh@0.2.0-rc.2 plugin --profile web add https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.0-rc.2.omd.0.10.0/trisoul_x-0.2.0-rc.2.omd.0.10.0.tgz
npx --yes @deepseek-ai/dsh@0.2.0-rc.2 --profile web
```

Add `--port YOUR_PORT` for a custom port. Use the original service manager for persistent operation; a temporary terminal is not persistent deployment.

<details>
<summary>Global npm/pnpm and source installations</summary>

Retain the package manager:

```sh
npm install -g @deepseek-ai/dsh@0.2.1-alpha.1
dsh --version
dsh plugin --profile web add https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-alpha.1.omd.0.10.0/trisoul_x-0.2.1-alpha.1.omd.0.10.0.tgz
dsh --profile web
```

For pnpm use `pnpm add -g @deepseek-ai/dsh@0.2.1-alpha.1`. Check the service uses this executable. Installing only the plugin does not upgrade DSH.

Keep source edits. Prepare the fixed tag in a separate checkout, install locked dependencies, build, and launch with the original data. [Source steps](development_EN.md#running-from-source). Do not forcibly clean user changes or rewrite running build artifacts.

</details>

## 4. Handle Relevant Version Differences

Check every installed plugin when changing hosts and prepare corresponding SDK builds. Replace mutually dependent packages through the host's native transaction using all matching artifacts. Do not copy another installation's `node_modules`, relax peers, or bypass checks.

Migrate only existing settings required by the target version. Retain limits, channel protocols, and enabled states. Byte and token budgets are not interchangeable. See migration above for conversation boundaries.

## 5. Check the Result

1. Start from the original entry; actual host/plugin versions match and no blocking error remains.
2. Check conversation/workbench, original models/appearance, and old messages/attachments.
3. With a usable model, run a short new conversation and harmless file read. Otherwise state the missing check.
4. Record actual versions, backup location, and incomplete items without exposing login tokens.

## Roll Back

Stop the new version and run the old host/plugin on a complete pre-upgrade backup copy with separate `DSH_HOME`. Retain upgraded data. Do not let old versions write migrated data or alternate versions against one directory.

<a id="candidate-install"></a>

<details>
<summary>If you received a local build</summary>

Require full version, origin, checksum, and matching host, then use isolated data/profile. GitHub alpha.2 OMD `0.16.0` is unpublished, and the latest local CU is not the public snapshot. Names/version numbers alone do not identify contents. Ordinary users should use public pairs; see [development](development_EN.md) for source work.

</details>
