# OpenCU

**Let AI work in real browsers and desktop apps while you watch, stop, take over, and resume.**

[简体中文](README.md) · [English](README_EN.md) · [Install](#install) · [Usage](docs/usage_EN.md) · [Integration](docs/integration_EN.md)

![OpenCU's real browser workspace: conversation alongside the page](docs/images/showcase-browser.png)

*Actual UI capture of a fictional Qinghe Studio stationery restock demo; product thumbnails are AI-generated assets. It shows new unpublished local 1.6.1 work. The links install released 1.3.0, with different entry points, layout, and runtime. [Version differences](#versions-and-platforms).*

OpenCU is an independently installable Computer Use project for browser and desktop control, live previews, page annotations, and file delivery. Current releases use DSH's models, sessions, and tool loop; integrators can reuse the same implementation through public modules. [Oh My DSH](https://github.com/gulagala001/oh-my-dsh) is one complete integration of OpenCU. Standalone installation does not require OMD.

## Install

Finish active tasks and stop DSH, then select a fixed release for your **full host version**. Requirements: Node.js ≥22.19, pnpm 11.23.0, and Git; use PowerShell 7 on Windows. Keep your existing profile, `DSH_HOME`, models, and sessions.

| DSH host | Fixed release | Plugin package |
| --- | --- | --- |
| `0.2.1-alpha.1` | [v1.3.0](https://github.com/gulagala001/opencu/releases/tag/v1.3.0) | [opencu-1.3.0.tgz](https://github.com/gulagala001/opencu/releases/download/v1.3.0/opencu-1.3.0.tgz) |
| `0.2.0-rc.2` | [v1.3.0-dsh.0.2.0-rc.2](https://github.com/gulagala001/opencu/releases/tag/v1.3.0-dsh.0.2.0-rc.2) | [opencu-1.3.0.tgz](https://github.com/gulagala001/opencu/releases/download/v1.3.0-dsh.0.2.0-rc.2/opencu-1.3.0.tgz) |

Both packages report `1.3.0`, but their SDK, Chat snapshot, and lockfile match different hosts and are not interchangeable. Release pages include source and `SHA256SUMS.txt`. Do not select through `releases/latest` or the identical asset filename alone.

DSH `0.2.1-alpha.1`:

```sh
npx --yes @deepseek-ai/dsh@0.2.1-alpha.1 plugin --profile web add github:gulagala001/opencu#v1.3.0
npx --yes @deepseek-ai/dsh@0.2.1-alpha.1 --profile web
```

DSH `0.2.0-rc.2`:

```sh
npx --yes @deepseek-ai/dsh@0.2.0-rc.2 plugin --profile web add github:gulagala001/opencu#v1.3.0-dsh.0.2.0-rc.2
npx --yes @deepseek-ai/dsh@0.2.0-rc.2 --profile web
```

Open the login link printed on startup, then **Computer → Runtime and permissions** in the composer. Version 1.3.0 uses local Chrome/Chromium; first installation of native desktop control builds locally, requiring Apple Command Line Tools on macOS or the .NET 10 SDK on Windows. See [Usage](docs/usage_EN.md#get-started) and [Windows](docs/windows_EN.md). Desktop users should use the app's own plugin manager or matching CLI and its actual profile.

## Start Working

Select `@Browser`, a connected `@Chrome` tab, or a desktop app in the conversation. State the goal and completion criteria:

> Prepare Qinghe Studio's restock order with Senye Stationery. Check blue notebooks, green document folders, and pencil-and-ruler sets. I will take over to fill in delivery date and notes; read the result after saving and keep the page.

The demo uses a controlled model and real tools. After manual save, the tool reads `2026-10-18`, contact “林夏” (Lin Xia), note “请在下午送达，纸箱分批标记。” (afternoon delivery with cartons labeled by batch), and tax-inclusive `¥3480`. This run uses the control interface for stop/resume transitions; [Showcase](docs/showcase_EN.md) records the actual actions and OMD configuration.

Selecting a target returns its initial screen and controls. Watch through the conversation preview or right Computer pane. For login, verification challenges, or manual edits, choose **Stop and take over**, then **Resume assistant control** when ready. Visual work requires an image-capable model; OpenCU does not switch models automatically.

| Task | Actions | Results to inspect |
| --- | --- | --- |
| Forms and web administration | Read controls, type, click, scroll, upload, and download | Page state, screenshots, operation results, and files |
| Keep an existing login | Connect Chrome and select the original tab | Original tab and actual login state |
| Page changes and design feedback | Region/element annotations, temporary style previews, responsive sizes | Images and explanation attachments |
| Desktop app work | Discover windows, read controls, use keyboard and mouse | Real app state and live previews |
| Deliver web material | Save MHTML snapshots and loaded assets | Persistent attachments and failure lists |

[Showcase](docs/showcase_EN.md) connects each problem to actions and results. [Usage](docs/usage_EN.md) covers stopping, recovery, downloads, configuration, and troubleshooting.

## Capabilities

- **Browser workspace**: tabs, address bar, find, downloads, device sizes, and live view, with a profile separate from your everyday browser.
- **Native apps**: macOS and Windows discovery, accessibility reads, screenshots, clicking, dragging, typing, and pasting.
- **Control handoff**: assistant cursor, stop, manual takeover, and resume. Watching does not acquire control.
- **Feedback and delivery**: window sharing, annotations, temporary CSS previews, page/asset export, and DSH session attachments.
- **Page diagnostics**: read observed network traffic and, where requirements are met, call WebMCP tools exposed by a page.

OpenCU controls **the machine running the DSH backend and local control programs**. Accessing DSH through a remote web page does not let the plugin directly control the visitor's other computer.

## Versions and Platforms

| Version | Status and host | Browser and installation differences |
| --- | --- | --- |
| 1.3.0 | Public; matched builds for DSH `0.2.1-alpha.1` / `0.2.0-rc.2` | Local Chrome/Chromium with a separate profile; native components require a first source build |
| New local 1.6.1 work | This round's changes are unpublished and absent from OpenCU's current public main; this demo uses a local DSH `0.2.0-rc.2` build | Unified Browser entry, official prebuilt Electron `44.7.0`, plugin-owned browser, site permissions, persistent history/downloads, profile and CSV password import, and login window; complete release packages are designed to carry prebuilt native components |

New screenshots do not mean these features are in 1.3.0. This documentation update does not release 1.6.1 or provide nonexistent download links. [1.3.0 release notes](docs/release-1.3.0.md) describe the public version.

OMD main includes the OpenCU 1.6.1 browser and runtime changes. These captures show a corresponding local build. Identical version strings do not establish identical implementations or a new package release.

| Platform | Public 1.3.0 requirements | Scope and limits |
| --- | --- | --- |
| macOS | Desktop: macOS 14+, Apple Command Line Tools, Accessibility and Screen Recording permissions | Native apps and browser; background input and app compatibility depend on the actual machine |
| Windows | PowerShell 7; .NET 10 SDK for initial desktop/Chrome connection setup; Windows 10 2004+ for desktop | Earlier validation covers single-display 125%, 150%, and 200%; local 1.6.1 has not been tested on a real Windows device in this round; mixed-DPI displays are outside scope |
| Linux | Available Chrome/Chromium | Browser only; no native Linux desktop control |

Implementation, earlier validation, and current device testing are distinct. WebMCP requires a protocol-capable Chromium 153+ connection; local Electron 44.7.0 does not automatically provide it. Protected cookies and passwords are not guaranteed to migrate fully. See [Credentials and login](docs/usage_EN.md#local-161-browser-preview).

## Integrate into a Program

The public backend entry `opencu/integration` exports `acquireComputerUse(ctx, options)`. The client source entry `opencu/client-source` exports `applyComputerUseClient(ctx, options)`. These use DSH/Cordis services and lifecycle to share runtime, tools, and UI across a plugin or workspace.

```js
import { acquireComputerUse } from 'opencu/integration';

export const name = 'my-computer-use-integration';
export const inject = ['llm', 'agents', 'sessions', 'settings', 'sessionProjections', 'tools'];

export async function apply(ctx, config) {
  await acquireComputerUse(ctx, { config, namespace: 'opencu' });
}
```

DSH supplies `ctx`. There is currently no general MCP server release that arbitrary MCP clients can add directly; internal native transport is not an external integration product. Dependencies, client bundling, configuration ownership, and disposal are covered in [Integration](docs/integration_EN.md).

### Coexist with Oh My DSH

Standalone OpenCU and a matching OMD integration share runtime, tools, and previews. Removing one owner keeps the other working. Explicit OpenCU settings override inherited OMD values; duplicate authorization or data copies are unnecessary.

For existing installations, the default data path remains `DSH_HOME/trisoul-x/computer-use/`, and some extensions, apps, protocols, and Chrome tab groups keep legacy names. These compatibility identifiers do not restrict standalone use or integration.

## Configure, Update, and Remove

DSH's `opencu` settings include enablement, browser executable, Chrome data root, native binary/socket, and data directory. Restart DSH after path changes. [Configuration](docs/usage_EN.md#configuration) lists all fields.

To update, finish tasks, stop the service, repeat the matching fixed-tag install command, and start the same profile. Removal example:

```sh
npx --yes @deepseek-ai/dsh@0.2.1-alpha.1 plugin --profile web remove opencu
```

Use the `0.2.0-rc.2` CLI for rc.2. Removal preserves sessions and local data. Remove Chrome connection and desktop runtime separately in **Runtime and permissions**, keeping shared components when another integration needs them. [Full instructions](docs/usage_EN.md#update-and-remove).

## Documentation and Development

| Document | Contents |
| --- | --- |
| [Usage](docs/usage_EN.md) | Daily flows, previews, handoff, configuration, login, and FAQ |
| [Showcase](docs/showcase_EN.md) | Real workspace, handoff, and integration scenarios |
| [Integration](docs/integration_EN.md) | Actual exports, DSH services, and shared lifecycle |
| [Windows](docs/windows_EN.md) | Installation, Chrome, native desktop, and WSL |
| [Development](docs/development_EN.md) | Fixed source versions, builds, tests, and contributions |
| [Documentation index](docs/README_EN.md) | Both languages and release records |

Report issues on [GitHub Issues](https://github.com/gulagala001/opencu/issues) with full OpenCU/DSH versions, platform, entry point, and error. Third-party notices are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
