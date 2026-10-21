# Your First Task

[简体中文](getting-started.md) · [Docs index](README_EN.md) · [Public installation](../README_EN.md#readme-install) · [Usage](usage_EN.md) · [Troubleshooting](troubleshooting_EN.md)

Start with an installed, fully restarted, matching environment. Current release **`0.2.1-rc.2.omd.0.19.0` / DSH `0.2.1-rc.2`** bundles OpenCU `2.0.6`. Check [installation and version matching](install_EN.md) first. Historical 0.10 users should follow their fixed-tag docs.

## 1. Check Actual Versions and Model

Open the version panel and read **Current version**. Latest version is remote information; public calculation excludes `unpublished`. Do not pair old public packages with newer hosts or choose across host versions using `latest`. Desktop/Web profiles differ: check full host, plugin enablement, actual data directory, and source.

OMD uses host models/credentials and supplies no account. File tasks need native tool calling; screenshot interpretation also requires image input. Text/file use does not require preparing desktop control or a Chrome extension first.

## 2. Choose Conversation, Directory, and Scope

Choose **Oh My DSH** for a new session. Saved sessions keep their preset. Select an existing workspace, or clear its label with **×**. Projectless Chat creates a file directory only on first send, then reuses it; unsent conversations create none.

Choose memory scope before sending; it then locks:

| Scope | Purpose and boundary |
| --- | --- |
| **Session isolation** | No automatic shared-memory injection/propagation; explicit historical recall remains. |
| **Project sharing** | Project material and completed short memory for later conversations. |
| **Global sharing** | Compact global memory and a paged project directory; detail read on demand. |

An automatic Chat file directory is **not a Dream project**. Descendants not added to a real workspace stay isolated. Directory changes/deletion do not expand sharing. [Dream (Chinese)](dream-memory.md)

Installation defaults to full file/command access and no execution approvals; **explicit profile overrides win**. Check current execution directory and actual permissions. Memory sharing is not filesystem access. Cold context/scope reads do not activate an Agent or create a ledger; saving rechecks whether the conversation started.

## 3. Complete a Small File Task

In a usable installed environment, try:

> Read the README in this directory and explain its purpose, startup steps, and requirements. Include only what you actually read; mark unspecified details as “not specified.” Save project-start.md and open it for inspection.

Check the right file, successful actual tool result, and accessible deliverable. Do not invent startup instructions. Use a prepared non-sensitive file if there is no README. This checks model/file work, not every component, platform, or the new candidate.

## 4. Find Common Controls

| Control | Purpose/default |
| --- | --- |
| Star | Refine an unsent draft and keep versions; each call incurs usage. Automatic polish defaults off. |
| **OMD Console** | The single right-sidebar entry: overview, context (prepare → hub → replace, compaction), memory (automatic Dream off; empty folder selection means all), call log, background log. `≥` is a lower bound; unknown is not zero; background calls also cost usage. New-session empty state is normal. |
| Composer info bar | Native turn/token readings plus context and Dream job items; each opens the matching console section. |
| **BT** | Task reminders on; verification reminders off. “View task evidence” opens requirements, status, and evidence. |
| Model/Fast | Ultra has Workflow / Agent Team / Free submodes and prefers `xhigh`, otherwise highest. Agent Team requires DSH to enable it. Fast needs actual matching Subscriptions/model support. |
| **Appearance** | Five themes, palettes, fonts, backgrounds, reduced motion. |
| **Base components** | CodeGraph readiness and retained native/third-party entries. |

Workbench uses native content tabs alongside files/terminals. Tools, evidence, CodeGraph, and Workflow follow the current directory. Ordinary OMD-PTC operations use `run_code`, with four direct background controls in matching scopes. [Full usage](usage_EN.md)

## 5. DeepSeek and CU Boundaries

DeepSeek Workbench provides web chat and platform entries and imports extractable web history into native conversations. You send the next message; there is no auto-send. See [conditions and limitations (Chinese)](deepseek-workbench.md).

New OpenCU is bundled by default. Open **Settings → Computer & browser** to inspect backends, OS permissions and browser resources; pair Chrome/Edge on first use if needed. The complete embedded browser and native monitor need matching host adapters. Plugin installation does not automatically patch stock DSH. Start with a nonsensitive task and check the actual page. [Setup and boundaries (Chinese)](computer-use.md)

IUI, OMAA and Subscriptions remain separate plugins. Match complete versions and their [integration boundaries](plugin-compatibility_EN.md).

Keep complete versions, actual entry, and the first complete error. Use [symptom troubleshooting (Chinese)](troubleshooting.md), rather than deleting data or bypassing version checks.
