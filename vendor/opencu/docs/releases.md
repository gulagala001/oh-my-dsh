# 固定发行 / Fixed Releases

**安装步骤 / Installation:** [简体中文](install.md) · [English](install_EN.md)

安装指南提供两种方式：整段复制给 AI，或在 **插件 → 右上角「+ 添加插件」** 中粘贴固定包 URL 并安装。The guides offer two methods: copy the complete instruction to AI, or paste the fixed package URL through **Plugins → “+ Add plugin” in the top right** and click **Install**.

已装 OMD，无需再装 OpenCU；请按 [OMD 中文指南](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md)／[OMD English guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install_EN.md) 更新。OMD includes OpenCU; no separate installation is needed.

## 2.0.3

## 中文

- 将电脑 JavaScript 执行放入独立 worker，隔离 CPU 密集或同步代码，保留会话绑定与可恢复的停止边界。
- 修复 Windows、Linux X11 和 Wayland 持键／持鼠操作对已按住输入的处理，保持按下、移动和释放语义一致。
- 修复断线后的输入释放与持久恢复，隔离取消后迟到的观察结果。
- 改进 Electron、浏览器扩展及共享文档服务的释放顺序；保存失败保留编辑状态并允许重试，未确认释放时继续阻断控制。
- rc.1／rc.2 使用各自固定 SDK、前端与根依赖锁，保留 macOS Helper 签名及扩展身份。

## English

- Runs computer JavaScript in a separate worker, isolating CPU-heavy or synchronous code while preserving session bindings and recoverable stop boundaries.
- Fixes held-key and held-button handling on Windows, Linux X11 and Wayland so press, move and release operations remain consistent.
- Repairs input release and durable recovery after disconnect, and isolates observation results that arrive after cancellation.
- Improves release ordering across Electron, the browser extension and shared document services. Failed saves retain the editing state and allow retry; unconfirmed release continues to block control.
- Builds rc.1 and rc.2 with their own fixed SDK, frontend and root dependency locks, preserving the macOS Helper signature and extension identity.

OMD 用户随 OMD 0.18.3 更新内置 OpenCU，无需重复安装。 / OMD users receive bundled OpenCU through OMD 0.18.3; no separate installation is needed.

### 当前固定下载 / Current fixed downloads

