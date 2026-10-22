# 下载与版本 / Downloads and versions

**安装步骤：[复制给 AI 安装](install.md#ai) · [在“添加插件”中安装](install.md#gui) · [English guide](install_EN.md)**

OMD 已内置 OpenCU，不需要再安装一份 OpenCU。下表为 OMD 0.99.1 正式安装入口；选择与你正在运行的 DSH **完整版本**相同的一行。OMD includes OpenCU. The URLs below provide the formal 0.99.1 release. Match the complete DSH version.

| DSH 宿主 / Host | OMD 插件 / Plugin | 可粘贴安装的包 / Package |
| --- | --- | --- |
| 0.2.1-rc.2 | 0.2.1-rc.2.omd.0.99.1 | [下载 .tgz / Download](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.99.1/oh-my-dsh-0.2.1-rc.2.omd.0.99.1.tgz) · [Release](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.2.omd.0.99.1) |
| 0.2.1-rc.1 | 0.2.1-rc.1.omd.0.99.1 | [下载 .tgz / Download](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.99.1/oh-my-dsh-0.2.1-rc.1.omd.0.99.1.tgz) · [Release](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.1.omd.0.99.1) |

## OMD 0.99.1（准备中 / In preparation）

[中文更新说明](release-0.99.1.md#zh-0990) · [English release notes](release-0.99.1.md#en-0990) · [dsh-ops 使用指南](dsh-ops.md)

## 当前公开版本 / Current public version

当前正式版本为 **0.99.1**；此前 0.19.0 草稿不作为安装入口。Current formal version: **0.99.1**; the earlier 0.19.0 drafts are not installation targets.

| 完整宿主 / Exact host | 公开安装入口 / Public installation |
| --- | --- |
| DSH 0.2.1-rc.2 | [OMD 0.99.1](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.2.omd.0.99.1) |
| DSH 0.2.1-rc.1 | [OMD 0.99.1](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.1.omd.0.99.1) |

## Release 里的文件怎么选？ / Which asset?

| 文件 / File | 用途 / Purpose |
| --- | --- |
| oh-my-dsh-…tgz | **安装插件用这个。** 粘贴其下载地址到“添加插件”，或下载后使用相应 CLI 安装。 / The installable plugin. |
| host-adapters.zip | 完整桌面 CU 所需的宿主源码适配和构建说明；**不是安装器，也不是插件**。 / Host adapter source and build instructions, not an installer. |
| SHA256SUMS | 下载文件的校验值。 / Archive checksums. |
| metadata.json | 发行版本及来源信息。 / Release metadata. |
| GitHub 自动生成的 Source code | 源码归档，供开发者使用，不填入普通插件安装步骤。 / Source archives for developers. |

宿主适配与校验文件：[rc.2 适配源码](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.99.1/host-adapters.zip) · [rc.2 校验值](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.99.1/SHA256SUMS) · [rc.1 适配源码](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.99.1/host-adapters.zip) · [rc.1 校验值](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.99.1/SHA256SUMS)

这些发行**不包含配套完整桌面安装器**。对话、主题、任务和记忆可按插件步骤安装；完整内置浏览器、批注和原生监看需要匹配宿主构建。见[安装条件](install.md#computer-use)。These releases do not include a complete desktop installer; full desktop CU requires a matching host build.

## 已发布包与 main 的区别 / Releases versus main

固定下载地址保留发布时的内容。main 上后续的修复不会自动进入这些包，即使源码版本字段相同；需要后续更新时，选择新的 Release 或[自行构建](development.md)。A fixed Release does not change when main receives fixes.

## 历史版本 / Historical releases

OMD 0.18.8：[DSH rc.2](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.2.omd.0.18.8) · [DSH rc.1](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.1.omd.0.18.8)。

## 旧版用户 / Older hosts

0.2.0-rc.2 与 0.2.1-rc.2 不是同一个版本。继续使用旧宿主时，请使用对应固定版本文档；升级宿主前先看[升级与迁移](upgrade.md)。

- DSH 0.2.1-alpha.1 / OMD 0.10：[历史发行](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-alpha.1.omd.0.10.0) · [对应文档](https://github.com/gulagala001/oh-my-dsh/blob/v0.2.1-alpha.1.omd.0.10.0/README.md)
- DSH 0.2.0-rc.2 / OMD 0.10：[历史发行](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.0-rc.2.omd.0.10.0) · [对应文档](https://github.com/gulagala001/oh-my-dsh/blob/v0.2.0-rc.2.omd.0.10.0/README.md)

For older hosts, use the matching tag's documentation. Do not choose a package solely from GitHub's Latest label.

## 市场同步记录（2026-10-19）

已有目录条目继续沿用，不重复投稿；当前版本的固定安装包见上表。市场收录与版本同步由各目录独立处理，不能以源码推送或 GitHub Release 代替市场回执。自动发现所需 topics 已配置；共用 Awesome 数据源的下游不重复投稿。
