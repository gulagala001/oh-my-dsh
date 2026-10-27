# Oh My DSH Usage Guide

[简体中文](usage.md) · [Docs index](README_EN.md) · [First task](getting-started_EN.md) · [Troubleshooting](troubleshooting_EN.md) · [Development](development_EN.md)

> Current source is **OMD `0.2.1-rc.3.omd.0.101.2` / DSH `0.2.1-rc.3`**, bundling OpenCU; component versions are listed in [credits](components_EN.md). Start with [version matching](install_EN.md); historical 0.10 users should follow their fixed-tag documentation.

OMD retains DSH's models, projects, sessions, native tools, files, skills, and content tabs. The package ID and preset are both `oh-my-dsh`; settings, conversations and data from earlier versions migrate automatically after upgrading, see [the upgrade guide](upgrade_EN.md#package-name).

<a id="install-in-existing-dsh"></a>

## Install in Existing DSH

Choose **[copy instructions to an AI](install_EN.md#ai)** or **[use the Add Plugin dialog](install_EN.md#gui)**. The installation guide contains the fixed package URLs for DSH 0.2.1-rc.1 and 0.2.1-rc.2; OMD already includes OpenCU.

After a full restart, create a conversation and select **Oh My DSH**. Existing conversations retain their presets. OMD uses your model accounts; explicit profile permission settings take precedence over its installation defaults.

<a id="update-uninstall"></a>

<details>
<summary>Update, disable, and uninstall</summary>

Back up, then select a fixed release for the actual full host. The version panel manages OMD in the current profile only; it does not update the host or restart it. Current and remote versions differ. Public calculation excludes `unpublished`; status and installation reject unpublished targets. Unreleased candidates do not get invented download links.

After installation/update/enable/disable, let tasks finish and fully restart the app or original Web service. Closing a window or refreshing does not switch the backend. Removal example for DSH 0.2.1-rc.2 with the web profile; desktop users should use the plugin interface:

```sh
npx --yes @deepseek-ai/dsh@0.2.1-rc.2 plugin --profile web remove oh-my-dsh
```

Disable/uninstall retains models, credentials, sessions, drafts, and memory. Old sessions missing their OMD preset require re-enabling it. A working new standard session does not establish conversion of old sessions. Loader protection does not persist effective bundle patches into user configuration and retains third-party registrations/wrappers.

</details>

## Projectless Chat

Each workspace reuses one unsent draft; global **New Session** reuses a separate draft. Repeated creation and preset changes preserve its text and attachments. Clicking **×** on the workspace label opens the global draft; choosing a workspace opens that workspace's draft. Their contents do not overwrite each other.

Each workspace and the global scope remember their last manually selected provider, model, reasoning effort, and Ultra mode/strategy together for new chats. Ultra effort is remembered separately for each provider/model, survives refreshes and restarts, and is not overwritten by ordinary effort choices. Viewing old conversations and restoring settings do not update these preferences. Existing conversations keep their own models; a scope without a saved preference starts with the default. If a remembered route is unavailable, the selector asks you to choose again and preserves the draft.

A global chat creates its native session and independent permission root before showing the composer, normally **Documents/DSH/date/新聊天**, numbered on collision. On its first send, OMD creates a child directory named after the first message and selects it through the native working-directory service. The directory-change notice and current directory information join the first request, so directory initialization does not trigger an extra model call. File tools, subagents, Finder and the open-directory shortcut use that effective directory. The permission root stays in place: confined writes remain inside this chat and read-only permissions still apply. Repeated creation reuses an unsent draft; a new chat after sending receives a separate root. These directories are not registered as workspaces, so chats remain Ungrouped. Every send retains the same session ID, personality, subscription Fast mode, permissions, attachments and other plugin state. Native events restore the working directory after restart. Existing files are not moved and started chats retain their directories. Unsent drafts complete first-message naming within their existing session.

**An automatic file directory is not a Dream project.** Chat and descendants not added to a real workspace stay isolated. Changing the save root/current execution directory or deleting the original directory must not admit historical Chat or old Dream jobs into shared organization. Unknown ownership is temporarily isolated with diagnostics while basic chat continues. Explicitly joining a native workspace uses that ownership and selected scope. [Dream isolation (Chinese)](dream-memory.md)

Custom permissions remain owned and enforced by the native session, without conversion to a preset before sending. File permissions and memory-sharing scope are different controls.

Leaving during creation cancels the remaining preparation and releases its waits. The draft and attachments remain, and retry reuses the same directory allocation. Once the message reaches the host, its actual admission receipt still determines completion even if you leave. A failed admission can be retried; navigation never resends it automatically.

If a disk error or process exit interrupts initial creation, retry preserves any existing directory whose ownership was not confirmed and chooses another numbered name. Its files are never adopted into the chat. Confirmed chats continue using their original directory.

<a id="local-development-or-trial"></a>

Source trials use the [short development guide](development_EN.md). Public fixed installation needs no clone/manual build.

## Interface and Entry Points

The right-sidebar guide offers one **OMD Console** entry with overview, context, memory, call log, and background log sections: top tabs in a narrow sidebar, left navigation when wide or fullscreen. Composer info-bar items and the BT menu jump straight to a section. File, terminal, native browser, and third-party entries remain; material reading supports Back and Escape.

| Entry | Purpose |
| --- | --- |
| **Overview** | Tokens, cache hit, calls/failures, current context, OMD savings, Dream quota; main vs OMD background trend, component usage, background feed. |
| **Context** | Occupancy breakdown and post-replacement estimate; prepare → hub → replace status, apply prepared results, `/compact-p`/`/compact-f`, segment summaries and material. |
| **Memory** | Session/project/global short memory, summary catalog, jobs, and automatic Dream settings. |
| **Call log / Background log** | Each model call (kind, model, tokens, duration, status) and each background mechanism record (prepare, hub decision, replacement, compaction, adaptive, Dream); searchable, filterable, paged. |
| **Task evidence** | Opened from the BT menu “View task evidence”: requirement excerpts, status, and checks. |
| Composer info bar | Native readings unchanged, with jumps to overview or call log; the context item appears while organizing or when a replacement is ready and can apply it; Dream jobs show progress. |
| **Permissions → Memory scope** | Choose session, project or global scope before first send; the fixed scope remains visible afterward. |
| **BT** | Change task/verification reminders or open task evidence. |
| Model / Fast | Native effort, Ultra and its three submodes, and a bolt when matching Subscriptions supports it. |

[![OMD Console overview](images/release/monitor.jpg)](monitoring.md)

Native sidebar search, menus, and third-party row actions remain. Use arrows, Home/End, Enter, Escape, and Shift+F10. Narrow windows dismiss with backdrop, selection, or Escape. Composer responsiveness follows the actual conversation column, not the whole viewport. System/manual reduced motion retains static state. Theme attributes and registrations respect third-party takeover; uninstall withdraws owned contributions only.

## Everyday Work

The **Conversation overview** button beside the title brings together outputs, subagents, background processes, sources and computer-use controls. Expand subagents to open an active member directly in the right sidebar, or open the categorized overview. Workflow stages and Agent Team members and task boards retain their native layout and behavior. Colored DSH whales stay consistent for each agent. Continuable chats retain native messaging, queueing, steering and stop controls. The overview replaces the corresponding duplicate header entries while it is available.

The overview uses complete session records, so browsing or loading a partial history does not change confirmed sources, outputs or workflow results. Subagent rows show the current turn outcome; a successful continuation preserves the earlier failure in its historical workflow. Read failures show their cause and offer a retry. Open a session first when its history requires migration. Native entries remain available while reads are incomplete.

BT completion reminders belong to the main conversation. Ordinary, Workflow and Team subagents retain their task tools without BT, memory scope, prompt optimization, OMD context/Dream or model/Ultra settings. Usage and timing remain visible; chat, permissions and stop controls follow native DSH restrictions. Fast retains the subscription plugin's native behavior.

Provide goals, inputs, boundaries, and delivery conditions. For multi-step tasks, preserve original requirements, track work, check artifacts, and then deliver. `todo_write` manages tasks/anchors; `verify_link` links, runs, or withdraws evidence. Evidence retains actual tool/callId, command, exit state, and timing. Task completion, process completion, and passing verification differ.

A verification batch keeps its starting work directory and saves each completed result. Cancellation or a later execution failure preserves earlier results. After a task edit, old results remain in history and cannot overwrite the new tasks. Python's pytest and any necessary script fallback share one test deadline; test output never selects a different runner after a failure.

**BT** persists per conversation. Task completion reminders have a separate switch, initially on. The second control, task verification, has three positions: **Off / Default / On**, initially the middle **Default** position. Default provides `verify_link` and evidence instructions without prompting for verification at turn end. Off removes the verification tool from that conversation's native tool list and PTC SDK, disables evidence requirements, missing-evidence reminders and text-evidence review, and preserves ordinary Todo and existing evidence. On enables the complete verification mechanism, including both completion reminders and text-evidence review, which may use more time and tokens. A blocker can pause this turn's reminders without marking completion.

The task verification default in **Settings → OMD → Agent** applies to conversations without an explicit BT selection; conversation choices persist independently. Legacy verification reminders off migrate to Default, and on migrate to On. Switching updates tools and the UI and retires disabled verification reminders. Requests already sent to a model cannot be recalled; stale verification calls are rejected, a command already running may finish and retain its result, and remaining checks do not start. Existing evidence remains readable in “View task evidence”; re-enabling does not require rebuilding tasks.

### Models and Work Modes

The panel retains native efforts plus **Ultra**, with **Workflow / Agent Team / Free** submodes; Free is the initial default. After sliding to Ultra, click the **Ultra** heading button to open its submode menu. The panel keeps its size. Successful selections are remembered in the current browser and reused when entering Ultra, including after a refresh; conversations already using Ultra retain their current choice. The menu’s reasoning effort section adjusts Ultra independently, initially defaulting to declared `xhigh` or the highest supported effort. Model preferences retain it across toggling Ultra, refreshes, new chats, and restarts. Switching models first restores that provider/model's remembered Ultra effort; without one, it keeps a compatible current effort or uses the default. Ordinary effort choices do not overwrite Ultra effort; no effort declaration means provider default. DSH owns the Agent Team switch and native interface; OMD only adds Ultra mode guidance. When Team is unavailable its option is hidden, and a saved Team choice temporarily uses Free without losing that preference. Mode and submode save separately and survive model changes. Selecting native effort/default turns Ultra off while remembering its submode and Ultra effort. Ultra does not expand permissions. [Workflow (Chinese)](workflow.md)

If another window has changed the model during save preparation, or the required collaboration capability is no longer available, the save reports a conflict or capability error and preserves the newer choice. After each save settles, the panel checks the current state and retains any save error so you can retry from that state. Failed writes are never replayed automatically. A running turn still keeps its Ultra strategy until the next turn.

**Fast** reads Subscriptions' actual state/capability and supports `codex` and `openai-codex`. It hides without matching services or model support. A write invalidates stale polling; failure retains the old state and shows an accessible top-level error. The actual Subscriptions version owns persistence, pools, and routing. Real OAuth, quotas, priority speedup, and paid requests remain unaccepted.

### Native Tools and OMD-PTC

OMD retains native registry, SDK, scheduling, permissions, and cancellation instead of replacing Tools wholesale. Ordinary OMD-PTC operations use `run_code`; only matching, sampled scopes retain direct **`job_output`, `job_list`, `job_kill`, `runtime_status`**. Nested SDKs, native presets, and third-party tools stay host-owned. Request projection is reversible; uninstall retains other wrappers. [Adaptation boundary (Chinese)](prompt-adaptation.md)

`run_code` uses the current PTC runtime's deadline (the host defaults to 120 seconds, with a 600-second per-call cap). Preparation, nested tools, result processing, and process cleanup also have bounded waits. Timeout or cancellation returns an explicit error. If the underlying call has not finished cleaning up, further business operations in that session are refused until it settles; existing direct job controls can still inspect and stop jobs. Do not repeat operations whose effects are unknown. Native human approval before program execution continues to wait for the user's decision without spending the program budget. Preset labels and pickers prefer the loaded session's live projection, including after navigation or reconnection, instead of a stale list summary.

Tools, verification commands, CodeGraph, and Workflow resolve paths in the host's **current execution directory**, not permanently in the initial cwd. Project identity and memory ownership remain. A directory change does not bypass access or make independent Chat shared.

## Context and Memory

**Context optimization** is on by default. **Settings → Context and memory → Context optimization** controls supported result shortening, repeat-read references, on-demand tool discovery and original-result preservation. Choose **View original** on a tool card for line ranges, search and head/tail paging; import evidence archives from the Context panel. `context_view` provides file and webpage views, `code_search` supports AST patterns in 16 grammars, and CodeGraph retains indexed code relationships. Disabling optimization keeps existing originals available. [Usage, accounting and migration](context-optimization.md#english)

**Multi-image request repair** is enabled with CMD selected by default and stays collapsed in the same settings group. Expand it to add configured providers, then expand a provider to edit its image count, total image size and retention target: **20 images, 10 MB and 10 retained images** by default. Size counts the Base64 content of the actual request images. Each request is checked; older images are offloaded in batches only when a limit is exceeded, while original files and attachment recall remain available. Requests below the limit keep the existing history unchanged. Retention is a target: the size limit may require fewer images, while the newest unread batch is always protected. If that batch alone exceeds a limit, split the input or adjust the rule. Rules apply to OMD sessions and sessions with OMD enhancements enabled. Disabling the feature or removing a provider restores the existing host limits.

Image offload is independent of text compaction and preserves existing summaries and valid prepared decisions. An offload changes that request's prefix and may affect caching. Cached background preparation only reuses successful snapshots that meet the current image limits; it never rewrites a borrowed prefix and waits if no suitable snapshot exists. BC receives a boundary update when image delivery changes, while Dream, archives and recall remain available.

**Context → Context management** selects OMD or Billion Context (BC) per session; OMD is the default. The current integration targets DSH **0.2.1-rc.2** and the original **billion-context 0.1.202** npm package by [ranxianglei](https://github.com/ranxianglei/billion-context). Install and enable the pinned package in third-party features, then select BC.

Only automatic compression ownership changes. In BC mode, OMD continues archive preparation, Dream, tasks, persona, original/attachment recall, side questions and branch handling. OMD's compression settings stay saved for switching back. In OMD mode, BC's `compress`/`absorb` writers are hidden and rejected; its search, recovery, rules and diagnostics remain available. Explicit material/compaction operations synchronize the BC history boundary. Native tools and PTC retain their own execution routes.

Busy sessions switch at the next request boundary. Returning to OMD first prepares a safe native representation if local history is too large; a failed switch keeps BC active and reports the reason. Rewind cannot reuse future BC summaries. An unavailable BC fails the request locally instead of silently sending uncompressed history. Each request verifies the proxy version because BC has its own updater.

The UI separates BC's outgoing estimate from local history. Independent archive/Dream calls keep their inputs and budgets outside the main BC conversation. Memory-cache preparation still copies the host request prefix; BC's wire rewriting can change cache reuse, and the existing input-budget wait remains in force. Other protocol/platform/version combinations require separate verification. [Detailed workflow](context-workflow.md#omd-与-billion-context)

Background preparation stores facts, source-backed user decisions, and detailed material separately, applying representations at safe request boundaries. Originals, documents, images, and attachments remain; windows are finite. Choose **Permissions → Memory scope** before first send; it then locks:

| Scope | Automatic injection and boundary |
| --- | --- |
| **Session isolation** | No automatic shared-memory injection or project/global propagation; explicit recall remains available. |
| **Project sharing** | Project summaries/material and completed project short memory. |
| **Global sharing** | Compact global short memory and a paged project directory; detail is read on demand. |

Cold sessions use public read-only inspection without activating an Agent, creating a ledger, or starting a model. Scope saving rechecks whether the conversation started. Read failure retains errors, retry, and the original scope.

**Context → Asynchronous compression** defaults to Original asynchronous. Active asynchronous uses a separate request to decide the range. The main model continues; later requests apply only valid completed results. Switching cancels old requests and ignores late results while keeping archives. `/compact` applies a prepared plan, `/compact-p` selects summaries for prepared segments, and `/compact-f` calls a model to summarize again; failure keeps originals. [Mechanism, budgets, original search (Chinese)](context-workflow.md)

`recall({search: 'original', query: 'keyword'})` searches current original events. Cross-session search needs explicit `sessionId`; `query` alone still filters summaries. Results are bounded/paged and retain source locations. Retrieved history is data, not new execution authority.

**Dream** offers session/project/global organization and automatic settings. Global jobs select large folders; an empty selection means all. Custom registries, nested projects, and deleted historical directories share one ownership rule. Partial failure retains successful progress and initial source cutoffs; retry/restart continues unfinished targets, without publishing incomplete parent summaries or marking failure complete. Automatic Dream defaults off, checks every 60 minutes when enabled, and shares 200,000 tokens/day across manual/automatic work. [Dream details (Chinese)](dream-memory.md)

Turning off automatic organization pauses automatic jobs at the next execution check, preventing further dispatch and late publication; requests already sent can still incur usage. Resume the same job manually to retain its progress without re-enabling automatic scheduling. Resuming immediately after Stop waits for the previous model stream to finish cleanup. Action messages and background records follow the actual job outcome.

Moderate is the default frequency. The first automatic preparation waits for 48 eligible source events after recent-tail protection and control-material filtering. After its first success, preparation resumes the usual cadence of 48 new events; minimum text volume and complete tool round trips still apply. Idle preprocessing defaults off, with a 90-second default delay when enabled. Memory-cache mode defaults off. When enabled, preparation and Auto Compact prefer the latest usable successful main-request prefix. If it leaves insufficient room for the task, a retained smaller successful prefix on the same route can be used; the entire request must still fit the input budget. Request growth does not erase valid prefixes or cancel work on the same route. Budget waits explain how to raise the preparation budget or compact manually, while the coordinator shows its prepared-summary count and trigger count. Active asynchronous preparation uses the same prefix protection and preserves the current user-request boundary. Background models can follow or differ from the main model; usage remains chargeable and savings are not guaranteed. [Cache behavior and budgets (Chinese)](context-workflow.md)

## Draft Optimization

Hover over **✨** to open **Light polish, Structure, Step planning**; click the star to toggle automatic pre-send polish. Add requirements/save a preset, inspect, then send. Undo, redo, original recovery, and further refinement remain. Automatic pre-send polish defaults off and adds a current-model call each send without reading attachment contents or the entire history. Changed drafts/attachments, stop, error, timeout, or session switch never auto-send.

Each session retains up to 20 versions. Within the page, switching retains unsent attachments/optimizer history while cancelling unfinished work; returning does not replay. Native admission failure retains the original, versions and pending result together. If another draft is being edited, the complete retained record appears separately without replacing it. Inspecting that record preserves later versions, and a pending result still requires explicit application. Clearing the input during optimization keeps the original available for recovery; a late result never replaces or sends the draft automatically. Refresh/close discards these attachments/versions; the host owns text drafts. Preferences/presets stay in the current browser and synchronize same-origin tabs, not devices. Fixed MIT templates/authors appear in [notices](../THIRD_PARTY_NOTICES.md).

<a id="settings"></a>

<a id="personalities"></a>

## Settings and Saving

Oh My DSH settings use one page, with third-party features on a separate subpage. Switches and selections save immediately; personality text uses its editor's save button. Failed saves show an error and restore stored settings while retaining personality drafts.

Wide windows show an **On this page** outline to the left of the content. Select a group to scroll to it; scrolling updates the active group, and selecting **Advanced** expands it. At smaller available widths, the outline collapses into a group menu at the top. The outline is hidden on the third-party and credits subpages, and returning restores the previous scroll position. The console's Dream settings shortcut also jumps to the corresponding controls.

| Settings group | Common controls |
| --- | --- |
| Features | Workbench, Extensions, interactive answers, agent presets, code understanding and prompt optimization; third-party entry |
| Personality | Global preset, four modules, files and session choices |
| Context and memory | Multi-image request repair, optimization, preprocessing, coordination, caching, Auto Compact, default memory scope and Dream |
| Background models / Global background | Background model routes and manually maintained fixed context |
| Agent | System prompt style, per-chat entry switch, runtime and budget hints, background waits and constraint-first guidance |
| About / Advanced | Versions and feature updates; advanced parameters and history page size under Other |

**System prompt style**, in the Agent group, offers seven choices: OMD default, native DSH, Codex, Cursor, Pi, Grok and ZCode. OMD default remains selected initially. **Enable per-chat prompt style** is off by default; enabling it reveals the selector in OMD/OMD-PTC main-chat permission menus. Chats without a saved choice follow the global selection. Disabling the switch uses the global style while preserving saved choices for re-enabling. Changes apply at the next turn. Personality, tools, tasks and memory retain their own functions. [Pinned sources and adaptations (Chinese)](prompt-adaptation.md).

**Personality preset** selects the global default: Default, Overclock (超频) or Economical (精算). Overclock expands useful reasoning and detail; Economical reduces repetition and unnecessary wording while preserving deliverable quality. The collapsed **Advanced** section manages multiple personalities: create, copy, rename, update, delete, import and export. The editing selection is independent of the global selection, so saving an edit does not switch the global personality. Deleting the selected global preset preserves all its modules in Custom. Copy built-in presets to edit them.

When multiple windows edit personalities, a stale save stops and displays the current settings while keeping the local draft for review and an explicit retry. If another editor deleted that preset, its draft can be saved as a new preset.

Each personality has four modules: **Identity, Language style, Communication, and Answer presentation**. The latter three can inherit defaults; an explicitly empty override adds no preference for that module. Personality preferences do not replace the actual environment, permissions, tool protocols, task controls or memory processing rules.

Use **Copy creation prompt**, give it to an AI with your character idea, and ask for a JSON file following the included format. **Import personality file** creates and selects a new preset; duplicate names are renamed automatically, existing presets are never overwritten, and invalid files show an error. **Export personality file** saves the current editor content for backup, sharing or further AI editing.

**Session personalities** are enabled by default, adding a **Session personality** section to the permissions drawer in OMD and OMAA main conversations. Choose the global default, a specific personality, or Off. Changes apply to subsequent model requests, including in conversations already underway. Choices persist independently for each conversation. Disabling the feature uses the global personality while preserving saved choices for re-enabling. Deleted presets fall back to the global selection with a notice. Child conversations do not show this control. Upgrades preserve an explicit disabled setting. Retired built-in global selections fall back to Default, and conversation selections fall back to the global choice; custom personality content is retained.

Global background is user-maintained. On conflict, **Read latest version**, compare, merge/adopt, then save; reading does not overwrite a draft. Dream does not edit this background.

Choose native DSH or five themes including Glyph, with 29 palettes, backgrounds, section colors, fonts, logos/titles and reduced motion. [Appearance (Chinese)](skins.md)

<a id="runtime-state-and-blockers"></a>

Runtime/budget hints default off, background optimization on, CoT placement on, CFR off. They affect the next request, not permissions. [Background options (Chinese)](runtime-state-background.md)

## Monitoring

The OMD Console overview, call log, and background log share session/time scopes. A persistent SQLite ledger records actual call identity, parent/real-child/background attribution, route, status, error, usage, and duration, with date/model/component filters, trends, groups, and paged details. Write failures retain diagnostics without failing the model call.

**`≥` is a known lower bound, not complete consumption.** Missing input/cache/output is not zero. Unmetered calls retain state but do not plot false zero trends. Cache ratios require complete, consistent disclosures. Context estimates are not provider bills; summed durations may overlap and are not wall-clock elapsed time. Unattributed historical totals remain separate, not distributed across dates/models. [Accounting (Chinese)](monitoring.md)

## CodeGraph

Bundled 1.6.0 prepares `.codegraph/` in the current code directory without a global CLI. Ask “Which functions handle login?” Queries follow the current execution directory and nearest ancestor index; use explicit `projectPath` for another repository. First query waits for preparation. Retry failures; ordinary file/search tools remain.

If tool preparation fails, CodeGraph settings retain the original cause. Opening another chat does not repeat the failed preparation. After fixing the environment, choose “Prepare again” or disable and re-enable CodeGraph. A disconnected query connection is replaced before the next query; failed queries are never replayed automatically.

Connections watch changes, release when idle, and catch up later. Disable/uninstall stops owned processes but keeps indexes. They are outside DSH session backups and normally not committed. Source results enter model requests; structure is not compilation/testing. Explicit read-only/no-index directories must not be prepared.

<a id="computer-use"></a>

## Computer Use

OpenCU is bundled by default. It provides real browser/native target discovery, observation, background-first input, monitoring and annotations. Complete UI requires matching Host, Client and preload adapters; plugin installation alone does not patch stock DSH. [Guide (Chinese)](computer-use.md) · [Integration boundaries](plugin-compatibility_EN.md#opencu).

Completed, failed and canceled downloads retain their results when older progress arrives. After a restart, unconfirmed active downloads stay unavailable until live desktop status returns, without automatically downloading again. Missing files keep their history and file errors without blocking other downloads; clearing history keeps the files. Exact pause/resume ordering also needs the matching updated host adapter.

<a id="get-started-with-computer-use"></a>

### Get Started

After matching the build and permissions, ask the assistant to open a site, inspect a page or work with a connected app. Choose embedded, extension-connected or automation browsers separately; first extension pairing requires the user's Allow. Viewing is not takeover, closing a preview is not stop, and continuation starts with a fresh observation. [Operation and annotations (Chinese)](computer-use.md). Old 0.10 users should keep using the [fixed-tag instructions](https://github.com/gulagala001/oh-my-dsh/blob/v0.2.1-alpha.1.omd.0.10.0/docs/usage.md#computer-use).

### Platforms and Requirements

Non-CU work targets matching DSH on Windows/macOS/Linux without native desktop dependencies; this candidate remains unaccepted. Old public 0.10 prerequisites follow its release docs. This page expands no Linux desktop, Windows multi-screen, or account promise. New CU's common single-screen journeys and Windows 125%/150%/200% need separate real-device results.

## Extension Features and Third-party

Open **Settings → Oh My DSH → Common** for DeepSeek Workbench, interactive answers, and agent presets. Community features have their own **Third-party** subpage. Each compact row has a short description and a switch: first use installs and enables the feature; switching off disables it while retaining configuration and data. Version, source, update, and uninstall controls are under **Details**. Built-in btw and rewind are no longer duplicated as recommendations.

The current profile’s native manager handles installation and activation, retaining exact host, fixed release, and SHA-256 checks. Incompatible entries or additional configuration requirements are explained. Automatic updates default off and apply only to installed, enabled features; they do not cross hosts, approve install scripts, or restart DSH. Lost acknowledgements trigger a fresh state read rather than duplicate installation.

After queuing or preflight, updates recheck current state before removal or installation. Opting out, starting a task or disabling the feature prevents an automatic update that has not begun applying. If the installed version or enablement changes during a manual update, the current choice is preserved and a new operation is required. OMD self-updates also recheck tasks, known release information and native installation state; “Install anyway” does not bypass these conditions.

The current source enables **Settings → Oh My DSH → About → Plugin installation preflight** by default. Installation, updates and activation through the running host’s native plugin manager first check loading, the composer entry and Settings in a temporary DSH profile. The original marketplace remains open; passing checks continue automatically. A failed check offers cancellation, a copyable AI repair prompt, or “Install anyway.” Continuing bypasses only this check; native version requirements, build-script approval and installation rules still apply. Turning the switch off restores the original path for new requests.

Only one check runs at a time. It reuses an available browser and native package-manager caches without automatically downloading a browser or copying conversations, account credentials or private plugin data. Preparation is bounded to 120 seconds and runtime checking to 45 seconds. Missing browsers, external configuration and resource limits are reported as incomplete checks, never as compatibility passes. Temporary files are removed after processes exit; owned leftovers from an interrupted run are reclaimed at the next startup or check. Error details remain only with the current operation, which cancels after five minutes without a decision. Reports and screenshots do not accumulate; shared caches required by native installation remain intact.

The integration currently covers the running native manager, including native plugin controls, tool calls and desktop dsh-market calls through that service. Web markets that bypass it, external `dsh plugin` / npm / pnpm commands and manual directory changes are not automatically intercepted. No global pre-start host gate is installed. [Coverage and validation](plugin-compatibility_EN.md#recommendations-updates-and-data)

**IUI, OMAA, Subscriptions and Intent remain independent projects**, each needing a matching host build. OMD retains their entries, tools, configuration and user data rather than taking over their accounts or business features. [Compatibility](plugin-compatibility_EN.md)

**DeepSeek Workbench** is bundled and enabled by default. It opens web chat/platform and imports extractable history into native conversations, retaining the original webpage; the user sends the next message. Embedded pages, persistent login and downloads require matching host bridges. [Usage (Chinese)](deepseek-workbench.md)

**Extensions** is bundled and enabled by default. It adds Skills, MCP, Instructions, Commands and Hooks tabs to the **Plugins** page: switch skills, manage MCP servers and single tools in `~/.dsh/mcp.json`, edit AGENTS.md / CLAUDE.md, define `/commands` from Markdown templates and configure hooks in the Claude Code format. [Usage (Chinese)](extensions.md)

<a id="optional-intent-component"></a>

Intent understanding, Subscriptions, IUI, and OMAA are optional. Do not invent releases without fixed artifacts/checksums. [Recommendations/adaptation (Chinese)](plugin-submissions.md)

## Side Questions and Turn Rewind

### Temporary sidebar chat

Run `/侧栏` to open an independent temporary text chat using the currently selected model. It starts without the main conversation context, keeps messages in memory, and stops the response and clears them when closed. This text chat does not execute workspace tools. `/侧栏（网页版）` opens a temporary chat with the DeepSeek website account; closing deletes its own website conversation, and a failed cleanup keeps the panel open for retry. Both preserve the main conversation and its position.

`/btw question` uses bundled [DSH BTW](https://github.com/gulagala001/dsh-btw) to open a native popover above the main composer. It uses the main conversation snapshot and model, with history, follow-ups and independent cancellation. Closing the popover keeps the answer running; Stop cancels only the side request and preserves text already received. Only explicitly completed, untruncated replies enter follow-up context; failed or interrupted replies can be retried manually. The latest 20 exchanges per main conversation stay in window memory and clear on reload. Side questions execute no tools and do not enter the main conversation or Dream. Maintained by gulagala001. [Attribution](../THIRD_PARTY_NOTICES.md#bundled-dsh-btw)

OMD bundles `@gulagala001/dsh-undo-plugin`. Double Esc while idle or `/rewind` opens the rewind list above the composer; `/undo` restores the last rewind. Both require confirmation. While running, double Esc keeps the Stop behavior. The action next to a user message's Copy button opens confirmation, then withdraws that message and the following conversation in place. Available checkpoints also restore tool-generated file changes; older messages without backups explicitly show conversation-only recovery. Text, images and files return to the composer. Undo restores the previous conversation and files. External changes block conflicting restores and preserve the backups. This OMD version and the standalone plugin share one service and action; disabling either retains the remaining owner's functionality. Avoid enabling other history-mutating rewind plugins together. The old Turn Rewind recommendation and dedicated compatibility layer have been removed; existing third-party installations and data are retained.

## Data and Maintenance

Rewind, undo and failure recovery use one historical cutoff for tasks, original-wording excerpts and verification evidence. Tools, the task dock, context and completion checks read the same native task record. Replayed messages are not counted as new user requirements and cannot resume paused reminders within a turn. Existing quotation numbers remain stable and may have gaps where replayed copies were skipped. Restored evidence is historical, not a fresh verification run. Legacy message-only snapshots without an event cutoff do not infer or overwrite task records.

Before a tool starts, rewind backup maintenance and workspace locks each wait at most 30 seconds. A timeout returns an error without admitting a tool that has not obtained its lock. Cancellation releases queued backups that have not started; active backups finish their cleanup, and workspaces being restored reject new tools. This applies to Standard, PTC and other modes using the same rewind service.

The 2 GiB backup target applies to idle collection. A separate default 4 GiB write ceiling checks physical backup content and indexes under the shared writer lock across instances. Existing recovery records are not forcibly deleted to meet it; recovery metadata and compaction temporary copies are separate. Captures before and after tools cover the entire eligible workspace, so unchanged files in large directories may be stored temporarily before collection. Short operations do not postpone a scheduled cleanup. Backup writes, compaction and restore temporary files check for at least 512 MiB of remaining free space. Low space stops new backups while normal tools continue, with an explicit record that the affected file changes cannot be safely rewound. Interrupted recovery retains its transaction and backups. Do not manually delete `$DSH_HOME/rewind-plus/v1` during recovery.

Personalities, rewind backups, workflows and website imports retain their own data. Copying only `oh-my-dsh/` does not cover every feature; include the locations in [plugin data ownership](architecture_EN.md#data-retains-its-owner).

Use actual `DSH_HOME` (normally user `.dsh` for Web), OMD under `oh-my-dsh/`, source default repository `data/dsh/`. Back up profiles, credentials, sessions, attachments, context, memory together. Dream uses `dream-v1/memory.sqlite`, monitoring `monitor-v1/usage.sqlite`; retired automatic memory stays read-only. External projects/indexes need separate backups. Disable/uninstall does not clear user data.

## Versions and Update Notices

Current/remote versions, progress, errors, and restart states remain separate. Green is ordinary update, red required fix. Checks make no model calls or conversation uploads; failure is not “latest.” Local `unpublished` is excluded and rejected again before install. Historical sorting/deduplication follows version rules rather than dates or old highest numbers. Upgrade the host separately.

<a id="development-and-verification"></a>
<a id="idle-preprocessing-and-image-budget"></a>

See the [short development guide](development_EN.md) and [context/image budgets (Chinese)](context-workflow.md).

Responses routes use the bundled response-ID reuse plugin. Storage confirmation from normal responses and exact history extensions allow incremental input; unavailable continuation falls back to full context. It adds no UI, probe calls or generation stop conditions. Unloading its plugin entry removes interception.

Responses continuation verifies stored response history automatically. Retries, background preparation and concurrent branches retain reusable parent IDs; full replay and cold recovery use the verified history representation. Unverified and encrypted reasoning retain native handling, and original conversation logs remain intact. Storage readback does not invoke the model.
