# 架构 / Architecture

[中文首页](../README.md) · [English](../README_EN.md)

DSH Workflow 以 profile bundle 形式安装。执行引擎基于 DSH 自带的 Workflow、PTC 和 tool-workflow，负责编排脚本、保存运行记录和续跑，子代理、会话、后台任务、权限和取消都走 DSH 原有的机制。

DSH Workflow installs as a profile bundle. Its engine builds on the Workflow, PTC and tool-workflow modules that ship with DSH. It orchestrates scripts, stores run records and resumes runs, while subagents, conversations, background jobs, permissions and cancellation use the existing DSH mechanisms.

| 位置 / Location | 作用 / Purpose |
| --- | --- |
| `cordis.patch.yml` | 挂载引擎和工具 / Mounts the engine and tool |
| `src/runtime.mjs`, `budget.mjs`, `store.mjs` | 运行支持与预算持久化 / Runtime support and budget storage |
| `src/engine.mjs`, `tool.mjs`, `spawn.mjs` | 对接 DSH 的工作流、工具和子代理接口 / Connect to DSH workflow, tool and subagent APIs |
| `src/shared.mjs` | 多个插件共装时的组件归属与释放 / Component ownership when several plugins share it |
| `src/client/` | 工作流面板，复用 DSH 界面组件 / Workflow panel built from DSH UI components |
| `vendor/dsh/`, `vendor/dsh.json` | 固定版本的 DSH 源码与文件摘要 / Pinned DSH sources and checksums |
| `vendor/host-artifacts.json` | 目标 DSH 版本的 npm 工件摘要 / Checksums of the target DSH npm artifacts |
| `scripts/build-*.mjs` | 构建宿主模块和前端 / Build host modules and the client |

宿主模块在运行时通过 DSH 原有的 Loader 加载依赖，并核对 DSH 版本，避免出现第二份运行时服务。只在 Windows 上需要的原生依赖不会在其他平台启动时加载。

Host modules load their dependencies through the DSH Loader at run time and check the DSH version, so no second copy of runtime services is created. Windows-only native dependencies are not loaded on other platforms.

构建以 `package.json` 的版本为准，每份构建使用同版本的 DSH SDK 和依赖锁。`vendor/host-artifacts.json` 把固定源码和目标 npm 工件分开记录，构建时逐个文件核对。

Builds follow the version in `package.json` and use the matching DSH SDK and lockfile. `vendor/host-artifacts.json` records the pinned sources and target npm artifacts separately, and the build checks them file by file.

上游来源、固定提交和许可见 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。

Upstream sources, pinned commits and licenses are listed in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
