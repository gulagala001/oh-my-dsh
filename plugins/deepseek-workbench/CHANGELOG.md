# DeepSeek Workbench 0.1.2 · DSH 0.2.1-rc.2

[中文](#zh-012) | [English](#en-012)

<a id="zh-012"></a>

## 中文

### 问题修复

- 保留网页会话迁移请求及回执关联，避免回执丢失后重试创建重复会话。
- 保留已经读取的附件；附件写入采用有界并发，失败后等待所有在途写入收尾再返回。

<a id="en-012"></a>

## English

### Bug Fixes

- Preserves web-conversation migration requests and their receipts to avoid duplicate conversations after retrying a lost receipt.
- Retains loaded attachments and bounds concurrent writes, settling outstanding writes before returning a failure.

## 安装 / Installation

在 **插件 → 添加插件** 使用与当前 DSH 完整版本一致的固定包，保留原 profile、配置和数据，待任务结束后重启。

Install the fixed package matching the complete DSH version through **Plugins → Add plugin**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.2 | [DeepSeek Workbench 0.1.2](https://github.com/gulagala001/dsh-deepseek-workbench/releases/download/v0.1.2-dsh.0.2.1-rc.2/dsh-deepseek-workbench-0.1.2-dsh.0.2.1-rc.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-deepseek-workbench/releases/download/v0.1.2-dsh.0.2.1-rc.2/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-deepseek-workbench/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/dsh-deepseek-workbench/blob/main/docs/install_EN.md)

---

# DeepSeek Workbench 0.1.1 · DSH 0.2.1-rc.2

[中文](#zh-011) | [English](#en-011)

<a id="zh-011"></a>

## 中文

### 问题修复

- 修复压缩构建导致独立页面脚本失效的问题，恢复网页聊天与导入功能的脚本执行。
- 网页聊天顶栏使用原生窗口拖动语义，改善拖动与浮窗交互。

### 其他变更

- 更新插件标识、双语安装指南与独立产品说明。

<a id="en-011"></a>

## English

### Bug Fixes

- Preserves standalone page scripts in minified builds so web chat and imports execute correctly.
- Uses native window drag semantics for web-chat headers, improving dragging and floating-window interaction.

### Other Changes

- Updates plugin identities, bilingual installation guides and standalone product documentation.

## 安装 / Installation

在 **插件 → 添加插件** 安装与当前 DSH 完整版本一致的固定包，保留原 profile、配置和数据，待当前任务结束后重启。

Install the fixed package matching the complete DSH version through **Plugins → Add plugin**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.2 | [DeepSeek Workbench 0.1.1](https://github.com/gulagala001/dsh-deepseek-workbench/releases/download/v0.1.1-dsh.0.2.1-rc.2/dsh-deepseek-workbench-0.1.1-dsh.0.2.1-rc.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/dsh-deepseek-workbench/releases/download/v0.1.1-dsh.0.2.1-rc.2/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/dsh-deepseek-workbench/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/dsh-deepseek-workbench/blob/main/docs/install_EN.md)

---

# Changelog

## 0.1.0-dsh.0.2.1-rc.2

- DeepSeek web chat in the main content area, with website history, DeepThink, Search and attachments.
- Temporary sidebar chat with owned website-conversation cleanup before closing and retry after failure.
- API Platform entry in account settings and website-history migration into native DSH conversations.
- Exact DSH 0.2.1-rc.2 / Cordis 4.0.5 compatibility; companion desktop bridge required for embedded website capabilities.

[中文 / English release notes](docs/releases.md)
