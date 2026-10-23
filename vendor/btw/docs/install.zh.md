# 安装 DSH BTW

[English](install.md)

要求 **DSH 0.2.1-rc.2**、**Cordis 4.0.5** 和 **Node.js 22.19+**。本包精确适配该宿主版本。

## 添加插件

打开 **插件 → 添加插件**，粘贴以下地址并安装：

```text
https://github.com/gulagala001/dsh-btw/releases/download/v0.1.3-dsh.0.2.1-rc.2/gulagala001-dsh-btw-0.1.3-dsh.0.2.1-rc.2.tgz
```

保留现有 profile、配置和数据，当前任务结束后重启对应实例。

## 命令行

将 `web` 替换成该 DSH 实例实际使用的 profile：

```sh
dsh plugin --profile web add https://github.com/gulagala001/dsh-btw/releases/download/v0.1.3-dsh.0.2.1-rc.2/gulagala001-dsh-btw-0.1.3-dsh.0.2.1-rc.2.tgz
```

安装标识为 `@gulagala001/dsh-btw`。使用上述固定地址，本次通过 GitHub Releases 分发。

## 复制给 AI

```text
请把 DSH BTW 安装到我现有的 DSH profile：
https://github.com/gulagala001/dsh-btw/releases/download/v0.1.3-dsh.0.2.1-rc.2/gulagala001-dsh-btw-0.1.3-dsh.0.2.1-rc.2.tgz
先核对 DSH 0.2.1-rc.2、Cordis 4.0.5 和 Node.js 22.19+。
保留原配置和数据，等当前任务结束后再重启。
```

下载后可用发行附件 [SHA256SUMS](https://github.com/gulagala001/dsh-btw/releases/download/v0.1.3-dsh.0.2.1-rc.2/SHA256SUMS) 核对安装包。

在主会话发送过消息后，输入 `/btw 问题` 提问；输入 `/btw` 重新打开弹窗和历史列表。旁聊记录仅在当前窗口保存，刷新即清空。

关闭弹窗只隐藏界面；停止会取消当前旁聊并保留已收到的文字。只有明确完成且未截断的回答会用于后续追问；失败或中断时可手动重试。停用最后一个旁聊入口会取消请求并清空窗口内存中的记录。
