# OMD 0.19.0 · DSH 0.2.1-rc.1 / 0.2.1-rc.2

[中文](#zh-0190) | [English](#en-0190)

<a id="zh-0190"></a>

## 中文

### 新增功能

- “Oh My DSH → 第三方功能”新增 dsh-ops，署名原作者 T-Auto。开启后安装与当前完整宿主版本匹配的固定兼容包，提供文件、文档、命令操作和按需工具加载。
- 普通模式保留 DSH 原生工具；PTC 模式支持 OPS 类型化工具及后台任务查询、输出与取消。

### 问题修复

- 统一 PTC 工具探测与实际请求的展示结果，避免 OPS 工具反复发布、撤回；业务工具仍通过 run_code 调用。
- 修复固定 OPS 工件中的宿主作用域模块解析、POSIX worker 执行权限和兼容版本的来源回执校验。

### 其他变更

- 固定上游 dsh-ops 0.4.1，分别提供精确匹配 DSH rc.1／rc.2 的兼容工件并校验 SHA-256；目录更新不跟随 latest。
- 原生工具替换、OPS 面板和 TUI 入口默认关闭。停用保留配置与数据；不支持的宿主或原生运行时目标不提供安装入口。
- 内置 OpenCU 继续为 2.0.6。

<a id="en-0190"></a>

## English

### New Features

- Adds dsh-ops under Oh My DSH → Third-party features, crediting T-Auto. Enabling it installs a fixed compatibility package for the exact host version, providing file, document, shell and on-demand tool capabilities.
- Native mode retains DSH tools; PTC supports typed OPS tools and background-job listing, output and cancellation.

### Bug Fixes

- Makes PTC presentation probes and real requests expose the same controls, avoiding repeated OPS publication and withdrawal. Business operations still use run_code.
- Fixes host scope-module resolution, POSIX worker executable permissions and provenance validation for the fixed OPS compatibility packages.

### Other Changes

- Pins upstream dsh-ops 0.4.1 with separate, SHA-256-verified packages for DSH rc.1 and rc.2. Catalog updates do not follow latest.
- Native-tool replacement, the OPS panel and TUI entry remain disabled by default. Disabling retains settings and data; unsupported hosts and native runtime targets cannot install through the catalog.
- Bundled OpenCU remains at 2.0.6.

## 安装 / Installation

仅使用与当前 DSH **完整版本**匹配的包。打开 **插件 → ＋ 添加插件**，粘贴对应地址；保留原 profile、配置和数据，当前任务结束后重启对应实例。

Use the package matching the **complete DSH version**. Open **Plugins → Add Plugin**, paste the matching URL, keep the existing profile and data, and restart the instance after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.2 | [OMD 0.19.0](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.19.0/trisoul_x-0.2.1-rc.2.omd.0.19.0.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.19.0/SHA256SUMS) |
| 0.2.1-rc.1 | [OMD 0.19.0](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.19.0/trisoul_x-0.2.1-rc.1.omd.0.19.0.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.19.0/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md) · [dsh-ops 使用指南 / dsh-ops guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/dsh-ops.md)
