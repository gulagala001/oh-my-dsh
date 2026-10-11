# 实拍案例与素材来源

[English](showcase_EN.md) · [项目介绍](../README.md) · [目录](README.md) · [首次使用](getting-started.md)

虚构业务和本地受控示例模型，文件、网页、下载、检查与交付真执行。不代表供应商模型能力或当前公开发行包。

<a id="当前本地案例采购单"></a>

## 当前本地案例：采购单

**问题：** 青禾工坊的办公文具采购单已准备好，需要用户补充送货信息，助手再读取保存后的结果。

**操作：** 从唯一的 **浏览器** 入口打开采购单。用户在预览中填写日期 **2026-10-18**、收货人 **林夏**、备注 **“请在下午送达，纸箱分批标记。”**，实际保存后恢复控制。CU 工具随后读取页面，核对填写内容、合计 **¥3480** 和 **已确认交付** 状态。

[![统一浏览器中的青禾工坊采购单：送货信息已保存，合计 3480 元](images/showcase-browser.png)](images/showcase-browser.png)

**结果：** 保存后的页面保留用户填写的信息，助手读到了对应金额与状态。页面的“已确认交付”是虚构订单状态，不表示现实采购或收货发生。

本例运行于 DSH `0.2.0-rc.2`／OMD `0.2.0-rc.2.omd.0.16.0`／OpenCU `1.6.1`，属于**未发布本地实现**。受控示例模型配合实际 CU 工具；页面中的配图由 AI 生成，界面、字段与操作结果未编辑。本次使用实际控制 API 操作和恢复，未验证界面的可见停止按钮。

## Launchpad：从要求到交付

下面保留早期版本的 CSV 工作流，作为任务、上下文与交付的独立案例。

**问题：** 导出发布清单时不能漏掉未验收事项。

**要求：** 8 条事项、3 条待验收，CSV 为 UTF-8 + BOM，固定六列“编号、事项、负责人、优先级、状态、验收说明”，逐字段检查后交付 CSV 和要求文件。

| 阶段 | 实际操作与结果 | 截图 |
| --- | --- | --- |
| 固定要求 | 读要求，任务留原话和锚点。 | [要求](site/media/launchpad-requirements.jpg) |
| 网页操作 | 预备示例页搜索、筛选、刷新恢复、导出并存下载。 | [浏览器](site/media/launchpad-browser.jpg) |
| 核对文件 | 检查 BOM、六列、8／3 条数与全部字段，存 PASS。 | [任务](site/media/launchpad-tasks.jpg) |
| 长任务继续 | 实际整理压缩，原话留档。 | [上下文](site/media/launchpad-context.jpg) |
| 精确回查 | 压缩后读最初编码与列顺序。 | [原话](site/media/launchpad-recall.jpg) |
| 交付查看 | CSV／Markdown 可打开，工作台有完成记录。 | [工作台](site/media/launchpad-workbench.jpg) |

[![对话中交付 CSV 和要求，保留检查结果](site/media/launchpad-workbench.jpg)](site/media/launchpad-workbench.jpg)

**结果：** 文件满足约定、未验收完整保留。业务“已验收／待验收”是虚构数据，两个工作任务与文件检查才是实际执行结果，不算产品工程验收数量。

<details>
<summary>要求与回查实拍</summary>

![原始编码、列与事项要求](site/media/launchpad-requirements.jpg)

![压缩后回查 CSV 原话](site/media/launchpad-recall.jpg)

</details>

## 主题与设置

同一份已执行任务／文件用于五套明暗展示，主题名只指外观，不提供品牌模型账号或服务。

| 外观 | 浅色 | 深色 |
| --- | --- | --- |
| OMD 默认 | [浅色](site/media/theme-omd-light.jpg) | [深色](site/media/theme-omd-dark.jpg) |
| Codex Desktop | [浅色](site/media/theme-codex-light.jpg) | [深色](site/media/theme-codex-dark.jpg) |
| iOS Liquid Glass | [浅色](site/media/theme-glass-light.jpg) | [深色](site/media/theme-glass-dark.jpg) |
| Claude CLI | [浅色](site/media/theme-terminal-light.jpg) | [深色](site/media/theme-terminal-dark.jpg) |
| Google Material | [浅色](site/media/theme-material-light.jpg) | [深色](site/media/theme-material-dark.jpg) |

![Liquid Glass 浅色同任务交付](site/media/theme-glass-light.jpg)

[外观实拍](site/media/launchpad-appearance.jpg) · [推荐目录实拍](site/media/launchpad-plugins.jpg) · [外观指南](skins.md)

## 实拍范围

早期 Launchpad 于 2026-10-10 使用隔离 DSH `0.2.1-alpha.2`／OMD `0.13.0` 开发环境、OpenCU `1.5.0` 拍摄。人物、清单、状态虚构，网页预先准备；受控模型安排响应／调用，宿主循环真执行。当前本地采购单的版本和操作范围见上方专节。

不评估供应商自主规划、摘要质量或速度，无真实订阅、私人材料、原生桌面权限，不证明 Windows 实机、全部第三方版本或公开发布。拍摄窗口、准备批次和手动压缩不改用户默认。

GitHub alpha.2 OMD `0.16.0` 未发行，内置较早 OpenCU `1.6.1` 快照；最新本地同版本重构尚未合入它，截图不是公开 `0.10.0` 的功能承诺。

## 实拍与插画

运行点击实拍，不改消息、任务状态、结果或文字，局部仅裁切。[素材清单](site/media/manifest.json)存尺寸、日期、版本与校验。网页切图只浏览，不执行任务。

机制 SVG 是说明图，品牌插画用于介绍，不作界面或执行证据。

## 批注示例

[批注图](images/readme-annotation.png)是独立元素选择／临时样式案例，[清单](images/readme-screenshots.json)有版本范围；临时 CSS 不算源码修改，初始业务数据不算工程结果。
