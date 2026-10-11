# Oh My DSH 使用文档

[English](README_EN.md) · [项目介绍](../README.md) · [实拍案例](showcase.md)

从你现在要做的事开始。安装 OMD 后，继续使用 DSH 原有的模型、会话、工具与技能。

| 你要做什么 | 入口 |
| --- | --- |
| 安装到官方桌面应用 | [桌面安装](upgrade.md#desktop) |
| 安装到 DSH Web | [Web 安装](usage.md#安装到现有-dsh推荐) |
| 完成第一个任务 | [首次使用](getting-started.md) |
| 整理文件、跟进任务和查看交付 | [日常使用](usage.md#日常使用) |
| 长对话里继续工作、找回原始要求 | [上下文与记忆](usage.md#上下文与记忆) |
| 操作网页、查看画面、人工接手 | [Computer Use](usage.md#computer-use) |
| 润色草稿、调整模型或外观 | [使用指南](usage.md) |
| 更新、备份或从 Web 转到桌面 | [安装与升级](upgrade.md) |
| 安装失败、找不到原会话、界面异常 | [按症状排障](troubleshooting.md#按症状处理) |
| 安装其他插件并与 OMD 共用 | [插件兼容说明](plugin-compatibility.md) |
| 停用或卸载 OMD | [更新与卸载](usage.md#update-uninstall) |

[![统一浏览器中的采购单：人工补充交付信息后，助手读取保存结果](images/showcase-browser.png)](showcase.md)

*虚构采购单，本地未发布集成。用户填写并保存交付信息后，受控示例模型通过实际 CU 工具读取结果。[操作、结果与截图来源](showcase.md)。*

<a id="版本与文档范围"></a>

## 先选对版本

| 你的 DSH | 可公开安装的 OMD | 固定发行 |
| --- | --- | --- |
| `0.2.1-alpha.1` | `0.2.1-alpha.1.omd.0.10.0` | [alpha.1 Release](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-alpha.1.omd.0.10.0) |
| `0.2.0-rc.2`，包括本文桌面教程 | `0.2.0-rc.2.omd.0.10.0` | [rc.2 Release](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.0-rc.2.omd.0.10.0) |

GitHub `main` 的 `0.2.1-alpha.2.omd.0.16.0` 对应 DSH `0.2.1-alpha.2`，**尚未公开发行**，内置较早的 OpenCU 1.6.1 快照。最新本地浏览器与运行时重构也使用 1.6.1 版本号，但尚未合入该快照；相同版本号不表示内容相同。本组文档标明这些差异，它们没有可供普通用户安装的新 Release 链接。公开 `0.10.0` 不包含 `0.11–0.16` 的新增改动。

按完整宿主版本和固定 OMD 版本配对，不用 GitHub `latest` 标记选包。其他版本先查[兼容说明](plugin-compatibility.md)，不要绕过宿主检查。

<a id="日常操作与设置"></a>

## 按需查阅

| 主题 | 详细说明 |
| --- | --- |
| 调用、Token、缓存和上下文预算 | [监控](monitoring.md) |
| 摘要、资料、附件和原文回查 | [上下文机制](context-workflow.md) |
| 会话、项目与全局短记忆（开发分支） | [Dream](dream-memory.md) |
| Pro、Ultracode 与任务恢复 | [Workflow](workflow.md) |
| 主题、28 套配色、字体和壁纸 | [外观](skins.md) |
| 后台任务、期限和阻塞 | [运行状态](runtime-state-background.md) |
| Windows 使用条件 | [Windows](windows.md) |
| CodeGraph、侧问和可选插件 | [使用指南](usage.md) |
| 源码运行、构建与贡献 | [开发入口](development.md) · [贡献约定](../CONTRIBUTING.md) |

## 反馈与参与

[反馈 Bug](https://github.com/gulagala001/oh-my-dsh/issues/new?template=bug-report.yml) · [提出建议](https://github.com/gulagala001/oh-my-dsh/issues/new?template=feature-request.yml) · [推荐插件／申请适配](plugin-submissions.md) · [更新记录](../CHANGELOG.md) · [作者、来源与许可](../THIRD_PARTY_NOTICES.md)

反馈实际版本、运行方式、最短复现和第一处脱敏错误。不要上传凭据或整个数据目录。
