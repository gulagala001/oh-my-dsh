# 固定发行 / Fixed Releases

**安装步骤 / Installation:** [简体中文](install.md) · [English](install_EN.md)

安装指南提供两种方式：整段复制给 AI，或在 **插件 → 右上角「+ 添加插件」** 中粘贴固定包 URL 并安装。The guides offer two methods: copy the complete instruction to AI, or paste the fixed package URL through **Plugins → “+ Add plugin” in the top right** and click **Install**.

已装 OMD，无需再装 OpenCU；请按 [OMD 中文指南](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md)／[OMD English guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install_EN.md) 更新。OMD includes OpenCU; no separate installation is needed.

## 按实际 DSH 完整版本下载 / Match the exact DSH version

| DSH | OpenCU | 固定包 / Fixed package | 发行页 / Release |
| --- | --- | --- | --- |
| `0.2.1-rc.1` | `2.0.0-dsh.0.2.1-rc.1` | [opencu-2.0.0-dsh.0.2.1-rc.1.tgz](https://github.com/gulagala001/opencu/releases/download/v2.0.0-dsh.0.2.1-rc.1/opencu-2.0.0-dsh.0.2.1-rc.1.tgz) | [rc.1](https://github.com/gulagala001/opencu/releases/tag/v2.0.0-dsh.0.2.1-rc.1) |
| `0.2.1-rc.2` | `2.0.0-dsh.0.2.1-rc.2` | [opencu-2.0.0-dsh.0.2.1-rc.2.tgz](https://github.com/gulagala001/opencu/releases/download/v2.0.0-dsh.0.2.1-rc.2/opencu-2.0.0-dsh.0.2.1-rc.2.tgz) | [rc.2](https://github.com/gulagala001/opencu/releases/tag/v2.0.0-dsh.0.2.1-rc.2) |

`0.2.1-rc.1`、`0.2.1-rc.2` 与 `0.2.0-rc.*` 不可混用。These builds are not interchangeable and do not target `0.2.0-rc.*`.

| 附件 / Asset | rc.1 | rc.2 | 用途 / Purpose |
| --- | --- | --- | --- |
| `host-adapters.zip` | [下载 / Download](https://github.com/gulagala001/opencu/releases/download/v2.0.0-dsh.0.2.1-rc.1/host-adapters.zip) | [下载 / Download](https://github.com/gulagala001/opencu/releases/download/v2.0.0-dsh.0.2.1-rc.2/host-adapters.zip) | 宿主适配源码材料，非完整安装器 / Host source adapters, not a complete installer |
| `metadata.json` | [下载 / Download](https://github.com/gulagala001/opencu/releases/download/v2.0.0-dsh.0.2.1-rc.1/metadata.json) | [下载 / Download](https://github.com/gulagala001/opencu/releases/download/v2.0.0-dsh.0.2.1-rc.2/metadata.json) | 该固定发行的版本信息 / Version information for that fixed Release |
| `SHA256SUMS` | [下载 / Download](https://github.com/gulagala001/opencu/releases/download/v2.0.0-dsh.0.2.1-rc.1/SHA256SUMS) | [下载 / Download](https://github.com/gulagala001/opencu/releases/download/v2.0.0-dsh.0.2.1-rc.2/SHA256SUMS) | 下载文件校验值 / Download checksums |

## 插件与完整界面的区别 / Plugin versus full UI

两个 Release 都**不提供完整桌面安装器**。完整内置浏览器、原生监看与相应界面需要针对同一 DSH 版本适配并构建 Host、Client 和 preload；安装插件不会自动替换宿主。需要源码构建时参考 [DEVELOPMENT.md](../DEVELOPMENT.md#构建和本地插件包)。

Neither Release includes a complete desktop installer. The full embedded browser, native monitoring and related UI require Host, Client and preload adapters built for the same DSH version. Installing a plugin does not replace the host. See the [developer instructions (Chinese)](../DEVELOPMENT.md#构建和本地插件包) for source builds.

## 主干与发行包 / Main branch versus Release packages

主干可能包含固定 Release 之后的修复。合并 PR、更新 README 或本地构建，都不表示上述附件已重新发行。固定 URL 不会自动获得主干的新功能；发行包内容以对应 Release 附件为准。

Main may contain fixes added after a fixed Release. Merging a PR, editing a README or building locally does not republish these assets. Fixed URLs do not automatically receive new main-branch features; the corresponding Release assets define what is distributed.

升级时沿用原 profile、`DSH_HOME` 和数据目录，先备份，再按[中文步骤](install.md)或[English steps](install_EN.md)更新并重启对应实例。

For upgrades, retain the original profile, `DSH_HOME` and data directory. Back up, follow the [installation steps](install_EN.md), and restart the corresponding instance.
