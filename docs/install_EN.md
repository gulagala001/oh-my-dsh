[rc.1 / rc.2 当前下载与安装](releases.md)

# Installation and Version Matching

[简体中文](install.md) · [Overview](../README_EN.md) · [First steps](getting-started_EN.md)

## Start here

**OMD is a DSH plugin, not a standalone client. Match the complete host version.** The current default build is `0.2.1-rc.2.omd.0.17.4` for DSH `0.2.1-rc.2`, bundling OpenCU `2.0.0`. Both rc.1 and rc.2 packages are available from [current releases](releases.md).

OpenCU's complete embedded browser, annotations and native monitoring also require the **matching Host, Client and preload adapters**. Installing a plugin into arbitrary stock DSH does not add those host changes. Text, file and theme features do not require desktop control first.

| Your environment | What to use |
| --- | --- |
| Current release | Matching plugin and host adapters supplied by the maintainer; verify full versions, provenance and archive SHA-256. |
| DSH `0.2.0-rc.2` | A separate rc.2 build, not the rc.1 package. |
| DSH `0.2.1-alpha.3` | Its matching alpha.3 build; do not relabel a different archive. |
| Public OMD 0.10 | The fixed historical releases below and their tag-specific docs, without the new OpenCU described here. |

## Before installation

1. Identify the running DSH version, `DSH_HOME` and profile. Another `dsh` executable on PATH may not be your running host.
2. End active work, fully stop the instance being updated and back up the actual data directory. Preserve credentials, conversations, attachments, plugins and explicit settings.
3. Configure your own model provider. Tools require tool calling; understanding screenshots requires image input. No model account is included.
4. Review permissions: OMD's installation configuration defaults to full file/command access and no execution approvals. Explicit profile overrides win. Memory sharing is not filesystem permission.

## Desktop

Use the app's **Plugins** page to install and enable a verified local `.tgz`. For terminal installation, use the desktop app's bundled CLI—not a global npm/npx CLI—and its reserved `desktop` profile.

Example for the default macOS app location; replace the archive placeholder and retain the actual `DSH_HOME`:

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" --version
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add 'file:/absolute/path/to/matching-omd.tgz'
```

On Windows, use the app's plugin manager or actual bundled CLI, not the Mac path. Install matching host adapters according to their delivery instructions; the plugin CLI does not replace the desktop Host.

## DSH Web

Use the running service's matching CLI, existing profile, data directory and port. In this example, `dsh` must resolve to the verified host and `web` must be replaced with your actual profile:

```sh
dsh --version
dsh plugin --profile web add 'file:/absolute/path/to/matching-omd.tgz'
```

Restart through your existing launch method. Installing the plugin does not turn Web into a desktop Host with the full embedded browser. See [development](development_EN.md) for source and per-host builds.

## After installation

Fully restart the corresponding instance; closing a desktop window or refreshing a page is not a Host restart. Check:

- Full host and OMD versions match, and the plugin is enabled.
- A new conversation offers **Oh My DSH**; existing models, conversations and plugins remain.
- A short conversation and harmless file read work. Configure a model first if none is available.
- For CU, open **Settings → Computer & browser** and prepare browser resources, OS permissions or Chrome/Edge pairing as needed. See [computer use (Chinese)](computer-use.md).

If installation scripts are blocked, use the [targeted approval procedure](upgrade_EN.md#build-approval) for the same verified package. Do not bypass with `ignoreScripts`, relaxed peers, version exemptions or blanket approval.

## Existing public releases

These historical versions are not download links for the new candidate:

| DSH | OMD | Release and matching docs |
| --- | --- | --- |
| `0.2.1-alpha.1` | `0.2.1-alpha.1.omd.0.10.0` | [Release](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-alpha.1.omd.0.10.0) · [Version docs](https://github.com/gulagala001/oh-my-dsh/blob/v0.2.1-alpha.1.omd.0.10.0/README_EN.md) |
| `0.2.0-rc.2` | `0.2.0-rc.2.omd.0.10.0` | [Release](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.0-rc.2.omd.0.10.0) · [Version docs](https://github.com/gulagala001/oh-my-dsh/blob/v0.2.0-rc.2.omd.0.10.0/README_EN.md) |

Do not choose across host versions using GitHub's `latest` label. [Upgrade guidance](upgrade_EN.md) retains migration, backup and rollback procedures.
