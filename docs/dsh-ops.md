# dsh-ops

[English](dsh-ops_EN.md) · [插件共用](plugin-compatibility.md) · [上游项目](https://github.com/T-Auto/dsh-ops)

**dsh-ops** 由 [T-Auto](https://github.com/T-Auto) 开发，为 DSH 提供有界文件读取、搜索、修改、文档读取与命令执行。工具按需发现和加载，较大的结果可以通过引用继续取用。普通模式使用紧凑、带行号的文本结果；PTC 使用类型化 SDK 结果。

这里提供基于上游 **0.4.1** 的固定兼容发行，由 **gulagala001** 维护 DSH `0.2.1-rc.1`／`0.2.1-rc.2` 适配。

## 支持范围

| 项目 | 要求 |
| --- | --- |
| DSH | 精确匹配 `0.2.1-rc.1` 或 `0.2.1-rc.2`，各使用对应工件 |
| 原生运行平台 | Windows x64（`win32-x64`）、Linux x64（`linux-x64`）、macOS Apple Silicon（`darwin-arm64`） |
| Node.js | `^22.19 \|\| >=24`，使用匹配宿主的运行时 |
| Shell | Linux／macOS 使用本机 Bash；Windows 使用上游固定的可选 Bash 载荷，PowerShell 由宿主管理 |

Intel Mac、Linux ARM64、Windows ARM64 等其他目标不提供安装入口。平台限制取决于完整的平台与架构组合，不能只看包的 `os`／`cpu` 列表。

文档读取支持有界 CSV／TSV、DOCX 主体段落与受限 PDF 文本层。二进制 DOC、OCR 和通用 PDF 渲染不在其文档读取范围内；复杂格式应先查看[上游文档格式说明](https://github.com/T-Auto/dsh-ops/blob/v0.4.1/docs/原生内核.md)。

## 安装

在 **设置 → Oh My DSH → 第三方功能 → dsh-ops** 打开安装／启用开关。入口按当前完整宿主版本和运行平台选择固定包，并校验已登记的 SHA-256。未知宿主或不支持的平台不会提供可安装入口。

手动安装时，先选择对应宿主的固定包，再交给目标 profile 的原生插件管理器。桌面 profile 使用桌面应用自带的 CLI；Web／TUI 使用对应宿主的 CLI。[DSH 插件安装与配对](install.md)

| 精确宿主 | 固定兼容包 | 校验文件 |
| --- | --- | --- |
| `0.2.1-rc.2` | [dsh-ops-0.2.1-rc.2.ops.0.1.0.tgz](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.99.0/dsh-ops-0.2.1-rc.2.ops.0.1.0.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.99.0/SHA256SUMS) |
| `0.2.1-rc.1` | [dsh-ops-0.2.1-rc.1.ops.0.1.0.tgz](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.99.0/dsh-ops-0.2.1-rc.1.ops.0.1.0.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.99.0/SHA256SUMS) |

## 使用与默认设置

安装后可以直接提出文件或命令任务，例如“查找项目中读取配置的位置”“读取这份 DOCX 的正文”或“运行构建并报告错误”。工具按当前会话的工作目录、权限与沙箱策略执行；需要审批的操作继续通过宿主审批。

- **普通模式**：初始提供 `ops_read_files`、`ops_discover_tools` 和可用的 `ops_bash`。其他文件、文档工具按需发现，在所属 agent 后续请求中启用。
- **PTC**：业务工具经 `run_code` 中的 SDK 调用；工具发现、批处理和结果引用沿用上游能力。宿主可以同时提供 `job_output`、`job_list`、`job_kill`、`runtime_status` 四个后台控制，供查询输出、列出任务、取消与查看运行状态。
- **原生工具**：官方 `read`／`glob`／`grep` 替换默认关闭，保留宿主原有工具入口。
- **可选界面**：`dsh-ops/panel` 与 `dsh-ops/tui` 默认关闭；需要时在宿主插件配置中单独启用，并满足相应界面扩展要求。

已有显式配置优先于新装默认值。Linux／macOS 如需指定 Bash，可在 `dsh-ops/shell` 的 `bashPath` 中填写本机 Bash 的绝对路径。Windows 的 Bash 选择与修复方式见[上游配置参考](https://github.com/T-Auto/dsh-ops/blob/v0.4.1/docs/配置参考.md)。

## 更新、关闭与数据

关闭第三方功能开关会停用 dsh-ops，并保留插件配置与数据；再次开启可恢复使用。卸载使用目标 profile 的原生插件管理器。

目录更新只安装已登记且匹配当前宿主的固定兼容发行，**不跟随上游 `latest`**。外部市场或 CLI 自行升级可以绕过该固定版本；如改装其他版本，应重新核对完整宿主、平台与插件版本。升级宿主后也需要切换到对应工件。

## 来源与许可

原作者：**T-Auto 与 dsh-ops 贡献者**。兼容适配维护：**gulagala001**。兼容发行保留上游 **MIT AND Apache-2.0** 许可、署名、`NOTICE` 与来源记录；Windows 可选 Bash 载荷另保留其自身组件许可。[完整来源与许可](../THIRD_PARTY_NOTICES.md#dsh-ops-compatibility-distribution)
