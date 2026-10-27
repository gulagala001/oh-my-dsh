# OMD 1.1.2 · DSH 0.2.1-rc.3

[中文](#zh-112) | [English](#en-112)

<a id="zh-112"></a>

## 中文

### 问题修复

- 修复无工作区新聊天首次创建具名工作目录时，目录变更通知额外触发一次模型调用的问题。首次初始化静默完成，首轮请求保留 DSH 原生当前目录快照。
- 保留首条消息命名、权限根、会话身份和目录持久化；后续手动切换、目录失效恢复及其他排队消息继续沿用原生流程。

<a id="en-112"></a>

## English

### Bug Fixes

- Prevent an extra model call caused by the directory-change notice when a projectless chat first creates its named working directory. Initialization is silent while the first request retains DSH's native current-directory snapshot.
- Preserve first-message naming, the permission root, session identity and durable directory state. Later manual changes, missing-directory recovery and other queued messages retain their native behavior.

## 安装 / Installation

本版精确匹配 DSH **0.2.1-rc.3**。在 **插件 → 添加插件** 中粘贴固定包地址。保留原 profile、配置与会话；按宿主提示在当前任务结束后重新加载。旧 rc.1／rc.2 宿主继续使用各自的固定历史构建。

This release targets DSH **0.2.1-rc.3** exactly. Paste the fixed package URL into **Plugins → Add plugin**, preserving your profile, configuration and conversations. Reload after active tasks finish if requested. Older rc.1/rc.2 hosts retain their matching historical builds.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.3 | [OMD 1.1.2](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.1.1.2/oh-my-dsh-0.2.1-rc.3.omd.1.1.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.1.1.2/SHA256SUMS) |

[安装指南](install.md) · [Installation guide](install_EN.md) · [版本与兼容范围 / Versions and compatibility](releases.md) · [完整桌面 CU 安装条件 / Full desktop CU requirements](install.md#computer-use)
