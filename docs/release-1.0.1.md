# OMD 1.0.1 · DSH 0.2.1-rc.3

[中文](#zh-101) | [English](#en-101)

<a id="zh-101"></a>

## 中文

### 问题修复

- 修复插件安装、启用和更新预检固定等待“添加 API Key”，导致正常主界面被误报为 30 秒超时的问题。预检按实际显示的欢迎页、账号选择、密钥编辑页或主界面继续检查，无需登录或填写密钥。
- 修复插件仍在加载时提前判定，以及候选入口缺失时可能误判通过的问题。保留白屏、脚本加载失败、运行错误、输入框与设置检查；等待超时明确标记为“预检未完成”，附上失败阶段。
- 修复 dsh-ops 的 rc.3 固定安装包被旧发行号规则误拦的问题，所有安装继续执行宿主原有版本要求。
- 修复第三方功能已安装旧版或出现兼容错误时缺少“更新”入口的问题。更新先检查候选，再保留原启停选择完成替换。
- 需求理解适配包更新为 0.3.3：通过宿主 Loader 解析消息接口，以原生 profileContext 定位配置，修复桌面启动路径和自定义 profile 接线。

### 其他变更

- 第三方目录固定到订阅登录 0.9.11、插件市场 1.70.3、动态思考文案 0.38.0、DSH × Blender 2.6.1 和小鲸鱼记账挂件 0.4.2，核对安装包 SHA-256 与 rc.3 基础运行。

<a id="en-101"></a>

## English

### Bug Fixes

- Fixes install, enable and update preflight waiting unconditionally for “Add API Key” and reporting a 30-second timeout after the main interface is already ready. Checks follow the rendered welcome, account choice, credential editor or main interface without signing in or entering credentials.
- Fixes premature activation checks and missing candidate entries being treated as success. Blank pages, failed scripts, runtime errors, composer interaction and Settings remain checked. Readiness timeouts now report an incomplete check with its failing stage.
- Fixes an outdated release-number rule rejecting the pinned rc.3 dsh-ops package. Native host version requirements continue to apply.
- Restores the Update action for third-party features with older or incompatible installations. Updates check the candidate before replacement and retain the existing enabled state.
- Updates the Intent Assistant adapter to 0.3.3: message APIs resolve through the native Loader and configuration uses profileContext, fixing desktop launch paths and custom-profile wiring.

### Other Changes

- Pins Subscription Login 0.9.11, DSH Market 1.70.3, Status Rotator 0.38.0, DSH × Blender 2.6.1 and Balance Whale Widget 0.4.2, with package SHA-256 and basic rc.3 runtime verification.

## 安装 / Installation

在 **插件 → 添加插件** 使用下方固定包，精确宿主为 **DSH 0.2.1-rc.3**。保留现有 profile、配置和会话，待任务结束后按宿主提示启用或完整重启。旧版预检若仍报“添加 API Key”超时，核对本版固定地址后可选择“仍然安装”完成这一次升级；宿主版本检查和安装规则继续生效。

Install the fixed package through **Plugins → Add plugin** on **DSH 0.2.1-rc.3**. Keep the existing profile, settings and conversations, then follow the host activation or restart prompt after active tasks finish. If the old preflight still times out on “Add API Key”, verify this fixed release URL and choose “Install anyway” for this upgrade. Native version checks and installation rules still apply.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [OMD 1.0.1](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.1.0.1/oh-my-dsh-0.2.1-rc.3.omd.1.0.1.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.1.0.1/SHA256SUMS) |
| 0.2.1-rc.3 | [需求理解 / Intent Assistant 0.3.3](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.1.0.1/omd-prompt-optimizer-0.2.1-rc.3.intent.0.3.3.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.1.0.1/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install_EN.md)
