# DSH Response ID Reuse

[中文](README.md) · [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [Documentation structure](docs/documentation.md)

[![GitHub release downloads](https://img.shields.io/github/downloads/gulagala001/dsh-response-id-reuse/total?label=GitHub%20release%20downloads)](https://github.com/gulagala001/dsh-response-id-reuse/releases)

Automatically reuse Responses IDs in DeepSeek Harness. Enabled when loaded, the backend plugin sends only new context on supported routes, reducing repeated transmission of historical images and messages. It adds no UI, notifications, or model probe calls.

## Behavior

- Learn response IDs from ordinary completed requests. Isolate state by endpoint, credentials, model, session and request parameters.
- Continue exact history extensions with `previous_response_id`. Edits, compaction, forks and parameter changes send complete context.
- Preserve images and client tool results. Generation limits, stopping conditions, tool execution and host retry policy remain unchanged.
- On an explicit ID/storage rejection before generated output, retry once with full context and remember the incompatibility. Leave network failures, rate limits and partial streams to the host.
- Keep bounded ID/fingerprint caches in memory only. Disabling, unloading or exiting clears them; provider URLs, keys and default model settings are never rewritten.
- Duplicate loads share one runtime. Unloading the last active instance restores native request handling.

## Compatibility

Exact host: **DSH 0.2.1-rc.3**. Node **22.19+**.

Every Responses route can pass through the same entry point. Unverified routes retain their original request format; the plugin never probes models or switches protocols.

| Endpoint | Automatic continuation | Evidence |
| --- | --- | --- |
| Official Bailian Beijing `cn-beijing.maas.qianwenaiapi.com` and workspace `*.maas.aliyuncs.com` | `qwen3.8-flash`, `qwen3.7-flash`, `deepseek-v4-flash-0731`, `deepseek-v4.1-flash-1017` | Official documentation; additional multi-image verification for 1017 |
| Command Code `api.commandcode.ai` | `deepseek/deepseek-v4.1-flash` | Multi-image continuation verification |
| Other endpoints/models | Unmodified requests | An ID or HTTP 200 alone does not establish support |

No extra model calls are made for detection. Ordinary API charges still apply. Continuation enables `store:true`, so providers retain context under their own policies. Explicit ZDR requests pass through unchanged. Uninstalling cannot undo submitted requests or remove remote history. Latency improvements depend on the model, connection and context.

References: [Bailian Responses](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-responses), [Command Code Provider API](https://commandcode.ai/docs/provider). The latter's general Responses documentation does not establish ID support for every model.

## Install and uninstall

In **Plugins → Add plugin**, enter the fixed package URL:

```text
https://github.com/gulagala001/dsh-response-id-reuse/releases/download/v0.1.0-dsh.0.2.1-rc.3/gulagala001-dsh-response-id-reuse-0.1.0-dsh.0.2.1-rc.3.tgz
```

Enable the installed plugin. If the host requests a restart, follow its lifecycle after active tasks finish. No configuration panel or manual response IDs are needed.

For the corresponding Web/CLI profile:

```sh
dsh plugin --profile web add https://github.com/gulagala001/dsh-response-id-reuse/releases/download/v0.1.0-dsh.0.2.1-rc.3/gulagala001-dsh-response-id-reuse-0.1.0-dsh.0.2.1-rc.3.tgz
```

Disable or uninstall through the host plugin manager. Subsequent calls use the remaining plugins and native host behavior; conversations are preserved. This version is distributed as a GitHub Release artifact, not through the npm registry.

[SHA256SUMS](https://github.com/gulagala001/dsh-response-id-reuse/releases/download/v0.1.0-dsh.0.2.1-rc.3/SHA256SUMS) · [Release notes](CHANGELOG.md)

## Development

```sh
npm ci --ignore-scripts
npm test
npm pack
```

Tests use synthetic requests and controlled responses, with no online model calls. License: [MIT](LICENSE).
