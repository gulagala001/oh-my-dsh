# 下载与版本 / Downloads and versions

**安装步骤：[复制给 AI 安装](install.md#ai) · [在“添加插件”中安装](install.md#gui) · [English guide](install_EN.md)**

OMD 已内置 OpenCU，不需要再安装一份 OpenCU。下表列的是已发布插件包；选择与你正在运行的 DSH **完整版本**相同的一行。OMD includes OpenCU. Match the complete DSH version.

| DSH 宿主 / Host | OMD 插件 / Plugin | 可粘贴安装的包 / Package |
| --- | --- | --- |
| 0.2.1-rc.2 | 0.2.1-rc.2.omd.0.17.4 | [下载 .tgz / Download](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.17.4/trisoul_x-0.2.1-rc.2.omd.0.17.4.tgz) · [Release](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.2.omd.0.17.4) |
| 0.2.1-rc.1 | 0.2.1-rc.1.omd.0.17.4 | [下载 .tgz / Download](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.17.4/trisoul_x-0.2.1-rc.1.omd.0.17.4.tgz) · [Release](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.1.omd.0.17.4) |

## Release 里的文件怎么选？ / Which asset?

| 文件 / File | 用途 / Purpose |
| --- | --- |
| trisoul_x-…tgz | **安装插件用这个。** 粘贴其下载地址到“添加插件”，或下载后使用相应 CLI 安装。 / The installable plugin. |
| host-adapters.zip | 完整桌面 CU 所需的宿主源码适配和构建说明；**不是安装器，也不是插件**。 / Host adapter source and build instructions, not an installer. |
| SHA256SUMS | 下载文件的校验值。 / Archive checksums. |
| metadata.json | 发行版本及来源信息。 / Release metadata. |
| GitHub 自动生成的 Source code | 源码归档，供开发者使用，不填入普通插件安装步骤。 / Source archives for developers. |

宿主适配与校验文件：[rc.2 适配源码](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.17.4/host-adapters.zip) · [rc.2 校验值](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.17.4/SHA256SUMS) · [rc.1 适配源码](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.17.4/host-adapters.zip) · [rc.1 校验值](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.17.4/SHA256SUMS)

这些发行**不包含配套完整桌面安装器**。对话、主题、任务和记忆可按插件步骤安装；完整内置浏览器、批注和原生监看需要匹配宿主构建。见[安装条件](install.md#computer-use)。These releases do not include a complete desktop installer; full desktop CU requires a matching host build.

## 已发布包与 main 的区别 / Releases versus main

固定下载地址保留发布时的内容。main 上后续的修复不会自动进入这些包，即使源码版本字段相同；需要后续更新时，选择新的 Release 或[自行构建](development.md)。A fixed Release does not change when main receives fixes.

## 旧版用户 / Older hosts

0.2.0-rc.2 与 0.2.1-rc.2 不是同一个版本。继续使用旧宿主时，请使用对应固定版本文档；升级宿主前先看[升级与迁移](upgrade.md)。

- DSH 0.2.1-alpha.1 / OMD 0.10：[历史发行](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-alpha.1.omd.0.10.0) · [对应文档](https://github.com/gulagala001/oh-my-dsh/blob/v0.2.1-alpha.1.omd.0.10.0/README.md)
- DSH 0.2.0-rc.2 / OMD 0.10：[历史发行](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.0-rc.2.omd.0.10.0) · [对应文档](https://github.com/gulagala001/oh-my-dsh/blob/v0.2.0-rc.2.omd.0.10.0/README.md)

For older hosts, use the matching tag's documentation. Do not choose a package solely from GitHub's Latest label.
