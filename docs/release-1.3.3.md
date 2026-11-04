# Oh My DSH 1.3.3 · DSH 0.2.2-rc.1

[中文](#zh) · [English](#en)

<a id="zh"></a>

## 中文

### 体验优化与问题修复

- 沿用原生工具执行、配置与生命周期，保留上下文、Dream、任务、工作流与独立组件共装；纳入权限继承、Claude Desktop 焦点框及后续组件修复。

- npm 插件更新复用 DSH 原生事务与回滚，OMD 在移除旧版前完成预检；固定发行附件仍保持校验后更新。
- 网页读取改用原生共享连接池；修复 PTC 预设加载和 OPS 按需工具进入下一模型步的时序，保留 Native／PTC 工具与独立插件协作。

### 其他变更

- 精确适配 DSH **0.2.2-rc.1**、Cordis **4.1.0** 与 Schemastery **3.19.0**，使用对应 SDK 与冻结依赖；Node.js 最低版本为 **24.9.0**。
- 保留已有配置、会话与插件数据；原宿主的历史固定发行继续保留。

<a id="en"></a>

## English

### Improvements and fixes

- Reuse native tool execution, configuration and lifecycle while retaining context, Dream, tasks, workflows and component coexistence. Include permission inheritance, Claude Desktop focus styling and component fixes.

- Registry plugin updates use native DSH transactions and rollback, with OMD preflight before removing the installed version. Fixed release assets retain verified updates.
- Web fetching uses the native shared connection pool. Fix PTC preset loading and OPS tool publication before the next step’s admission snapshot, preserving Native/PTC operation and independent plugins.

### Other changes

- Target exactly DSH **0.2.2-rc.1**, Cordis **4.1.0** and Schemastery **3.19.0**, with matching SDK packages and frozen dependencies; require Node.js **24.9.0** or later.
- Preserve settings, conversations and plugin data. Historical releases remain available for their original hosts.

## 安装 / Installation

| DSH | 固定安装包 / Fixed package | 校验 / Checksums |
| --- | --- | --- |
| 0.2.2-rc.1 | [Oh My DSH 1.3.3](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.1.omd.1.3.3/oh-my-dsh-0.2.2-rc.1.omd.1.3.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.1.omd.1.3.3/SHA256SUMS) |

在 **插件 → 添加插件** 使用匹配的固定包。保留原 profile、配置与数据，安装后按宿主提示重载。

Use the matching fixed package in **Plugins → Add plugin**. Retain your profile, settings and data, then reload when requested.

完整桌面能力还需要同宿主的 OpenCU 适配；本版提供固定来源与逐字节核对的构建输入。

Full desktop functionality also requires the matching OpenCU host adapter; this release includes pinned sources and byte-verified build inputs.

[安装指南 / Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md)
