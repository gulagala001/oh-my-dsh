# DeepSeek Workbench desktop host adapter

[简体中文](README.md) · [Capabilities and compatibility](../docs/desktop-host_EN.md)

Targets **DSH 0.2.1-rc.2**, **Cordis 4.0.5** and **Schemastery 3.18.5**. Apply this source adapter directly to clean official DSH rc.2 sources. No other plugin installation is required.

The standard host already supplies isolated webviews and page extraction. This adapter adds a persistent DeepSeek login profile, origin- and redirect-checked downloads, official-resource policy, an API Keys platform page and capability reporting. Ordinary sidebar guests keep their existing partition and download policy.

## Build from source

1. Obtain the [pinned DSH rc.2 source](https://github.com/deepseek-ai/deepseek-harness/tree/687f282e8625c6b8d11ff58211a90524be2e4317) and use an independent source copy you own. Do not target an installed application or shared source cache.
2. Run from this plugin's directory:

   ```bash
   node desktop/apply-host.mjs /absolute/owned/dsh-source
   ```

3. Install DSH dependencies from its frozen lock. rc.2 uses pnpm `11.28.5`, TypeScript `6.0.3` and Electron `44.7.0`. Follow that source revision's build instructions to rebuild affected Host, Client, Web, desktop main and preloads, then package and sign through upstream platform workflows.
4. Install the pinned plugin Release package into the new host's actual profile. See the [installation guide](../docs/install_EN.md).

The adapter checks versions and every replacement anchor before writing changes. Mismatched inputs fail. Reapplying checks the policy and returns. Existing recognized browser capabilities retain their asynchronous release transaction; unrecognized variants are rejected.

## Focused development check

For adapted sources, provide a toolchain directory containing the exact TypeScript and Electron versions above, plus Node types:

```bash
node desktop/check-host.mjs /absolute/patched-dsh-source /absolute/toolchain
```

This checks real guest-boundary types and syntax in every changed TypeScript file. It does not replace a full desktop build, signing or native platform verification. It does not install dependencies or launch or modify an installed DSH instance.

Host policy lives in [deepseek-browser-policy.ts](deepseek-browser-policy.ts). Attribution is in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
