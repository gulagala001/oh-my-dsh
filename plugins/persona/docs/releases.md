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
