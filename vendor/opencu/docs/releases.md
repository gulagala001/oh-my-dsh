# 固定发行 / Fixed Releases

**安装步骤 / Installation:** [简体中文](install.md) · [English](install_EN.md)

安装指南提供两种方式：整段复制给 AI，或在 **插件 → 右上角「+ 添加插件」** 中粘贴固定包 URL 并安装。The guides offer two methods: copy the complete instruction to AI, or paste the fixed package URL through **Plugins → “+ Add plugin” in the top right** and click **Install**.

已装 OMD，无需再装 OpenCU；请按 [OMD 中文指南](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md)／[OMD English guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install_EN.md) 更新。OMD includes OpenCU; no separate installation is needed.

## 2.0.1

[中文](#zh) | [English](#en)

<a id="zh"></a>

## 中文

本次更新改进自 2.0.0 以来的审批、浏览器恢复与批注体验。本次恢复分发原 2.0.1 工件；预设入口问题位于 OMD，使用 OMD 的用户应升级至 0.18.1。

### 新增功能

- 设置页提供与已安装版本匹配的 Chrome／Edge MV3 扩展包下载，并校验包身份与文件哈希。
- 补齐浏览器点击按键组合、按钮、次数与按住时长，以及下拉选择、Unicode 文本编辑和键盘操作。
- 监看支持按目标单独隐藏和恢复；关闭预览不会停止任务，多个目标的截图故障相互隔离。

### 体验优化

- 优化可访问性观察的冗余文本和增量差异输出，保留稳定标识与层级。
- 首次使用提供真实接口说明；普通操作错误保留绑定和已加载文档，超时或主动取消按生命周期清理。

### 问题修复

- 修复默认审批卡片的显示与会话归属、授权复用、拒绝和取消；取消一个请求不再影响其他会话。
- 停止或断线后释放持键与拖拽；恢复时拒绝旧连接迟到响应，不重放结果不明的输入。
- 修复浏览器弹窗生命周期和恢复，以及 macOS AX 文本选择。DSH 内置浏览器支持 alert／confirm；window.prompt 仍不支持。
- 修复高分屏批注错位、SVG 批注导出及共装时总览组件归属；Native Helper 日志改为原子写入并保留既有签名身份。

### 其他变更

- rc.1／rc.2 分别使用匹配的 SDK 和依赖锁。OMD 已内置 OpenCU，无需另装；完整桌面界面需匹配宿主适配。

<a id="en"></a>

## English

This update improves approval, browser recovery and annotations since 2.0.0. The original 2.0.1 artifacts are being republished unchanged. The preset regression was in OMD; OMD users should upgrade to 0.18.1.

### New Features

- Settings can download the Chrome/Edge MV3 extension matching the installed plugin, with package identity and file-hash checks.
- Expands browser clicks with modifiers, button choice, click count and hold duration, alongside select controls, Unicode text editing and keyboard operations.
- Monitoring can be hidden and restored per target without stopping the task, with capture failures isolated across targets.

### Improvements

- Reduces redundant accessibility text and improves ordered incremental differences while preserving stable identifiers and hierarchy.
- First use provides the actual interface documentation. Ordinary operation errors retain bindings and loaded documentation, while timeouts and active cancellation follow lifecycle cleanup.

### Bug Fixes

- Fixes approval-card visibility, session ownership, grant reuse, denial and cancellation. Cancelling one request no longer cancels another session’s request.
- Releases held keys and drags on stop or disconnect, rejects stale responses from older connections, and avoids replaying inputs whose outcome is unknown.
- Fixes browser-dialog lifecycle and recovery, plus macOS AX text selection. The DSH embedded browser supports alert/confirm; window.prompt remains unsupported.
- Fixes high-DPI annotation alignment, SVG annotation export and shared overview ownership. Native Helper journal writes are atomic and retain the existing signing identity.

### Other Changes

- The rc.1 and rc.2 builds use their matching SDKs and lockfiles. OMD already includes OpenCU; full desktop surfaces require matching host adapters.

## 按实际 DSH 完整版本下载 / Match the exact DSH version

| DSH | OpenCU | 固定包 / Fixed package | 发行页 / Release |
| --- | --- | --- | --- |
| `0.2.1-rc.1` | `2.0.1-dsh.0.2.1-rc.1` | [opencu-2.0.1-dsh.0.2.1-rc.1.tgz](https://github.com/gulagala001/opencu/releases/download/v2.0.1-dsh.0.2.1-rc.1/opencu-2.0.1-dsh.0.2.1-rc.1.tgz) | [rc.1](https://github.com/gulagala001/opencu/releases/tag/v2.0.1-dsh.0.2.1-rc.1) |
| `0.2.1-rc.2` | `2.0.1-dsh.0.2.1-rc.2` | [opencu-2.0.1-dsh.0.2.1-rc.2.tgz](https://github.com/gulagala001/opencu/releases/download/v2.0.1-dsh.0.2.1-rc.2/opencu-2.0.1-dsh.0.2.1-rc.2.tgz) | [rc.2](https://github.com/gulagala001/opencu/releases/tag/v2.0.1-dsh.0.2.1-rc.2) |

`0.2.1-rc.1`、`0.2.1-rc.2` 与 `0.2.0-rc.*` 不可混用。These builds are not interchangeable and do not target `0.2.0-rc.*`.

| 附件 / Asset | rc.1 | rc.2 | 用途 / Purpose |
| --- | --- | --- | --- |
| `host-adapters.zip` | [下载 / Download](https://github.com/gulagala001/opencu/releases/download/v2.0.1-dsh.0.2.1-rc.1/host-adapters.zip) | [下载 / Download](https://github.com/gulagala001/opencu/releases/download/v2.0.1-dsh.0.2.1-rc.2/host-adapters.zip) | 宿主适配源码材料，非完整安装器 / Host source adapters, not a complete installer |
| `metadata.json` | [下载 / Download](https://github.com/gulagala001/opencu/releases/download/v2.0.1-dsh.0.2.1-rc.1/metadata.json) | [下载 / Download](https://github.com/gulagala001/opencu/releases/download/v2.0.1-dsh.0.2.1-rc.2/metadata.json) | 该固定发行的版本信息 / Version information for that fixed Release |
| `SHA256SUMS` | [下载 / Download](https://github.com/gulagala001/opencu/releases/download/v2.0.1-dsh.0.2.1-rc.1/SHA256SUMS) | [下载 / Download](https://github.com/gulagala001/opencu/releases/download/v2.0.1-dsh.0.2.1-rc.2/SHA256SUMS) | 下载文件校验值 / Download checksums |

## 插件与完整界面的区别 / Plugin versus full UI

两个 Release 都**不提供完整桌面安装器**。完整内置浏览器、原生监看与相应界面需要针对同一 DSH 版本适配并构建 Host、Client 和 preload；安装插件不会自动替换宿主。需要源码构建时参考 [DEVELOPMENT.md](../DEVELOPMENT.md#构建和本地插件包)。

Neither Release includes a complete desktop installer. The full embedded browser, native monitoring and related UI require Host, Client and preload adapters built for the same DSH version. Installing a plugin does not replace the host. See the [developer instructions (Chinese)](../DEVELOPMENT.md#构建和本地插件包) for source builds.

## 主干与发行包 / Main branch versus Release packages

主干可能包含固定 Release 之后的修复。合并 PR、更新 README 或本地构建，都不表示上述附件已重新发行。固定 URL 不会自动获得主干的新功能；发行包内容以对应 Release 附件为准。

Main may contain fixes added after a fixed Release. Merging a PR, editing a README or building locally does not republish these assets. Fixed URLs do not automatically receive new main-branch features; the corresponding Release assets define what is distributed.

升级时沿用原 profile、`DSH_HOME` 和数据目录，先备份，再按[中文步骤](install.md)或[English steps](install_EN.md)更新并重启对应实例。

For upgrades, retain the original profile, `DSH_HOME` and data directory. Back up, follow the [installation steps](install_EN.md), and restart the corresponding instance.

## 市场同步记录（2026-10-18）

[Awesome DSH Plugin 投稿／更新](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/7930)：本次投稿待审。本次维护同一仓库条目，向共用该数据源的下游不重复投稿。自动发现 topics 已配置，市场同步与外部审核尚未确认完成；当前安装请使用上方固定 Release 地址。
