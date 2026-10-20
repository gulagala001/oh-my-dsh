# DeepSeek Workbench 0.1.0 · DSH 0.2.1-rc.2

[中文](#zh) · [English](#en) · [安装 / Installation](#installation)

<a id="zh"></a>
## 中文

### 新增功能

- 从左侧栏打开主内容区 DeepSeek 网页聊天，查看官网历史、发送消息、切换深度思考与联网搜索、上传附件。
- 使用 `/侧栏（网页版）` 开启临时聊天，关闭时删除其官网会话；清理失败保留面板并允许重试。
- 在设置的账号页访问 DeepSeek API 开放平台，有相应宿主接口时复用当前账号的平台授权。
- 将官网消息和可读取附件迁移为新 DSH 会话，使用 DSH 模型与工具继续。

### 体验优化

- 根据官网实时状态切换深度思考和联网搜索；发送失败保留输入草稿。
- 普通聊天保留官网历史，临时侧栏与主聊天各自管理会话。

### 其他变更

- 精确适配 DSH **0.2.1-rc.2**、Cordis **4.0.5** 与 Node.js **22.19+**。
- 标准 rc.2 桌面支持内嵌网页；跨重启保留登录和官网下载使用配套桌面源码适配。
- 使用 MIT 许可，通过固定 GitHub Release 包分发。

<a id="en"></a>
## English

### New features

- Open DeepSeek web chat in the main content area to browse history, send messages, toggle DeepThink and Search, and upload attachments.
- Run `/侧栏（网页版）` for temporary chat. Closing deletes its website conversation; failed cleanup keeps the panel open for retry.
- Access the DeepSeek API Platform from account settings, reusing current platform authorization when the host supports it.
- Import website messages and readable attachments into a new DSH conversation and continue with DSH models and tools.

### Improvements

- DeepThink and Search toggles follow actual website state; failed sends retain the draft.
- Ordinary web chats retain website history; temporary sidebar and main chat manage their own conversations.

### Other changes

- Exact compatibility with DSH **0.2.1-rc.2**, Cordis **4.0.5** and Node.js **22.19+**.
- Standard rc.2 desktop supports embedded pages. Persistent sign-in across restarts and website downloads use the companion desktop source adapter.
- MIT licensed, distributed through pinned GitHub Release packages.

<a id="installation"></a>
## 安装 / Installation

**宿主 / Host:** DSH `0.2.1-rc.2` · **Cordis:** `4.0.5` · **Node.js:** `>=22.19`

```bash
dsh plugin --profile desktop add "https://github.com/gulagala001/dsh-deepseek-workbench/releases/download/v0.1.0-dsh.0.2.1-rc.2/dsh-deepseek-workbench-0.1.0-dsh.0.2.1-rc.2.tgz"
```

将 `desktop` 换成实际 profile，待当前任务结束后重启。Replace `desktop` with your actual profile and restart it after active tasks finish.

持久登录和官网下载的宿主适配见安装指南。See the installation guides for host support for persistent sign-in and website downloads.

[固定安装包 / Pinned package](https://github.com/gulagala001/dsh-deepseek-workbench/releases/download/v0.1.0-dsh.0.2.1-rc.2/dsh-deepseek-workbench-0.1.0-dsh.0.2.1-rc.2.tgz) · [SHA256SUMS](https://github.com/gulagala001/dsh-deepseek-workbench/releases/download/v0.1.0-dsh.0.2.1-rc.2/SHA256SUMS) · [中文指南](https://github.com/gulagala001/dsh-deepseek-workbench#安装) · [English guide](https://github.com/gulagala001/dsh-deepseek-workbench/blob/main/README_EN.md#install)
