# OMD 1.2.2 · DSH 0.2.1-rc.5

[中文](#zh-122) | [English](#en-122)

<a id="zh-122"></a>

## 中文

### 问题修复

- 适配新版思考正文的原文／展示文本契约，保留流式预览、连续思考合并与第三方翻译扩展。
- 同步 OpenCU 批注显示修复；图片、网页、文档和文字批注在发送、排队及插话时使用原生展示规则。

### 其他变更

- 现有 `context_view` 新增 DOCX、PDF 文本层、CSV／TSV 和 XLSX 读取；PTC 原文回查精简重复展示，保留工具参数和程序返回值。
- 精确适配 DSH **0.2.1-rc.5**，同步匹配的 SDK、构建输入和完整依赖锁。每份安装包仅用于对应宿主。

<a id="en-122"></a>

## English

### Bug Fixes

- Adapt to the native raw/display reasoning text contract while preserving streaming previews, consecutive reasoning groups and third-party translation extensions.
- Include the OpenCU annotation display fix across images, pages, documents and text in sends, queues and steering.

### Other Changes

- Add DOCX, PDF text-layer, CSV/TSV and XLSX reading through `context_view`; simplify duplicate PTC recall display while preserving tool arguments and program return values.
- Target DSH **0.2.1-rc.5** exactly with matching SDK, build inputs and complete dependency locks. Each package is specific to its host.

## 安装 / Installation

精确宿主为 **DSH 0.2.1-rc.5**。在 **插件 → 添加插件** 中使用下方固定包，保留现有 profile、设置与会话；任务结束后按宿主提示重新加载。

The exact host is **DSH 0.2.1-rc.5**. Use the fixed package in **Plugins → Add plugin**, retaining profiles, settings and conversations; reload after active tasks finish if requested.

桌面侧栏及输入／关闭增强需要本版 `host/` 适配源码重建匹配的桌面宿主后完整重启。

Desktop sidebar, input and closure enhancements require rebuilding the matching desktop host with this release’s `host/` adapter sources, then restarting fully.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.5 | [OMD 1.2.2](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.5.omd.1.2.2/oh-my-dsh-0.2.1-rc.5.omd.1.2.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.5.omd.1.2.2/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md)
