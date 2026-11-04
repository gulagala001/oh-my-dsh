# Oh My DSH 1.3.5 · DSH 0.2.2-rc.1

[中文](#zh) · [English](#en)

<a id="zh"></a>

## 中文

### 体验优化与问题修复

- 修复右侧栏渲染崩溃及图片、文档预览入口，修正对话标签偏移；匹配桌面适配需要同步更新。原生普通分叉保留 OMD 归档、Dream、回查及 BC 选择的插件资料继承。
- 冷会话读取改用原生 Session Query，保留精确历史边界与分支继承记录；读取后释放观察句柄，取消与会话不存在的错误保持明确。读取历史不启动 Agent 或改写原始会话。
- 修复历史会话的撤回状态，并同步侧问与 OMAA 的冷读取适配。

### 其他变更

- 精确适配 DSH **0.2.2-rc.1**、Cordis **4.1.0** 与 Schemastery **3.19.0**，使用对应 SDK 与冻结依赖；Node.js 最低版本为 **24.9.0**。
- 保留已有配置、会话与插件数据；原宿主的历史固定发行继续保留。

<a id="en"></a>

## English

### Improvements and fixes

- Restore sidebar rendering and image/document previews, align conversation tabs, and synchronize the matching desktop adapter. Retain OMD archive, Dream, recall and BC choice inheritance for native independent forks.
- Read cold sessions through native Session Query with exact history boundaries and inherited events. Release observation leases after reads, preserve cancellation and not-found errors, and avoid activating Agents or rewriting stored conversations.
- Fix rewind status for persisted conversations and synchronize side-question and OMAA cold-read integration.

### Other changes

- Target exactly DSH **0.2.2-rc.1**, Cordis **4.1.0** and Schemastery **3.19.0**, with matching SDK packages and frozen dependencies; require Node.js **24.9.0** or later.
- Preserve settings, conversations and plugin data. Historical releases remain available for their original hosts.

## 安装 / Installation

| DSH | 固定安装包 / Fixed package | 校验 / Checksums |
| --- | --- | --- |
| 0.2.2-rc.1 | [Oh My DSH 1.3.5](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.1.omd.1.3.5/oh-my-dsh-0.2.2-rc.1.omd.1.3.5.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.1.omd.1.3.5/SHA256SUMS) |

在 **插件 → 添加插件** 使用匹配的固定包。保留原 profile、配置与数据，安装后按宿主提示重载。

Use the matching fixed package in **Plugins → Add plugin**. Retain your profile, settings and data, then reload when requested.

完整桌面能力还需要同宿主的 OpenCU 适配；本版提供固定来源与逐字节核对的构建输入。

Full desktop functionality also requires the matching OpenCU host adapter; this release includes pinned sources and byte-verified build inputs.

[安装指南 / Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md)
