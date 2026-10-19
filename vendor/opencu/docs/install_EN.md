# Install and upgrade OpenCU

[简体中文](install.md) · [Home](../README_EN.md)

**Already using OMD? Do not install OpenCU separately.** OMD includes it. Follow the [OMD installation and upgrade guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install_EN.md).

For standalone OpenCU, choose either method below. **If DSH is not installed, install it first using the [official DSH instructions](https://github.com/deepseek-ai/deepseek-harness)**, then choose the plugin for its actual full version. OpenCU is not a DSH installer.

## Option 1: Copy the whole instruction to AI

Send the entire block to an AI that can operate your computer:

```text
Please install or upgrade standalone OpenCU in my DSH setup.

First read the project's canonical installation guide and fixed Release list:
https://github.com/gulagala001/opencu/blob/main/docs/install_EN.md
https://github.com/gulagala001/opencu/blob/main/docs/releases.md

Identify the desktop or Web instance I use, its full DSH version, actual profile, DSH_HOME and existing plugins. If OMD is installed, do not install OpenCU again; follow the OMD installation guide instead:
https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install_EN.md

If DSH is missing, explain that it must be installed first and follow its official installation instructions; then select the package for the actual installed version. Install only an already published fixed .tgz listed for that exact full DSH version. Do not mix 0.2.1-rc.1, 0.2.1-rc.2 or 0.2.0-rc.*. If no matching package exists, stop and explain; do not substitute main-branch source, latest or a renamed package for a Release.

If tasks are running, tell me before interrupting them. Back up the relevant configuration and data first. Keep the original profile, DSH_HOME and OpenCU data directory, including conversations, model configuration, browser pairing and third-party plugins. Do not recreate or clear configuration. Do not change Host/Client/preload, install across host versions or downgrade DSH without permission; explain any features that require host adapters.

You may install or upgrade the matching plugin and restart the affected DSH instance; do not restart other instances. Afterwards, briefly confirm that the plugin loads, Computer & browser settings open, and existing data and third-party plugins remain. Report DSH/OpenCU versions, the fixed package used, the instance restarted and any OS permissions I still need to grant. Do not run a large test suite.
```

## Option 2: Install through DSH's plugin interface

1. Open the DSH desktop app or Web interface you use and check its **full version** in About.
2. Open **Plugins → “+ Add plugin” in the top right**.
3. Paste the complete matching URL below into the input for a **package name / GitHub repository address / local path**, then click **Install**. Desktop and Web use the same package for a given host version; install in the instance you intend to use.
4. Wait for success. Fully quit and reopen desktop; for Web, restart the corresponding DSH service and reopen the page. Refreshing a page does not restart the service. Open **Settings → Computer & browser** and follow the prompts for browser resources, OS permissions and any Chrome/Edge extension pairing you need.

**DSH `0.2.1-rc.2`: copy this entire line:**

```text
https://github.com/gulagala001/opencu/releases/download/v2.0.5-dsh.0.2.1-rc.2/opencu-2.0.5-dsh.0.2.1-rc.2.tgz
```

**DSH `0.2.1-rc.1`: copy this entire line:**

```text
https://github.com/gulagala001/opencu/releases/download/v2.0.5-dsh.0.2.1-rc.1/opencu-2.0.5-dsh.0.2.1-rc.1.tgz
```

`0.2.1-rc.2` and `0.2.0-rc.2` are different versions. Do not use these packages with an unlisted host.

## Features and upgrades

- Both fixed Releases include the plugin and `host-adapters.zip` source materials, **not a complete desktop installer**. The full embedded browser, native monitoring and related UI need matching Host, Client and preload source adapters and a host build. Installing the plugin does not supply those host changes. Builders can follow the [developer instructions (Chinese)](../DEVELOPMENT.md#构建和本地插件包).
- Web capabilities depend on the service machine, backend and permissions. They do not directly grant control over the computer visiting the page.
- Before upgrading, back up and keep the original profile, `DSH_HOME`, data directory and third-party plugins. Install the matching package and restart the affected instance. Do not create or reset configuration for an upgrade.
- **Main-branch updates do not update fixed Releases.** These URLs do not automatically include later fixes. See the [Release list](releases.md) for published packages and checksums.

<details>
<summary>CLI supplement (for AI or users who prefer the terminal)</summary>

Use the target DSH's bundled CLI or the same CLI that starts your existing Web service, retaining the original `DSH_HOME`. Run `dsh --version` first. The commands use the standard `desktop`/`web` profiles; use your original name for a custom profile. Do not substitute another global CLI or recreate configuration with `--from-default-profile`.

DSH `0.2.1-rc.2` desktop:

```sh
dsh plugin --profile desktop add 'https://github.com/gulagala001/opencu/releases/download/v2.0.5-dsh.0.2.1-rc.2/opencu-2.0.5-dsh.0.2.1-rc.2.tgz'
```

DSH `0.2.1-rc.2` Web:

```sh
dsh plugin --profile web add 'https://github.com/gulagala001/opencu/releases/download/v2.0.5-dsh.0.2.1-rc.2/opencu-2.0.5-dsh.0.2.1-rc.2.tgz'
```

DSH `0.2.1-rc.1` desktop:

```sh
dsh plugin --profile desktop add 'https://github.com/gulagala001/opencu/releases/download/v2.0.5-dsh.0.2.1-rc.1/opencu-2.0.5-dsh.0.2.1-rc.1.tgz'
```

DSH `0.2.1-rc.1` Web:

```sh
dsh plugin --profile web add 'https://github.com/gulagala001/opencu/releases/download/v2.0.5-dsh.0.2.1-rc.1/opencu-2.0.5-dsh.0.2.1-rc.1.tgz'
```

Restart the corresponding instance as described above, keeping its launch method and environment. The CLI needs Node.js ≥22.19; desktop uses its bundled runtime.

</details>
