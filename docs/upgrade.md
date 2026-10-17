# Oh My DSH 安装与升级

[English](upgrade_EN.md) · [目录](README.md) · [桌面](#desktop) · [Web](#3-按原安装方式升级) · [迁移](#web-to-desktop) · [备份](#2-停止并完整备份) · [排障](troubleshooting.md)

按实际 DSH 版本选配套插件。已有环境沿用运行方式、数据目录、profile 和端口；升级先结束任务、停止服务或完整退出，并备份。用户只询问文档时不执行安装；安装授权不包含公开发布或中断未授权的活动任务。

可把[本页网址](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/upgrade.md)交给能操作电脑／终端的 AI，说明桌面或 Web、安装或升级。缺少桌面新包不自动改装 Web，所在环境权限规则优先。

## 目标版本与完成标准

| 环境 | DSH | 公开 OMD／固定 tag |
| --- | --- | --- |
| Web alpha.1 | `0.2.1-alpha.1` | [v0.2.1-alpha.1.omd.0.10.0 安装包](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-alpha.1.omd.0.10.0/trisoul_x-0.2.1-alpha.1.omd.0.10.0.tgz) |
| Web rc.2／本文桌面 | `0.2.0-rc.2` | [v0.2.0-rc.2.omd.0.10.0 安装包](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.0-rc.2.omd.0.10.0/trisoul_x-0.2.0-rc.2.omd.0.10.0.tgz) |

仓库 `gulagala001/oh-my-dsh`，包 `trisoul_x`。包名分别为 `trisoul_x-0.2.1-alpha.1.omd.0.10.0.tgz` 与 `trisoul_x-0.2.0-rc.2.omd.0.10.0.tgz`，来源为 [alpha.1 Release](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-alpha.1.omd.0.10.0) 与 [rc.2 Release](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.0-rc.2.omd.0.10.0)。公开安装以固定 tag 文档为准。

当前发行 **`0.2.1-rc.2.omd.0.17.3`** 对应 **DSH `0.2.1-rc.2`**，默认内置新版 OpenCU `2.0.0`。新版安装请先看[安装与版本配对](install.md)；下方固定 URL 只用于旧 0.10。完整 CU 界面需要匹配 Host／Client／preload 适配。rc.2、alpha.3、rc.1 各用独立 SDK 与构建，不改版本号混装，不用 `latest` 跨宿主选包。

安装默认带入 Oh My DSH 预设、完整文件／命令访问和关闭执行审批的配置；**profile 显式覆盖优先**，不擅自移除用户限制，旧会话保留预设。完成需核对正常启动、当前版本、新 OMD 会话；升级还检查原模型、旧会话／附件、外观。下载成功、HTTP 200 或“最新版本”都不等于安装成功；未配置模型时先完成模型设置。

<a id="desktop"></a>

## 桌面版：从零安装与升级

本页提供官方桌面 rc.2 的固定公开配对，不代表已确认当前所有桌面更新源。其他宿主先查其真实桌面资产与配套 OMD，已有更高宿主不直接降级。

| 电脑 | 固定官方安装包 |
| --- | --- |
| Windows x64 | [rc.2 EXE](https://download.deepseek.com/dsh-desk/bin/win-x64/deepseek-harness-0.2.0-rc.2-win-x64.exe) |
| Mac Apple 芯片 | [rc.2 ZIP](https://download.deepseek.com/dsh-desk/bin/mac-arm64/deepseek-harness-0.2.0-rc.2-mac-arm64.zip) |

其他架构查[官方说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.0-rc.2)。

1. 有旧数据先[备份](#2-停止并完整备份)。Windows 运行安装程序，Mac 解压移入“应用程序”。
2. 打开应用，在模型设置沿用／配置自己的渠道与凭据。原生工具必需；密钥在应用内填。
3. 在 **插件** 页用下方固定来源安装并启用。
4. 完整退出重开，或 **重启应用与 Host**。仅关窗口／刷新不够。
5. 查 DSH `0.2.0-rc.2`、OMD **当前版本** `0.2.0-rc.2.omd.0.10.0`。新会话选 Oh My DSH，做短对话和无副作用工具调用。

```text
https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.0-rc.2.omd.0.10.0/trisoul_x-0.2.0-rc.2.omd.0.10.0.tgz
```

桌面使用独立 `desktop` profile，Web 已装不会自动共享。终端安装须桌面自带 CLI，不能用 npm／npx Web CLI 写保留 profile，也不能全局 npm 替换桌面宿主。

<a id="desktop-cli"></a>

<details>
<summary>Mac 桌面自带 CLI</summary>

默认应用位置下，先核对桌面宿主再装匹配包：

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" --version
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.0-rc.2.omd.0.10.0/trisoul_x-0.2.0-rc.2.omd.0.10.0.tgz
```

不是 rc.2 时先换对应发行。其他安装位置替换应用路径，沿用桌面实际 `DSH_HOME`。这是 Mac 布局，不照搬为 Windows 路径；Windows 可用应用插件页。之后仍完整重启检查。

</details>

<a id="build-approval"></a>

### 安装脚本被拦截，插件页没有批准入口

仅在安装报 `ERR_PNPM_IGNORED_BUILDS` 或明确提示构建脚本未批准时使用，不能据空的待批准列表推断脚本已运行，也不假定所有 OMD 包都有安装脚本。

先结束任务、完整退出并备份。使用原宿主 CLI、实际 `DSH_HOME` 和同一 profile；桌面必须用应用自带 CLI。下例重试刚被拦截的同一已核验本地 `.tgz`。若原安装用 URL、现在改为本地 `file:`，先尝试本地包；仍被拦截时复制这次的依赖键，不复用 URL 的旧键：

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop ignored-builds
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop approve-builds '<从上一条输出复制的完整依赖键>'
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add 'file:/absolute/path/to/verified-package.tgz'
```

替换两处占位内容，只选择核对过来源、完整宿主版本与 SHA-256 的目标包；完整键可能含 `@file:`，不能只凭包名猜键。批准会执行目标安装脚本，需用户明确同意；确认退出码 0 与脚本完成，再逐包重试同一归档，保留已有允许／拒绝规则。Web 用原服务配套 CLI 与原 profile；Windows 用其实际桌面入口。

若 `ignored-builds` 没列出目标包，保留错误并核对 profile 和归档，不用 `--all`、`ignoreScripts`、空白 profile 或 version exemption 绕过。安装退出码 0 后完整重启并检查首次实际操作；原生拒绝如实记录。

非 CU 使用不要求准备桌面控制。公开旧包的电脑操作条件按[固定 0.10 文档](https://github.com/gulagala001/oh-my-dsh/blob/v0.2.1-alpha.1.omd.0.10.0/docs/usage.md#computer-use)查阅。

<a id="web-to-desktop"></a>

## 旧版 DSH Web 转桌面，同时安装 OMD

同一实际 `DSH_HOME` 才共享产品数据。数据目录接入、profile 配置转移、会话格式迁移分别处理；OMD 不包办整个迁移。

1. 记录旧版本、启动方式、目录、Web profile、端口、必要插件和外部自定义数据。
2. 停 Web 和自动拉起服务，完整退桌面，备份全部实际数据。
3. 让桌面进程使用目标目录。默认 Web `~/.dsh`，Windows 用户目录 `.dsh`；自定义需在真实桌面启动入口设 `DSH_HOME`，另一个终端的变量不证明 Dock／开始菜单继承。
4. 安装匹配桌面与 OMD、启用并完整重启后再开旧 OMD 会话，避免原生宿主先转换日志而 OMD 关联尚未同步。不覆盖 `profiles/desktop` 的整套 Web profile／依赖／锁文件。
5. 核对桌面渠道、必要插件、OMD 设置和外观；共享凭据存在不代表渠道已配置。旧纯 DSH 会话不自动变 OMD。
6. 抽查原文／附件、原 OMD 上下文与任务，新会话短聊并读取文件，再从长期桌面入口重开确认。

搬到默认目录时先备份目标，只在目标不存在时复制整目录，保留原件，不覆盖合并两套数据。切换后旧 Web 不再写升级目录。关联不一致时保留现场，在备份副本验证，不删迁移记录强制重跑。

<details>
<summary>自动迁移的边界</summary>

DSH 处理其支持的旧格式；OMD 迁移可识别会话与关联，V3 → V4 保留原日志和 `omd-v4-migration.json`，已有 V4 不重复迁移。

`settings.yaml` 导入后留 `settings.yaml.imported`，不代表桌面拥有其他 profile 全部配置，当前显式覆盖优先；不改回名字强制导入。更早／定制环境先在备份副本验证，不承诺所有组合。

</details>

<a id="legacy-history-failure"></a>

### 旧会话显示“历史加载失败”怎么办

公开配对包含早期 V0 兼容修复，该提示仍可能有其他原因。保留完整错误、会话 ID 和数据，再[定位](troubleshooting.md#按症状处理)。不能仅凭当前 preset 名判断历史格式。

识别成功的旧记录生成兼容副本，原 `session.jsonl`／`session.jsonl.zstd` 保留；退役附加字段不保证恢复成现界面功能，事件冲突仍可能失败。重启后实际打开原失败会话核对正文、附件、任务和记录；仍失败的逐项保留诊断，不删原日志／迁移记录或手工改序号。加载失败不是自动删除数据的理由。

## 1. 识别真实运行环境

Web／源码先核对实际进程／服务用的可执行文件、版本、`DSH_HOME`、profile、端口；PATH 另一份 `dsh --version` 不代表运行服务。

Web 默认用户目录 `.dsh`；源码默认仓库 `data/dsh/`、`trisoul-x` profile、3083。保留参数、代理和显式覆盖，不以空白 profile 代替升级。AI 只读安装必需信息，不输出凭据、登录 Token、私人正文。

## 2. 停止并完整备份

停任务、服务和自动拉起入口，复制整个实际 `DSH_HOME` 到新时间戳目录，包括隐藏凭据、profiles、会话、附件、OMD 资料；外部项目／自定义数据另备份。

<details>
<summary>备份命令</summary>

换成实际绝对路径，macOS／Linux：

```sh
omdDataDir='/absolute/path/to/dsh-data'
omdBackupDir="${omdDataDir:?}.backup-$(date +%Y%m%d-%H%M%S)"
test -d "$omdDataDir" && test ! -e "$omdBackupDir" && cp -a "$omdDataDir" "$omdBackupDir"
```

PowerShell 7：

```powershell
$omdDataDir = 'C:\dsh-data'
$omdBackupDir = "$omdDataDir.backup-$(Get-Date -Format yyyyMMdd-HHmmss)"
if (!(Test-Path -LiteralPath $omdDataDir -PathType Container)) { throw 'Check the data directory' }
if (Test-Path -LiteralPath $omdBackupDir) { throw 'Backup destination already exists' }
Copy-Item -LiteralPath $omdDataDir -Destination $omdBackupDir -Recurse -ErrorAction Stop
```

确认成功和关键目录齐全，备份只留本机。首次无数据可跳过并说明。

</details>

## 3. 按原安装方式升级

以下是 **公开旧版本的 Web 命令**，不是本地 0.17 安装。绑定实际 `DSH_HOME`，用原 profile 替换 `web`，保留端口，不同时运行两个写入实例。

### npx 或首次安装

alpha.1：

```sh
npx --yes @deepseek-ai/dsh@0.2.1-alpha.1 --version
npx --yes @deepseek-ai/dsh@0.2.1-alpha.1 plugin --profile web add https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-alpha.1.omd.0.10.0/trisoul_x-0.2.1-alpha.1.omd.0.10.0.tgz
npx --yes @deepseek-ai/dsh@0.2.1-alpha.1 --profile web
```

保留 rc.2 的 Web：

```sh
npx --yes @deepseek-ai/dsh@0.2.0-rc.2 plugin --profile web add https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.0-rc.2.omd.0.10.0/trisoul_x-0.2.0-rc.2.omd.0.10.0.tgz
npx --yes @deepseek-ai/dsh@0.2.0-rc.2 --profile web
```

自定义端口加 `--port 原端口`，常驻沿用服务管理器，临时终端不等于持久部署。

<details>
<summary>npm／pnpm 全局与源码</summary>

沿用原包管理器：

```sh
npm install -g @deepseek-ai/dsh@0.2.1-alpha.1
dsh --version
dsh plugin --profile web add https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-alpha.1.omd.0.10.0/trisoul_x-0.2.1-alpha.1.omd.0.10.0.tgz
dsh --profile web
```

pnpm 用 `pnpm add -g @deepseek-ai/dsh@0.2.1-alpha.1`。核对服务调用同一可执行文件；只装插件不升级宿主。

源码保留改动，在独立 checkout 准备固定 tag，使用该 checkout 的 pnpm 与锁定依赖、构建，再沿用数据启动。[源码步骤](development.md#源码运行)。本地重构阶段的 build／test／pack／宿主启动留到全部实现后的集中阶段，不强制清理用户改动或改写运行产物。

</details>

## 4. 处理必要的版本差异

换宿主时查全部已装插件，对应 SDK 的构建一起准备；互相依赖包按原生事务换全套匹配工件。不复制别的 `node_modules`、放宽 peer、使用 version exemption 或跳过检查。

只迁移实际存在且目标要求的旧配置，保留限额、渠道协议、启用状态和用户显式覆盖。字节／Token 预算不照抄；例如 `maxInlineBytes` 转 `maxInlineTokens` 应重新确定限额。保留显式后台唤醒限制，不把新默认写回用户层。旧 bundle／渠道只按实际目标要求处理，非 DeepSeek 的渠道不强改协议。会话边界见迁移专节。

## 5. 少量检查并交付

安装用户环境时只核对本次结果，不运行整个开发测试集：

1. 原入口启动，实际宿主与插件当前版本匹配，无阻止运行错误。
2. 对话／工作台、原模型／外观、旧会话／附件正常；第三方插件与用户配置保留。
3. 有模型就新会话短聊并无副作用读文件，无模型注明未完成。
4. 记录实际版本、备份位置和未完成项，不公开登录 Token。

## 回退

停新版，以原宿主／插件运行升级前完整备份的副本，用独立 `DSH_HOME`。保留升级目录，旧版不写已迁移数据，两版不交替写同目录。

<a id="candidate-install"></a>

<details>
<summary>收到本地构建时核对身份</summary>

核对完整版本 `0.2.1-rc.2.omd.0.17.3`、来源、归档 SHA-256、匹配 DSH `0.2.1-rc.2` 及 SDK／组件／锁文件；其他宿主使用各自单独构建。先在独立数据、profile、端口中检查。文件名或版本号不足以证明内容相同。[新版安装](install.md) · [源码构建](development.md)。

保留其他插件的源码、未提交成果、数据与独立归档，不回档、不覆盖；生态组合还需各独立插件的匹配构建。仅使用文字、文件和主题无需先配置电脑控制。

</details>
