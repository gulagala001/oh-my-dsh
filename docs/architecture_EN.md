# Plugin structure and running plugins together

[中文](architecture.md) · [Docs](README_EN.md) · [Plugin compatibility](plugin-compatibility_EN.md) · [Upgrade](upgrade_EN.md)

OMD is a ready-to-use bundle. Workflow, rewind, personalities, extension management, the web workbench and the other parts inside it can also be installed as separate plugins.

## Each part is also available on its own

| Product | What it does | In OMD | Separate version |
| --- | --- | --- | --- |
| [OpenCU](https://github.com/gulagala001/opencu/releases) | Operate browsers and desktop apps, observe, annotate, live view | Built in | 2.2.11 |
| [DSH Workflow](https://github.com/gulagala001/dsh-workflow/releases) · `dsh-workflow-plus` | Workflow scripts, subagents, stage panel, background runs, budgets and resuming | Ultra's Workflow mode and workflow tools | 0.1.8 |
| [DSH Rewind](https://github.com/gulagala001/dsh-undo-plugin/releases) · `@gulagala001/dsh-undo-plugin` | Rewind messages and files, undo a rewind, refill the input | Built in: message button, double Esc, `/rewind`, `/undo` | 0.1.11 |
| [DeepSeek Workbench](https://github.com/gulagala001/dsh-deepseek-workbench/releases) · `dsh-deepseek-workbench` | Web chat, web side panel, open platform and history import | Toggle in **Settings → Oh My DSH → Features** | 0.1.5 |
| [DSH Extensions](https://github.com/gulagala001/dsh-extensions/releases) · `dsh-extensions` | Skills, MCP, instruction files, commands and Hooks | On by default, on the Plugins page | 0.1.5 |
| [DSH Persona](https://github.com/gulagala001/dsh-persona-plugin/releases) · `@gulagala001/dsh-persona-plugin` | Personality presets, four modules, import/export and per-session personalities | Edit in OMD settings, pick in the main session's permissions menu | 0.2.2 |
| [DSH Theme](https://github.com/gulagala001/dsh-theme-plugin/releases) · `@gulagala001/dsh-theme-plugin` | Appearance settings, theme management, theme market and install checks, including Glyph | OMD has its own appearance picker; theme management can be added | 0.3.3 |
| [DSH BTW](https://github.com/gulagala001/dsh-btw/releases) · `@gulagala001/dsh-btw` | Side chats, history, follow-ups and separate stop | Built in, via `/btw` | 0.1.8 |
| [DSH Response ID Reuse](https://github.com/gulagala001/dsh-response-id-reuse/releases) · `@gulagala001/dsh-response-id-reuse` | Response ID continuation for Responses channels | Built in, nothing to set up | 0.1.7 |

Separate versions update on their own schedule; the table shows the current ones, all for DSH 0.2.2-rc.1. IUI and OMAA have always been separate products, and dsh-ops is a third-party tool installed from OMD's third-party page.

## Running them together

- For everything, install OMD; there is no need to add the parts it already contains.
- For just one part, install that product by its own instructions.
- With OMD and a separate plugin installed together, the two coordinate so tools, services and buttons are not duplicated. Disable either one and the other keeps providing the feature.
- Turning a feature off in OMD only removes OMD's entry; a separately installed plugin is still managed on the DSH Plugins page.
- When theme management takes over appearance, existing themes and preferences are kept; if it cannot, the current appearance stays and an error is shown.

## Basic chat starts first

Basic chat loads first, and computer use, rewind, Workflow and other features load separately. If one is missing a dependency or fails to start, only that feature shows an error and chat keeps working.

Some features depend on DSH itself: the embedded browser and native live view need a matching DSH desktop build, and persistent DeepSeek web sign-in and downloads need the desktop app. Installing a plugin never upgrades or replaces DSH.

## Loaded when needed

Larger fonts and styles, the Glyph animation and the heavier parts of OpenCU load only when used, so startup is faster. Screenshot-only observations skip extra interface-structure reads; detailed structure and diffs are read only when needed.

## Raw records and display stay separate

Task completion is restored from the session's `todo_write` records, so reloading, resuming a session or cancelling verification never overwrites it with an empty list. Monitoring data comes from the real receipt of each call.

Context optimization only changes what is sent to the model: the original is stored first, then a trimmed version, diff or reference is sent, and the raw session and attachments can always be looked up. OMD and Billion Context only take turns on compaction; Dream, archives and other features keep working.

<a id="data-retains-its-owner"></a>

## Data stays with its feature

A full backup covers the whole `DSH_HOME`, profiles, conversations and attachments, plus external projects and local preferences in your browser.

| Data | Location |
| --- | --- |
| OMD context, archives, Dream, monitoring | `DSH_HOME/oh-my-dsh/`; conversation records and attachments are managed by DSH |
| Personalities and per-session choices | `DSH_HOME/dsh-persona-plugin/`, per profile |
| Rewind backups | `DSH_HOME/rewind-plus/v1/` by default; back up custom locations separately |
| Workflow | Budgets in `DSH_HOME/dsh-workflow/`, scripts and worktrees in their projects |
| Web history imports | `DSH_HOME/deepseek-workbench/`; website sign-in is managed by the desktop app |
| Extension settings | MCP, commands and Hooks in DSH settings; Skills and instruction files in personal or project folders |
| Appearance and themes | Appearance and background preferences in the browser, plus the theme library and install records saved per profile by theme management |

Disabling a plugin never deletes its data. Exporting a DSH conversation does not include plugin data: when moving conversations, bring their original-content archives too, and for personalities keep the Persona data or export personality files. See [upgrade and backup](upgrade_EN.md).
