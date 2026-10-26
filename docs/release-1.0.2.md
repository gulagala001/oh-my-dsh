# OMD 1.0.2 · DSH 0.2.1-rc.3

[中文](#zh-102) | [English](#en-102)

<a id="zh-102"></a>

## 中文

### 问题修复

- 修复在新聊天输入区切换人格后，首次发送创建会话时丢失选择、回到全局人格的问题。所选人格在首条消息提交前保存到新会话，自定义人格、关闭人格与继承全局均保持原有含义。
- 同步修复首次发送时会话提示词风格、任务提醒及验证档位丢失的问题，覆盖 OMD 与 OMAA 预设。发送失败后可按草稿中的最新选择重试；目标会话已开始或被单独修改时保留草稿并提示。
- 修复首次启动引导自动关闭或重新绘制时，插件预检仍等待旧按钮而误报超时的问题。继续按实际界面检查启动、加载、输入框与设置。

<a id="en-102"></a>

## English

### Bug Fixes

- Fixes a persona selected in a new chat reverting to the global persona on first send. The selection is saved to the new session before its first message is submitted, preserving custom personas, disabled personas and global inheritance.
- Preserves session prompt style, task reminders and verification mode during first send for OMD and OMAA presets. Failed sends can retry with the draft's latest choices. If the target chat has started or its settings were edited independently, the draft is retained with an error.
- Fixes plugin preflight reporting a timeout when onboarding closes automatically or replaces a button during rendering. Startup, activation, composer and Settings checks continue to follow the rendered interface.

## 安装 / Installation

在 **插件 → 添加插件** 使用下方固定包，精确宿主为 **DSH 0.2.1-rc.3**。保留现有 profile、配置和会话，待任务结束后按宿主提示启用或完整重启。旧版预检若仍报“添加 API Key”超时，核对本版固定地址后可选择“仍然安装”完成这一次升级；宿主版本检查和安装规则继续生效。

Install the fixed package through **Plugins → Add plugin** on **DSH 0.2.1-rc.3**. Keep the existing profile, settings and conversations, then follow the host activation or restart prompt after active tasks finish. If the old preflight still times out on “Add API Key”, verify this fixed release URL and choose “Install anyway” for this upgrade. Native version checks and installation rules still apply.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [OMD 1.0.2](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.1.0.2/oh-my-dsh-0.2.1-rc.3.omd.1.0.2.tgz) | [校验 / Verify](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.1.0.2/SHA256SUMS) |

[中文安装指南](install.md) · [English installation guide](install_EN.md) · [第三方兼容说明](plugin-compatibility.md) · [Third-party compatibility](plugin-compatibility_EN.md)
