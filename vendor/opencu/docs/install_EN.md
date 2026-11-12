# Install OpenCU

[简体中文](install.md) · [Back to README](../README_EN.md)

Requires DSH **0.2.2-rc.2** and Node.js **24.9.0+**.

## Install in DSH

Open **Plugins → Add plugin** and paste:

```text
https://github.com/gulagala001/opencu/releases/download/v2.2.13-dsh.0.2.2-rc.2/opencu-2.2.13-dsh.0.2.2-rc.2.tgz
```

When your current task finishes, enable the plugin or restart DSH when prompted. Checksums: [SHA256SUMS](https://github.com/gulagala001/opencu/releases/download/v2.2.13-dsh.0.2.2-rc.2/SHA256SUMS).

## Install from the command line

Use the CLI that belongs to the same DSH, replacing `web` with your profile (`desktop` for the desktop app):

```bash
dsh plugin --profile web add "https://github.com/gulagala001/opencu/releases/download/v2.2.13-dsh.0.2.2-rc.2/opencu-2.2.13-dsh.0.2.2-rc.2.tgz"
```

If you already use OMD, skip this: OMD includes OpenCU. For other DSH versions, find the matching package on [Releases](https://github.com/gulagala001/opencu/releases); do not mix packages built for different versions.

## After installing

Open **Settings → Computer & Browser** and follow the prompts to set up browser files, grant system permissions or connect the Chrome or Edge extension.

- **Chrome or Edge extension**: click the button in Settings to show the extension folder, turn on developer mode on the browser's extensions page, choose "Load unpacked" and select that folder. The first time the AI uses this browser, it asks "Allow connection to this browser?". Click **Allow and remember**, and it reconnects automatically from then on.
- **macOS**: in **System Settings → Privacy & Security**, turn on Accessibility and Screen Recording for DSH.
- **DSH built-in browser**: apply the matching adaptation to the DSH desktop source and build it yourself. The release includes `host-adapters.zip`; steps are in [development](../DEVELOPMENT.md#构建和本地插件包). Installing the plugin alone never changes DSH itself.

## Ask the AI to install it

You can also send this to the AI in DSH and let it do the install:

```text
Install OpenCU into the DSH profile I am using now:
https://github.com/gulagala001/opencu/releases/download/v2.2.13-dsh.0.2.2-rc.2/opencu-2.2.13-dsh.0.2.2-rc.2.tgz
First check that DSH is 0.2.2-rc.2 and Node.js is 24.9.0 or later. If OMD is already installed, do not install OpenCU.
Keep my settings, conversations, browser pairing and other plugins, and do not upgrade DSH. Before restarting, make sure no task is running.
Afterwards, confirm that Settings → Computer & Browser opens, and tell me which system permissions I still need to grant.
```

## Upgrade and roll back

Back up your profile and `DSH_HOME/opencu`, then install the new package over the old one. DSH itself does not need to change. If the upgrade fails, your data is untouched; send the first error to [Issues](https://github.com/gulagala001/opencu/issues).

To go back, install the previous package. Rolling back only replaces the code; data written by the newer version stays.

## Uninstall

Remove it on the Plugins page, or run:

```bash
dsh plugin --profile web remove opencu
```

Then restart DSH. Browser pairing, download history and annotations live in `DSH_HOME/opencu` and stay; delete it by hand if you no longer need it. Remove the Chrome or Edge extension from the browser's extensions page separately.
