# Installing and Upgrading Oh My DSH

[简体中文](upgrade.md) · [Documentation](README_EN.md) · [Desktop](#desktop) · [Web](#3-use-your-original-install-method) · [Migration](#web-to-desktop) · [Backup](#2-stop-and-back-up) · [Troubleshooting](troubleshooting_EN.md)

Match the plugin to the actual DSH version. Retain the existing launch method, data directory, profile, and port. Finish work, stop the service or fully quit the app, and back up before upgrading. Reading this guide is not an instruction to install; installation authorization does not authorize publication or interrupting unrelated active work.

You can give an AI with computer/terminal access [this guide's URL](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/upgrade_EN.md), specifying desktop or Web and installation or upgrade. A missing newer desktop package is not a reason to switch silently to Web. The environment's permission rules take precedence.

## Versions and Success Criteria

| Environment | DSH | Public OMD / fixed tag |
| --- | --- | --- |
| Web alpha.1 | `0.2.1-alpha.1` | [v0.2.1-alpha.1.omd.0.10.0 package](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-alpha.1.omd.0.10.0/trisoul_x-0.2.1-alpha.1.omd.0.10.0.tgz) |
| Web rc.2 / desktop in this guide | `0.2.0-rc.2` | [v0.2.0-rc.2.omd.0.10.0 package](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.0-rc.2.omd.0.10.0/trisoul_x-0.2.0-rc.2.omd.0.10.0.tgz) |

Repository: `gulagala001/oh-my-dsh`. Package: `trisoul_x`. Archives are `trisoul_x-0.2.1-alpha.1.omd.0.10.0.tgz` and `trisoul_x-0.2.0-rc.2.omd.0.10.0.tgz`, from the [alpha.1 release](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-alpha.1.omd.0.10.0) and [rc.2 release](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.0-rc.2.omd.0.10.0). Use fixed-tag documentation for public installation.

Current release **`0.2.1-rc.2.omd.0.17.3`** targets **DSH `0.2.1-rc.2`**, bundles new OpenCU `2.0.0`. For the new generation, start with [installation and version matching](install_EN.md); fixed URLs below are for historical 0.10 only. Complete CU UI requires matching Host, Client and preload adapters. rc.2, alpha.3 and rc.1 each use separate SDK/build inputs—not relabeled archives or cross-host `latest` selection.

Installation contributes the Oh My DSH preset, full file/command access, and no execution approvals by default. **Explicit profile overrides win**; do not remove user restrictions. Existing conversations retain presets. Success requires a running chosen environment, matching current versions, and a new OMD conversation; upgrades also check original models, old messages/attachments, and appearance. Downloads, HTTP 200, or Latest version do not prove installation. Configure a model before starting a conversation.

<a id="desktop"></a>

## Desktop: Installation and Upgrade

This guide provides the fixed public rc.2 desktop pair, not a claim about every current desktop update source. For another host, inspect actual desktop assets and matching OMD. Do not directly downgrade a newer existing host.

| Computer | Fixed official installer |
| --- | --- |
| Windows x64 | [rc.2 EXE](https://download.deepseek.com/dsh-desk/bin/win-x64/deepseek-harness-0.2.0-rc.2-win-x64.exe) |
| Apple-silicon Mac | [rc.2 ZIP](https://download.deepseek.com/dsh-desk/bin/mac-arm64/deepseek-harness-0.2.0-rc.2-mac-arm64.zip) |

Check [official notes](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.2) for other architectures.

1. [Back up existing data](#2-stop-and-back-up). Run the Windows installer, or unzip and move the Mac app to Applications.
2. Open the app and retain/configure model channels and credentials in its settings. Native tools are required; enter secrets in the app.
3. Install the fixed source below on the **Plugins** page and enable it.
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

If the actual host is not rc.2, select its matching release first. Adjust the app path for other locations and retain the desktop's actual `DSH_HOME`. This is a Mac layout, not a Windows path; Windows users can use the Plugins page. Fully restart and check afterward.

</details>

<a id="build-approval"></a>

### Install Scripts Blocked with No Approval Button

Use this only for `ERR_PNPM_IGNORED_BUILDS` or an explicit unapproved-build-script error. An empty approval list does not mean scripts ran; not every OMD package has an installation script.

Finish work, fully quit, and back up. Use the original host CLI, actual `DSH_HOME`, and same profile; desktop requires its bundled CLI. The example retries the same verified local `.tgz` that was just blocked. If changing from a URL to `file:`, try that local package first; if blocked, copy its dependency key rather than reuse the URL key:

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop ignored-builds
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop approve-builds '<complete dependency key copied from the preceding output>'
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add 'file:/absolute/path/to/verified-package.tgz'
```

Replace both placeholders. Select only the intended package after checking its source, complete host version, and SHA-256. The complete key may contain `@file:`; do not guess from its name. Approval runs the target's installation scripts and requires explicit user consent. Confirm exit code 0 and script completion before retrying the same archive one package at a time, retaining allow/deny rules. Web uses the running service's matching CLI and original profile; Windows uses its actual desktop entry.

If `ignored-builds` does not list the target, retain the error and check profile/archive. Do not bypass with `--all`, `ignoreScripts`, an empty profile, or version exemptions. After exit code 0, fully restart and check a first real operation. Record native refusals as refusals.

Non-CU work does not require desktop-control preparation. Use the [fixed 0.10 guide (Chinese)](https://github.com/gulagala001/oh-my-dsh/blob/v0.2.1-alpha.1.omd.0.10.0/docs/usage.md#computer-use) for the old public package's computer-operation requirements.

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

## 1. Identify the Running Environment

For Web/source, inspect the process or service's actual executable, versions, `DSH_HOME`, profile, and port. Another `dsh --version` on PATH may describe a different installation.

Web defaults to the user's `.dsh`; source runs default to repository `data/dsh/`, profile `trisoul-x`, port 3083. Retain parameters, proxy, and explicit overrides rather than using an empty profile as an upgrade. Read only needed information; do not expose credentials, login tokens, or private conversation text.

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

## 3. Use Your Original Install Method

These are **old public Web commands**, not installation of local 0.17. Use actual `DSH_HOME`, replace `web` with the original profile, retain the port, and avoid two writing instances.

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

Keep source edits. Prepare a fixed tag in a separate checkout, use that checkout's pinned pnpm/lockfile, build, then launch with the intended data. [Source steps](development_EN.md#running-from-source). During this local reconstruction, build/test/pack/host startup are deferred until all implementation is complete. Do not forcibly clean user changes or rewrite running artifacts.

</details>

## 4. Handle Relevant Version Differences

Check every installed plugin when changing hosts and prepare corresponding SDK builds. Replace mutually dependent packages through the native transaction using all matching artifacts. Do not copy another installation's `node_modules`, relax peers, use version exemptions, or bypass checks.

Migrate only existing settings required by the target version. Retain limits, channel protocols, enabled states, and explicit user overrides. Byte and token budgets are not interchangeable; changes such as `maxInlineBytes` to `maxInlineTokens` require a new limit decision. Keep explicit background-wake limits; do not write new defaults into user configuration. Update old bundles/channels only when required by the real target, without forcing non-DeepSeek channels to another protocol. See migration above for conversation boundaries.

## 5. Check the Result

On a user's installation, check this operation rather than running the entire development test suite:

1. Start from the original entry; actual host/plugin versions match and no blocking error remains.
2. Check conversation/workbench, original models/appearance, old messages/attachments, other plugins, and user configuration.
3. With a usable model, run a short new conversation and harmless file read. Otherwise state the missing check.
4. Record actual versions, backup location, and incomplete items without exposing login tokens.

## Roll Back

Stop the new version and run the old host/plugin on a complete pre-upgrade backup copy with separate `DSH_HOME`. Retain upgraded data. Do not let old versions write migrated data or alternate versions against one directory.

<a id="candidate-install"></a>

<details>
<summary>If you received a local build</summary>

Check full version `0.2.1-rc.2.omd.0.17.3`, source, archive SHA-256, DSH `0.2.1-rc.2` and matching SDK/components/lockfile. Other hosts need their own builds. Check with isolated data, profile and port first. Names/version numbers alone do not identify contents. [New installation](install_EN.md) · [Source builds](development_EN.md).

Preserve other plugins' source, uncommitted work, data and archives without rollback or overwriting. Combinations need matching builds from each independent project. Text, file and theme use does not require desktop control first.

</details>
