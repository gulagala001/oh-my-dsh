# DeepSeek Workbench

[简体中文](README.md) · [User guide](docs/usage_EN.md) · [Desktop host](docs/desktop-host_EN.md) · [Release notes](docs/releases.md)

Use DeepSeek web chat, temporary sidebar chat and the API Platform inside **DeepSeek Harness**, and move website history into a DSH conversation you can continue.

![DeepSeek Workbench](docs/images/temporary-chat.png)

Temporary sidebar example with synthetic conversation content.

## Features

- **Web chat:** Open DeepSeek from the sidebar into the main content area, browse history, send messages, toggle DeepThink and Search, and upload attachments.
- **Temporary sidebar chat:** Run `/侧栏（网页版）` to ask questions in a separate website conversation alongside the main chat. Closing it deletes that temporary website conversation.
- **API Platform:** Open usage, balance and the API Platform from account settings. Compatible host account interfaces reuse the current DSH authorization.
- **Continue in DSH:** Import website messages and readable attachments into a new DSH conversation, then continue with DSH models and tools.

Ordinary web chats retain their website history. A temporary sidebar owns its own website conversation and waits for deletion before closing. If deletion fails, its panel stays open for retry. The main chat and other website conversations keep their own state.

## Install

Requires **DSH 0.2.1-rc.2**, **Cordis 4.0.5** and **Node.js ≥22.19**. This release targets these exact host versions.

Open **Plugins → Add Plugin** and paste the [pinned package URL](https://github.com/gulagala001/dsh-deepseek-workbench/releases/download/v0.1.0-dsh.0.2.1-rc.2/dsh-deepseek-workbench-0.1.0-dsh.0.2.1-rc.2.tgz), or run:

```bash
dsh plugin --profile desktop add "https://github.com/gulagala001/dsh-deepseek-workbench/releases/download/v0.1.0-dsh.0.2.1-rc.2/dsh-deepseek-workbench-0.1.0-dsh.0.2.1-rc.2.tgz"
```

Replace `desktop` with your actual profile and restart that instance after active tasks finish. Verify the download using [SHA256SUMS from the same release](https://github.com/gulagala001/dsh-deepseek-workbench/releases/download/v0.1.0-dsh.0.2.1-rc.2/SHA256SUMS). Packages are distributed through pinned GitHub Releases in this repository.

**Use DSH desktop for embedded web chat.** Standard rc.2 desktop provides isolated pages and page reading. Persistent sign-in across restarts, website downloads and extended platform pages use the included desktop source adapter. The plugin reports capabilities detected in the actual host. Browser-only DSH provides an external website entry point. See the [desktop host guide](docs/desktop-host_EN.md).

## Get started

1. Open **DeepSeek web chat** from the left sidebar and sign into the website. Website chat login and DSH API Platform authorization are managed separately.
2. Start an ordinary chat with the new-chat button or resume website history. DeepThink, Search and attachments are handled by the website.
3. Run `/侧栏（网页版）` in the DSH composer for a temporary question. Closing waits for deletion of that temporary website conversation.
4. Click **Continue in DSH** in an ordinary web chat to import its history. Review the result before sending the next message.
5. Open **Settings → Account → DeepSeek API Platform** for account and platform features.

Migration retains readable conversation content and reports unavailable attachments. Imported messages do not replay instructions or tool execution from the website. See the [user guide](docs/usage_EN.md).

## Update and uninstall

Install the pinned package for the desired version to update. To uninstall, run `dsh plugin --profile desktop remove dsh-deepseek-workbench`, then restart that instance. Close temporary panels and confirm cleanup before uninstalling. Imported DSH conversations and ordinary website history remain stored by their respective services. Website login storage is managed by the desktop host.

## Development

```bash
pnpm install --frozen-lockfile --ignore-scripts --config.strict-dep-builds=false
pnpm build
```

`npm test` runs focused checks. `npm pack` rebuilds the client and audits actual Git files, complete history and tags, and the actual archive. Packaging requires this project's own complete Git repository. CI applies the same gate.

MIT licensed. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for third-party attribution.
