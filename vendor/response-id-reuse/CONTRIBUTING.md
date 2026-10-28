# Contributing / 贡献

```sh
npm ci --ignore-scripts
npm test
npm pack
```

`src/index.mjs` 接入模型请求，`src/engine.mjs` 管理续传，`src/replay.mjs` 核对已存储响应与原生历史，`src/shared.mjs` 管理共装生命周期。测试使用合成请求和受控响应。

The entry module scopes model calls, the engine handles continuation, the replay module verifies stored response history, and the shared module manages runtime ownership. Tests use synthetic requests and controlled responses.

插件发出的 ID 续传遇到 HTTP 5xx 时，沿用同一套历史回放表示，以完整输入重试一次；保留父 ID 与存储能力判断，取消后不重试。首发请求、调用方自带 ID、无关 4xx 和流内错误不触发此恢复；回退再次失败即返回错误。服务端异常期间，首次错误的等待与完整回放开销仍可能发生。

An HTTP 5xx on plugin-managed ID continuation retries once with full input using the same replay representation, retaining the parent ID and storage capability state. Cancellation prevents retry. Initial requests, caller-supplied IDs, unrelated 4xx responses and in-stream errors do not trigger this recovery; a failed replay is returned without another attempt. The initial error latency and full-replay overhead can still occur during an upstream outage.

文档结构变更同步 [清单](docs/structure.json)，执行 `npm run docs:write` 和 `npm run docs:check`；维护规则见 [文档规范](docs/documentation.md)。CI 和 prepack 检查文档、公开文件、Git 历史及实际安装包。发行从已提交源码打包，更新双语 [CHANGELOG](CHANGELOG.md) 和校验文件。

Update the [manifest](docs/structure.json) for documentation changes, then run the documentation checks. CI and prepack validate documentation, public files, Git history and the archive. Release committed sources with bilingual notes and checksums.
