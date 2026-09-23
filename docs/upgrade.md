# 从旧版 DSH 升级并安装 Oh My DSH

[返回首页](../README.md) · [使用指南](usage.md)

**先配对版本，再备份、升级宿主、安装插件，最后重启。** “检查更新”只读取发布说明，不会替你安装或重启。

## 先选对版本

| 你的情况 | 做法 |
| --- | --- |
| DSH 0.1.6-alpha.2，准备使用 OMD 1.7.0 | 按下文将宿主升级到 0.1.7-alpha.1，再安装 OMD 1.7.0 |
| 已使用 DSH 0.1.7-alpha.1 | 备份后安装或更新 OMD 1.7.0，重启即可 |
| 本地 OMD 还是 1.7.0-rc.1 | 仍需安装 1.7.0 并重启；发布了正式版不等于本地已更新 |
| 暂时保留 DSH 0.1.6-alpha.2 | 继续使用 OMD 1.6.1；不要只把插件升级到 1.7.0 |
| 更早的 DSH、桌面版或自己改过的宿主 | 本文的命令面向 Web 版；先在数据副本上按对应宿主的升级说明确认迁移，再切换原环境 |

OMD 1.7.0 当前固定适配 **DSH 0.1.7-alpha.1**，内置 **OpenCU 1.1.0**，无需另外安装 OpenCU。DSH 官方于 2026-09-22 发布了 [0.1.7-alpha.2](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-alpha.2)；它比本文使用的宿主更新。当前配对以 OMD 的版本说明和 `package.json` 为准，不要把命令中的固定版本直接改成 `latest`。

## 1. 记住原来的启动方式

升级前记录四项：**启动命令、DSH_HOME、profile 名称、端口**。

- 通常 Web 用户使用 `web` profile，数据默认在 `~/.dsh`（Windows 为用户目录下的 `.dsh`）。
- 自定义的 `DSH_HOME` 必须继续使用同一个目录；启动器、服务管理器可能替你设置了它，不能只看当前终端的环境变量。
- profile 存放在 `DSH_HOME/profiles/`。原来用 `work`、`trisoul-x` 等名称，下文的 `web` 就要换成那个名称。
- 用 OMD 源码的 `pnpm start` 启动时，默认数据在该仓库的 `data/dsh/`，profile 为 `trisoul-x`，端口为 `3083`。它使用仓库里的 DSH，更新全局 `dsh` 不会更新这个实例。

保留已有的自定义端口、代理、模型环境变量和其他启动参数。不要为了升级重新创建一个 profile，也不要把旧配置整份覆盖到新版默认配置上。

## 2. 停止服务并备份

等正在执行的任务结束，停止旧 DSH；若由启动器或系统服务管理，要暂停自动重启。完整复制实际使用的 **DSH_HOME 整个目录**，包含隐藏文件、模型凭据、profiles、会话、附件和插件资料。项目工作目录通常在它外面，需要时另行备份。

macOS / Linux，确认下方路径就是原服务的数据目录再执行：

```sh
omdDataDir="${DSH_HOME:-$HOME/.dsh}"
omdBackupDir="${omdDataDir}.backup-$(date +%Y%m%d-%H%M%S)"
test -d "$omdDataDir" && cp -a "$omdDataDir" "$omdBackupDir"
```

Windows PowerShell 7：

```powershell
$omdDataDir = if ($env:DSH_HOME) { $env:DSH_HOME } else { Join-Path $HOME '.dsh' }
$omdBackupDir = "$omdDataDir.backup-$(Get-Date -Format yyyyMMdd-HHmmss)"
if (!(Test-Path -LiteralPath $omdDataDir -PathType Container)) { throw '数据目录不存在，请核对原启动配置' }
Copy-Item -LiteralPath $omdDataDir -Destination $omdBackupDir -Recurse -Force -ErrorAction Stop
```

若原目录不是上面的默认值，先把 `omdDataDir` 改成它的实际绝对路径。复制完成后检查备份中有原有的 `profiles`、会话和附件；备份包含凭据，保存在自己的设备上。

## 3. 使用匹配宿主安装插件

