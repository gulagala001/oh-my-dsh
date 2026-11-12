# dsh-ops

[English](dsh-ops_EN.md) · [文档目录](README.md) · [插件兼容](plugin-compatibility.md) · [上游项目](https://github.com/T-Auto/dsh-ops)

**dsh-ops** 由 [T-Auto](https://github.com/T-Auto) 开发，给 DSH 加上更强的文件读取、搜索、修改、文档读取和命令执行工具。工具按需加载，大结果可以通过引用接着取。普通模式返回带行号的紧凑文本，PTC 模式返回类型化的 SDK 结果。

这里提供基于上游 **0.4.1** 的兼容版，由 **gulagala001** 维护 DSH 适配。

## 支持范围

| 项目 | 要求 |
| --- | --- |
| DSH | 0.2.2-rc.2，每个 DSH 版本用各自的安装包 |
| 平台 | Windows x64、Linux x64、macOS Apple Silicon |
| Shell | Linux／macOS 用本机 Bash；Windows 用随包的可选 Bash，PowerShell 由 DSH 管理 |

Intel Mac、Linux ARM64、Windows ARM64 没有安装包。

文档读取支持 CSV／TSV、DOCX 正文段落和 PDF 的文字层，不支持旧版 DOC、OCR 和 PDF 渲染。复杂格式先看[上游的格式说明](https://github.com/T-Auto/dsh-ops/blob/v0.4.1/docs/原生内核.md)。

## 安装

在 **设置 → Oh My DSH → 第三方 → dsh-ops** 打开开关即可。OMD 会按你的 DSH 版本和平台选对应的安装包，并核对 SHA-256；版本或平台不支持时不会显示安装入口。

手动安装时，把对应的安装包交给目标 profile 的插件管理：桌面版用应用自带的命令行，网页版用它配套的命令行。见[安装指南](install.md)。

| DSH | 安装包 | 校验 |
| --- | --- | --- |
| 0.2.2-rc.2 | [dsh-ops-0.2.2-rc.2.ops.0.1.0.tgz](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.2.omd.1.3.15/dsh-ops-0.2.2-rc.2.ops.0.1.0.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.2.omd.1.3.15/SHA256SUMS) |

<!-- history -->
旧版 DSH：[0.2.1-rc.5](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.5.omd.1.2.2) · [0.2.1-rc.3](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.3.omd.0.100.1) · [0.2.1-rc.2](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.2.omd.0.99.0) · [0.2.1-rc.1](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.1.omd.0.99.0)
<!-- /history -->

## 使用

装好后直接提文件或命令任务，比如"找出项目里读取配置的地方""读这份 DOCX 的正文""运行构建并报告错误"。工具按当前会话的工作目录、权限和沙箱执行，需要审批的照常审批。

- **普通模式**：一开始只有 `ops_read_files`、`ops_discover_tools` 和 `ops_bash`，其他工具用到时再加载。
- **PTC 模式**：在 `run_code` 里通过 SDK 调用。`job_output`、`job_list`、`job_kill`、`runtime_status` 仍可直接调用。
- **原生工具**：默认不替换 DSH 自带的 `read`／`glob`／`grep`。
- **面板**：`dsh-ops/panel` 和 `dsh-ops/tui` 默认关闭，需要时在插件配置里打开。

你已有的配置优先于默认值。Linux／macOS 想指定 Bash，在 `dsh-ops/shell` 的 `bashPath` 填绝对路径。Windows 的 Bash 设置见[上游配置参考](https://github.com/T-Auto/dsh-ops/blob/v0.4.1/docs/配置参考.md)。

## 更新、关闭与数据

关掉第三方页的开关会停用 dsh-ops，配置和数据保留，再打开就能用。卸载在 profile 的插件管理里做。

OMD 只装登记过、和你的 DSH 匹配的兼容版，**不跟上游的 latest**。从别的市场或命令行装了其他版本时，请自己核对 DSH 版本、平台和插件版本。升级 DSH 后也要换成对应的安装包。

## 来源与许可

原作者：**T-Auto 与 dsh-ops 贡献者**。兼容适配：**gulagala001**。兼容版保留上游的 **MIT AND Apache-2.0** 许可、署名、`NOTICE` 和来源记录；Windows 的可选 Bash 另有自己的组件许可。见[第三方声明](../THIRD_PARTY_NOTICES.md#dsh-ops-compatibility-distribution)。
