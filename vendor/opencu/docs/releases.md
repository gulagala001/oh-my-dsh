# 固定发行 / Fixed Releases

**安装步骤 / Installation:** [简体中文](install.md) · [English](install_EN.md)

安装指南提供两种方式：整段复制给 AI，或在 **插件 → 右上角「+ 添加插件」** 中粘贴固定包 URL 并安装。The guides offer two methods: copy the complete instruction to AI, or paste the fixed package URL through **Plugins → “+ Add plugin” in the top right** and click **Install**.

已装 OMD，无需再装 OpenCU；请按 [OMD 中文指南](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md)／[OMD English guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install_EN.md) 更新。OMD includes OpenCU; no separate installation is needed.

## 2.0.6

## 中文

- 为真实 REA 地址建议补齐当前会话的 ThreadScope／RouteScope，修复该建议入口触发的 `Missing scope instance`。
- 保留选择建议、Escape 关闭、继续编辑和组件卸载行为。

## English

- Supplies the current conversation's ThreadScope/RouteScope to the original REA address suggestions, fixing `Missing scope instance` in that suggestion entry.
- Preserves suggestion selection, Escape dismissal, continued editing and component teardown.

OMD 用户随 OMD 0.18.7 更新内置 OpenCU，无需重复安装。 / OMD users receive bundled OpenCU through OMD 0.18.7.

### 当前固定下载 / Current fixed downloads

| DSH | OpenCU | 固定包 / Fixed package | 发行页 / Release |
| --- | --- | --- | --- |
| `0.2.1-rc.1` | `2.0.6-dsh.0.2.1-rc.1` | [opencu-2.0.6-dsh.0.2.1-rc.1.tgz](https://github.com/gulagala001/opencu/releases/download/v2.0.6-dsh.0.2.1-rc.1/opencu-2.0.6-dsh.0.2.1-rc.1.tgz) | [0.2.1-rc.1](https://github.com/gulagala001/opencu/releases/tag/v2.0.6-dsh.0.2.1-rc.1) |
| `0.2.1-rc.2` | `2.0.6-dsh.0.2.1-rc.2` | [opencu-2.0.6-dsh.0.2.1-rc.2.tgz](https://github.com/gulagala001/opencu/releases/download/v2.0.6-dsh.0.2.1-rc.2/opencu-2.0.6-dsh.0.2.1-rc.2.tgz) | [0.2.1-rc.2](https://github.com/gulagala001/opencu/releases/tag/v2.0.6-dsh.0.2.1-rc.2) |

每份固定发行同时提供 `host-adapters.zip`、`metadata.json` 和 `SHA256SUMS`。宿主适配源码不是完整桌面安装器；完整界面仍需匹配的 Host／Client／preload。 / Each fixed Release also includes `host-adapters.zip`, `metadata.json` and `SHA256SUMS`. Host adapters are source materials, not a complete desktop installer; the full UI still needs matching Host, Client and preload builds.

## 历史发行 / Previous releases

## 2.0.5

## 中文

- 修复 macOS 鼠标事件的目标窗口身份与窗口内坐标，恢复后台原生点击、滚轮与拖拽。
- 将原生光标裁到目标窗口，并遵循实际窗口遮挡与层级；目标隐藏或移位后隐藏光标。
- Electron 预览随所属窗口层级显示，更新、重新显示与窗口转移时不再无条件置顶。

## English

- Fixes target-window identity and local coordinates in macOS pointer events for background native clicks, scrolling and dragging.
- Clips the native cursor to its target window and respects occlusion and window order; hides the cursor when its target is hidden or moved.
- Keeps Electron previews in their owner window order, including updates, redisplay and window transfers, without unconditional raising.

OMD 用户随 OMD 0.18.5 更新内置 OpenCU，无需重复安装。 / OMD users receive bundled OpenCU through OMD 0.18.5.

## 2.0.4

## 中文

- 为扩展断线后的输入释放增加身份与凭据绑定的回执；未知释放状态继续阻断操作。
- 支持人工确认旧浏览器连接恢复，以及冷启动后连接新标签继续工作。
- 保留可终止的 JavaScript worker、持键释放及共享文档恢复修复。

## English

- Binds extension disconnect release receipts to connection identity and credentials; unknown release continues to block input.
- Restores old browser connections after human confirmation and resumes through a new tab after a cold start.
- Preserves cancellable JavaScript workers, held-input release and shared-document recovery fixes.

OMD 用户随 OMD 0.18.4 更新内置 OpenCU，无需重复安装。 / OMD users receive bundled OpenCU through OMD 0.18.4.


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
