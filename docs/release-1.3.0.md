# OMD 1.3.0 · DSH 0.2.1-rc.5

[中文](#zh-130) | [English](#en-130)

<a id="zh-130"></a>

## 中文

### 新增功能

- 新增“精算（英文版）”内置人格，完整保留 Actuary 的身份、语言风格、沟通方式和回答呈现，仅调整预设显示名称。

### 问题修复

- 集成 OpenCU 2.2.6，修复复制失败却显示成功，以及不适用于 DSH 的 ChatGPT 焦点提示。
- 统一链接、新标签页、下载、文件打开、文件内容复制和本地图片读取的 DSH 适配，保留发起会话，正确处理取消、准备失败及真实操作错误。
- 补齐文件预览下载动作，清理不可用的云端菜单与宿主文案。

<a id="en-130"></a>

## English

### New Features

- Add the built-in Economical (English) preset, preserving Actuary’s identity, language style, communication and answer-presentation content with only the preset display name changed.

### Bug Fixes

- Include OpenCU 2.2.6, fixing false copy success and the ChatGPT focus instruction that does not apply to DSH.
- Align links, new tabs, downloads, file opening, file-content copying and local image reads with DSH, retaining the originating conversation and handling cancellation, failed preparation and real action errors.
- Restore file-preview downloads and remove unavailable cloud menus and inappropriate host wording.

## 安装 / Installation

精确宿主为 **DSH 0.2.1-rc.5**。在 **插件 → 添加插件** 中使用下方固定包，保留现有 profile、设置与会话；任务结束后按宿主提示重新加载。

The exact host is **DSH 0.2.1-rc.5**. Use the fixed package in **Plugins → Add plugin**, retaining profiles, settings and conversations; reload after active tasks finish if requested.

完整内置浏览器、桌面文件操作与电脑操作界面需要匹配的桌面宿主适配。已使用匹配适配的安装可直接升级插件；其余安装按安装指南使用 `host-adapters.zip` 构建宿主。

The embedded browser, desktop file actions and full computer-use interface require the matching desktop host adapter. Installations already using that adapter can update the plugin directly; otherwise follow the installation guide and build the host with `host-adapters.zip`.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.5 | [OMD 1.3.0](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.5.omd.1.3.0/oh-my-dsh-0.2.1-rc.5.omd.1.3.0.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.5.omd.1.3.0/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md) · [宿主适配源码 / Host adapter sources](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.5.omd.1.3.0/host-adapters.zip)
