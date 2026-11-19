# Using OMD with other plugins

[中文](plugin-compatibility.md) · [Docs](README_EN.md) · [Install](install_EN.md) · [Plugin structure](architecture_EN.md)

OMD keeps DSH's native tools, skills, sessions and third-party plugin entries.

## Installation and coexistence

OMD 1.9.2 uses one package across DSH versions. DSH 0.2.2 builds rc.3, rc.4 and rc.5 can all use it. You can also try the same package on other versions.

For other plugins, follow their installation instructions.

## Who owns the tools

- DSH manages tool registration, the SDK, scheduling, permissions, cancellation and plugin scopes.
- OMD only provides PTC inside its own presets: business tools go through `run_code`, and the four background-job tools stay directly callable.
- A tool visible in `standard` is not necessarily visible in every preset; check the actual scope.
- Removing OMD only withdraws what OMD added. Wrappers, registrations and shared slots added later by third parties stay, and your original settings are not rewritten.

See [prompt sources](prompt-adaptation.md) (Chinese).

<a id="opencu"></a>

## OpenCU is built in

With OMD installed there is no need to install OpenCU. You can also install OpenCU on its own; installed together, they share the same core and tools.

After installing OMD in the stock DSH desktop app on Windows or macOS, open **Settings → Computer and browsers** to check the embedded browser, annotation and native monitor features available in the current window. You can start text and file tasks right away. See [computer and browser](computer-use.md) (Chinese).

## Separate plugins

Workflow, Rewind, DeepSeek Workbench, Persona, Extensions, OpenCU and theme management are all available separately, and Glyph ships with the theme plugin. Each separate version has its own DSH requirement. See [plugin structure](architecture_EN.md).

| Plugin | Relationship with OMD |
| --- | --- |
| **Intelligent UI** | A separate interactive-content plugin. OMD provides the recommendation, version matching, shared slots and tool access, but not its implementation or data |
| **OMAA** | Separate agent presets that work with OMD through workflow or mode entries |
| **Subscription Login** | Separately handles sign-in, account pools, routing and Fast. OMD provides no accounts, quotas or priority |
| **Intent assistant** | A separate plugin, off by default, unrelated to OMD's prompt enhancements and the ✨ optimizer |
| **[dsh-ops](dsh-ops_EN.md)** | File, document and command tools by T-Auto, based on upstream 0.4.1; both normal mode and PTC keep DSH's permissions, sandbox and native tools |
| **DeepSeek Workbench** | The built-in one is toggled under Features; a separately installed one is managed on the DSH Plugins page |
| **OpenDesign and other standard plugins** | Keep their own skills, tools, interface, account requirements and licenses |

<a id="recommendations-updates-and-data"></a>

## Third-party catalog

**Settings → Oh My DSH → Third-party** lists each plugin's purpose, original author, fixed source, supported DSH version, SHA-256 and status. The catalog prefers a matching build and offers an existing fixed package for other host versions. Installs use the current profile's plugin manager; the desktop app uses itself or its bundled command line.

Current catalog: Billion Context 0.1.202, dsh-ops 0.1.0, Subscription Login 0.9.12, OpenDesign 0.1.0-omd.1.0.0, Intent assistant 0.3.4, Plugin Market 1.70.3, Infinite Gen 4 0.4.0, Status Rotator 0.38.0, DSH × Blender 2.6.1 and Balance Whale Widget 0.4.2. Set up accounts, Blender connections and paid requests as each plugin requires.

- Older or incompatible installs show an **Update** button.
- Automatic updates are off by default and only handle installed, enabled catalog entries. You retain control of build approvals and restarts.
- dsh-ops only installs registered compatibility builds, never upstream latest. If you install another version from a market or the command line, check it yourself.

## Plugin install pre-check

DSH installs plugins directly by default. If you enable the pre-check in Settings → Oh My DSH → About, when you install, update or enable a plugin from the DSH Plugins page, a tool call or the desktop dsh-market, OMD first tries it in a temporary DSH. The plugin has to appear in the plugin list and load; blank pages, script errors and runtime errors are stopped. If it takes too long, it is marked "pre-check incomplete". It checks that the plugin starts properly, not that every feature works.

- The pre-check uses the plugin code and enabled state you selected and copies no third-party private settings or accounts, so plugins that need external services may only show "incomplete". No API key is needed.
- If first launch shows onboarding it continues through it; going straight to the main screen also counts as normal.
- On macOS / Linux, the check stops if the processes use about 2 GiB of memory combined or temporary files reach about 1 GiB. Windows uses process-tree termination and timeouts.
- It passes only after every check and process cleanup has finished. Early exits, crashes or cleanup timeouts never pass.
- The pre-check installs no background service and leaves your command-line entries alone.
- For updates from npm sources, it runs once before the whole update. Cancelling it never removes the old version first, and restoring the old version after a failed update is not checked again.

Plugins installed from the command line, npm / pnpm or by editing folders are not pre-checked.

## Disabling and removing

Disabling or removing OMD keeps conversations, drafts, attachments, settings, short memory and separate plugins' data. Old sessions created with an OMD preset may need OMD installed again to open.

When reporting a conflict, include the full versions of the plugins involved, load order, profile, the shortest steps to reproduce and the first error (with private data removed). Do not clear data or turn off every enhancement to hide a conflict. See [troubleshooting](troubleshooting_EN.md) and [third-party notices](../THIRD_PARTY_NOTICES.md).
