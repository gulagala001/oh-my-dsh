# Install Oh My DSH

[简体中文](install.md) · [Overview](../README_EN.md) · [Upgrade and migration](upgrade_EN.md)

**Choose one method: give an AI the instructions below, or paste a package URL into DSH's Add Plugin dialog.** OMD is a DSH plugin and already includes OpenCU; a second OpenCU installation is unnecessary.

No DSH yet? Install [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) first. Both methods work with an existing desktop or Web environment. First-time Web commands are in the [optional CLI section](#cli).

<a id="ai"></a>

## Method 1: copy these instructions to an AI

Give this entire block to an AI that can operate the computer or terminal where DSH is installed. A text-only assistant cannot perform the installation.

```text
Install or upgrade Oh My DSH (OMD) in the existing DeepSeek Harness (DSH) environment on this computer.

Read these guides first:
https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install_EN.md
https://github.com/gulagala001/oh-my-dsh/blob/main/docs/releases.md

Identify the actual running DSH instance: desktop or Web, full DSH version, data directory (DSH_HOME), and profile. Select a published OMD .tgz built for that exact host version.
Preserve existing model configuration, credentials, conversations, attachments, user settings, and other plugins. Back up existing data. If tasks are running, tell me before interrupting them.
Install through this DSH instance's Plugins → Add Plugin interface or its matching CLI. Desktop uses the app's bundled CLI and desktop profile. Web keeps its original service CLI, profile, data directory, and port.
OMD includes OpenCU; do not install it a second time. Do not treat repository main as a published package, change DSH versions or deployment type just to install the plugin, replace the host, or publish anything.
If no matching published package exists, state which version is missing instead of guessing a URL or forcing a mismatched package.
After installation succeeds, fully restart the updated DSH instance. Confirm OMD is enabled, a new conversation offers Oh My DSH, and existing data/plugins remain. Report installed versions and the backup location.
```

These instructions install the published plugin. Complete desktop computer use has [additional requirements](#computer-use) that plugin installation does not supply.

<a id="gui"></a>

## Method 2: use the Add Plugin dialog

### 1. Check your DSH version

Read the **complete host version** in DSH's About/version information, for example 0.2.1-rc.3. This is not the OMD version. DSH 0.2.0-rc.2 and 0.2.1-rc.3 are different hosts.

### 2. Copy the URL for your host


**DSH 0.2.1-rc.3 → OMD 1.1.0:**

```text
https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.1.1.0/oh-my-dsh-0.2.1-rc.3.omd.1.1.0.tgz
```

**DSH 0.2.1-rc.1 → OMD 0.100.0:**

```text
https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.100.0/oh-my-dsh-0.2.1-rc.1.omd.0.100.0.tgz
```

The first part of the complete plugin version identifies DSH; the trailing 0.100.0 identifies OMD. For other hosts, use [downloads and historical versions](releases.md).

### 3. Paste and install

1. Finish active tasks. Existing OMD users should [back up before upgrading](upgrade_EN.md).
2. Open **Plugins** in the sidebar, then **＋ Add Plugin**.
3. Paste the **complete .tgz URL** into the field for a package name, GitHub repository URL, or local path.
4. Click **Install**, wait for completion, and confirm Oh My DSH is enabled.
5. Fully quit and reopen the desktop app, or restart the original Web service. Closing a window or refreshing a page does not restart the backend.
6. Create a conversation and select **Oh My DSH**. It uses your DSH model configuration; no model account is included.

The dialog also accepts repository addresses. These instructions use a fixed release package so installation does not follow a changing main branch. Do not enter Source code or host-adapters.zip as the plugin.

On failure, retain the error and check the host version first. Consult [build-script approval](upgrade_EN.md#build-approval) only when the installer reports that scripts require approval.

<a id="computer-use"></a>

## If you need computer or browser control

| Feature | Additional requirements |
| --- | --- |
| Conversations, themes, tasks, context, and memory | Matching OMD plus a configured model; CU setup is not required. |
| Chrome/Edge extension control | Follow the version's Computer & browser settings to install the extension and allow pairing. |
| Full embedded browser, sidebar annotations, and native monitoring | Matching DSH host adapters/build and applicable OS permissions. |

**These Releases provide plugin packages and host adapter source, not a ready-to-install matching desktop application.** host-adapters.zip contains source adapters and build instructions; it is not another plugin. See [development](development_EN.md) and [OpenCU requirements (Chinese)](computer-use.md) for full desktop CU. Installing a plugin does not replace the DSH host.

OMD's default installation configuration grants full file/command access and disables execution approvals; explicit existing profile settings take precedence. Model calls and background processing are billed by your provider.

<a id="cli"></a>

<details>
<summary>Optional: terminal installation / first-time Web setup</summary>

Existing Web installation: stop the service and use its original CLI. This example is for DSH 0.2.1-rc.3 with the web profile; retain any custom profile name.

```sh
dsh --version
dsh plugin --profile web add https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.1.1.0/oh-my-dsh-0.2.1-rc.3.omd.1.1.0.tgz
```

Restart through the original launch method, retaining the data directory and port. For DSH 0.2.1-rc.1, use the rc.1 URL above.

First-time Web setup requires Node.js ≥22.19; use PowerShell 7 on Windows:

```sh
npx --yes @deepseek-ai/dsh@0.2.1-rc.3 plugin --profile web add https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.1.1.0/oh-my-dsh-0.2.1-rc.3.omd.1.1.0.tgz
npx --yes @deepseek-ai/dsh@0.2.1-rc.3 --profile web
```

Open the full login link printed by the terminal. Data defaults to .dsh in your user directory; a new Web service defaults to port 3080. Do not use these commands to create a second environment for an existing installation.

Default macOS desktop CLI example, only for an actual DSH 0.2.1-rc.3 installation:

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" --version
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.1.1.0/oh-my-dsh-0.2.1-rc.3.omd.1.1.0.tgz
```

On Windows desktop, the plugin dialog is the simplest route; CLI paths depend on the installation. A Web CLI does not substitute for the desktop CLI.

</details>

**Release scope:** the rc.3 URL installs OMD 1.1.0; rc.1 and rc.2 retain OMD 0.100.0. Existing Release assets do not change with later main-branch fixes. Continue with [your first task](getting-started_EN.md).
