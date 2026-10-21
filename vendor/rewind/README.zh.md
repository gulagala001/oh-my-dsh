# dsh-undo-plugin

[English](README.md) | 中文

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供对话与工作区文件撤回，支持撤销撤回。

![输入框上方的原生回退列表](docs/images/rewind.jpg)

## 安装

需要 **DSH 0.2.1-rc.2** 和 **Node.js 22.19+**。

打开 **插件 → 添加插件**，粘贴[固定安装包地址](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.0-dsh.0.2.1-rc.2/gulagala001-dsh-undo-plugin-0.1.0-dsh.0.2.1-rc.2.tgz)，或执行：

```sh
dsh plugin --profile web add https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.0-dsh.0.2.1-rc.2/gulagala001-dsh-undo-plugin-0.1.0-dsh.0.2.1-rc.2.tgz
```

将 `web` 换成你的配置名，任务结束后重启对应实例。校验值见 [Release](https://github.com/gulagala001/dsh-undo-plugin/releases/tag/v0.1.0-dsh.0.2.1-rc.2) 附件 `SHA256SUMS`。

安装包标识为 `@gulagala001/dsh-undo-plugin`，通过 GitHub Release 分发。请使用上面的固定地址安装。

## 使用

点击用户消息 **复制** 按钮旁的撤回箭头，检查受影响文件并确认。对话在原会话内回退，文字与附件回填输入框；点击 **撤销撤回** 可恢复此前的对话与文件。

检查点自动记录。没有保留文件快照的旧消息只撤回对话，确认框会显示实际范围；恢复前会核对外部改动。

会话空闲时连按两次 **Esc**，或输入 **`/rewind`**，在输入框上方打开回退列表；输入 **`/undo`** 撤销上一次撤回。所有恢复操作都需确认。运行中双击 Esc 保持宿主的停止行为。

## 文档

文件覆盖范围、自动清理和开发命令见 [使用指南](docs/usage.zh.md)。

## 许可

[MIT](LICENSE)。第三方来源见 [许可声明](THIRD_PARTY_NOTICES.md)。
