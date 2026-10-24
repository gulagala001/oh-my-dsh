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
