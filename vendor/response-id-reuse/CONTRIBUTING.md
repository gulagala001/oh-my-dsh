# Contributing / 贡献

```sh
npm ci --ignore-scripts
npm test
npm pack
```

`src/index.mjs` 接入模型请求，`src/engine.mjs` 管理续传，`src/replay.mjs` 核对已存储响应与原生历史，`src/recovery.mjs` 管理等待与临时冷却，`src/shared.mjs` 管理共装生命周期。测试使用合成请求、受控响应和本地 HTTP 服务。

The entry module scopes model calls, the engine handles continuation, replay verifies stored response history, recovery manages waiting and temporary cooldowns, and shared manages runtime ownership. Tests use synthetic requests, controlled responses and a loopback HTTP server.

插件发出的 ID 续传遇到 HTTP 5xx 或首个有效输出超时，沿用同一套历史回放表示，完整重试最多一次。5xx 不再等待错误正文；回退失败的错误正文也有读取时限与大小限制。流式续传按同路由／请求类型最近 16 次成功样本的 P90 自动估算首字预算（4 倍加 5 秒，限制在 15～60 秒；无样本默认 30 秒）；全量回退至少获得 30 秒。心跳、创建事件和空消息不算有效输出；开始输出后撤掉首字计时，继续沿用宿主流式时限，不重复已交付内容或工具调用。

HTTP 5xx or a first-output timeout on plugin-managed ID continuation triggers at most one full replay with the same history representation. HTTP 5xx does not wait for an error body; failed replay error bodies have read-time and size limits. Streaming continuation automatically derives its first-output budget from the last 16 successful samples for the same route/request type: four times P90 plus five seconds, bounded to 15–60 seconds, defaulting to 30 seconds without samples. Full replay gets at least 30 seconds. Heartbeats, creation events and empty messages are not output. After real output starts, the first-output timer ends and host streaming limits apply; already-delivered content and tools are never replayed transparently.

临时故障独立于存储能力记录：保留有效父 ID，同路由续传先冷却 1 分钟，重复失败递增至最多 15 分钟；冷却期间完整发送，冷却后仅允许一条正常业务请求尝试续传。只有真正续传成功才恢复，全量成功或并发旧请求迟到成功都不能清除新故障。无需渠道名单、额外推理探测或用户参数。调用方取消、调用方自带 ID、无关 4xx 和流内错误不触发此自动回退；带服务端工具的请求不使用新增超时／5xx 自动重放。非流式调用保持宿主等待策略。客户端取消不保证服务端立即停止，失败与重放仍可能计费。

Temporary failures are tracked separately from storage support. Valid parent IDs remain available; the affected continuation route cools down for one minute, growing to at most 15 minutes after repeated failures. Ordinary requests send full context during cooldown; afterward, only one real request may try continuation. Only successful continuation restores health: successful full replay or a late older response cannot erase a newer failure. No provider allowlist, extra inference probes or user settings are needed. Caller cancellation, caller-owned IDs, unrelated 4xx and in-stream errors do not trigger automatic replay. Requests with server-side tools do not use the new timeout/5xx replay. Non-streaming calls retain host waiting behavior. Client cancellation does not guarantee immediate server termination; failed and replayed attempts may still be billed.

文档结构变更同步 [清单](docs/structure.json)，执行 `npm run docs:write` 和 `npm run docs:check`；维护规则见 [文档规范](docs/documentation.md)。CI 和 prepack 检查文档、公开文件、Git 历史及实际安装包。发行从已提交源码打包，更新双语 [CHANGELOG](CHANGELOG.md) 和校验文件。

Update the [manifest](docs/structure.json) for documentation changes, then run the documentation checks. CI and prepack validate documentation, public files, Git history and the archive. Release committed sources with bilingual notes and checksums.
