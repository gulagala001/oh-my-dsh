# OMD 1.1.0 · DSH 0.2.1-rc.3

[中文](#zh-110) | [English](#en-110)

<a id="zh-110"></a>

## 中文

本版已进入发行准备，尚未公开发布。包含 1.0.2 之后的功能和修复。

### 新增功能

- Ultra 抽屉新增“思考强度”，可选择当前模型支持的推理档位，首次默认 `xhigh`；模型没有该档时使用最高支持档或提供方默认。
- Ultra 强度接入原有模型偏好，按全局／工作区、模型渠道与模型分别记住。退出再开启、刷新和重启后复用，新聊天一起恢复模型、Ultra 模式与协作方式；普通思考档位不会覆盖 Ultra 的选择。

### 体验优化

- 无工作区的新聊天提前准备独立目录和最终会话，首次发送保持同一会话与输入框状态；首条消息为实际工作子目录命名，后续继续在该目录工作。
- Finder 按钮与打开目录快捷键跟随当前实际工作目录，保留宿主原生界面与权限检查。

### 问题修复

- 修复首次发送时人格、Fast、提示词风格等会话设置丢失，以及历史空白聊天错误复用其他会话目录的问题。已有聊天、草稿、附件和文件保持原位。Fast 的跨宿主重启行为仍由订阅插件负责。
- 修复模型保存的旧成功回执覆盖新模型偏好的竞争问题；核对当前选择后再保存记忆，跨控件的新选择不会被迟到回执覆盖。
- 修复 CU 将超时、重置或自动清理误当成用户明确停止的问题。单个浏览器目标故障单独恢复，健康页面继续可用；已连接的空浏览器也可恢复，保留输入释放与停止保护。
- 修复 CU 原生工具与 PTC 错误信息遗漏恢复诊断，以及 Codex 返回 `Store must be set to false` 时未触发完整历史回退的问题。回退仅重试一次，不重放无关失败。

<a id="en-110"></a>

## English

This version is prepared for release and has not been published. It includes the features and fixes since 1.0.2.

### New Features

- Adds reasoning effort to the Ultra menu using the selected model's supported levels. The initial default remains `xhigh`, falling back to the highest supported effort or provider default.
- Integrates Ultra effort with existing model preferences, separated by global/workspace scope, provider and model. Choices survive toggling, refreshes and restarts; new chats restore the model, Ultra mode and collaboration strategy together. Ordinary effort choices do not overwrite Ultra effort.

### Improvements

- Projectless chats prepare an independent directory and final session before showing the composer. First send retains the same session and input state; its first message names the working subdirectory used by later turns.
- Finder and the open-directory shortcut follow the effective working directory while retaining the native interface and permission checks.

### Bug Fixes

- Preserves persona, Fast, prompt style and other session settings on first send, and prevents historical blank chats from adopting another session's directory. Existing chats, drafts, attachments and files stay in place. Fast persistence across host restarts remains the subscription plugin's responsibility.
- Prevents a delayed successful model-save receipt from overwriting a newer model preference. Preferences are saved after confirming the current selection, including changes from another control.
- Stops CU timeouts, resets and lifecycle cleanup from being treated as explicit user stops. Browser-target failures are isolated so healthy pages remain usable. Connected empty browsers can recover while input-release and explicit-stop protections remain enforced.
- Preserves recovery diagnostics through native CU tools and PTC errors. Codex storage rejections such as `Store must be set to false` now trigger one full-history fallback; unrelated failures are not replayed.

## 安装 / Installation

发行准备包精确匹配 **DSH 0.2.1-rc.3**。下方是发布后的固定地址，公开发布前请继续使用[当前公开版本](releases.md)。更新保留原 profile、配置、会话及用户文件；当前任务结束后按宿主提示启用或完整重启。

The prepared package targets **DSH 0.2.1-rc.3** exactly. The URLs below become available after publication; until then use the [current public release](releases.md). Keep the existing profile, settings, conversations and user files, then activate or fully restart when current tasks finish.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [OMD 1.1.0](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.1.1.0/oh-my-dsh-0.2.1-rc.3.omd.1.1.0.tgz) | [校验 / Verify](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.1.1.0/SHA256SUMS) |

[中文安装指南](install.md) · [English installation guide](install_EN.md) · [第三方兼容说明](plugin-compatibility.md) · [Third-party compatibility](plugin-compatibility_EN.md)
