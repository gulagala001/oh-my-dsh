# OpenCU 2.0.8 · DSH 0.2.1-rc.1 / 0.2.1-rc.2

[中文](#zh-208) | [English](#en-208)

<a id="zh-208"></a>

## 中文

### 问题修复

- 私有测试浏览器统一隔离凭据，避免访问系统钥匙串；原生与 SDK 工具说明补齐实际启动和清理入口，保留网页测试、截图与 WebGL。
- 修复首次页面就绪竞态、关闭后的请求释放、停止状态下创建标签和异常清理；故障回执保留原始错误。
- 干净重启保留已确认的输入释放结果，避免误报仍有未释放输入。

### 其他变更

- 修复隔离发行目录的文档检查入口，使用真实源码清单检查生成包中的文档。

<a id="en-208"></a>

## English

### Bug Fixes

- Isolates private test-browser credentials to avoid system-keychain access. Native and SDK tool guidance now includes working launch and cleanup entry points while retaining website testing, screenshots and WebGL.
- Fixes first-page readiness races, request release after closing, tab creation while stopped and failure cleanup. Failure receipts preserve the original error.
- Preserves verified input-release results across clean restarts to prevent false reports of unreleased input.

### Other Changes

- Fixes documentation checks in isolated release directories by using the source inventory to check generated package documentation.

## 安装 / Installation

在 **插件 → 添加插件** 使用与当前 DSH 完整版本一致的固定包，保留原 profile、配置和数据，待任务结束后重启。

Install the fixed package matching the complete DSH version through **Plugins → Add plugin**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.2 | [OpenCU 2.0.8](https://github.com/gulagala001/opencu/releases/download/v2.0.8-dsh.0.2.1-rc.2/opencu-2.0.8-dsh.0.2.1-rc.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/opencu/releases/download/v2.0.8-dsh.0.2.1-rc.2/SHA256SUMS) |
| 0.2.1-rc.1 | [OpenCU 2.0.8](https://github.com/gulagala001/opencu/releases/download/v2.0.8-dsh.0.2.1-rc.1/opencu-2.0.8-dsh.0.2.1-rc.1.tgz) | [SHA256SUMS](https://github.com/gulagala001/opencu/releases/download/v2.0.8-dsh.0.2.1-rc.1/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/opencu/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/opencu/blob/main/docs/install_EN.md)
