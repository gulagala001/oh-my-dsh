<p align="center"><img src="docs/images/logo.svg" width="64" height="64" alt="Oh My DSH" /></p>
<h1 align="center">Oh My DSH</h1>
<p align="center"><strong>Take long tasks, browser work and desktop actions to a result you can check, inside familiar DSH.</strong></p>
<p align="center">
  <a href="README.md"><strong>简体中文</strong></a> · <strong>English</strong> · <a href="#quickstart"><strong>Install Oh My DSH</strong></a> · <a href="docs/getting-started_EN.md"><strong>First Task</strong></a>
</p>

[![Oh My DSH in use: after manual saving, the assistant reads the order page and confirms delivery details](docs/images/showcase-browser.png)](docs/showcase_EN.md)

<sub>Captured from the latest local implementation: a fictional purchase order and a controlled demo model, with actual OpenCU tool execution and a real page save. The product thumbnail is AI-generated; the UI is not redrawn. The capture does not promise these features in public packages. [Versions and scenarios](docs/showcase_EN.md)</sub>

Oh My DSH (OMD) is an enhancement plugin for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness). Keep using your models, conversations, files, tools and skills, with context management for long tasks, task and verification records, computer use, draft refinement and a customizable work interface.

[Features](#features) · [Install](#quickstart) · [Real Scenarios](#scenarios) · [Get Started](#start) · [Appearance and Settings](#settings) · [Plugin Ecosystem](#plugins) · [Update and Uninstall](#maintenance) · [Platforms and FAQ](#support) · [Docs and Development](#docs)

<a id="features"></a>

## What You Can Do

| Your work | How OMD helps |
| --- | --- |
| Work through a long conversation without losing the original requirements | Organize context while retaining original messages, attachments and detailed records; recall sources when exact details matter. |
| Research websites, operate apps and export material | Built-in OpenCU brings target views into the conversation workbench; stop, take over manually and resume assistant control. |
| Check the result before accepting “done” | Link requirements, task status and verification records; preview or open generated files directly in DSH. |
| Clarify a rough idea before sending it | Refine, structure or plan a draft, retaining the original and its versions for undo and further edits. |
| Start a conversation without setting up a project | **Main-branch preview, unreleased**: clear the selected workspace; the first message creates a directory for this conversation, reused when you return. |
| Arrange the interface around your habits | Choose five appearances, light/dark modes, separate colors and backgrounds, and adjust typography, layout and the workbench. |
| Inspect progress, usage and longer-term memory | **Main-branch preview, unreleased**: monitoring shows calls, caching and context; Dream organizes sourced conversation, project and global short memories. |

Model capabilities, context windows and service charges still depend on your provider; background processing also consumes model usage. See the [usage guide](docs/usage_EN.md) for details.

<a id="quickstart"></a>

## Install

**Check the full version of the DSH host you actually run, then choose the package with the matching host prefix.** These are the currently available public packages:

| DSH host | Full OMD version | Fixed package |
| --- | --- | --- |
| `0.2.0-rc.2` | `0.2.0-rc.2.omd.0.10.0` | [Download rc.2](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.0-rc.2.omd.0.10.0/trisoul_x-0.2.0-rc.2.omd.0.10.0.tgz) |
| `0.2.1-alpha.1` | `0.2.1-alpha.1.omd.0.10.0` | [Download alpha.1](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-alpha.1.omd.0.10.0/trisoul_x-0.2.1-alpha.1.omd.0.10.0.tgz) |

The package version on `main` is **0.2.1-alpha.2.omd.0.16.0, unreleased**, with no corresponding public package. The 0.10.0 downloads above do not contain the later monitoring, Dream or local changes. Earlier hosts retain historical releases; check the [installation and upgrade guide](docs/upgrade_EN.md) rather than mixing packages for different hosts.

### Existing DSH Web

You need Node.js ≥22.19, a working DSH model and the runtime requirements of the public package; use PowerShell 7 on Windows. Let active tasks finish, stop the service, back up the actual `DSH_HOME`, and retain your profile and port.

This example is for **DSH 0.2.1-alpha.1 / the `web` profile**:

```sh
npx --yes @deepseek-ai/dsh@0.2.1-alpha.1 plugin --profile web add https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-alpha.1.omd.0.10.0/trisoul_x-0.2.1-alpha.1.omd.0.10.0.tgz
npx --yes @deepseek-ai/dsh@0.2.1-alpha.1 --profile web
```

For rc.2, change the **host version in both commands** to `0.2.0-rc.2` and use the rc.2 package URL from the table. Replace `web` with your existing custom profile. If you use a global `dsh` installation or service manager, keep that launch method and actual data directory. You can also download a package and install it with `file:/absolute/path/package.tgz`.

Open the login link printed by this launch, then choose **Oh My DSH** for a new conversation. Existing conversations keep their Agent preset. Check “Current version” after installation; “Latest version” alone does not confirm installation. [Full steps](docs/usage_EN.md) · [Installation and upgrade](docs/upgrade_EN.md)

### Official DSH Desktop App

Use the desktop app's plugin manager to install the package matching its **full host version**. Desktop uses the separate `desktop` profile, so Web plugins need to be installed again; a separate npm CLI does not manage that profile in place of the app. Fully quit and reopen after installation; closing a window or refreshing a page is not a full restart. [Desktop installation](docs/upgrade_EN.md#desktop) · [Move from Web while retaining data](docs/upgrade_EN.md#web-to-desktop)

> **Installation changes execution permissions:** OMD defaults to full file/command access with execution approval disabled, and sets the default Agent preset to `trisoul-x`. Explicit profile overrides take precedence. Confirm this suits your use before installing; macOS permissions and the first Chrome extension load still require the indicated manual steps. [Permissions and runtime requirements](docs/usage_EN.md)

<details>
<summary>Ask an AI with terminal or computer access to help install</summary>

Give it this instruction and specify desktop or Web:

> Follow https://github.com/gulagala001/oh-my-dsh/blob/main/docs/upgrade_EN.md to install or upgrade Oh My DSH. First check the actual full DSH version and matching public package. Back up and retain existing models, conversations, data directory and configuration, then verify the current version after installation and a full restart.

</details>

<a id="scenarios"></a>

## Real Scenarios

These three scenarios come from one release-checklist demonstration using fictional business data and a local controlled model. They show actual execution and checks. See the [showcase](docs/showcase_EN.md) for the full requests, actions and validation scope. The screenshots use the Chinese interface.

### Recover the Original Requirement After a Long Conversation

> Organize the release checklist. Use UTF-8 with BOM for the CSV and exactly six columns: ID, item, owner, priority, status and acceptance notes. Keep items awaiting acceptance.

After continued work and context processing, ask the assistant to recall the original request. Inspect its source and original text in the workbench to confirm encoding, column order and the requirement to retain pending items.

[![Recalling the original message after context processing to check the six CSV columns](docs/site/media/launchpad-recall.jpg)](docs/site/media/launchpad-recall.jpg)

**Result:** Original wording remains accessible for checking specific requirements after reducing current context. Keeping source material does not make the model window unlimited. [Context records](docs/site/media/launchpad-context.jpg) · [Context workflow](docs/context-workflow.md)

### Operate a Website and Keep the Items That Matter

> Open the release checklist, check filtering and state after refresh, and download the CSV. Do not treat items awaiting acceptance as completed.

Use `@Browser` to specify the website, view its actual screen in the workbench, then filter, refresh and download. Stop or take over when you need to make a change yourself, then resume assistant control.

[![Release checklist website: filtering, statuses and CSV download](docs/site/media/launchpad-browser.jpg)](docs/site/media/launchpad-browser.jpg)

**Result:** The export includes 8 items and retains 3 awaiting acceptance; an independent field check then examines the downloaded file. [Computer use guide](docs/usage_EN.md#computer-use)

### Deliver the File with a Record of Its Checks

> Check the downloaded file's encoding, six columns and every field, then deliver the file and the validation result.

Link the original requirements to actual execution results in Tasks and Verification. Check the CSV BOM, column order, row count and field contents, then open the delivered attachment.

[![Tasks and verification: requirements, check script and actual PASS output](docs/site/media/launchpad-tasks.jpg)](docs/site/media/launchpad-tasks.jpg)

**Result:** The file checks pass, with the CSV and requirements file delivered. Initial checkmarks in the business checklist are sample data; task completion and execution evidence are recorded separately. [Full demonstration and evidence](docs/showcase_EN.md)

<a id="start"></a>

## Get Started

1. **Choose a model and conversation.** Select Oh My DSH for a new conversation and reuse your host model configuration. Native tool calling is required; interpreting screenshots also needs image input.
2. **Choose a working directory.** Work in an existing project. In the main-branch preview, you can also clear the workspace selection for a separate conversation; its directory is created only when you first send a message.
3. **Describe the deliverable.** For example, “Organize this directory, produce a file list and check the file count.” Draft refinement can help clarify the request first.
4. **Inspect work as it proceeds.** Open the workbench from the input area to view tasks, context or files. The computer entry shows the target screen, with stop and takeover controls.
5. **Check the delivery.** Open attachments and verification records; ask the assistant to recall original material when you need to trace a detail.

Public versions and development source may have different entries; follow the docs for your installed version. [First task](docs/getting-started_EN.md) · [Full guide](docs/usage_EN.md)

<a id="settings"></a>

## Appearance and Settings

Use **Settings → Oh My DSH** for background models, context processing, identity, appearance and computer use. Configure the main model in DSH's model settings; background processing can use a separate model and frequency. Better Todo reminders are enabled by default, while verification reminders are off by default and can be set per conversation.

[![iOS Liquid Glass light appearance showing the same actual task and file delivery](docs/site/media/theme-glass-light.jpg)](docs/site/media/theme-glass-light.jpg)

| Appearance | Light and dark captures |
| --- | --- |
| OMD default | [Light](docs/site/media/theme-omd-light.jpg) · [Dark](docs/site/media/theme-omd-dark.jpg) |
| Codex Desktop | [Light](docs/site/media/theme-codex-light.jpg) · [Dark](docs/site/media/theme-codex-dark.jpg) |
| iOS Liquid Glass | [Light](docs/site/media/theme-glass-light.jpg) · [Dark](docs/site/media/theme-glass-dark.jpg) |
| Claude CLI | [Light](docs/site/media/theme-terminal-light.jpg) · [Dark](docs/site/media/theme-terminal-dark.jpg) |
| Google Material | [Light](docs/site/media/theme-material-light.jpg) · [Dark](docs/site/media/theme-material-dark.jpg) |

Choose themes, 28 color schemes and backgrounds independently. Adjust fonts, type size, materials, section colors, name and logo; import settings or restore defaults. Themes provide visual styles, not accounts or services from the corresponding brands. [Appearance settings](docs/skins.md) · [Settings capture](docs/site/media/launchpad-appearance.jpg)

<details>
<summary>Advanced features and unreleased changes</summary>

<a id="prompts"></a>

System instructions organize work around DSH's actual tools, permissions and execution modes without claiming unavailable host capabilities. [Prompt adaptation (Chinese)](docs/prompt-adaptation.md)

- **Pro / Ultracode:** Choose work modes above a model's native reasoning levels to adjust requirement planning, implementation and checks. [Workflow](docs/workflow.md)
- **OMD-PTC / CodeGraph:** Use composed tool calls or query code relationships as needed. [Usage guide](docs/usage_EN.md)
- **Main-branch preview, unreleased:** Monitoring shows calls, usage and context changes. Dream incrementally organizes conversation, project and global short memories with sources; automatic processing is off by default. [Monitoring](docs/monitoring.md) · [Dream](docs/dream-memory.md)
- **Latest local implementation, unreleased:** OpenCU's browser reconstruction uses officially precompiled Electron 44.7.0, one browser entry and a unified tab bar, while retaining split views and the sidebar. GitHub main includes the OpenCU 1.6.1 browser and runtime reconstruction; source integration does not mean a new installation package has been released. Public installation packages do not include these changes, and this does not establish validation on other platforms.

</details>

<a id="plugins"></a>

## DSH and Its Plugin Ecosystem

OMD reuses DSH's native models, conversations, tool loop, skills, files and content tabs. You can continue using other DSH plugins; plugins that depend on a host SDK update need their own matching host builds.

**Settings → Recommended Plugins** shows purpose, author, version and verification status, with install, update and uninstall actions for available entries. Automatic updates are off by default; when enabled, they only check installed plugins eligible under the catalog rules and indicate when a restart is needed. [Catalog capture](docs/site/media/launchpad-plugins.jpg)

Compatibility work checks installation order, enable/disable, restart and uninstall, aiming to keep plugins that work in original DSH usable with the full OMD setup enabled. **This does not guarantee every plugin, host and platform has been verified.** See [plugin compatibility](docs/plugin-compatibility_EN.md) for exact combinations, limitations and unverified cases.

Recommend your own plugin or another open-source project with its repository URL and one sentence about its purpose: [Submit a plugin / request adaptation](https://github.com/gulagala001/oh-my-dsh/issues/new?template=plugin-submission.yml) · [Submission guide](docs/plugin-submissions.md)

<a id="maintenance"></a>

## Data, Updates and Uninstall

Installation into existing DSH keeps the actual `DSH_HOME`, with OMD records under `trisoul-x/`; Web commonly defaults to `~/.dsh`. Desktop and Web plugins belong to separate profiles and share product data only when they use the same actual data directory.

Before updating, let tasks finish, stop the service or fully quit the desktop app, and back up the entire data directory. Install the fixed package matching your host, then fully restart and check the current version, models and old conversations. Source updates and public-package updates follow different paths. [Upgrade, migration and rollback](docs/upgrade_EN.md)

<details>
<summary>Uninstall command and retained data</summary>

Web example (use your actual host version and profile):

```sh
npx --yes @deepseek-ai/dsh@0.2.1-alpha.1 plugin --profile web remove trisoul_x
```

Desktop users disable or uninstall in the app's plugin manager, then fully quit and reopen. Uninstalling does not delete model configuration, credentials, conversations or OMD memory files; old conversations using the `trisoul-x` preset need the plugin reinstalled to continue execution. [Maintenance details](docs/usage_EN.md)

</details>

<a id="support"></a>

## Platforms and FAQ

| Capability | Requirements and current limits |
| --- | --- |
| Conversations, context, tasks, themes and Web workbench | Built on DSH; actual Windows, macOS and Linux verification scope follows each release record. |
| Browser control and everyday Chrome connection | Working Chrome/Chromium; the first connection to existing Chrome requires manually loading the extension. |
| Native macOS desktop control in public 0.10.0 | macOS 14+, Apple Command Line Tools, Accessibility and Screen Recording permissions. |
| Native Windows desktop control in public 0.10.0 | Windows 10 2004+, PowerShell 7, .NET 10 SDK and an unlocked interactive desktop; this round has no real Windows machine validation. |
| Latest locally precompiled runtime | Not publicly released; it does not remove native build requirements from older public packages. Native Linux desktop control is not listed as supported. |

<details>
<summary>Installation, models, permissions and versions</summary>

**Installed but no entry appears?** Check the active profile, enabled state and actual plugin version. Fully restart the service or desktop app, then choose Oh My DSH for a new conversation.

**Why is there no alpha.2 download?** Main-branch 0.16.0 is unreleased. Use public 0.10.0 with the matching host from the table, or wait for a new paired release.

**The model cannot understand the computer view?** Image input is required. A text-only model can still read some control text but does not gain image understanding automatically.

**Desktop actions fail?** Check the native runtime and system permissions; older public packages require local build prerequisites. For existing Chrome, confirm the extension is actually loaded. [Troubleshooting](docs/troubleshooting.md)

**Will existing models and conversations disappear?** Plugin installation reuses host data, but upgrades still need a full backup. Moving from Web to desktop is not automatic migration; check data directories and configuration using the guide.

**Is every other plugin guaranteed compatible?** No. Consult verified combinations by full host version, plugin version and platform; report those versions and a minimal reproduction for conflicts. [Compatibility](docs/plugin-compatibility_EN.md)

</details>

<a id="docs"></a>

## Docs and Development

[Docs index](docs/README_EN.md) · [First task](docs/getting-started_EN.md) · [Full guide](docs/usage_EN.md) · [Installation and upgrade](docs/upgrade_EN.md) · [Showcase](docs/showcase_EN.md) · [Compatibility](docs/plugin-compatibility_EN.md) · [Changelog](CHANGELOG.md)

<details>
<summary>Develop from source</summary>

Current main uses DSH `0.2.1-alpha.2`, Node.js ≥22.19 and `pnpm 11.28.5`; it is not the public stable installation path.

```sh
git clone https://github.com/gulagala001/oh-my-dsh.git
cd oh-my-dsh
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

The development launcher defaults to the repository's `data/dsh/`, a separate `trisoul-x` profile and port `3083`. Open the full login link printed in the terminal and configure your own model credentials. For fixed tags, follow that tag's build requirements. Generic Computer Use is maintained in the [OpenCU](https://github.com/gulagala001/opencu) source repository. [Contribute](CONTRIBUTING.md) · [Development guide](docs/usage_EN.md)

</details>

[Report a bug](https://github.com/gulagala001/oh-my-dsh/issues/new?template=bug-report.yml) · [Suggest a feature](https://github.com/gulagala001/oh-my-dsh/issues/new?template=feature-request.yml) · [Product page](https://gulagala001.github.io/oh-my-dsh/)

Include full DSH/OMD versions, platform, entry point, expected behavior and actual behavior in reports, and remove private data and credentials. The project has not specified a code license; original projects and third-party sources and licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Package name `trisoul_x` and preset ID `trisoul-x` remain for compatibility with existing installations.
