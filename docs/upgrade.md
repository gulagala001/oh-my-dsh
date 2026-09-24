# Oh My DSH：AI 安装与升级手册

这份文档供有本地终端访问能力的 AI 执行。用户把本页网址交给你并要求安装／升级时，按下列流程完成；用户只是询问文档时，不执行安装。用户的实际要求和所在环境规则优先。

自己操作的用户请看[手动安装](usage.md#安装到现有-dsh推荐)。本页固定入口：<https://github.com/gulagala001/oh-my-dsh/blob/main/docs/upgrade.md>；无法读取 GitHub 页面时可读[原始 Markdown](https://raw.githubusercontent.com/gulagala001/oh-my-dsh/main/docs/upgrade.md)。

## 目标版本与完成标准

| 组件 | 本手册目标 |
| --- | --- |
| Oh My DSH | **1.7.3**，Git tag `v1.7.3` |
| DSH Web／官方桌面宿主 | **0.1.7-rc.2** |
| 内置 OpenCU | **1.1.3**，无需另装 |
| 环境 | Node.js ≥22.19、Git、pnpm 11.23.0；Windows 使用 PowerShell 7 |

以本手册与目标 tag 的 `package.json` 配对，不能仅把一个组件换成 `latest`。若仓库刚发布新版本而配对资料未同步，先核对官方发布说明和目标包，避免混装。

完成意味着：**原环境已备份，新版在原数据目录、profile 和端口运行，旧模型／会话／皮肤仍可用，界面当前版本为 1.7.3。** GitHub 最新版本、下载成功或文件已改，均不能代替实际安装和重启。

## 1. 识别真实运行环境

若用户运行官方桌面应用，使用应用内「插件」页面安装 `github:gulagala001/oh-my-dsh#v1.7.3`，由桌面应用管理内置宿主和 `desktop` profile。不要对它执行 CLI 的 `plugin --profile desktop`、全局 npm 升级或修改签名应用内文件。先退出桌面应用并备份实际 `DSH_HOME`；同时使用 Web 时，桌面与 Web 的插件安装、启用状态分别管理。下文命令行安装流程适用于 Web。

桌面安装、更新或启停插件后，等待现有任务结束，再从应用菜单选择「重启应用与 Host」，或完整退出后重新打开应用。关闭窗口会留在后台，刷新页面会复用桌面的旧启动配置，两者都不能代替完整重启。重启后检查当前版本、原会话和输入区工作台。

只读取安装与运行需要的信息，不输出密钥、登录 token 或会话正文。

- 查实际启动命令、服务管理器、运行进程和监听端口；判断 npx、npm／pnpm 全局、OMD 源码，还是定制宿主。查当前宿主和插件版本，不能只凭 PATH 中另一个 `dsh --version` 下结论。
- 确认实际 `DSH_HOME`、profile、端口和工作目录。默认 Web 数据在 `~/.dsh`；服务管理器可能另设环境变量。OMD 源码 `pnpm start` 默认用仓库 `data/dsh/`、`trisoul-x` profile、3083 端口。
- 记录需要沿用的启动参数、代理、环境变量、模型渠道、皮肤和 profile 自定义覆盖。已有用户不要创建一个空白 profile 来代替升级。
- 确认任务是否还在执行。等任务结束再停机；不要未经用户授权中断活动任务。可以先下载依赖、准备隔离目录和核对升级步骤。
- 首次安装无旧服务时采用 Web 默认环境。若是桌面版、定制启动器或有宿主源码改动，先识别其安装机制；不要拿 Web CLI 命令直接替换桌面程序。

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
