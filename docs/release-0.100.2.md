# OMD 0.100.2 · DSH 0.2.1-rc.3

[中文](#zh-01002) | [English](#en-01002)

<a id="zh-01002"></a>

## 中文

### 问题修复

- 修复检查更新误报已启用插件未启用的问题，更新检查不再依赖是否开启代理预设。
- 修复 rc.3 固定发行识别和更新附件校验，保留精确宿主、配对版本与禁止降级保护。

<a id="en-01002"></a>

## English

### Bug Fixes

- Fixes enabled plugins being reported as disabled during update checks; checks no longer depend on active agent presets.
- Fixes rc.3 release discovery and update attachment validation while preserving exact-host, compatible-pair and downgrade protection.

## 安装 / Installation

在 **插件 → 添加插件** 使用下方固定包。精确宿主为 **DSH 0.2.1-rc.3**；保留原 profile、配置与数据，待任务结束后完整重启。

Install the fixed package through **Plugins → Add plugin** on **DSH 0.2.1-rc.3**. Preserve settings and data, then restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [OMD 0.100.2](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.0.100.2/oh-my-dsh-0.2.1-rc.3.omd.0.100.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.0.100.2/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install_EN.md)
