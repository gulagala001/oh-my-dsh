# Using Other Plugins with OMD

[简体中文](plugin-compatibility.md) · [Documentation](README_EN.md) · [Installation](install_EN.md)

OMD retains native DSH tools, skills, sessions and third-party entries. **Use plugins built for the complete host version.**

## Match the artifacts

Current source targets DSH `0.2.1-rc.2`: OMD `0.99.2` and standalone/bundled OpenCU `2.0.7`. DSH `0.2.1-rc.1` has a separate build; these two complete host versions are currently supported. Independent projects such as IUI and OMAA need their own matching builds; relabeling the same frontend is not adaptation.

Do not replace current work with old packages, older HEAD or version exemptions. Back up actual data and retain explicit settings, accounts and third-party provenance.

## Native tools and ownership

- The host owns registry, SDK, lookup, scheduling, permissions, cancellation and plugin scopes.
- OMD provides PTC presentation only within its presets. Ordinary work uses `run_code`; matching scopes retain four direct background controls.
- Visibility in `standard` is not visibility in every preset. Check actual scoped tools.
- Request projection is reversible; removal withdraws owned contributions, retaining later third-party wrappers, registrations and public slots.
- Loader removal preserves original user configuration rather than persisting the whole effective bundle patch.

[System prompts and tool boundaries (Chinese)](prompt-adaptation.md)

<a id="opencu"></a>

## New OpenCU is bundled

New OMD needs no second OpenCU installation. Standalone use remains available; coinstallation shares one core, tool set and presentation implementation. The frozen 1.3.0 transition snapshot has been replaced.

The complete embedded browser, annotations and native monitor need matching Host, Client and preload adapters. Plugin installation does not automatically patch stock DSH. Text and file tasks do not require desktop control first. [Setup and boundaries (Chinese)](computer-use.md)

## Independent products and composed use

Workflow, Rewind, DeepSeek Workbench, Persona and Extensions have independent formal releases; Glyph is included in the theme plugin. OpenCU remains available independently, and theme management has its own product. See [plugin architecture](architecture_EN.md) for responsibilities, fixed releases and coinstallation. Each product has its own scope and host requirements.

## Other plugins and integration boundaries

| Project | Boundary |
| --- | --- |
| **Intelligent UI** | Independent interactive-content capabilities. OMD maintains recommendations, matching artifacts, public slots and tool projection—not its implementation or data. |
| **OMAA** | Independent presets/features, usable through supported workflow/mode boundaries. |
| **Subscriptions** | Independent login, account pools, routing and persistent Fast settings. OMD supplies no accounts, quota or server-priority guarantees. |
| **Intent / requirement understanding** | Independent and off by default, separate from OMD's system instructions and manual draft refinement. |
| **[dsh-ops](dsh-ops_EN.md)** | File, document and shell tools by T-Auto, with progressive tool discovery and result references. Fixed rc.1/rc.2 compatibility packages pin upstream `0.4.1`; native mode and PTC retain host permissions, sandbox policies and native tools. |
| **DeepSeek Workbench** | Independent web-chat and migration product. OMD controls its included entry under Features; a separately installed package is managed by the native plugin page. |
| **OpenDesign / standard plugins** | Retain independent skills, tools, UI ownership, account requirements and licenses. |
| **Development-injected projects** | Follow their project instructions when no standard artifact exists; do not disguise them as directly installable packages. |

## Recommendations, updates and data

The catalog lists purpose, original author, fixed source, full host, SHA-256 and state. Unknown hosts, missing artifacts and unpublished targets do not get invented installation entries. Use the current profile's native manager; on desktop, use the app or its bundled CLI.

Automatic updates default off and apply only to eligible installed/enabled releases. They do not cross hosts, approve scripts or restart. Accounts, OAuth, Fast and paid behavior need separate confirmation.

The dsh-ops third-party feature page provides an install/enable switch and selects a fixed compatibility package for the complete host version and runtime target. Disabling retains plugin data. Catalog updates use reviewed compatibility releases rather than upstream `latest`. Updates through an external plugin marketplace or CLI can bypass the catalog pin; check the matching version afterward. [Installation and usage](dsh-ops_EN.md)

Disable/removal retains conversations, drafts, attachments, settings, short memory and companion data. A saved conversation missing its preset may need that plugin restored.

Report full versions, loading order, profile, a minimal reproduction and the first redacted error. Do not clear data or disable every enhancement to conceal conflicts. [Troubleshooting](troubleshooting_EN.md) · [Sources and licensing](../THIRD_PARTY_NOTICES.md)