| DSH | OpenCU | 固定包 / Fixed package | 发行页 / Release |
| --- | --- | --- | --- |
| `0.2.1-rc.1` | `2.0.3-dsh.0.2.1-rc.1` | [opencu-2.0.3-dsh.0.2.1-rc.1.tgz](https://github.com/gulagala001/opencu/releases/download/v2.0.3-dsh.0.2.1-rc.1/opencu-2.0.3-dsh.0.2.1-rc.1.tgz) | [0.2.1-rc.1](https://github.com/gulagala001/opencu/releases/tag/v2.0.3-dsh.0.2.1-rc.1) |
| `0.2.1-rc.2` | `2.0.3-dsh.0.2.1-rc.2` | [opencu-2.0.3-dsh.0.2.1-rc.2.tgz](https://github.com/gulagala001/opencu/releases/download/v2.0.3-dsh.0.2.1-rc.2/opencu-2.0.3-dsh.0.2.1-rc.2.tgz) | [0.2.1-rc.2](https://github.com/gulagala001/opencu/releases/tag/v2.0.3-dsh.0.2.1-rc.2) |

每份固定发行同时提供 `host-adapters.zip`、`metadata.json` 和 `SHA256SUMS`。宿主适配源码不是完整桌面安装器；完整界面仍需匹配的 Host／Client／preload。 / Each fixed Release also includes `host-adapters.zip`, `metadata.json` and `SHA256SUMS`. Host adapters are source materials, not a complete desktop installer; the full UI still needs matching Host, Client and preload builds.

## 历史发行 / Previous releases

## 2.0.2

[中文](#zh) | [English](#en)

<a id="zh"></a>

## 中文

OpenCU 2.0.2 汇总 2.0.1 之后的修复，改进审批目标的一致性、停止操作时的输入释放，以及两套宿主构建的可复现性。OMD 用户随 OMD 0.18.2 更新内置 OpenCU，无需重复安装。

### 审批与目标归属

- 审批固定到请求时的目标身份；应用或标签页变化后，旧审批不能用于操作新目标。
- 拒绝、取消与断线按实际会话清理，不把迟到的读取结果当作新连接响应。

### 停止与恢复

- 控制器、macOS Helper 与 MV3 扩展都可取消等待中的观察，避免读取停滞阻碍停止。
- 停止与取消时释放已按住的键鼠，保留输入回执；结果不明的输入仍不自动重放。

### 浏览器观察与连接设置

- 截图与返回的观察信息保持一致，避免混用不同次读取的内容。
- 扩展观察取消后隔离迟到结果，后续调用可重新获取状态。
- 修复 Chrome／Edge 连接设置中安装说明被挤成单字窄列的问题；安装、配对、profile 选择与已连接状态使用上下排列。

### 构建与兼容

- rc.1／rc.2 分别保存完整 SDK 与前端依赖锁；构建强制使用冻结锁并核对实际安装版本。
- 对应源码变体携带匹配的根 npm 锁，避免源码安装混入其他宿主版本。
- 保留现有 macOS Helper 签名身份。仅支持表中精确宿主版本；完整桌面界面仍需匹配的 Host、Client 与 preload 适配。

<a id="en"></a>

## English

OpenCU 2.0.2 brings together fixes added after 2.0.1: consistent approval targets, input release when stopping, and reproducible builds for both supported hosts. OMD users receive the bundled OpenCU through OMD 0.18.2 and do not need a separate installation.

### Approval and target ownership

- Approval is pinned to the target identity requested. A previous approval cannot operate a replacement app or tab.
- Denial, cancellation and disconnect clean up the actual session and reject late read results from older connections.

### Stop and recovery

- The controller, macOS Helper and MV3 extension can cancel pending observations, preventing stalled reads from blocking stop.
- Stop and cancellation release held keys and mouse buttons while preserving input acknowledgements. Inputs with an unknown outcome are still not replayed automatically.

### Browser observation and connection settings

- Screenshots remain consistent with the returned observation instead of mixing data from different reads.
- Extension observation cancellation isolates late results and permits fresh state reads on later calls.
- Fixes Chrome/Edge connection instructions collapsing into a one-character-wide column. Installation, pairing, profile choices and connected status now stack their text and controls vertically.

### Build and compatibility

- The rc.1 and rc.2 variants preserve complete SDK and frontend lockfiles. Builds require frozen installation and verify the actual installed versions.
- Each source variant carries the matching root npm lockfile to prevent installation against another host's SDK graph.
- Preserves the existing macOS Helper signing identity. Only the exact host versions below are supported; full desktop surfaces still require matching Host, Client and preload adapters.

## 按实际 DSH 完整版本下载 / Match the exact DSH version

| DSH | OpenCU | 固定包 / Fixed package | 发行页 / Release |
| --- | --- | --- | --- |
| `0.2.1-rc.1` | `2.0.2-dsh.0.2.1-rc.1` | [opencu-2.0.2-dsh.0.2.1-rc.1.tgz](https://github.com/gulagala001/opencu/releases/download/v2.0.2-dsh.0.2.1-rc.1/opencu-2.0.2-dsh.0.2.1-rc.1.tgz) | [rc.1](https://github.com/gulagala001/opencu/releases/tag/v2.0.2-dsh.0.2.1-rc.1) |
| `0.2.1-rc.2` | `2.0.2-dsh.0.2.1-rc.2` | [opencu-2.0.2-dsh.0.2.1-rc.2.tgz](https://github.com/gulagala001/opencu/releases/download/v2.0.2-dsh.0.2.1-rc.2/opencu-2.0.2-dsh.0.2.1-rc.2.tgz) | [rc.2](https://github.com/gulagala001/opencu/releases/tag/v2.0.2-dsh.0.2.1-rc.2) |

`0.2.1-rc.1`、`0.2.1-rc.2` 与 `0.2.0-rc.*` 不可混用。These builds are not interchangeable and do not target `0.2.0-rc.*`.

| 附件 / Asset | rc.1 | rc.2 | 用途 / Purpose |
| --- | --- | --- | --- |
| `host-adapters.zip` | [下载 / Download](https://github.com/gulagala001/opencu/releases/download/v2.0.2-dsh.0.2.1-rc.1/host-adapters.zip) | [下载 / Download](https://github.com/gulagala001/opencu/releases/download/v2.0.2-dsh.0.2.1-rc.2/host-adapters.zip) | 宿主适配源码材料，非完整安装器 / Host source adapters, not a complete installer |
| `metadata.json` | [下载 / Download](https://github.com/gulagala001/opencu/releases/download/v2.0.2-dsh.0.2.1-rc.1/metadata.json) | [下载 / Download](https://github.com/gulagala001/opencu/releases/download/v2.0.2-dsh.0.2.1-rc.2/metadata.json) | 该固定发行的版本信息 / Version information for that fixed Release |
| `SHA256SUMS` | [下载 / Download](https://github.com/gulagala001/opencu/releases/download/v2.0.2-dsh.0.2.1-rc.1/SHA256SUMS) | [下载 / Download](https://github.com/gulagala001/opencu/releases/download/v2.0.2-dsh.0.2.1-rc.2/SHA256SUMS) | 下载文件校验值 / Download checksums |

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
