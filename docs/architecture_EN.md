# Plugin Architecture and Installation Choices

[简体中文](architecture.md) · [Documentation](README_EN.md) · [Plugin compatibility](plugin-compatibility_EN.md) · [0.100.0 release notes](release-0.100.1.md#en-01001)

OMD organizes these features through dedicated plugin entry points. Workflow, turn rewind, personalities, extension management and the web workbench have their own plugin entry points. Theme management and Glyph also have independent product forms. OMD provides a composed workspace, while each independent product has its own purpose, host requirements and releases.

This page describes the OMD 0.101.0 plugin structure and formal releases. Glyph is included in the theme plugin.

## Products you can choose independently

| Product | Capabilities | Use within OMD | Independent distribution |
| --- | --- | --- | --- |
| **OpenCU** | Browser/native app actions, observation, annotations, monitoring and sources | Included, retaining coordinated standalone and embedded entry points | [2.0.8](https://github.com/gulagala001/opencu/releases/tag/v2.0.8-dsh.0.2.1-rc.2), with separate rc.1/rc.2 packages |
| **DSH Workflow** · `dsh-workflow-plus` | Scripts, subagents, phases, background execution, budgets and resumption | Provides the Workflow path in Ultra and workflow tools; native teams remain DSH-owned | [0.1.2 for DSH rc.2](https://github.com/gulagala001/dsh-workflow/releases/tag/v0.1.2-dsh.0.2.1-rc.2) |
| **DSH Rewind** · `@gulagala001/dsh-undo-plugin` | Turn rollback, checkpointed file restoration, undo and draft recovery | Included through message actions, double Escape, `/rewind` and `/undo` | [0.1.1 for DSH rc.2](https://github.com/gulagala001/dsh-undo-plugin/releases/tag/v0.1.1-dsh.0.2.1-rc.2) |
| **DeepSeek Workbench** · `dsh-deepseek-workbench` | Web chat, temporary website side chats, the API platform and history import | Controlled under **Oh My DSH → Features**, with web-chat and account entries | [0.1.1 for DSH rc.2](https://github.com/gulagala001/dsh-deepseek-workbench/releases/tag/v0.1.1-dsh.0.2.1-rc.2) |
| **Extensions** · `dsh-extensions` | Skills, MCP, instruction files, commands and hooks | Included and enabled by default on the plugin page | [0.1.0](https://github.com/gulagala001/dsh-extensions/releases/tag/v0.1.0-dsh.0.2.1-rc.2) |
| **Persona** · `@gulagala001/dsh-persona-plugin` | Presets, four style modules, file exchange and session personalities | Edited in OMD settings and selected in main-session permission menus | [0.1.0](https://github.com/gulagala001/dsh-persona-plugin/releases/tag/v0.1.0-dsh.0.2.1-rc.2) |
| **dsh-theme-plugin** | Appearance settings, theme management, a theme market and installation checks | Optional theme-management product; OMD retains its own built-in appearance choices | [0.2.2 for DSH rc.2](https://github.com/gulagala001/dsh-theme-plugin/releases/tag/v0.2.2-dsh.0.2.1-rc.2) |
| **DSH BTW** · `@gulagala001/dsh-btw` | Native side-question popover, history, follow-ups and cancellation | Bundled; open with `/btw` while the main task continues | [0.1.2 for DSH rc.2](https://github.com/gulagala001/dsh-btw/releases/tag/v0.1.2-dsh.0.2.1-rc.2) |
| **Glyph** · `dsh-glyph-theme` | Character whale, controls, ripples and reasoning-intensity effects | Selectable appearance, used by default for new appearance configurations | Included in Theme 0.2.2; no separate release |

Independent products follow their own releases. An older fixed package does not automatically acquire subsequent fixes from current OMD source. Check that product's Release and exact host version.

Intelligent UI and OMAA continue as established independent products; they did not first become independent in this release. dsh-ops is a third-party tool product installed through the matching compatibility entry in OMD's third-party page.

## Full installation and coinstallation

- Install the matching OMD package for its composed workspace. Included capabilities do not require duplicate independent installations.
- For one independent product, follow its own fixed-package installation guide. OMD's rc.1 support does not extend the rc.2-only releases listed above.
- Matching OpenCU, Workflow, Rewind, BTW, Persona, Extensions and DeepSeek Workbench installations coordinate runtime and UI ownership in the same host scope. This avoids duplicate tools, services and controls; a still-enabled owner can retain the capability when another is disabled.
- Disabling an OMD feature controls its OMD entry. A separately installed plugin remains managed through DSH's plugin page. Check the actual enabled source before updating or removing it.
- Theme management retains theme and preference ownership when taking over appearance controls. A failed takeover preserves the current appearance and reports the error. The Glyph theme and the theme-management product are distinct installation choices.

## Core conversations and optional features start separately

Core Chat/Conversation services are established first. Computer use, turn rewind, Workflow and other optional UI enhancements mount in their own scopes. Missing dependencies or failed optional startup produce an actionable error while retaining the basic conversation and recovery entry points.

Actual host services and system permissions still determine availability. OpenCU's embedded browser and native monitor need matching host adapters; persistent website login and downloads depend on the corresponding desktop capabilities. Installing an independent plugin does not upgrade DSH or replace its desktop application.

## Resources load when needed

Large theme fonts/styles, the Glyph renderer and heavier OpenCU client capabilities load on demand, reducing synchronous startup work. Matching resources remain part of the fixed installation package, and existing theme and feature interfaces stay available.

Observation follows the requested output: screenshot-only observation avoids unrelated accessibility work, while AX, differences and detailed reads retain the information they require. Floating previews reuse acknowledged images and restore complete frames after reload or loss of an image baseline.

## Native records and presentation views stay separate

Task status restores from native `todo/write` events, with requirements and verification linked to the same task record. Refresh, session recovery or cancellation does not replace that state with a separate empty ledger. Monitoring derives summaries and details from actual call receipts and reconciles derived results when prices or filters change.

Context optimization transforms the model-facing view, preserving authorized originals before producing compact results, deltas or references. PTC program return values remain intact, and original sessions/attachments remain retrievable. OMD and BC coordinate the replaced compaction responsibility while Dream, archives and other conversation features retain their own data boundaries.

## Data retains its owner

A complete backup covers the actual `DSH_HOME`, profile, sessions and attachments, plus external projects and browser-local preferences.

| Data | Location or owner |
| --- | --- |
| OMD context, archives, Dream and monitoring | `DSH_HOME/oh-my-dsh/`; DSH continues to own original session records and attachments |
| Personalities and per-session choices | Profile-specific storage under `DSH_HOME/dsh-persona-plugin/`; existing OMD personalities migrate on first use, retaining conflicting content |
| File rollback backups and recovery state | `DSH_HOME/rewind-plus/v1/` by default; retain custom storage locations separately |
| Workflow | Native sessions/journals retain their owner; standalone budgets use `DSH_HOME/dsh-workflow/`, while scripts and worktrees live in their projects |
| Website history imports | `DSH_HOME/deepseek-workbench/`; website login belongs to the desktop session |
| Extension configuration | MCP, commands and hooks use their DSH configuration; skills and instruction files stay in their personal/project directories |
| Appearance and theme management | Browser-local appearance/background preferences plus the theme library and installation records scoped by profile |

Disabling a plugin preserves user data. A native session export is not an export of every plugin's data: migrate original-result archives with sessions that reference compact results, and retain Persona data or export personality files. See [upgrade and backup](upgrade_EN.md).
