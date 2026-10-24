# OMD 0.100.2 · DSH 0.2.1-rc.3

[中文](#zh-01002) | [English](#en-01002)

<a id="zh-01002"></a>

## 中文

### 体验优化

- 记忆缓存模式默认开启，保留用户已保存的开关选择。

### 问题修复

- 修复检查更新误报已启用插件未启用的问题，更新检查不再依赖是否开启代理预设。
- 修复 rc.3 固定发行识别和更新附件校验，保留精确宿主、配对版本与禁止降级保护。

<a id="en-01002"></a>

## English

### Improvements

- Memory cache mode is enabled by default, preserving explicitly saved preferences.

### Bug Fixes

- Fixes enabled plugins being reported as disabled during update checks; checks no longer depend on active agent presets.
- Fixes rc.3 release discovery and update attachment validation while preserving exact-host, compatible-pair and downgrade protection.

## 安装 / Installation

2026-10-24 已替换同版本安装包以默认开启记忆缓存模式；已安装此版本的用户可重新添加下方固定包。

The same-version package was replaced on 2026-10-24 to enable memory cache mode by default. Existing users of this version can reinstall the fixed package below.

在 **插件 → 添加插件** 使用下方固定包。精确宿主为 **DSH 0.2.1-rc.3**；保留原 profile、配置与数据，待任务结束后完整重启。

Install the fixed package through **Plugins → Add plugin** on **DSH 0.2.1-rc.3**. Preserve settings and data, then restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [OMD 0.100.2](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.0.100.2/oh-my-dsh-0.2.1-rc.3.omd.0.100.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.0.100.2/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install_EN.md)
