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

---

# OpenCU 2.0.7 · DSH 0.2.1-rc.1 / 0.2.1-rc.2

[中文](#zh-207) | [English](#en-207)

<a id="zh-207"></a>

## 中文

### 新增功能

- 前端按需加载浏览器、文档与预览组件，保留统一工作台和共享服务。

### 体验优化

- 复用浏览器活动监测、目标描述和已交付预览；精确选择目标时减少重复发现。
- 将连续浏览器预览合成移出界面线程，worker 进度只传新增文本，保留完整 AX、最终结果、附件与历史。

### 问题修复

- 贯通目标发现、扩展选择与聚焦的取消，修复目标替换、浏览器恢复和挂起读取之间的冲突。
- 失败或取消时收尾已派发调用；输入释放失败保留重试责任，空闲会话退出也处理待释放输入。
- 修复应用审批反馈、扩展目录与下载交互，完善 Windows 原生控件归属校验、读树超时和授权诊断。

### 其他变更

- 公开文件检查覆盖当前加载入口、前端分块、清单与逐文件哈希，测试夹具同步当前服务契约。

<a id="en-207"></a>

## English

### New Features

- Loads browser, document and preview components on demand while retaining the unified workspace and shared services.

### Improvements

- Reuses browser activity monitoring, target descriptors and delivered previews; exact target selection avoids repeated discovery.
- Moves continuous preview composition off the UI thread and transfers incremental worker progress while retaining complete AX, final results, attachments and history.

### Bug Fixes

- Connects cancellation across discovery, extension selection and focus, and resolves conflicts involving target replacement, browser recovery and stalled reads.
- Settles dispatched calls on failure or cancellation; failed input release remains retryable, including during idle-session shutdown.
- Fixes application-approval feedback and extension-folder/download interactions; improves Windows control ownership, tree-read timeouts and approval diagnostics.

### Other Changes

- Distribution checks cover the current loader, frontend chunks, manifests and file hashes; test fixtures follow the current service contract.

## 安装 / Installation

在 **插件 → 添加插件** 安装与当前 DSH 完整版本一致的固定包，保留原 profile、配置和数据，待当前任务结束后重启。

Install the fixed package matching the complete DSH version through **Plugins → Add plugin**. Preserve the profile, settings and data, and restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.1 | [OpenCU 2.0.7](https://github.com/gulagala001/opencu/releases/download/v2.0.7-dsh.0.2.1-rc.1/opencu-2.0.7-dsh.0.2.1-rc.1.tgz) | [SHA256SUMS](https://github.com/gulagala001/opencu/releases/download/v2.0.7-dsh.0.2.1-rc.1/SHA256SUMS) |
| 0.2.1-rc.2 | [OpenCU 2.0.7](https://github.com/gulagala001/opencu/releases/download/v2.0.7-dsh.0.2.1-rc.2/opencu-2.0.7-dsh.0.2.1-rc.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/opencu/releases/download/v2.0.7-dsh.0.2.1-rc.2/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/opencu/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/opencu/blob/main/docs/install_EN.md)

---

# OpenCU 2.0.6 · DSH 0.2.1-rc.1 / rc.2

[中文](#zh-206) | [English](#en-206)

<a id="zh-206"></a>

## 中文

### 问题修复

- 为真实 REA 地址建议补齐当前会话的 ThreadScope／RouteScope，修复该建议入口触发的 `Missing scope instance`。
- 保留选择建议、Escape 关闭、继续编辑和组件卸载行为。

### 其他变更

- 分别提供匹配 DSH 0.2.1-rc.1 与 rc.2 的构建，保留原有 Helper 与扩展身份。完整内置浏览器和原生监看仍需对应宿主适配；插件不会自动替换宿主。

<a id="en-206"></a>

## English

### Bug Fixes

- Supplies the current conversation's ThreadScope/RouteScope to the original REA address suggestions, fixing `Missing scope instance` in that suggestion entry.
- Preserves suggestion selection, Escape dismissal, continued editing and component teardown.

### Other Changes

- Separate builds target DSH 0.2.1-rc.1 and rc.2, retaining the existing Helper and extension identities. Full embedded-browser and native-monitoring surfaces still require matching host adapters; installing a plugin does not replace the host.

## 安装 / Installation

仅适用于 DSH **0.2.1-rc.1** 与 **0.2.1-rc.2**，按实际完整版本选包，不可混用。打开 **插件 → ＋ 添加插件**，粘贴对应地址。更新保留原 profile、配置与数据，任务结束后重启对应实例。

For DSH **0.2.1-rc.1** and **0.2.1-rc.2** only; choose the package for the exact installed version. Open **Plugins → Add Plugin** and paste the matching URL. Keep the existing profile, configuration and data, and restart the instance after active tasks finish.

DSH 0.2.1-rc.1:

```text
https://github.com/gulagala001/opencu/releases/download/v2.0.6-dsh.0.2.1-rc.1/opencu-2.0.6-dsh.0.2.1-rc.1.tgz
```

DSH 0.2.1-rc.2:

```text
https://github.com/gulagala001/opencu/releases/download/v2.0.6-dsh.0.2.1-rc.2/opencu-2.0.6-dsh.0.2.1-rc.2.tgz
```

[完整安装指南（含复制给 AI 的指令） / Installation guide](https://github.com/gulagala001/opencu/blob/main/docs/install.md)

校验值见各发行附件 SHA256SUMS。Checksums are provided in each Release's SHA256SUMS.

# OpenCU 2.0.5 · DSH 0.2.1-rc.1 / rc.2

[中文](#zh-205) | [English](#en-205)

<a id="zh-205"></a>

## 中文

### 问题修复

- 修复 macOS 鼠标事件的目标窗口身份与窗口内坐标，恢复后台原生点击、滚轮与拖拽。
- 将原生光标裁到目标窗口，并遵循实际窗口遮挡与层级；目标隐藏或移位后隐藏光标。
- Electron 预览随所属窗口层级显示，更新、重新显示与窗口转移时不再无条件置顶。

<a id="en-205"></a>

## English

### Bug Fixes

- Fixes target-window identity and local coordinates in macOS pointer events for background native clicks, scrolling and dragging.
- Clips the native cursor to its target window and respects occlusion and window order; hides the cursor when its target is hidden or moved.
- Keeps Electron previews in their owner window order, including updates, redisplay and window transfers, without unconditional raising.

## 安装 / Installation

仅适用于 DSH **0.2.1-rc.1** 与 **0.2.1-rc.2**，按实际完整版本选包。For DSH **0.2.1-rc.1** and **0.2.1-rc.2** only; choose the package for the exact installed version.

```text
https://github.com/gulagala001/opencu/releases/download/v2.0.5-dsh.0.2.1-rc.1/opencu-2.0.5-dsh.0.2.1-rc.1.tgz
https://github.com/gulagala001/opencu/releases/download/v2.0.5-dsh.0.2.1-rc.2/opencu-2.0.5-dsh.0.2.1-rc.2.tgz
```

[安装指南 / Installation guide](https://github.com/gulagala001/opencu/blob/main/docs/install.md) · 校验值见附件 SHA256SUMS / Checksums in SHA256SUMS.

# OpenCU 2.0.4 · DSH 0.2.1-rc.1 / rc.2

[中文](#zh-204) | [English](#en-204)

<a id="zh-204"></a>

## 中文

### 体验优化

- 支持人工确认后恢复旧浏览器连接，以及冷启动后连接新标签继续工作。

### 问题修复

- 为扩展断线后的输入释放增加身份与凭据绑定的回执；未知释放状态继续阻断操作。
- 保留可终止的 JavaScript worker、持键释放及共享文档恢复修复。

<a id="en-204"></a>

## English

### Improvements

- Restores old browser connections after human confirmation and resumes through a new tab after a cold start.

### Bug Fixes

- Binds extension disconnect release receipts to connection identity and credentials; unknown release continues to block input.
- Preserves cancellable JavaScript workers, held-input release and shared-document recovery fixes.

## 安装 / Installation

仅适用于 DSH **0.2.1-rc.1** 与 **0.2.1-rc.2**，按实际完整版本选包。For DSH **0.2.1-rc.1** and **0.2.1-rc.2** only; choose the package for the exact installed version.

```text
https://github.com/gulagala001/opencu/releases/download/v2.0.4-dsh.0.2.1-rc.1/opencu-2.0.4-dsh.0.2.1-rc.1.tgz
https://github.com/gulagala001/opencu/releases/download/v2.0.4-dsh.0.2.1-rc.2/opencu-2.0.4-dsh.0.2.1-rc.2.tgz
```

[安装指南 / Installation guide](https://github.com/gulagala001/opencu/blob/main/docs/install.md) · 校验值见附件 SHA256SUMS / Checksums in SHA256SUMS.

# OpenCU 2.0.3 · DSH 0.2.1-rc.1 / rc.2

[中文](#zh-203) | [English](#en-203)

<a id="zh-203"></a>

## 中文

### 问题修复

- 隔离电脑 JavaScript 执行，保持停止、会话绑定与故障恢复。
- 修复 Windows／Linux 持键、持鼠与移动操作的一致性。
- 修复断线释放、迟到观察及共享文档服务保存／释放顺序，失败后保留编辑状态并可重试。

### 其他变更

- 分别提供 rc.1 与 rc.2 构建，保留签名 Helper 与扩展身份。

<a id="en-203"></a>

## English

### Bug Fixes

- Isolates computer JavaScript execution while retaining stop, session binding and failure recovery.
- Makes held keys, held mouse buttons and movement consistent on Windows and Linux.
- Fixes disconnect release, late observations and the save/release order of the shared document service; edits are kept for retry after a failure.

### Other Changes

- Separate rc.1 and rc.2 builds retain the signed Helper and extension identities.

## 安装 / Installation

仅适用于 DSH **0.2.1-rc.1** 与 **0.2.1-rc.2**，按实际完整版本选包。For DSH **0.2.1-rc.1** and **0.2.1-rc.2** only; choose the package for the exact installed version.

```text
https://github.com/gulagala001/opencu/releases/download/v2.0.3-dsh.0.2.1-rc.1/opencu-2.0.3-dsh.0.2.1-rc.1.tgz
https://github.com/gulagala001/opencu/releases/download/v2.0.3-dsh.0.2.1-rc.2/opencu-2.0.3-dsh.0.2.1-rc.2.tgz
```

[安装指南 / Installation guide](https://github.com/gulagala001/opencu/blob/main/docs/install.md) · 校验值见附件 SHA256SUMS / Checksums in SHA256SUMS.

# OpenCU 2.0.2 · DSH 0.2.1-rc.1 / rc.2

[中文](#zh-202) | [English](#en-202)

<a id="zh-202"></a>

## 中文

本次汇总 2.0.1 之后的修复，改进审批目标一致性、停止时的输入释放，以及两套宿主构建的可复现性。

### 问题修复

- 审批固定到请求时的目标身份；应用或标签页变化后，旧审批不能用于操作新目标。拒绝、取消与断线按实际会话清理。
- 控制器、macOS Helper 与 MV3 扩展都可取消等待中的观察；停止与取消时释放已按住的键鼠，结果不明的输入不自动重放。
- 截图与返回的观察信息保持一致；扩展观察取消后隔离迟到结果。
- 修复 Chrome／Edge 连接设置说明被挤成单字窄列的问题，安装、配对与已连接状态改为上下排列。

### 其他变更

- rc.1／rc.2 分别固化完整 SDK、前端及根 npm 锁，构建强制冻结并核对实际安装版本；保留已签名 macOS Helper。

<a id="en-202"></a>

## English

This release brings together fixes added after 2.0.1: consistent approval targets, input release when stopping, and reproducible builds for both supported hosts.

### Bug Fixes

- Approval is pinned to the requested target identity; a previous approval cannot operate a replacement app or tab. Denial, cancellation and disconnect clean up the actual session.
- The controller, macOS Helper and MV3 extension can cancel pending observations. Stop and cancellation release held keys and mouse buttons; inputs with an unknown outcome are not replayed.
- Screenshots stay consistent with the returned observation, and late results are isolated after an extension observation is cancelled.
- Fixes Chrome/Edge connection instructions collapsing into a one-character column; installation, pairing and connected status now stack vertically.

### Other Changes

- The rc.1 and rc.2 builds lock their complete SDK, frontend and root npm dependencies, require frozen installation and verify installed versions. The signed macOS Helper is retained.

## 安装 / Installation

仅适用于 DSH **0.2.1-rc.1** 与 **0.2.1-rc.2**，按实际完整版本选包。For DSH **0.2.1-rc.1** and **0.2.1-rc.2** only; choose the package for the exact installed version.

```text
https://github.com/gulagala001/opencu/releases/download/v2.0.2-dsh.0.2.1-rc.1/opencu-2.0.2-dsh.0.2.1-rc.1.tgz
https://github.com/gulagala001/opencu/releases/download/v2.0.2-dsh.0.2.1-rc.2/opencu-2.0.2-dsh.0.2.1-rc.2.tgz
```

[安装指南 / Installation guide](https://github.com/gulagala001/opencu/blob/main/docs/install.md) · 校验值见附件 SHA256SUMS / Checksums in SHA256SUMS.

# OpenCU 2.0.1 · DSH 0.2.1-rc.1 / rc.2

[中文](#zh-201) | [English](#en-201)

<a id="zh-201"></a>

## 中文

### 体验优化

- 浏览器扩展的单次状态查询复用工具栏与扩展列表中的同一图标结果，后续查询仍重新读取，保留图标更新与失败重试。

<a id="en-201"></a>

## English

### Improvements

- A single browser-extension status query now shares one icon result between the toolbar and the extension list; later queries still read fresh state, keeping icon updates and retry on failure.

## 安装 / Installation

仅适用于 DSH **0.2.1-rc.1** 与 **0.2.1-rc.2**，按实际完整版本选包。For DSH **0.2.1-rc.1** and **0.2.1-rc.2** only; choose the package for the exact installed version.

```text
https://github.com/gulagala001/opencu/releases/download/v2.0.1-dsh.0.2.1-rc.1/opencu-2.0.1-dsh.0.2.1-rc.1.tgz
https://github.com/gulagala001/opencu/releases/download/v2.0.1-dsh.0.2.1-rc.2/opencu-2.0.1-dsh.0.2.1-rc.2.tgz
```

[安装指南 / Installation guide](https://github.com/gulagala001/opencu/blob/main/docs/install.md) · 校验值见附件 SHA256SUMS / Checksums in SHA256SUMS.

# OpenCU 2.0.0 · DSH 0.2.1-rc.1 / rc.2

[中文](#zh-200) | [English](#en-200)

<a id="zh-200"></a>

## 中文

### 新增功能

- 重写电脑与浏览器控制，统一持久 JavaScript 入口、语义观察、差分与定位器。
- 集成真实浏览器、批注与监看组件，保留后台操作及目标归属保护。

### 问题修复

- 修复异步预览、macOS 截图重试、后台按钮及 Helper 执行权限。

### 其他变更

- 分别发布匹配宿主 SDK 的 rc.1 与 rc.2 构建。2.0 为重写系列公开版本，旧 1.x 固定发行保留。

<a id="en-200"></a>

## English

### New Features

- Rewritten computer and browser control with one persistent JavaScript entry, semantic observation, diffs and locators.
- Integrated real browser, annotation and monitoring components, retaining background operation and target ownership protection.

### Bug Fixes

- Fixes asynchronous previews, macOS screenshot retries, background buttons and Helper execute permissions.

### Other Changes

- Separate rc.1 and rc.2 builds use the matching host SDK. 2.0 is the public rewritten series; earlier 1.x fixed Releases remain available.

## 安装 / Installation

仅适用于 DSH **0.2.1-rc.1** 与 **0.2.1-rc.2**，按实际完整版本选包。For DSH **0.2.1-rc.1** and **0.2.1-rc.2** only; choose the package for the exact installed version.

```text
https://github.com/gulagala001/opencu/releases/download/v2.0.0-dsh.0.2.1-rc.1/opencu-2.0.0-dsh.0.2.1-rc.1.tgz
https://github.com/gulagala001/opencu/releases/download/v2.0.0-dsh.0.2.1-rc.2/opencu-2.0.0-dsh.0.2.1-rc.2.tgz
```

[安装指南 / Installation guide](https://github.com/gulagala001/opencu/blob/main/docs/install.md) · 校验值见附件 SHA256SUMS / Checksums in SHA256SUMS.
