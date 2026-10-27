# Contributing / 贡献

```sh
npm ci --ignore-scripts
npm test
npm pack
```

`src/index.mjs` 接入模型请求，`src/engine.mjs` 管理续传，`src/replay.mjs` 核对已存储响应与原生历史，`src/shared.mjs` 管理共装生命周期。测试使用合成请求和受控响应。

The entry module scopes model calls, the engine handles continuation, the replay module verifies stored response history, and the shared module manages runtime ownership. Tests use synthetic requests and controlled responses.

文档结构变更同步 [清单](docs/structure.json)，执行 `npm run docs:write` 和 `npm run docs:check`；维护规则见 [文档规范](docs/documentation.md)。CI 和 prepack 检查文档、公开文件、Git 历史及实际安装包。发行从已提交源码打包，更新双语 [CHANGELOG](CHANGELOG.md) 和校验文件。

Update the [manifest](docs/structure.json) for documentation changes, then run the documentation checks. CI and prepack validate documentation, public files, Git history and the archive. Release committed sources with bilingual notes and checksums.
