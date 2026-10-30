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
