# 架构 / Architecture

[中文首页](../README.md) · [English](../README_EN.md)

DSH Workflow 是通过 profile bundle 安装的工作流插件。执行引擎基于 DSH **0.2.1-rc.2** 的 Workflow、PTC 和 tool-workflow，负责脚本编排、运行记录与续跑，并接入原生子代理、会话、Jobs、权限和取消生命周期。

DSH Workflow installs as a profile bundle. Its engine builds on DSH **0.2.1-rc.2** Workflow, PTC and tool-workflow to coordinate scripts, persist run records and resume execution through native subagents, sessions, Jobs, permissions and cancellation.

| 位置 / Location | 职责 / Responsibility |
| --- | --- |
| `cordis.patch.yml` | 挂载增强引擎与工具 / Mount the enhanced engine and tool |
| `src/runtime.mjs`, `budget.mjs`, `store.mjs` | 共享运行支持与持久预算 / Runtime support and durable budgets |
| `src/engine.mjs`, `tool.mjs`, `spawn.mjs` | 宿主能力薄适配 / Thin host capability adapters |
| `src/shared.mjs` | 共享组件的持有与释放 / Shared component ownership and disposal |
| `src/client/` | 真实 REA 控件与原生阶段／成员视图 / REA components and native phase/member views |
| `vendor/dsh/`, `vendor/dsh.json` | 固定的宿主源码基础与文件摘要 / Pinned host source foundation and checksums |
| `scripts/build-*.mjs` | 宿主模块工厂与客户端构建 / Host module factories and client build |

宿主侧模块通过原始 Loader 树取得服务依赖，核对精确宿主版本，避免独立打包出第二份运行时服务身份。运行中的子代理、后台工作与取消仍遵守宿主生命周期。客户端复用宿主 REA 组件。

Host modules resolve service dependencies through the original Loader tree and check the exact host version, avoiding a second set of runtime service identities. Active agents, background jobs and cancellation retain host lifecycle semantics. The client reuses host REA components.

上游来源、固定提交与许可证见 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。

See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for upstream provenance, the pinned commit and licenses.
