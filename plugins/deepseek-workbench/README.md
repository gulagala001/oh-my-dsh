# DeepSeek Workbench

[English](README_EN.md) · [使用指南](docs/usage.md) · [桌面宿主](docs/desktop-host.md) · [发行说明](docs/releases.md)

在 **DeepSeek Harness** 中使用 DeepSeek 网页聊天、临时侧栏聊天和 API 开放平台，并将网页历史迁移为可继续的 DSH 会话。

![DeepSeek Workbench](docs/images/temporary-chat.png)

临时侧栏界面示例（合成对话内容）。

## 功能

- **网页聊天**：从左侧栏打开 DeepSeek，在主内容区查看历史、发送消息、切换深度思考与联网搜索、上传附件。
- **临时侧栏聊天**：输入 `/侧栏（网页版）` 打开独立的临时网页会话，边看主聊天边提问；关闭时删除该临时官网会话。
- **API 开放平台**：在设置的账号页打开用量、余额和 API 平台；有相应宿主接口时沿用当前 DSH 账号授权。
- **在 DSH 中继续**：将官网会话的消息和可读取附件迁移为新的 DSH 会话，随后使用 DSH 的模型与工具继续。

普通网页聊天保留官网历史。临时侧栏使用自己的官网会话，关闭时等待删除完成，删除失败会保留面板并允许重试；主聊天及其他官网会话保持各自状态。

## 安装

要求 **DSH 0.2.1-rc.2**、**Cordis 4.0.5** 与 **Node.js ≥22.19**。本版精确匹配上述宿主版本。

在 **插件 → 添加插件** 中粘贴[固定安装包地址](https://github.com/gulagala001/dsh-deepseek-workbench/releases/download/v0.1.0-dsh.0.2.1-rc.2/dsh-deepseek-workbench-0.1.0-dsh.0.2.1-rc.2.tgz)，或执行：

```bash
dsh plugin --profile desktop add "https://github.com/gulagala001/dsh-deepseek-workbench/releases/download/v0.1.0-dsh.0.2.1-rc.2/dsh-deepseek-workbench-0.1.0-dsh.0.2.1-rc.2.tgz"
```

将 `desktop` 换成实际 profile，待当前任务结束后重启该实例。下载校验见同一 [Release 的 SHA256SUMS](https://github.com/gulagala001/dsh-deepseek-workbench/releases/download/v0.1.0-dsh.0.2.1-rc.2/SHA256SUMS)。安装包通过本仓库的固定 GitHub Release 分发。

**使用 DSH 桌面版打开内嵌网页聊天。** 标准 rc.2 桌面宿主提供隔离网页与页面读取；跨重启保留登录、官网下载与扩展平台页面需要随包提供的桌面源码适配。插件会按实际宿主能力显示提示。浏览器版 DSH 提供外部网页入口。详见[桌面宿主说明](docs/desktop-host.md)。

## 开始使用

1. 点击左侧栏的 **DeepSeek 网页聊天**，完成一次官网聊天登录。官网聊天账号与 DSH 的 API 平台授权分别管理。
2. 通过顶部新建按钮开始普通聊天，或选择官网历史继续。深度思考、联网搜索和附件仍由官网处理。
3. 需要临时提问时，在 DSH 输入框执行 `/侧栏（网页版）`。关闭按钮会先清理本次官网会话，完成后关闭面板。
4. 需要使用 DSH 工具继续时，在普通网页聊天中点击 **在 DSH 中继续**，确认迁移结果后发送下一条消息。
5. 在 **设置 → 账号** 打开 **DeepSeek API 开放平台**，查看账号与平台功能。

迁移只保留可读取的会话内容；无法获取的附件会提示。迁移后的历史是普通消息，不会重放网页中的指令或工具执行。详见[使用指南](docs/usage.md)。

## 更新与卸载

更新时安装目标版本的固定包。卸载执行 `dsh plugin --profile desktop remove dsh-deepseek-workbench`，然后重启相应实例。卸载前先关闭临时面板并确认清理成功。已迁移的 DSH 会话与普通官网历史由各自服务保存；官网登录数据由桌面宿主管理。

## 开发

```bash
pnpm install --frozen-lockfile --ignore-scripts --config.strict-dep-builds=false
pnpm build
```

`npm test` 运行定点检查。`npm pack` 会重新构建，并检查实际 Git 文件、完整历史与标签、实际安装包；打包需要本项目自己的完整 Git 仓库。CI 使用相同门禁。

MIT 许可，第三方来源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
