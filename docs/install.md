# 安装 Oh My DSH

[English](install_EN.md) · [首页](../README.md) · [升级](upgrade.md) · [首次使用](getting-started.md)

**需要：** DSH **0.2.2-rc.1**，Node.js **24.9.0+**。OMD 已经内置 OpenCU，不用再单独装。还没有 DSH 的话，先装 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。

下面两种方式选一种。已经装过 OMD 的，先看[升级](upgrade.md)备份数据。

<a id="gui"></a>

## 在"添加插件"里安装

1. 在 DSH 的"关于"里看 DSH 的完整版本，比如 0.2.2-rc.1。这是 DSH 的版本，不是 OMD 的。
2. 等手头的任务跑完。
3. 点左侧 **插件**，再点右上角 **＋ 添加插件**，粘贴：

   ```text
   https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.1.omd.1.3.11/oh-my-dsh-0.2.2-rc.1.omd.1.3.11.tgz
   ```

4. 点 **安装**，装完确认 Oh My DSH 已启用。
5. 完整退出再打开桌面版；网页版要重启原来的 Web 服务，只刷新网页不算。
6. 新建会话，预设选 **Oh My DSH**。

安装包名里前半段是 DSH 版本，`omd.` 后面的才是 OMD 版本。请用上面的固定安装包，不要直接装仓库的 main 分支，也不用下载 Source code 或 host-adapters.zip。校验文件：[SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.1.omd.1.3.11/SHA256SUMS)。

安装报错时先核对 DSH 版本。提示"构建脚本未批准"时，看[安装脚本处理](upgrade.md#build-approval)。

<a id="ai"></a>

## 复制给 AI 安装

把下面整段发给一个能操作你电脑终端的 AI（只能聊天的 AI 装不了）：

```text
请在这台电脑现有的 DeepSeek Harness（DSH）里安装或升级 Oh My DSH（OMD）。
先读 https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md
确认我用的是桌面版还是网页版、DSH 的完整版本、数据目录（DSH_HOME）和 profile，选和这个 DSH 版本完全匹配的 OMD 安装包；没有匹配的包就告诉我，不要猜地址或混装。
保留原来的模型配置、密钥、会话、附件、设置和其他插件，先备份已有数据；有任务在跑时先告诉我，不要强行中断。
用这个 DSH 自带的"插件 → 添加插件"或配套的命令行安装，不要升级或降级 DSH。OMD 已内置 OpenCU，不要重复安装。
装好后完整重启 DSH，确认 OMD 已启用、新会话能选 Oh My DSH、原来的数据和插件都在，最后告诉我实际版本和备份位置。
```

<a id="computer-use"></a>

## 用电脑和浏览器操作时

| 功能 | 还需要 |
| --- | --- |
| 对话、外观、任务、上下文和记忆 | 装好 OMD、配好模型就行 |
| 通过 Chrome／Edge 扩展操作网页 | 在 **设置 → 电脑与浏览器** 按提示装扩展并允许连接 |
| 内嵌浏览器、侧栏批注、原生监看 | 配套适配的 DSH 桌面版和对应的系统权限 |

Release 里的 host-adapters.zip 是给 DSH 桌面版源码用的适配和构建说明，不是插件，目前也没有现成的完整桌面安装包。需要内嵌浏览器时看[开发](development.md)和[电脑与浏览器](computer-use.md)。

OMD 默认让 AI 直接读写文件、运行命令，不逐条询问；你在 profile 里设过的权限优先生效。模型调用和后台整理按你的服务商计费。

<a id="cli"></a>

<details>
<summary>命令行安装</summary>

已有网页版：先停掉服务，用它配套的命令行安装，`web` 换成你的 profile 名：

```sh
dsh --version
dsh plugin --profile web add https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.1.omd.1.3.11/oh-my-dsh-0.2.2-rc.1.omd.1.3.11.tgz
```

然后按原来的方式启动，数据目录和端口都不变。

第一次用网页版（Windows 请用 PowerShell 7）：

```sh
npx --yes @deepseek-ai/dsh@0.2.2-rc.1 plugin --profile web add https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.1.omd.1.3.11/oh-my-dsh-0.2.2-rc.1.omd.1.3.11.tgz
npx --yes @deepseek-ai/dsh@0.2.2-rc.1 --profile web
```

打开终端打印出来的完整登录链接。数据默认在用户目录的 `.dsh`，默认端口 3080。已经装过 DSH 的不要用这段命令另起一套。

macOS 桌面版默认位置的命令行：

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" --version
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.1.omd.1.3.11/oh-my-dsh-0.2.2-rc.1.omd.1.3.11.tgz
```

Windows 桌面版建议直接用插件页安装。

</details>

## 旧版 DSH

<!-- history -->
| DSH | OMD 安装包 |
| --- | --- |
| 0.2.1-rc.1 | [OMD 0.100.0](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.100.0/oh-my-dsh-0.2.1-rc.1.omd.0.100.0.tgz) |
<!-- /history -->

其他版本到 [Releases](https://github.com/gulagala001/oh-my-dsh/releases) 找名字以你的 DSH 版本开头的包。装好之后看[首次使用](getting-started.md)。
