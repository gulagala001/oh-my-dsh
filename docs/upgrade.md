# Oh My DSH：AI 安装与升级手册

这份文档供能操作本地终端或桌面应用的 AI 执行，也可供用户照着操作。用户把本页网址交给你并要求安装／升级时，按所选版本的流程完成；用户只是询问文档时，不执行安装。用户的实际要求和所在环境规则优先。

自己操作的用户请看[手动安装](usage.md#安装到现有-dsh推荐)。本页固定入口：<https://github.com/gulagala001/oh-my-dsh/blob/main/docs/upgrade.md>；无法读取 GitHub 页面时可读[原始 Markdown](https://raw.githubusercontent.com/gulagala001/oh-my-dsh/main/docs/upgrade.md)。

**安装桌面应用从[桌面版：从零安装与升级](#desktop)开始；通过终端启动 Web 的用户从[识别真实运行环境](#1-识别真实运行环境)开始。** 已有环境沿用原安装方式；首次安装未说明桌面还是 Web，且上下文也无法判断时，先确认这一项，不默认改装 Web。

## 目标版本与完成标准

| 组件 | 本手册目标 |
| --- | --- |
| Oh My DSH | **1.7.3**，Git tag `v1.7.3` |
| DSH Web／官方桌面宿主 | **0.1.7-rc.2** |
| 内置 OpenCU | **1.1.3**，无需另装 |
| Web／源码环境 | Node.js ≥22.19、Git、pnpm 11.23.0；Windows 使用 PowerShell 7 |

以本手册与目标 tag 的 `package.json` 配对，不能仅把一个组件换成 `latest`。若仓库刚发布新版本而配对资料未同步，先核对官方发布说明和目标包，避免混装。

完成意味着：**首次安装能启动所选桌面应用或 Web、加载插件并显示当前版本 1.7.3；升级时原环境已备份，沿用原数据目录和 profile（Web 还需保留原端口），旧模型／会话／皮肤仍可用。** GitHub 最新版本、下载成功或文件已改，均不能代替实际安装和重启。没有模型凭据时如实报告对话验证尚未完成。

<a id="desktop"></a>

## 桌面版：从零安装与升级

桌面版由 **DSH 官方桌面应用 + Oh My DSH 插件** 组成。本手册配对 **DSH 0.1.7-rc.2 + OMD 1.7.3**，由桌面应用管理内置宿主；无需克隆本仓库或运行下方 Web 启动命令。

### 1. 下载并安装 DSH 桌面应用

| 电脑 | 官方安装包 | 安装方式 |
| --- | --- | --- |
| Windows x64 | [下载 EXE](https://download.deepseek.com/dsh-desk/bin/win-x64/deepseek-harness-0.1.7-rc.2-win-x64.exe) | 下载后运行安装程序，按提示安装并打开 DeepSeek Harness。 |
| Mac Apple 芯片（M 系列） | [下载 ZIP](https://download.deepseek.com/dsh-desk/bin/mac-arm64/deepseek-harness-0.1.7-rc.2-mac-arm64.zip) | 解压，将 DeepSeek Harness 应用移入「应用程序」，再打开。 |

上述链接固定为本插件适配的 rc.2。其他系统或架构先核对 [DSH 官方发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-rc.2)中的可用安装包，不将这两个包当成通用安装包，也不因缺少对应包擅自改装 Web。

**已有桌面版或 Web 数据时：** 先确认实际 `DSH_HOME`，等任务结束，完整退出桌面应用并停止使用同一数据目录的 Web 服务，再按[备份步骤](#2-停止并完整备份)备份整个目录，之后更新桌面应用并继续使用原数据。首次安装尚无数据时跳过备份。若已有宿主不是 rc.2，先核对版本配对；不要仅更新插件，也不要直接降级更高版本的宿主。

### 2. 首次启动与模型配置

打开 DeepSeek Harness，按应用引导完成初始设置。在模型设置中添加自己的提供方、模型和凭据；已有配置继续沿用。模型应支持原生工具调用，需要理解截图时还应支持图像输入。插件不附带模型账号或密钥。

AI 协助安装时，让用户在应用中填写登录信息或密钥，不要求其粘贴到对话中。没有可用模型时可以继续安装插件，但不能宣称已通过对话验证。

### 3. 在应用内安装 Oh My DSH

打开应用内「插件」页面，在安装来源中填入以下内容并执行安装，完成后确认插件已启用：

```text
github:gulagala001/oh-my-dsh#v1.7.3
```

桌面使用保留的 `desktop` profile。即使 Web 已安装 OMD，也需要在桌面端单独安装；安装与启用状态分别管理。不要执行 CLI 的 `plugin --profile desktop`，不要用全局 npm 升级来替换桌面内置宿主，也不要修改签名应用内的文件。OpenCU 已包含在 OMD 内，无需另装一套插件。

安装会将此 profile 的默认 Agent preset 设为 Oh My DSH，并带入完整文件／命令访问、关闭执行审批的配置；已有显式覆盖优先，已有会话保留各自的 preset。

### 4. 完整重启并检查

等当前任务结束，从应用菜单选择 **「重启应用与 Host」**，或完整退出应用后重新打开。**仅关闭窗口会留在后台，仅刷新页面会复用旧启动配置，不能代替完整重启。** 后续安装、更新、启用或停用插件也遵循这一步。

重启后确认：

1. 桌面宿主为 **0.1.7-rc.2**，插件版本面板的「当前版本」为 **1.7.3**；「最新版本」不能代替当前版本。
2. 新建会话选择 **Oh My DSH**，输入区出现工作台；已有用户的模型、旧会话和皮肤仍可用。
3. 选择已配置的模型发送一条简短消息，确认能正常回复；有条件时再做一次无副作用的工具调用。缺少凭据或权限时说明未完成项。

主题在「设置 → 外观」切换；电脑操作的运行环境与权限在「设置 → Oh My DSH → 基础组件」按需准备，参见[平台与运行条件](usage.md#平台与运行条件)。这些组件的准备与系统授权不等于安装桌面应用本身。

若 AI 只有终端权限、无法操作桌面应用，就提供应用内安装和重启的具体步骤，由用户完成；不要绕过桌面插件管理器。完成本节后无需执行下方 Web 安装命令。[桌面验证范围](release-1.7.3.md#验证范围)。

## 1. 识别真实运行环境

以下识别和命令行安装流程适用于 **Web／源码环境**。用户要求安装或升级桌面应用时，执行上方[桌面版流程](#desktop)。

只读取安装与运行需要的信息，不输出密钥、登录 token 或会话正文。

- 查实际启动命令、服务管理器、运行进程和监听端口；判断 npx、npm／pnpm 全局、OMD 源码，还是定制宿主。查当前宿主和插件版本，不能只凭 PATH 中另一个 `dsh --version` 下结论。
- 确认实际 `DSH_HOME`、profile、端口和工作目录。默认 Web 数据在 `~/.dsh`；服务管理器可能另设环境变量。OMD 源码 `pnpm start` 默认用仓库 `data/dsh/`、`trisoul-x` profile、3083 端口。
- 记录需要沿用的启动参数、代理、环境变量、模型渠道、皮肤和 profile 自定义覆盖。已有用户不要创建一个空白 profile 来代替升级。
- 确认任务是否还在执行。等任务结束再停机；不要未经用户授权中断活动任务。可以先下载依赖、准备隔离目录和核对升级步骤。
- 首次安装且已明确选择 Web 时，采用 Web 默认环境。若是桌面版、定制启动器或有宿主源码改动，先识别其安装机制；不要拿 Web CLI 命令直接替换桌面程序。

只在缺少决定性信息时询问。已获安装／升级授权后，备份、安装和必要检查连续完成，无需每一步重复确认。

## 2. 停止并完整备份

安全停止旧服务，必要时暂停服务管理器自动重启。将**实际 DSH_HOME 整个目录**复制到新的带时间戳目录，包含隐藏文件、凭据、profiles、会话、附件和插件资料。项目工作目录若在 DSH_HOME 外，不会随它一起备份。

macOS / Linux 示例，先把第一行替换成查到的绝对路径：

```sh
omdDataDir='/实际/DSH_HOME'
omdBackupDir="${omdDataDir}.backup-$(date +%Y%m%d-%H%M%S)"
test -d "$omdDataDir" && cp -a "$omdDataDir" "$omdBackupDir"
```

PowerShell 7：

```powershell
$omdDataDir = 'C:\实际\DSH_HOME'
$omdBackupDir = "$omdDataDir.backup-$(Get-Date -Format yyyyMMdd-HHmmss)"
if (!(Test-Path -LiteralPath $omdDataDir -PathType Container)) { throw '请核对原数据目录' }
Copy-Item -LiteralPath $omdDataDir -Destination $omdBackupDir -Recurse -Force -ErrorAction Stop
```

确认复制成功，目录和关键文件齐全后再继续；保存备份路径。备份含凭据，仅保留本机，不提交仓库或上传。首次安装尚无数据目录时跳过备份并如实说明。

## 3. 按原安装方式升级

在同一执行环境中绑定真实 `DSH_HOME`；下列 `web` 一律替换成原 profile，启动命令沿用原端口与参数。保持原服务启动方式，避免新旧两个实例同时写同一目录。

### npx 或首次安装

```sh
# macOS / Linux
export DSH_HOME="$omdDataDir"
```

```powershell
# PowerShell 7
$env:DSH_HOME = $omdDataDir
```

```sh
npx --yes @deepseek-ai/dsh@0.1.7-rc.2 --version
npx --yes @deepseek-ai/dsh@0.1.7-rc.2 plugin --profile web add github:gulagala001/oh-my-dsh#v1.7.3
npx --yes @deepseek-ai/dsh@0.1.7-rc.2 --profile web
```

自定义端口启动时追加 `--port 原端口`。需要常驻时使用原服务管理方式，不把临时终端进程误报为持久部署。

### npm／pnpm 全局安装

用原包管理器更新原安装位置：

```sh
npm install -g @deepseek-ai/dsh@0.1.7-rc.2
# 原来通过 pnpm 全局安装时，使用 pnpm add -g @deepseek-ai/dsh@0.1.7-rc.2

dsh --version
dsh plugin --profile web add github:gulagala001/oh-my-dsh#v1.7.3
dsh --profile web
```

确认原服务管理器使用的可执行文件就是更新后的版本；插件安装命令不会升级全局宿主。保留原来的 DSH_HOME、profile 和端口参数。

### OMD 源码启动

读取仓库工作约定和 `git status`，保留用户修改。干净工作区可执行：

```sh
git fetch origin --tags
git switch --detach v1.7.3
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

存在本地修改时，在独立 checkout／worktree 准备该 tag，沿用原数据目录及启动参数，并保留旧 checkout；不要 `reset --hard`、清除文件或强制覆盖。不要一边运行原服务，一边改写它正在加载的构建产物。

## 4. 处理必要的版本差异

- **DSH 0.1.7-alpha.1 / alpha.2 → rc.1：** 会话继续采用 V4，无需重复迁移旧日志。OMD 旧“简洁／详细”映射为新版“标准”，旧“完全展开”映射为新版“详细”，保留实际显示习惯；之后的主动选择不再迁移。保留 OMD 上下文、任务账本、BT、PTC、预算、皮肤及其设置。
- **DSH 0.1.6-alpha.2 → 本版：** OMD 自动迁移支持的旧会话与关联记录；V3 原日志保留，`omd-v4-migration.json` 保存恢复信息。旧配置导入后保留为 `settings.yaml.imported`；不要重建已导入文件触发二次覆盖。
- **更早或定制环境：** 先在数据副本上核对对应宿主迁移结果，再切换；无法确定兼容性时报告具体阻碍，不删除旧数据试错。暂留 DSH 0.1.6-alpha.2 的用户应留在 OMD 1.6.1；DSH alpha.1 对应 OMD 1.7.0，alpha.2 对应 OMD 1.7.1。
- **自定义 spill-policy：** alpha.2 将 `maxInlineBytes` 改为 `maxInlineTokens`，文本和图片共用 token 预算。只有实际存在旧自定义项时才处理；字节与 token 单位不同，不机械照抄数值。可用新版默认值时移除旧覆盖；用户有明确限额要求时先确认合适预算。OMD 图片请求大小、输出预览等合法字节限制不改名。
- **后台唤醒：** alpha.2 默认不再限制连续三次完成唤醒；用户显式配置的 `maxConsecutiveWakes` 仍要保留。
- **旧 bundle／渠道：** 仅在发现对应旧配置时修正。独立 `agent-team-web-profile` 已并入 `agent-team-profile`；旧 `.agent-presets` 应转为 preset bundle。官方 DeepSeek 渠道的旧 `protocol` 配置需按 Messages API 迁移，其他 OpenAI 兼容渠道保持各自协议。参阅 [DSH alpha.1 说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-alpha.1) 和 [alpha.2 说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-alpha.2)。

安装插件会将该 profile 默认 Agent preset 设为 `trisoul-x`，并带入完整文件／命令访问、关闭执行审批的配置；用户已有显式覆盖优先，不为安装擅自移除限制。已有会话保留自己的 preset。

## 5. 少量检查并交付

只检查这次安装的实际结果，不在用户电脑跑整个开发测试集：

1. 服务从原入口正常启动，日志无阻止运行的错误；宿主实际为 0.1.7-rc.2，插件当前版本为 1.7.3。
2. 使用本次启动的登录链接打开页面；确认对话、工作台和原皮肤正常显示。已有用户能看到原模型配置和一个旧会话的历史，不输出其正文。
3. 如可使用已配置模型，在新测试会话做一次短对话和无副作用的工具调用；没有可用模型或凭据时明确这一项未完成，不伪造成功。
4. 向用户简洁报告实际版本、访问地址（不公开登录 token）、备份位置和任何未完成步骤。用户未要求时，不公开推送本机配置或数据。

发现空白新环境先核对 DSH_HOME 和 profile，不要求用户重新录入凭据。发现旧版本先核对仍在运行的进程和启动器，不用反复安装掩盖没重启的问题。任务未结束、权限或必需凭据阻塞时，保留当前可用服务，说明具体下一步。

## 回退

停止新版，以升级前的宿主和插件版本运行完整备份副本，使用独立 DSH_HOME。保留升级后的目录；不要让新旧宿主交替写同一目录，也不要只降级程序后继续写已迁移数据。回退后同样确认真实版本与旧会话可见。
