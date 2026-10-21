<a id="readme-top"></a>

<h1 align="center">Oh My DSH</h1>

<p align="center"><strong>A more capable DSH workspace for sustained work.</strong><br>DeepSeek Harness plugin</p>

<p align="center"><a href="README.md">简体中文</a> · <strong>English</strong></p>

<p align="center">
  <a href="https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.2.omd.0.19.0"><img alt="OMD 0.19.0" src="https://img.shields.io/badge/release-OMD%200.19.0-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/oh-my-dsh/releases"><img alt="GitHub total downloads" src="https://img.shields.io/github/downloads/gulagala001/oh-my-dsh/total?style=flat-square&amp;label=GitHub%20downloads&amp;color=0969da"></a>
  <a href="#readme-install"><img alt="DSH 0.2.1-rc.2" src="https://img.shields.io/badge/DSH-0.2.1--rc.2-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/oh-my-dsh/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/gulagala001/oh-my-dsh?style=flat-square&amp;color=0969da"></a>
</p>

<p align="center"><a href="#readme-install"><strong>Get started</strong></a> · <a href="docs/README_EN.md">Docs</a> · <a href="https://github.com/gulagala001/oh-my-dsh/issues">Report an issue</a></p>

<p align="center"><a href="docs/images/omd-hero-en.png"><img src="docs/images/omd-hero-en.png" alt="Oh My DSH · From conversation to delivery" width="880"></a></p>

<a id="quickstart"></a>
<a id="desktop"></a>
<a id="features"></a>
<a id="prompts"></a>
<a id="themes"></a>
<a id="computer-use"></a>
<a id="memory"></a>
<a id="tools"></a>
<a id="support"></a>
<a id="plugins"></a>
<a id="docs"></a>
<a id="readme-install"></a>

## Quick start

**Required environment：** DSH **0.2.1-rc.2**, Node.js **22.19+**.

Models use your DSH configuration. The default installation grants full file/command access and disables execution approval; explicit profile settings take precedence. OpenCU is included; the full in-app browser and native monitoring also require matching host adapters and OS permissions.

### 1. Install

Open **Plugins → Add plugin** in the DSH instance you use, then paste:

```text
https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.19.0/trisoul_x-0.2.1-rc.2.omd.0.19.0.tgz
```

Wait for active tasks to finish, then follow the host’s activation/restart prompt. Keep your existing profile and data. See the [installation guide](docs/install_EN.md) · [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.19.0/SHA256SUMS).

### 2. Try this first

Create a conversation, choose **Oh My DSH**, and use your configured model in a shareable project:

```text
Read this project’s README and explain its purpose and startup steps. Use only what you actually read; do not change files.
```

**Success looks like：** The answer reflects the actual file; the OMD console shows context and call records.

## Keep tasks, context and results together

- **Sustain the work**: system instructions follow actual tools, modes and permissions, with requirements, sources and verification kept in view.
- **Organize long conversations**: context processing, Auto Compact and Dream handle summaries and longer-term memory while retaining access to original messages, attachments and sources.
- **See what happened**: the OMD console brings together context, memory, usage and background activity, with built-in computer use, task evidence and web chat.

### Arrange the workspace around your work

Native, Codex Desktop, iOS Liquid Glass, Claude CLI and Google Material appearances offer different layouts and materials, alongside 29 palettes, custom backgrounds, fonts and region colors. Current source also includes the Glyph character appearance; fixed packages provide the features listed in their Release.

![Appearance examples](docs/images/release/themes.jpg)

### Keep context and evidence available

| Capability | Behavior and conditions |
| --- | --- |
| Context processing | Saves factual summaries, user decisions and details on demand; `recall` can retrieve originals. |
| Auto Compact | Off by default; compresses at the configured token threshold, with summary-only or summary-plus-material modes. |
| Dream | Automatic processing is off by default; stores session, project and global memory within the selected sharing scope. |
| Better Todo | Connects requirements, tasks and evidence. Task reminders default on; verification reminders are separate. |
| Usage reporting | Uses actual receipts. Unknown is not zero; `≥` indicates a known lower bound. Background model calls also incur usage. |

[Context processing](docs/context-workflow.md) · [Dream memory](docs/dream-memory.md) · [Usage definitions](docs/monitoring.md)

## Supported use

| Scenario | Requirements |
| --- | --- |
| Conversations, appearance, tasks and memory | A matching DSH build and configured model. |
| Browser and desktop actions | An available OpenCU backend and OS permissions; full embedded UI also requires host adapters. |
| Web chat and history import | Corresponding DeepSeek Workbench desktop capabilities and website login; only readable messages and attachments can migrate. |
| Other DSH versions | Use their dedicated builds; rc.1 and rc.2 packages are not interchangeable. |

The main branch may contain improvements not yet included in a fixed Release. Public archives do not change when `main` changes. See [release packages](docs/releases.md) for actual downloads and checksums.

## FAQ

<details>
<summary>Why is Oh My DSH or its settings missing after installation?</summary>

Check that you installed into the profile used by this instance, fully restarted it and enabled the plugin. Choose Oh My DSH in a new conversation; existing conversations retain their presets. [Troubleshooting](docs/troubleshooting_EN.md)

</details>

<details>
<summary>Why is the full in-app browser unavailable?</summary>

The embedded browser, native monitoring and sidebar annotations require matching host adapters. Fixed releases provide source materials, not a complete desktop installer. [Computer Use requirements](docs/computer-use.md)

</details>

<details>
<summary>How do I update or recover an installation?</summary>

Finish active tasks and back up first. Install the fixed package matching the same host, preserving the data directory and profile. Do not clear data or bypass version checks. [Upgrade guide](docs/upgrade_EN.md)

</details>

## Contributing and attribution

Reproducible reports, documentation improvements and practical examples are welcome. [Contributing](CONTRIBUTING.md) · [Development](docs/development_EN.md)

The repository contains code and materials from multiple sources; a blanket MIT claim does not cover them all. Consult individual files and [third-party notices](THIRD_PARTY_NOTICES.md). This is a community project with no official affiliation or endorsement from the referenced brands.

## Documentation and support

| I want to | Where to go |
| --- | --- |
| Install, update or remove | [Installation guide](docs/install_EN.md) |
| Learn the features and limits | [Documentation](docs/README_EN.md) |
| Read release changes | [Releases](https://github.com/gulagala001/oh-my-dsh/releases) |
| Report a problem | [Issues](https://github.com/gulagala001/oh-my-dsh/issues) |

For a bug report, include the full DSH and plugin versions, the entry point, minimal reproduction steps, and expected versus actual behavior. Remove private data before sharing logs or screenshots.

<p align="center"><a href="#readme-top">Back to top</a> · <a href="https://github.com/gulagala001/oh-my-dsh/releases">Versions and downloads</a> · <a href="https://github.com/gulagala001/oh-my-dsh/issues">Feedback</a></p>
