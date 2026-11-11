# DeepSeek Workbench desktop host adapter

[简体中文](README.md) · [Capabilities and compatibility](../docs/desktop-host_EN.md)

Targets official **DSH 0.2.1-rc.2** source with **Cordis 4.0.5** and **Schemastery 3.18.5**.

Standard DSH can already embed web pages and read them. This adapter adds a DeepSeek sign-in profile that survives restarts, downloads checked for origin and redirects, an official-resource policy, the API Keys platform page, and a flag that tells the plugin these features are ready. Other sidebar web pages behave as before.

## Build from source

1. Obtain the [pinned DSH rc.2 source](https://github.com/deepseek-ai/deepseek-harness/tree/687f282e8625c6b8d11ff58211a90524be2e4317) and use an independent source copy you own. Do not target an installed application or shared source cache.
2. Run from this plugin's directory:

   ```bash
   node desktop/apply-host.mjs /absolute/owned/dsh-source
   ```

3. Install DSH dependencies from its frozen lock. rc.2 uses pnpm `11.28.5`, TypeScript `6.0.3` and Electron `44.7.0`. Follow that source revision's build instructions to rebuild affected Host, Client, Web, desktop main and preloads, then package and sign through upstream platform workflows.
4. Install the pinned plugin Release package into the new host's actual profile. See the [installation guide](../docs/install_EN.md).

The script checks the version and every place it needs to change, and writes only if all of them match; otherwise it stops. Running it again on adapted source only checks it. If the source already has other browser extensions, the adapter adds to them; changes it does not recognize make it refuse to run.

## Focused development check

For adapted sources, provide a toolchain directory containing the exact TypeScript and Electron versions above, plus Node types:

```bash
node desktop/check-host.mjs /absolute/patched-dsh-source /absolute/toolchain
```

This checks the browser interface types and the syntax of every changed TypeScript file. It installs nothing and never starts or changes an installed DSH. A release still needs a full build and signing.

Host policy lives in [deepseek-browser-policy.ts](deepseek-browser-policy.ts). Attribution is in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
