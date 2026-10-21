# dsh-undo-plugin

English | [中文](README.zh.md)

Rewind conversations and workspace files in [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness), with undo.

![Native rewind list above the composer](docs/images/rewind.jpg)

## Install

Requires **DSH 0.2.1-rc.2** and **Node.js 22.19+**.

Open **Plugins → Add Plugin** and paste the [release package URL](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.0-dsh.0.2.1-rc.2/gulagala001-dsh-undo-plugin-0.1.0-dsh.0.2.1-rc.2.tgz), or run:

```sh
dsh plugin --profile web add https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.0-dsh.0.2.1-rc.2/gulagala001-dsh-undo-plugin-0.1.0-dsh.0.2.1-rc.2.tgz
```

Replace `web` with your profile and restart that instance after active tasks finish. Verify the download with `SHA256SUMS` from the [release](https://github.com/gulagala001/dsh-undo-plugin/releases/tag/v0.1.0-dsh.0.2.1-rc.2).

The package identifier is `@gulagala001/dsh-undo-plugin`. Distribution uses GitHub Releases; install from the fixed URL above.

## Use

Click the rewind button beside **Copy** on a user message, review the affected files, and confirm. The conversation stays in the same session; text and attachments return to the composer. **Undo rewind** restores the previous conversation and files.

Checkpoints are automatic. Older messages without retained file snapshots offer conversation-only recovery. External file changes are checked before restoration.

Press **Esc twice** while idle, or enter **`/rewind`**, to open the rewind list above the composer. **`/undo`** restores the last rewind. Every restore requires confirmation. While a response is running, double Esc keeps the host’s Stop behavior.

## Documentation

See the [usage guide](docs/usage.md) for file coverage, automatic cleanup, and development commands.

## License

[MIT](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md).
