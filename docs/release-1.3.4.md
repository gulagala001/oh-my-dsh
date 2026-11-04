# Oh My DSH 1.3.4 · DSH 0.2.2-rc.1

[中文](#zh) · [English](#en)

<a id="zh"></a>

## 中文

### 体验优化与问题修复

- 修复桌面欢迎页启动认证：复用宿主已签发的 Cookie，并将后续请求严格限制在同一宿主来源。原生鉴权、退出与重启流程保持。
- 同步内置 OpenCU 2.2.9 与对应桌面构建适配。

### 其他变更

- 精确适配 DSH **0.2.2-rc.1**、Cordis **4.1.0** 与 Schemastery **3.19.0**，使用对应 SDK 与冻结依赖；Node.js 最低版本为 **24.9.0**。
- 保留已有配置、会话与插件数据；原宿主的历史固定发行继续保留。

<a id="en"></a>

## English

### Improvements and fixes

- Fix desktop welcome authentication by reusing the Host-issued cookie for requests restricted to that same origin. Preserve native authentication, shutdown and restart behavior.
- Synchronize bundled OpenCU 2.2.9 and its matching desktop adapter.

### Other changes

- Target exactly DSH **0.2.2-rc.1**, Cordis **4.1.0** and Schemastery **3.19.0**, with matching SDK packages and frozen dependencies; require Node.js **24.9.0** or later.
- Preserve settings, conversations and plugin data. Historical releases remain available for their original hosts.

## 安装 / Installation

| DSH | 固定安装包 / Fixed package | 校验 / Checksums |
| --- | --- | --- |
| 0.2.2-rc.1 | [Oh My DSH 1.3.4](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.1.omd.1.3.4/oh-my-dsh-0.2.2-rc.1.omd.1.3.4.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.1.omd.1.3.4/SHA256SUMS) |

在 **插件 → 添加插件** 使用匹配的固定包。保留原 profile、配置与数据，安装后按宿主提示重载。

Use the matching fixed package in **Plugins → Add plugin**. Retain your profile, settings and data, then reload when requested.

完整桌面能力还需要同宿主的 OpenCU 适配；本版提供固定来源与逐字节核对的构建输入。

Full desktop functionality also requires the matching OpenCU host adapter; this release includes pinned sources and byte-verified build inputs.

[安装指南 / Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md)