需要 Node.js ≥22.19、Git、pnpm；Windows 命令在 PowerShell 7 中执行。下面使用 [DSH 官方的 npx 运行方式](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-alpha.1/README.zh.md#通过-npm-运行)，并固定宿主和插件版本。

先在同一个终端绑定刚才核对的数据目录：

```sh
# macOS / Linux
export DSH_HOME="$omdDataDir"
```

```powershell
# Windows PowerShell 7
$env:DSH_HOME = $omdDataDir
```

然后执行以下两条命令；自定义 profile 请将 `web` 替换成原名称：

```sh
npx --yes @deepseek-ai/dsh@0.1.7-alpha.1 --version
npx --yes @deepseek-ai/dsh@0.1.7-alpha.1 plugin --profile web add github:gulagala001/oh-my-dsh#v1.7.0
```

第一条应显示 `0.1.7-alpha.1`。第二条既适用于首次安装，也适用于更新已有 OMD。安装完后再启动：

```sh
npx --yes @deepseek-ai/dsh@0.1.7-alpha.1 --profile web
```

原来使用自定义端口，例如 `3083`，启动时继续加上 `--port 3083`。打开这次启动打印的完整登录链接。

<details>
<summary>我一直用全局安装的 dsh，怎么更新？</summary>

保持同一个 DSH_HOME、profile 和端口，用 npm 更新全局宿主后安装插件：

```sh
npm install -g @deepseek-ai/dsh@0.1.7-alpha.1
dsh --version
dsh plugin --profile web add github:gulagala001/oh-my-dsh#v1.7.0
dsh --profile web
```

若原来通过 pnpm 全局安装，用 `pnpm add -g @deepseek-ai/dsh@0.1.7-alpha.1` 更新同一个安装来源。不要混用两个全局安装后，只凭终端中的版本号判断服务已经升级。

</details>

<details>
<summary>我用的是 OMD 源码的 pnpm start</summary>

先停止服务、备份仓库的实际 DSH_HOME，并保留自己的未提交修改。在 OMD 仓库内运行：

```sh
git fetch origin --tags
git switch --detach v1.7.0
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

若 Git 提示本地修改会被覆盖，先保存自己的修改，不要强制切换。默认使用该仓库的 `data/dsh/`、`trisoul-x` profile 和 `3083` 端口；显式设置过 DSH_HOME 或 PORT 时继续沿用。

</details>

## 4. 打开旧会话，确认本地已经更新

首次启动可能需要迁移旧会话，等服务就绪后再刷新网页。

- 左上角版本面板的**当前版本**应为 `1.7.0`；最新版本只是远端发布记录。
- 模型、凭据和旧会话应仍在。若显示全新空白环境，先核对 DSH_HOME 和 profile，不要急着重新填写模型。
- 新建会话选择 **Oh My DSH**；旧会话保留各自的 Agent preset，不会因安装插件全部变成 OMD 会话。
- 打开一个旧会话查看历史，再试一次普通对话和工具调用；自定义皮肤可在“设置 → 外观”中确认。

安装 OMD 会将该 profile 的默认 Agent preset 设为 `trisoul-x`，并带入完整文件/命令访问、关闭执行审批的配置；profile 中自己的显式覆盖优先。

## 迁移和常见问题

**配置与旧会话怎么处理？** 旧配置导入后保留为 `settings.yaml.imported`。旧 OMD 会话生成 V4 日志，V3 原文件保留；旁边的 `omd-v4-migration.json` 记录关联数据的迁移前副本。模型、附件和插件资料应成套保留，不手工删掉旧日志来“修复”迁移。

**报插件缺失或 preset 无效？** 先确认 OMD 安装在正在启动的同一个 profile，并查看终端第一条启动错误。旧自定义插件、手写预设也需要适配新宿主；旧 `.agent-presets` 目录已不再由新版读取，要转换成 preset bundle。新版 [Agent Team bundle](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.7-alpha.1/packages/experimental/agent-team-profile/package.json) 已包含 Web 界面；原 profile 同时列出旧 `agent-team-web-profile` 时，保留 `agent-team-profile` 并去掉已撤销的独立 Web bundle。预设与配置变更见 [DSH 0.1.7-alpha.1 发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.7-alpha.1)。

**旧 DeepSeek 渠道报协议错误？** DSH 0.1.7 的官方 DeepSeek 适配器改用 Messages API，旧 `protocol` 配置需要移除，地址应支持 Messages。其他自定义 OpenAI 兼容渠道继续按自己的协议配置，不要一并改成 Messages。详见上面的官方发布说明。

**为什么还显示 rc.1？** GitHub 发布、点击“检查更新”、更新磁盘代码，都不等于正在运行的服务已切换。完成安装后重启原服务，再刷新网页；不要只打开另一个端口的新实例。

**需要退回旧版本？** 停止新宿主，使用升级前的宿主和插件版本，并将完整备份恢复到一个独立目录，以该目录作为 DSH_HOME 启动。保留升级后的目录，不让新旧宿主同时写入它。只降级程序、继续写已迁移的数据目录，不是完整回退。
