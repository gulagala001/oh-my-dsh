<a name="readme-top"></a>

<h1 align="center">DSH BTW</h1>

<p align="center"><strong>Ask a side question while the main task continues.</strong><br>DeepSeek Harness plugin</p>

<p align="center"><a href="README.md">简体中文</a> · <strong>English</strong></p>

<p align="center">
  <a href="https://github.com/gulagala001/dsh-btw/releases/tag/v0.1.2-dsh.0.2.1-rc.2"><img alt="0.1.2" src="https://img.shields.io/badge/release-0.1.2-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/dsh-btw/releases"><img alt="GitHub total downloads" src="https://img.shields.io/github/downloads/gulagala001/dsh-btw/total?style=flat-square&amp;label=GitHub%20downloads&amp;color=0969da"></a>
  <a href="#readme-install"><img alt="DSH 0.2.1-rc.2" src="https://img.shields.io/badge/DSH-0.2.1--rc.2-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/dsh-btw/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/gulagala001/dsh-btw?style=flat-square&amp;color=0969da"></a>
</p>

<p align="center"><a href="#readme-install"><strong>Get started</strong></a> · <a href="docs/install.md">Docs</a> · <a href="https://github.com/gulagala001/dsh-btw/issues">Report an issue</a></p>

<p align="center"><a href="docs/images/side-chat.png"><img src="docs/images/side-chat.png" alt="旁聊与历史列表 / Side chat and history" width="880"></a></p>

<a name="readme-install"></a>

## Quick start

**Required environment：** DSH **0.2.1-rc.2**, Node.js **22.19+**.

Side chat uses your existing model service and incurs normal usage. It does not execute tools. History stays in window memory and is lost on refresh.

### 1. Install

Open **Plugins → Add plugin** in the DSH instance you use, then paste:

```text
https://github.com/gulagala001/dsh-btw/releases/download/v0.1.2-dsh.0.2.1-rc.2/gulagala001-dsh-btw-0.1.2-dsh.0.2.1-rc.2.tgz
```

Wait for active tasks to finish, then follow the host’s activation/restart prompt. Keep your existing profile and data. See the [installation guide](docs/install.md) · [SHA256SUMS](https://github.com/gulagala001/dsh-btw/releases/download/v0.1.2-dsh.0.2.1-rc.2/SHA256SUMS).

### 2. Try this first

After sending a message in the main conversation, enter:

```text
/btw Explain the main trade-off in the previous plan in two sentences.
```

**Success looks like：** A side answer appears above the composer. The main task continues and the side answer is not appended to its history.

## Side questions without stopping the task

- Enter `/btw question` to ask directly, or `/btw` to open the popup and history.
- The popup supports Markdown, code copying and follow-ups using existing main-conversation context.
- Stopping side chat cancels only that request. Esc and Close hide the popup while the main task continues.

The snapshot includes completed tool results, not the main answer currently being generated. Requests preserve the main message prefix, previous actual model configuration, tool declarations and cache linkage, appending only the side question. Actual cache hits depend on the model service. Side chat neither executes tools nor writes to main-conversation history.

## FAQ

<details>
<summary>How long is side-chat history retained?</summary>

It is separated by main conversation and limited to the latest 20 entries. It stays only in the current window’s memory and disappears on refresh, window closure or plugin disablement.

</details>

<details>
<summary>Why is an initial question or an attachment rejected?</summary>

Send at least one main-conversation message first to establish context. Side chat accepts text only. If the composer contains attachments, it preserves the draft and explains the limitation instead of dropping attachments.

</details>

<details>
<summary>Why does an answer continue after closing the popup?</summary>

Closing only hides the UI. Use Stop inside the popup to cancel the side request; the main task is unaffected.

</details>

## Compatibility, development and license

Targets DSH 0.2.1-rc.2 and Cordis 4.0.5. Verified in the native Web client on macOS; Windows, Linux and the Electron shell have not completed real-device validation. The package is `@gulagala001/dsh-btw`, distributed through fixed GitHub Releases.

```bash
npm ci
npm run build
npm test
```

The frontend uses native DSH components and composer extensions. The backend reads a read-only context snapshot and sends a separate streaming request. Licensed under [MIT](LICENSE).

## Documentation and support

| I want to | Where to go |
| --- | --- |
| Install, update or remove | [Installation guide](docs/install.md) |
| Learn the features and limits | [Documentation](docs/install.md) |
| Read release changes | [Releases](https://github.com/gulagala001/dsh-btw/releases) |
| Report a problem | [Issues](https://github.com/gulagala001/dsh-btw/issues) |

For a bug report, include the full DSH and plugin versions, the entry point, minimal reproduction steps, and expected versus actual behavior. Remove private data before sharing logs or screenshots.

<p align="center"><a href="#readme-top">Back to top</a> · <a href="https://github.com/gulagala001/dsh-btw/releases">Versions and downloads</a> · <a href="https://github.com/gulagala001/dsh-btw/issues">Feedback</a></p>

[Documentation structure and contributing](docs/documentation.md)
