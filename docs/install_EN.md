# Install Oh My DSH

[中文](install.md) · [Home](../README_EN.md) · [Upgrade](upgrade_EN.md) · [Getting started](getting-started_EN.md)

**Requires:** DSH **0.2.2-rc.1** and Node.js **24.9.0+**. OpenCU is built into OMD, so do not install it separately. If you do not have DSH yet, install [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) first.

Pick one of the two methods below. If you already use OMD, back up your data first as described in [upgrade](upgrade_EN.md).

<a id="gui"></a>

## Install from Add plugin

1. Check the full DSH version in DSH's About screen, for example 0.2.2-rc.1. This is the DSH version, not the OMD version.
2. Wait for your current task to finish.
3. Click **Plugins** on the left, then **Add plugin** at the top right, and paste:

   ```text
   https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.1.omd.1.3.11/oh-my-dsh-0.2.2-rc.1.omd.1.3.11.tgz
   ```

4. Click **Install** and check that Oh My DSH is enabled.
5. Fully quit and reopen the desktop app; for the web version, restart the original web service. Reloading the page is not enough.
6. Create a session and pick the **Oh My DSH** preset.

The first part of the package name is the DSH version; the number after `omd.` is the OMD version. Use the fixed package above rather than the repository's main branch, and do not download Source code or host-adapters.zip. Checksums: [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.1.omd.1.3.11/SHA256SUMS).

If installing fails, check the DSH version first. If you see a message about unapproved build scripts, see [build script approval](upgrade_EN.md#build-approval).

<a id="ai"></a>

## Ask an AI to install it

Send the following to an AI that can use a terminal on your computer (a chat-only AI cannot install it):

```text
Install or upgrade Oh My DSH (OMD) in the existing DeepSeek Harness (DSH) on this computer.
First read https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install_EN.md
Find out whether I use the desktop or web version, the full DSH version, the data directory (DSH_HOME) and the profile, and pick the OMD package that exactly matches that DSH version. If there is none, tell me; do not guess addresses or mix versions.
Keep my model settings, keys, conversations, attachments, settings and other plugins, and back up existing data first. If a task is running, tell me instead of interrupting it.
Install through this DSH's own Plugins → Add plugin or its matching command line, and do not upgrade or downgrade DSH. OpenCU is built into OMD, so do not install it again.
Afterwards, fully restart DSH, confirm OMD is enabled, new sessions can pick Oh My DSH and my data and plugins are still there, then tell me the installed version and where the backup is.
```

<a id="computer-use"></a>

## Using the computer and browser

| Feature | Also needs |
| --- | --- |
| Conversations, appearance, tasks, context and memory | Just OMD and a configured model |
| Operating web pages through the Chrome or Edge extension | Install the extension and allow the connection from **Settings → Computer & Browser** |
| Embedded browser, sidebar annotations, native live view | A DSH desktop build with the matching adaptation, plus system permissions |

host-adapters.zip in each release holds adaptation sources and build notes for the DSH desktop source. It is not a plugin, and there is no ready-made full desktop installer yet. For the embedded browser, see [development](development_EN.md) and [computer and browser](computer-use.md) (Chinese).

By default OMD lets the AI read and write files and run commands without asking each time; permissions you set in your profile take precedence. Model calls and background work are billed by your provider.

<a id="cli"></a>

<details>
<summary>Command-line install</summary>

Existing web version: stop the service and install with its matching command line, replacing `web` with your profile name:

```sh
dsh --version
dsh plugin --profile web add https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.1.omd.1.3.11/oh-my-dsh-0.2.2-rc.1.omd.1.3.11.tgz
```

Then start it the way you did before; the data directory and port stay the same.

First time using the web version (on Windows, use PowerShell 7):

```sh
npx --yes @deepseek-ai/dsh@0.2.2-rc.1 plugin --profile web add https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.1.omd.1.3.11/oh-my-dsh-0.2.2-rc.1.omd.1.3.11.tgz
npx --yes @deepseek-ai/dsh@0.2.2-rc.1 --profile web
```

Open the full sign-in link printed in the terminal. Data goes to `.dsh` in your user folder and the default port is 3080. If you already have DSH, do not use these commands to set up a second one.

Command line for the macOS desktop app in its default location:

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" --version
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.1.omd.1.3.11/oh-my-dsh-0.2.2-rc.1.omd.1.3.11.tgz
```

On the Windows desktop app, installing from the Plugins page is simpler.

</details>

## Older DSH versions

<!-- history -->
| DSH | OMD package |
| --- | --- |
| 0.2.1-rc.1 | [OMD 0.100.0](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.100.0/oh-my-dsh-0.2.1-rc.1.omd.0.100.0.tgz) |
<!-- /history -->

For other versions, look on [Releases](https://github.com/gulagala001/oh-my-dsh/releases) for a package whose name starts with your DSH version. After installing, see [getting started](getting-started_EN.md).
