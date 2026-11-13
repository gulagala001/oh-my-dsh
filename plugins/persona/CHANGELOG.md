# DSH Persona 0.2.4 · DSH 0.2.2-rc.3

[中文](#zh-024) · [English](#en-024)

<a id="zh-024"></a>

## 中文

### 其他变更

- 适配 DSH 0.2.2-rc.3。

<a id="en-024"></a>

## English

### Other changes

- Adds support for DSH 0.2.2-rc.3.

## 安装 / Installation

DSH **0.2.2-rc.3** · Node.js **24.9.0+**

[固定安装包 / Install package](https://github.com/gulagala001/dsh-persona-plugin/releases/download/v0.2.4-dsh.0.2.2-rc.3/gulagala001-dsh-persona-plugin-0.2.4-dsh.0.2.2-rc.3.tgz) · [安装指南 / Installation guide](https://github.com/gulagala001/dsh-persona-plugin/blob/main/README.md) · [SHA256SUMS](https://github.com/gulagala001/dsh-persona-plugin/releases/download/v0.2.4-dsh.0.2.2-rc.3/SHA256SUMS)

---

# DSH Persona 0.2.3 · DSH 0.2.2-rc.2

[中文](#zh-023) · [English](#en-023)

<a id="zh-023"></a>

## 中文

### 问题修复

- 切换人格时如果上一个实例仍在退出，新实例会在清理完成后重新挂载。

<a id="en-023"></a>

## English

### Bug fixes

- When the previous persona is still shutting down, activate the new instance once cleanup finishes.

已撤回。 / Withdrawn.

---

# DSH Persona 0.2.2 · DSH 0.2.2-rc.1

[中文](#zh-0-2-2-dsh-0-2-2-rc-1) · [English](#en-0-2-2-dsh-0-2-2-rc-1)

<a id="zh-0-2-2-dsh-0-2-2-rc-1"></a>

## 中文

### 体验优化与问题修复

- 权限菜单沿用原生组件，保留人格数据与选择；加入保持原始 Actuary 内容的“精算（英文版）”预设。

### 其他变更

- 精确适配 DSH **0.2.2-rc.1**、Cordis **4.1.0** 与 Schemastery **3.19.0**，使用对应 SDK 与冻结依赖；Node.js 最低版本为 **24.9.0**。
- 保留已有配置、会话与插件数据；原宿主的历史固定发行继续保留。

<a id="en-0-2-2-dsh-0-2-2-rc-1"></a>

## English

### Improvements and fixes

- Keep the native permission picker, persona data and selections; add the economical English preset with the original Actuary content.

### Other changes

- Target exactly DSH **0.2.2-rc.1**, Cordis **4.1.0** and Schemastery **3.19.0**, with matching SDK packages and frozen dependencies; require Node.js **24.9.0** or later.
- Preserve settings, conversations and plugin data. Historical releases remain available for their original hosts.

## 安装 / Installation

| DSH | 固定安装包 / Fixed package | 校验 / Checksums |
| --- | --- | --- |
| 0.2.2-rc.1 | [DSH Persona 0.2.2](https://github.com/gulagala001/dsh-persona-plugin/releases/download/v0.2.2-dsh.0.2.2-rc.1/gulagala001-dsh-persona-plugin-0.2.2-dsh.0.2.2-rc.1.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-persona-plugin/releases/download/v0.2.2-dsh.0.2.2-rc.1/SHA256SUMS) |

在 **插件 → 添加插件** 使用匹配的固定包。保留原 profile、配置与数据，安装后按宿主提示重载。

Use the matching fixed package in **Plugins → Add plugin**. Retain your profile, settings and data, then reload when requested.

[安装指南 / Installation guide](https://github.com/gulagala001/dsh-persona-plugin/blob/main/README.md)

---

## 未发布 · DSH 0.2.2-alpha.3

[中文](#alpha3-zh) | [English](#alpha3-en)

<a id="alpha3-zh"></a>

### 中文

- 增加 DSH 0.2.2-alpha.3 专用构建，精确对齐 SDK、Cordis 与依赖锁；保留当前主线功能和修复。此候选尚未发布，既有安装入口保持不变。

<a id="alpha3-en"></a>

### English

- Add a dedicated DSH 0.2.2-alpha.3 build with exact SDK, Cordis and dependency locks, retaining current features and fixes. This candidate is unpublished; existing installation links remain unchanged.

# DSH Persona 0.2.1 · DSH 0.2.1-rc.5

[中文](#zh-021) | [English](#en-021)

<a id="zh-021"></a>

## 中文

本版适配与验收正在进行，尚未发布。

### 其他变更

- 精确适配 DSH **0.2.1-rc.5**，同步匹配的 SDK、构建输入和完整依赖锁。每份安装包仅用于对应宿主。

<a id="en-021"></a>

## English

This adaptation is under validation and has not been published.

### Other Changes

- Target DSH **0.2.1-rc.5** exactly with matching SDK, build inputs and complete dependency locks. Each package is specific to its host.

## 安装 / Installation

精确宿主为 **DSH 0.2.1-rc.5**。在 **插件 → 添加插件** 中使用下方固定包，保留现有 profile、设置与会话；任务结束后按宿主提示重新加载。

The exact host is **DSH 0.2.1-rc.5**. Use the fixed package in **Plugins → Add plugin**, retaining profiles, settings and conversations; reload after active tasks finish if requested.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.5 | [DSH Persona 0.2.1](https://github.com/gulagala001/dsh-persona-plugin/releases/download/v0.2.1-dsh.0.2.1-rc.5/gulagala001-dsh-persona-plugin-0.2.1-dsh.0.2.1-rc.5.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-persona-plugin/releases/download/v0.2.1-dsh.0.2.1-rc.5/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/dsh-persona-plugin/blob/main/README.md)

---

# DSH Persona 0.2.0 · DSH 0.2.1-rc.3

[中文](#zh-020) | [English](#en-020)

<a id="zh-020"></a>

## 中文

### 新增功能

- 内置人格改为默认、超频、精算，移除软乎乎与硬邦邦；超频和精算沿用既有人格正文，仅调整命名及身份称呼。
- 会话人设默认开启，用户明确关闭的设置和已有自定义人格保留。

### 问题修复

- 已移除的内置人格全局选择回退为默认，会话选择回退全局；自定义内容及引用保留。
- 修复窄面板中控件挤压说明及容器名称不匹配导致单列规则未生效的问题。

<a id="en-020"></a>

## English

### New Features

- Built-in personas are now Default, Overclock and Economical. Retired Softie and Hardcore presets are removed; the two replacements preserve the existing persona text apart from names and identity labels.
- Session personalities are enabled by default, preserving explicit opt-outs and existing custom personas.

### Bug Fixes

- Retired built-in global selections fall back to Default, and conversation selections fall back to the global choice. Custom content and references are retained.
- Fixes compressed descriptions and a mismatched container name that prevented narrow-panel single-column layouts.

## 安装 / Installation

在 **插件 → 添加插件** 使用下方固定包。精确宿主为 **DSH 0.2.1-rc.3**；保留原 profile、配置和会话，待任务结束后完整重启。

Install the fixed package through **Plugins → Add plugin** on **DSH 0.2.1-rc.3**. Preserve the profile, settings and conversations, then restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [DSH Persona 0.2.0](https://github.com/gulagala001/dsh-persona-plugin/releases/download/v0.2.0-dsh.0.2.1-rc.3/gulagala001-dsh-persona-plugin-0.2.0-dsh.0.2.1-rc.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-persona-plugin/releases/download/v0.2.0-dsh.0.2.1-rc.3/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-persona-plugin/blob/main/README.md) · [Installation guide](https://github.com/gulagala001/dsh-persona-plugin/blob/main/README_EN.md)

---

# DSH Persona 0.1.2 · DSH 0.2.1-rc.3

[中文](#zh-012) | [English](#en-012)

<a id="zh-012"></a>

## 中文

### 其他变更

- 精确适配 DSH 0.2.1-rc.3，同步匹配的 SDK、组件与冻结依赖；每份安装包仅用于对应宿主版本。

<a id="en-012"></a>

## English

### Other Changes

- Targets DSH 0.2.1-rc.3 exactly, with matching SDK, components and frozen dependencies; each package is specific to its host version.

## 安装 / Installation

在 **插件 → 添加插件** 使用下方固定包。精确宿主版本为 **DSH 0.2.1-rc.3**；保留原 profile、配置和数据，待任务结束后重启。

Install the fixed package through **Plugins → Add plugin** on **DSH 0.2.1-rc.3**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [DSH Persona 0.1.2](https://github.com/gulagala001/dsh-persona-plugin/releases/download/v0.1.2-dsh.0.2.1-rc.3/gulagala001-dsh-persona-plugin-0.1.2-dsh.0.2.1-rc.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-persona-plugin/releases/download/v0.1.2-dsh.0.2.1-rc.3/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-persona-plugin/blob/main/README.md) · [Installation guide](https://github.com/gulagala001/dsh-persona-plugin/blob/main/README_EN.md)

---

# Persona 0.1.1 · DSH 0.2.1-rc.2

[中文](#zh-011) | [English](#en-011)

<a id="zh-011"></a>

## 中文

### 问题修复

- 人格保存携带读取时的配置版本，原子拒绝过期保存，防止多窗口编辑导致新增预设丢失。
- 保存冲突时保留编辑草稿；预设被外部删除后可将草稿另存为新预设。
- 停用后关闭旧实例写权限，阻止排队导入、迟到读取和旧请求覆盖重新启用后的数据。

<a id="en-011"></a>

## English

### Bug Fixes

- Saves personality settings with the version read by the editor and atomically rejects stale saves, preventing new presets from being lost during multi-window editing.
- Retains editor drafts after save conflicts and allows a draft to be saved as a new preset after external deletion.
- Revokes retired-instance write access, preventing queued imports, late reads and old requests from overwriting data after reactivation.

## 安装 / Installation

在 **插件 → 添加插件** 使用与当前 DSH 完整版本一致的固定包，保留原 profile、配置和数据，待任务结束后重启。

Install the fixed package matching the complete DSH version through **Plugins → Add plugin**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.2 | [Persona 0.1.1](https://github.com/gulagala001/dsh-persona-plugin/releases/download/v0.1.1-dsh.0.2.1-rc.2/gulagala001-dsh-persona-plugin-0.1.1-dsh.0.2.1-rc.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-persona-plugin/releases/download/v0.1.1-dsh.0.2.1-rc.2/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-persona-plugin/blob/main/README.md#安装) · [Installation guide](https://github.com/gulagala001/dsh-persona-plugin/blob/main/README_EN.md)

---

# Persona 0.1.0 · DSH 0.2.1-rc.2

[中文](#zh-010) | [English](#en-010)

<a id="zh-010"></a>

## 中文

### 新增功能

- 提供身份与人格、语言风格、沟通方式、回答呈现四个人格模块，支持继承默认内容。
- 创建、复制、改名、编辑与删除人设；导入／导出 JSON，复制 AI 创作提示词。
- 全局默认与会话独立选择，支持继承、指定人格和关闭人格；保存失败保留编辑草稿。

### 其他变更

- 首次正式发行，按 profile 保存人格数据，使用 MIT 许可。

<a id="en-010"></a>

## English

### New Features

- Provides four personality modules for identity, language style, communication and answer presentation, with default inheritance.
- Creates, duplicates, renames, edits and deletes presets; imports/exports JSON and provides an AI creation prompt.
- Supports global defaults and per-conversation inheritance, specific presets or disabled personality guidance, retaining drafts after save failures.

### Other Changes

- First formal release with profile-scoped personality storage and an MIT license.

## 安装 / Installation

在 **插件 → 添加插件** 安装与当前 DSH 完整版本一致的固定包，保留原 profile、配置和数据，待当前任务结束后重启。

Install the fixed package matching the complete DSH version through **Plugins → Add plugin**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.2 | [Persona 0.1.0](https://github.com/gulagala001/dsh-persona-plugin/releases/download/v0.1.0-dsh.0.2.1-rc.2/gulagala001-dsh-persona-plugin-0.1.0-dsh.0.2.1-rc.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-persona-plugin/releases/download/v0.1.0-dsh.0.2.1-rc.2/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-persona-plugin/blob/main/README.md#安装) · [Installation guide](https://github.com/gulagala001/dsh-persona-plugin/blob/main/README_EN.md)
