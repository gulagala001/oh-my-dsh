# OpenCU 2.2.6 · DSH 0.2.1-rc.5

[中文](#zh-226) | [English](#en-226)

<a id="zh-226"></a>

## 中文

### 问题修复

- 修复代码和工具输出复制时失败却显示“已复制”的问题；等待实际剪贴板写入完成，并移除不适用于 DSH 的 ChatGPT 焦点提示。
- 将主窗口和独立浏览器窗口的链接、新标签页与下载操作接入 DSH，遵循浏览器偏好并保留发起会话。
- 修复文件内容复制、本地图片读取、相对路径与默认打开方式；取消读取后不再继续执行，准备失败或被阻止时停止后续文件操作，并显示真实错误。
- 补齐文件预览下载动作，移除不可用的云端连接器菜单，统一批注、图片、权限和错误提示中的宿主文案及帮助入口。

<a id="en-226"></a>

## English

### Bug Fixes

- Fix copy actions that showed “Copied” after failure. Wait for the actual clipboard write and remove the ChatGPT focus instruction that does not apply to DSH.
- Connect links, new tabs and downloads in the main and detached browser windows to DSH, honoring browser preferences and preserving the originating conversation.
- Fix file-content copying, local image reads, relative paths and default file opening. Stop cancelled reads and blocked or failed preparation before subsequent file actions, and display actual errors.
- Restore the file-preview download action, hide unavailable cloud connector menus, and align annotation, image, permission and error messages and help links with the host.

## 安装 / Installation

精确宿主为 **DSH 0.2.1-rc.5**。在 **插件 → 添加插件** 中使用下方固定包，保留现有 profile、设置与会话；任务结束后按宿主提示重新加载。

The exact host is **DSH 0.2.1-rc.5**. Use the fixed package in **Plugins → Add plugin**, retaining profiles, settings and conversations; reload after active tasks finish if requested.

完整内置浏览器、桌面文件操作与电脑操作界面需要匹配的桌面宿主适配。已使用匹配适配的安装可直接升级插件；其余安装按安装指南使用 `host-adapters.zip` 构建宿主。

The embedded browser, desktop file actions and full computer-use interface require the matching desktop host adapter. Installations already using that adapter can update the plugin directly; otherwise follow the installation guide and build the host with `host-adapters.zip`.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.5 | [OpenCU 2.2.6](https://github.com/gulagala001/opencu/releases/download/v2.2.6-dsh.0.2.1-rc.5/opencu-2.2.6-dsh.0.2.1-rc.5.tgz) | [SHA256SUMS](https://github.com/gulagala001/opencu/releases/download/v2.2.6-dsh.0.2.1-rc.5/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/opencu/blob/main/docs/install.md) · [宿主适配源码 / Host adapter sources](https://github.com/gulagala001/opencu/releases/download/v2.2.6-dsh.0.2.1-rc.5/host-adapters.zip)

---

# OpenCU 2.2.5 · DSH 0.2.1-rc.5

[中文](#zh-225) | [English](#en-225)

<a id="zh-225"></a>

## 中文

### 问题修复

- 修复目标发现和初始化等待中的取消阻塞；只读查询不再排在无关输入操作之后，取消当前调用仍保留其他会话的共享初始化。
- 隔离原生只读查询的超时与取消，避免单次读取失败导致其他电脑操作失效；输入结果不明时仍保留释放与恢复保护。
- 停止状态保留触发来源、时间和输入释放明细；工具、界面与生命周期清理保持各自语义。
- 修复匹配桌面宿主的 Office 初始化生命周期、停止期间的迟到注册，以及欢迎页对已认证宿主 Cookie 的衔接。

<a id="en-225"></a>

## English

### Bug Fixes

- Keep target discovery and initialization waits cancellable. Read-only discovery no longer queues behind unrelated input, while cancelling one caller preserves shared initialization for other sessions.
- Contain native read timeouts and cancellation so one failed read does not disable unrelated operations. Preserve release and recovery safeguards when an input outcome is unknown.
- Retain the source, time and input-release details of stops, preserving the distinct semantics of tools, interface actions and lifecycle cleanup.
- Fix Office initialization lifetime, late registrations during shutdown and authenticated Host cookie reuse by the matching desktop welcome page.

## 安装 / Installation

精确宿主为 **DSH 0.2.1-rc.5**。在 **插件 → 添加插件** 中使用下方固定包，保留现有 profile、设置与会话；任务结束后按宿主提示重新加载。

The exact host is **DSH 0.2.1-rc.5**. Use the fixed package in **Plugins → Add plugin**, retaining profiles, settings and conversations; reload after active tasks finish if requested.

桌面启动认证、Office 生命周期及完整电脑操作增强需要使用本版 `host-adapters.zip` 重建匹配的桌面宿主后完整重启。

Desktop startup authentication, Office lifecycle and full computer-use enhancements require rebuilding the matching desktop host with this release’s `host-adapters.zip`, then restarting fully.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.5 | [OpenCU 2.2.5](https://github.com/gulagala001/opencu/releases/download/v2.2.5-dsh.0.2.1-rc.5/opencu-2.2.5-dsh.0.2.1-rc.5.tgz) | [SHA256SUMS](https://github.com/gulagala001/opencu/releases/download/v2.2.5-dsh.0.2.1-rc.5/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/opencu/blob/main/docs/install.md) · [宿主适配源码 / Host adapter sources](https://github.com/gulagala001/opencu/releases/download/v2.2.5-dsh.0.2.1-rc.5/host-adapters.zip)

---

# OpenCU 2.2.4 · DSH 0.2.1-rc.5

[中文](#zh-224) | [English](#en-224)

<a id="zh-224"></a>

## 中文

### 问题修复

- 修复 Chromium 返回零时区偏移时的发送失败，统一转换为宿主接受的 UTC；独立安装与共装均可使用。
- 修复图片、网页、文档和文字批注的聊天显示，保留原始消息、附件和模型输入。
- 修复精确宿主构建中检查工具的依赖定位，避免预打包隐式重装已核验的 SDK。

### 其他变更

- 精确适配 DSH **0.2.1-rc.5**，同步匹配的 SDK、构建输入和完整依赖锁。每份安装包仅用于对应宿主。

<a id="en-224"></a>

## English

### Bug Fixes

- Normalize Chromium’s zero-offset time zone to the host-supported UTC value, restoring message submission in standalone and shared installations.
- Fix chat rendering of image, page, document and text annotations while preserving original messages, attachments and model input.
- Resolve validation dependencies correctly in exact-host builds and prevent prepack from reinstalling the verified SDK.

### Other Changes

- Target DSH **0.2.1-rc.5** exactly with matching SDK, build inputs and complete dependency locks. Each package is specific to its host.

## 安装 / Installation

精确宿主为 **DSH 0.2.1-rc.5**。在 **插件 → 添加插件** 中使用下方固定包，保留现有 profile、设置与会话；任务结束后按宿主提示重新加载。

The exact host is **DSH 0.2.1-rc.5**. Use the fixed package in **Plugins → Add plugin**, retaining profiles, settings and conversations; reload after active tasks finish if requested.

桌面侧栏及输入／关闭增强需要本版 `host/` 适配源码重建匹配的桌面宿主后完整重启。

Desktop sidebar, input and closure enhancements require rebuilding the matching desktop host with this release’s `host/` adapter sources, then restarting fully.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.5 | [OpenCU 2.2.4](https://github.com/gulagala001/opencu/releases/download/v2.2.4-dsh.0.2.1-rc.5/opencu-2.2.4-dsh.0.2.1-rc.5.tgz) | [SHA256SUMS](https://github.com/gulagala001/opencu/releases/download/v2.2.4-dsh.0.2.1-rc.5/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/opencu/blob/main/docs/install.md)

---

# OpenCU 2.2.3 · DSH 0.2.1-rc.3

[中文](#zh-223) | [English](#en-223)

<a id="zh-223"></a>

## 中文

### 问题修复

- 修复 CU／BU 验证机的 Linux 进程查询参数，避免正常结束的场景被错误判定为清理失败；继续验证泄漏进程、独立进程组和嵌套取消。

### 其他变更

- 进程清理失败时输出明确原因；CI 在构建前检查实际进程监督能力。

<a id="en-223"></a>

## English

### Bug Fixes

- Fix Linux process-inventory arguments in the CU/BU verifier so completed scenarios are not incorrectly reported as cleanup failures. Leaked descendants, detached groups and nested cancellation remain checked.

### Other Changes

- Report explicit cleanup failure reasons and check real process supervision before the CI build.

## 安装 / Installation

适用于 **DSH 0.2.1-rc.3**。在 **插件 → 添加插件** 中粘贴下方固定包地址。保留 profile、配置与会话，按宿主提示在任务结束后重新加载。

For **DSH 0.2.1-rc.3**. Paste the fixed package URL below into **Plugins → Add plugin**. Preserve profiles, configuration and conversations, and reload after active tasks finish if requested.

此前桌面侧栏的输入与关闭修复仍需使用本版附带的 `host/` 适配源码重建匹配的桌面宿主，并在任务结束后完整重启。

The desktop sidebar input and closure fixes still require rebuilding the matching desktop host with this release's `host/` adapter sources, followed by a full restart after active tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [OpenCU 2.2.3](https://github.com/gulagala001/opencu/releases/download/v2.2.3-dsh.0.2.1-rc.3/opencu-2.2.3-dsh.0.2.1-rc.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/opencu/releases/download/v2.2.3-dsh.0.2.1-rc.3/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/opencu/blob/main/docs/install.md)
