# OpenCU 2.1.1 · DSH 0.2.1-rc.3

[中文](#zh-211) | [English](#en-211)

<a id="zh-211"></a>

## 中文

### 问题修复

- 保留浏览器、原生和扩展目标，按目标处理失效观察、取消与清理回执，恢复时隔离未确认的旧输入责任。
- 修复复合定位、嵌套框架、追加输入及导航／下载等待，更新桌面桥和构建输入。

### 其他变更

- 精确适配 DSH 0.2.1-rc.3，同步匹配的 SDK、组件与冻结依赖；每份安装包仅用于对应宿主版本。

<a id="en-211"></a>

## English

### Bug Fixes

- Preserves browser, native and extension targets while handling stale observations, cancellation and release receipts per target; recovery isolates unconfirmed input ownership.
- Fixes compound locators, nested frames, appended input and navigation/download waits, and updates desktop bridges and build inputs.

### Other Changes

- Targets DSH 0.2.1-rc.3 exactly, with matching SDK, components and frozen dependencies; each package is specific to its host version.

## 安装 / Installation

在 **插件 → 添加插件** 使用下方固定包。精确宿主版本为 **DSH 0.2.1-rc.3**；保留原 profile、配置和数据，待任务结束后重启。

Install the fixed package through **Plugins → Add plugin** on **DSH 0.2.1-rc.3**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [OpenCU 2.1.1](https://github.com/gulagala001/opencu/releases/download/v2.1.1-dsh.0.2.1-rc.3/opencu-2.1.1-dsh.0.2.1-rc.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/opencu/releases/download/v2.1.1-dsh.0.2.1-rc.3/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/opencu/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/opencu/blob/main/docs/install_EN.md)
