# DSH Extensions 0.1.2 · DSH 0.2.1-rc.3

[中文](#zh-012) | [English](#en-012)

<a id="zh-012"></a>

## 中文

### 问题修复

- 命令、技能与指令统一读取活跃原生预设和提供方，修复目录归属、取消及保存／删除交错。

### 其他变更

- 精确适配 DSH 0.2.1-rc.3，同步匹配的 SDK、组件与冻结依赖；每份安装包仅用于对应宿主版本。

<a id="en-012"></a>

## English

### Bug Fixes

- Commands, skills and instructions use active native presets and providers consistently, fixing ownership, cancellation and save/delete races.

### Other Changes

- Targets DSH 0.2.1-rc.3 exactly, with matching SDK, components and frozen dependencies; each package is specific to its host version.

## 安装 / Installation

在 **插件 → 添加插件** 使用下方固定包。精确宿主版本为 **DSH 0.2.1-rc.3**；保留原 profile、配置和数据，待任务结束后重启。

Install the fixed package through **Plugins → Add plugin** on **DSH 0.2.1-rc.3**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [DSH Extensions 0.1.2](https://github.com/gulagala001/dsh-extensions/releases/download/v0.1.2-dsh.0.2.1-rc.3/dsh-extensions-0.1.2-dsh.0.2.1-rc.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-extensions/releases/download/v0.1.2-dsh.0.2.1-rc.3/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-extensions/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/dsh-extensions/blob/main/docs/install_EN.md)

---

# DSH Extensions 0.1.1 · DSH 0.2.1-rc.2

[中文](#zh-011) | [English](#en-011)

<a id="zh-011"></a>

## 中文

### 问题修复

- 串行保存扩展配置，防止并发编辑覆盖彼此的结果，并修正 MCP 配置归属。
- 扩展停用或请求取消时终止其命令与运行任务，完整收尾已派发工作，避免旧实例继续写入状态。

<a id="en-011"></a>

## English

### Bug Fixes

- Serializes extension configuration updates to prevent concurrent edits from overwriting one another and corrects MCP configuration ownership.
- Stops owned commands and runtime tasks on extension shutdown or request cancellation, settling dispatched work so retired instances cannot keep updating state.

## 安装 / Installation

在 **插件 → 添加插件** 使用与当前 DSH 完整版本一致的固定包，保留原 profile、配置和数据，待任务结束后重启。

Install the fixed package matching the complete DSH version through **Plugins → Add plugin**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.2 | [DSH Extensions 0.1.1](https://github.com/gulagala001/dsh-extensions/releases/download/v0.1.1-dsh.0.2.1-rc.2/dsh-extensions-0.1.1-dsh.0.2.1-rc.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-extensions/releases/download/v0.1.1-dsh.0.2.1-rc.2/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-extensions/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/dsh-extensions/blob/main/docs/install_EN.md)

---

# DSH Extensions 0.1.0 · DSH 0.2.1-rc.2

[中文](#zh-010) | [English](#en-010)

<a id="zh-010"></a>

## 中文

### 新增功能

- 在插件页集中管理 Skill、MCP、指令文件、自定义命令与 Hooks。
- 按来源查看 Skill，切换模型／手动调用，支持创建、导入、编辑和删除。
- 添加 stdio 与 Streamable HTTP MCP 服务器，导入配置、管理服务器及工具开关，并重新连接。
- 管理个人与项目指令文件；使用带参数的自定义斜杠命令，并试运行会话与工具事件 Hooks。

### 其他变更

- 首次正式发行，使用固定 GitHub 安装包、MIT 许可与精确宿主版本。

<a id="en-010"></a>

## English

### New Features

- Manages skills, MCP servers, instruction files, custom commands and hooks from the Plugins page.
- Groups skills by source and supports model/manual invocation switches, creation, import, editing and deletion.
- Adds stdio and Streamable HTTP MCP servers, imports configuration, manages server/tool switches and reconnects.
- Manages personal and project instruction files, parameterized slash commands and trial runs of session/tool event hooks.

### Other Changes

- First formal release with fixed GitHub installation packages, an MIT license and exact host targeting.

## 安装 / Installation

在 **插件 → 添加插件** 安装与当前 DSH 完整版本一致的固定包，保留原 profile、配置和数据，待当前任务结束后重启。

Install the fixed package matching the complete DSH version through **Plugins → Add plugin**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.2 | [DSH Extensions 0.1.0](https://github.com/gulagala001/dsh-extensions/releases/download/v0.1.0-dsh.0.2.1-rc.2/dsh-extensions-0.1.0-dsh.0.2.1-rc.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-extensions/releases/download/v0.1.0-dsh.0.2.1-rc.2/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-extensions/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/dsh-extensions/blob/main/docs/install_EN.md)
