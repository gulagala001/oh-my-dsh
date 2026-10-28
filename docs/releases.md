# 下载与版本 / Downloads and versions

## OMD 1.2.0

[中文更新说明](release-1.2.0.md#zh-120) · [English release notes](release-1.2.0.md#en-120)


**安装步骤：[复制给 AI 安装](install.md#ai) · [在“添加插件”中安装](install.md#gui) · [English guide](install_EN.md)**

OMD 已内置 OpenCU，不需要再安装一份 OpenCU。下表优先列出 OMD 1.2.0 的 rc.3 正式安装入口，旧宿主沿用原固定版本；选择与你正在运行的 DSH **完整版本**相同的一行。OMD includes OpenCU. The newest build is 1.2.0 for rc.3; older hosts retain their fixed releases. Match the complete DSH version.

| DSH 宿主 / Host | OMD 插件 / Plugin | 可粘贴安装的包 / Package |
| --- | --- | --- |
| 0.2.1-rc.3 | 0.2.1-rc.3.omd.1.2.0 | [下载 .tgz / Download](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.1.2.0/oh-my-dsh-0.2.1-rc.3.omd.1.2.0.tgz) · [Release](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.3.omd.1.2.0) |
| 0.2.1-rc.2 | 0.2.1-rc.2.omd.0.100.0 | [下载 .tgz / Download](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.100.0/oh-my-dsh-0.2.1-rc.2.omd.0.100.0.tgz) · [Release](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.2.omd.0.100.0) |
| 0.2.1-rc.1 | 0.2.1-rc.1.omd.0.100.0 | [下载 .tgz / Download](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.100.0/oh-my-dsh-0.2.1-rc.1.omd.0.100.0.tgz) · [Release](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.1.omd.0.100.0) |

## OMD 1.1.2

[中文更新说明](release-1.1.2.md#zh-112) · [English release notes](release-1.1.2.md#en-112)

## OMD 1.1.1

[中文更新说明](release-1.1.1.md#zh-111) · [English release notes](release-1.1.1.md#en-111)

## OMD 1.1.0

[中文更新说明](release-1.1.0.md#zh-110) · [English release notes](release-1.1.0.md#en-110) · [dsh-ops 使用指南](dsh-ops.md)

## OMD 1.0.2

[中文更新说明](release-1.0.2.md#zh-102) · [English release notes](release-1.0.2.md#en-102) · [dsh-ops 使用指南](dsh-ops.md)

## 当前公开版本 / Current public version

当前 rc.3 正式版本为 **1.2.0**；此前 0.19.0 草稿不作为安装入口。Current rc.3 formal version: **1.2.0**; the earlier 0.19.0 drafts are not installation targets.

| 完整宿主 / Exact host | 公开安装入口 / Public installation |
| --- | --- |
| DSH 0.2.1-rc.3 | [OMD 1.2.0](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.3.omd.1.2.0) |
| DSH 0.2.1-rc.2 | [OMD 0.100.0](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.2.omd.0.100.0) |
| DSH 0.2.1-rc.1 | [OMD 0.100.0](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.1.omd.0.100.0) |

## Release 里的文件怎么选？ / Which asset?

| 文件 / File | 用途 / Purpose |
| --- | --- |
| oh-my-dsh-…tgz | **安装插件用这个。** 粘贴其下载地址到“添加插件”，或下载后使用相应 CLI 安装。 / The installable plugin. |
| host-adapters.zip | 完整桌面 CU 所需的宿主源码适配和构建说明；**不是安装器，也不是插件**。 / Host adapter source and build instructions, not an installer. |
| SHA256SUMS | 下载文件的校验值。 / Archive checksums. |
| metadata.json | 发行版本及来源信息。 / Release metadata. |
| GitHub 自动生成的 Source code | 源码归档，供开发者使用，不填入普通插件安装步骤。 / Source archives for developers. |

宿主适配与校验文件：[rc.2 适配源码](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.100.0/host-adapters.zip) · [rc.2 校验值](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.100.0/SHA256SUMS) · [rc.1 适配源码](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.100.0/host-adapters.zip) · [rc.1 校验值](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.100.0/SHA256SUMS)

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

## 市场同步记录（2026-10-28）

按各市场当前规则与实际需要维护原条目，正常必要更新保留；不把每次发行等同于全市场改帖或催审。首次投稿按独立数据源去重；自动刷新目录不逐版通知。外部写入前重新核对最新指南、模板、原申请反馈、必填字段、仓库／npm 归属、固定安装地址、完整宿主版本、许可、展示和权限要求。当前安装包见上表，不能以源码推送、Release 或 Issue 关闭代替实际收录证据。

| 独立数据源与规则 | 2026-10-28 核对结果 | 后续触发条件 |
| --- | --- | --- |
| [Awesome DSH Plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md) | [1.1.2 更新 #9934](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/9934)已合并；[当前条目](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/data/plugins/gulagala001__oh-my-dsh.yml)指向固定 1.1.2 包 | 规则或实际安装需要变更时改原 YAML 条目；不要求每个补丁都更新。已有待审 PR 复用原分支。截图从项目自身文件、npm 映射从 registry 采集，不为它们重复投稿 |
| [TYEclipse DSH Plugins Hub](https://github.com/TYEclipse/dsh-plugins-hub#how-to-submit-a-plugin) | [#51 的明确审核阻塞](https://github.com/TYEclipse/dsh-plugins-hub/issues/51#issuecomment-6278223429)仍涉及默认权限策略、宿主 UI 替换等；已有 MIT 不能视为全部解决，目前未收录 | 仅在阻塞实质解决且有证据时按维护者要求在原 Issue 请求复审；不因版本号变化改帖，不擅改产品方向换取收录 |
| [coderPerseus DSH Hub](https://github.com/coderPerseus/dsh-hub/blob/main/README.zh-CN.md) | [#57](https://github.com/coderPerseus/dsh-hub/issues/57)关闭；目录按规则每日自动发现／刷新。历史已有条目证据保留，本次未确认在线目录的 1.1.2 安装目标 | 未发现或存在具体错误时依当前模板反馈；不逐版编辑旧 Issue，关闭状态本身不等于新版同步 |
| [chnjames Market](https://github.com/chnjames/dsh-plugin-market/blob/main/README.md) | 定时刷新目录；2026-10-27 历史快照已发现仓库但安装目标为 main，本次不将旧证据描述为当前固定包同步 | topic／元数据按规则维护；确认安装目标错误时再按该项目入口反馈，不逐版通知 |

ZASENJC、NanmiCoder 未找到条目及 aust24lzy 索引 404 均为 **2026-10-27 历史观察**，不是自动重投／催审待办。需要处理具体问题时重新核对各自规则与现状，共用上游的下游展示站不重复提交。市场同步不是一般源码合并或发行的统一前置；不改变用户通知设置。
