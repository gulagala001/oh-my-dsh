# 安装 Oh My DSH

[English](install_EN.md) · [首页](../README.md) · [升级与迁移](upgrade.md)

**选一种方式即可：复制指令让 AI 安装，或在 DSH 的“添加插件”窗口粘贴安装地址。** OMD 是 DSH 插件，已内置 OpenCU，不用再单独安装 OpenCU。

还没有 DSH？先安装 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)，再回到本页。两种方式都适用于已有的桌面或 Web 环境；第一次使用 Web 的命令见[补充说明](#cli)。

<a id="ai"></a>

## 方法一：复制给 AI 安装

将下面整段交给能操作你电脑或终端的 AI。AI 需要访问安装 DSH 的那台电脑；只有文字聊天能力的 AI 无法代为安装。

```text
请在这台电脑现有的 DeepSeek Harness（DSH）中安装或升级 Oh My DSH（OMD）。

先读取：
https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md
https://github.com/gulagala001/oh-my-dsh/blob/main/docs/releases.md

请自动确认实际运行的是桌面版还是 Web、DSH 完整版本、数据目录（DSH_HOME）和 profile，选择与该 DSH 版本完全匹配的已发布 OMD .tgz。
保留原模型配置、凭据、会话、附件、用户设置和其他插件；已有数据先备份。若有正在执行的任务，先告知我，不强行中断。
通过当前 DSH 的“插件 → 添加插件”或该实例配套的 CLI 安装。桌面使用应用自带 CLI 和 desktop profile；Web 沿用原服务的 CLI、profile、数据目录和端口。
OMD 已内置 OpenCU，不重复安装。不要把仓库 main 当成已发布安装包，也不要为安装插件擅自升级或降级 DSH、换成另一种运行方式、替换宿主或公开发布。
如果没有匹配的已发布包，说明缺少哪个版本，不要猜下载地址或强行混装。
安装成功后完整重启此次更新的 DSH 实例，确认 OMD 已启用、新会话能选择 Oh My DSH、原数据和其他插件仍在，最后告诉我实际版本与备份位置。
```

这段指令安装的是已发布插件。完整桌面电脑控制还有[额外条件](#computer-use)，不会由插件安装自动补齐。

<a id="gui"></a>

## 方法二：在“添加插件”窗口安装

### 1. 确认 DSH 版本

在 DSH 的“关于／版本信息”中查看**宿主完整版本**，例如 0.2.1-rc.3。它不是 OMD 版本；0.2.0-rc.2 和 0.2.1-rc.3 也不是同一版。

### 2. 复制与你的 DSH 对应的地址


**DSH 0.2.1-rc.3 → OMD 0.104.0：**

```text
https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.0.104.0/oh-my-dsh-0.2.1-rc.3.omd.0.104.0.tgz
```

**DSH 0.2.1-rc.1 → OMD 0.100.0：**

```text
https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.100.0/oh-my-dsh-0.2.1-rc.1.omd.0.100.0.tgz
```

完整插件版本中的前半段对应 DSH，末尾 `omd.` 后的数字才是 OMD 版本。其他宿主版本请看[下载与旧版入口](releases.md)，不要直接粘贴不匹配的包。

### 3. 粘贴并安装

1. 等当前任务结束。已有 OMD 的用户先按[升级指南](upgrade.md)备份数据。
2. 点击左侧 **插件**，再点右上角 **＋ 添加插件**。
3. 在“输入插件的包名、GitHub 仓库地址或本地目录路径”输入框中，粘贴上面的**完整 .tgz 地址**。
4. 点击 **安装**，等安装完成，确认 Oh My DSH 已启用。
5. 完整退出并重新打开桌面应用；Web 用户重启原 Web 服务。仅关窗口或刷新网页不等于重启后端。
6. 新建会话，选择 **Oh My DSH**。模型使用你在 DSH 中配置的渠道，不附带账号。

输入框虽然也支持仓库地址，本指南使用固定发行包，避免直接安装仍在变化的 main 分支。无需先下载 Source code，也不用把 host-adapters.zip 填进去。

安装失败时保留错误，先核对宿主版本；只有遇到“构建脚本未批准”等提示时，才看[安装脚本处理](upgrade.md#build-approval)。

<a id="computer-use"></a>

## 需要电脑或浏览器控制时

| 你要用的功能 | 还需要什么 |
| --- | --- |
| 对话、主题、任务、上下文与记忆 | 安装匹配的 OMD，配置模型即可；无需先配置 CU。 |
| Chrome／Edge 扩展控制 | 在“设置 → 电脑与浏览器”按该版本提示安装扩展并允许配对。 |
| 完整内置浏览器、侧栏批注、原生监看 | 匹配的 DSH 宿主适配与构建，以及对应系统权限。 |

**目前这些 Release 提供插件包和宿主适配源码，没有可直接安装的配套完整桌面安装器。** host-adapters.zip 是源码适配和构建说明，不是另一个插件。需要完整桌面 CU 时看[构建说明](development.md)及 [OpenCU 使用条件](computer-use.md)；普通插件安装不会替换 DSH 宿主。

OMD 默认安装配置包含完整文件／命令访问并关闭执行审批；已有 profile 的显式权限设置优先。模型调用及后台整理按你的提供方计费。

<a id="cli"></a>

<details>
<summary>补充：终端安装／首次使用 Web（供 AI 或熟悉命令行的用户）</summary>

已有 Web：使用原服务配套的 CLI，先停止该服务；以下仅适用于 DSH 0.2.1-rc.3 和 web profile。自定义 profile 沿用原名称。

```sh
dsh --version
dsh plugin --profile web add https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.0.104.0/oh-my-dsh-0.2.1-rc.3.omd.0.104.0.tgz
```

之后按原方式启动服务，保留原数据目录和端口。DSH 0.2.1-rc.1 使用上面的 rc.1 地址。

首次使用 Web（需要 Node.js ≥22.19；Windows 使用 PowerShell 7）：

```sh
npx --yes @deepseek-ai/dsh@0.2.1-rc.3 plugin --profile web add https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.0.104.0/oh-my-dsh-0.2.1-rc.3.omd.0.104.0.tgz
npx --yes @deepseek-ai/dsh@0.2.1-rc.3 --profile web
```

打开终端打印的完整登录链接。默认数据目录为用户目录下的 .dsh，新 Web 默认端口为 3080。已有安装不要用这段命令另建环境。

macOS 默认桌面安装位置的 CLI 示例（仅适用于实际 DSH 0.2.1-rc.3）：

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" --version
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.3.omd.0.104.0/oh-my-dsh-0.2.1-rc.3.omd.0.104.0.tgz
```

Windows 桌面建议直接用上面的插件界面；命令行路径以实际安装为准。Web CLI 不代替桌面 CLI。

</details>

**版本说明：** 本页 rc.3 固定地址指向 OMD 0.104.0；rc.1／rc.2 沿用 OMD 0.100.0。固定 Release 不会随 main 后续修改而改变。安装之后看[第一次使用](getting-started.md)。
