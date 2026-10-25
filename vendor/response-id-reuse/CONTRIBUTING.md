# Contributing / 贡献

维护公开文档时同步 [docs/structure.json](docs/structure.json)，执行 `npm run docs:write` 与 `npm run docs:check`。完整职责见 [文档维护规范](docs/documentation.md)。双语首页分别维护当前行为、安装和精确宿主范围；版本事实集中于 [CHANGELOG.md](CHANGELOG.md)。

Keep documentation registrations, translations and links synchronized. Run `npm run docs:write` and `npm run docs:check`. See the [documentation policy](docs/documentation.md). Maintain current behavior and exact host support in both homepages, with version facts in [CHANGELOG.md](CHANGELOG.md).

`src/index.mjs` scopes transport handling through the host's public `llm/stream` middleware. `src/engine.mjs` owns capability policy, history matching and bounded in-memory state. `src/shared.mjs` leases one runtime to duplicate loads. Keep unrelated fetch calls and host stopping/tool behavior unchanged. Never add background model probes.

Run `npm test` for request, stream, isolation and lifecycle regression checks; use synthetic credentials and responses only. `npm pack` runs syntax, documentation, full Git history/tag and actual archive gates. CI runs the same checks. Update capability rules only with evidence for the exact endpoint and model. Do not commit user conversations, credentials, logs, internal plans, raw benchmarks or generated archives.

Release from committed sources. Verify archive contents and checksums before tagging or publishing. Keep the bilingual release layout and fixed host-specific download URLs.
