<a name="readme-top"></a>

<h1 align="center">DSH Response ID Reuse</h1>

<p align="center"><strong>Stop resending the whole history on every turn. Send only what is new, plus the previous response ID.</strong><br>A DeepSeek Harness plugin</p>

<p align="center"><a href="README.md">简体中文</a> · <strong>English</strong></p>

<p align="center">
  <a href="https://github.com/gulagala001/dsh-response-id-reuse/releases/tag/v0.1.9-dsh.0.2.2-rc.3"><img alt="DSH Response ID Reuse 0.1.9" src="https://img.shields.io/badge/release-0.1.9-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/dsh-response-id-reuse/releases"><img alt="GitHub downloads" src="https://img.shields.io/github/downloads/gulagala001/dsh-response-id-reuse/total?style=flat-square&amp;label=GitHub%20downloads&amp;color=0969da"></a>
  <a href="#readme-install"><img alt="DSH 0.2.2-rc.3" src="https://img.shields.io/badge/DSH-0.2.2--rc.3-0969da?style=flat-square"></a>
</p>

<a name="readme-install"></a>

## Install

**Requires:** DSH **0.2.2-rc.3** and Node.js **24.9.0+**.

In DSH, open **Plugins → Add plugin** and paste:

```text
https://github.com/gulagala001/dsh-response-id-reuse/releases/download/v0.1.9-dsh.0.2.2-rc.3/gulagala001-dsh-response-id-reuse-0.1.9-dsh.0.2.2-rc.3.tgz
```

Checksums: [SHA256SUMS](https://github.com/gulagala001/dsh-response-id-reuse/releases/download/v0.1.9-dsh.0.2.2-rc.3/SHA256SUMS). It works as soon as it is installed and has no settings. To go back to the original behavior, disable or remove it on the Plugins page.

## What it does

When your provider uses the OpenAI Responses API and stored the previous response, the plugin adds `previous_response_id` to the next request and sends only the new messages. Long conversations, and conversations with images, resend far less.

- No provider list to maintain and no test messages. The plugin learns from normal responses whether the provider supports this and only turns it on when it does.
- The main conversation, background tasks and parallel subagents each keep their own response IDs.
- If an ID has expired or the provider did not store it, that request sends the full history instead, and the next one tries to continue again.
- On a temporary provider error, continuation pauses for 1 minute, then one normal request tries again. Repeated errors extend the pause up to 15 minutes. Full history is sent during the pause.
- DSH conversation logs are never rewritten.

## FAQ

<details>
<summary>Does my provider support it?</summary>

Any provider that uses the OpenAI Responses API and stores responses works. Other providers are unaffected; requests look the same as without the plugin.

</details>

<details>
<summary>Will it cost more?</summary>

Normally it sends less. When continuation fails, the request is sent again with full history, and the provider may bill the failed attempt too.

</details>

## Development and license

Development commands and module notes are in [CONTRIBUTING.md](CONTRIBUTING.md); changes are in [CHANGELOG.md](CHANGELOG.md). Code is [MIT](LICENSE) licensed.

When reporting a problem, include your DSH and plugin versions, the provider, the steps, and what you expected versus what happened. Remove keys and personal data from logs first: [Issues](https://github.com/gulagala001/dsh-response-id-reuse/issues).
