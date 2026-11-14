# 升级、迁移与回退

[English](upgrade_EN.md) · [安装](install.md) · [排障](troubleshooting.md)

第一次安装请看[安装指南](install.md)。这页给已经在用 OMD 的人：升级、从网页版换到桌面版、恢复数据。升级 OMD 不会升级 DSH。

<a id="目标版本与完成标准"></a>

## 1. 确认你在用哪个 DSH

记下 DSH 的完整版本、桌面版还是网页版、数据目录（`DSH_HOME`）和 profile。桌面版的 profile 是 `desktop`，网页版沿用你启动命令里的 profile。终端里的 `dsh` 不一定是你正在用的那一份。

当前 OMD 1.3.21 对应 DSH 0.2.2-rc.3。旧版 DSH 请看[安装指南的旧版列表](install.md#旧版-dsh)。没有匹配的版本时保持现状，不要为了装插件降级 DSH。

<a id="2-停止并完整备份"></a>

## 2. 停下来，完整备份

停掉任务、服务和会自动拉起 DSH 的程序，把整个 `DSH_HOME` 复制到一个带时间的新目录，包括隐藏的密钥、profiles、会话、附件和 OMD 数据。放在外部的项目和自定义数据另外备份。

<details>
<summary>备份命令</summary>

把路径换成你的实际绝对路径。macOS／Linux：

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

确认复制成功、关键目录都在。备份只放在本机。

</details>

<a id="desktop"></a>
<a id="desktop-cli"></a>

## 3. 安装新版

备份好后打开 DSH，在 **插件 → ＋ 添加插件** 粘贴[安装指南](install.md#gui)里的安装包地址，覆盖安装即可，不用先卸载。也可以把 [AI 安装指令](install.md#ai)发给 AI，或者停掉服务后用[命令行](install.md#cli)。装好后完整重启 DSH。

**设置 → Oh My DSH → 关于** 里的更新只换当前 profile 的 OMD，不会升级 DSH。

装完检查：版本对、OMD 已启用、新会话能选 Oh My DSH，原来的模型、会话、附件、外观和其他插件都在。少了东西先核对数据目录和 profile，不要先删数据或重建。

<a id="package-name"></a>

### 从旧包名升级

现在的包名是 `oh-my-dsh`。早期版本用的是另一个包名，插件页会显示成两个插件：

1. 备份后直接装新包，不用先卸载旧版。
2. 新版启动时会停用仍在运行的旧版（数据保留）并提示重启。完整重启后，在插件页移除旧版。还有提示的话，先手动停用旧版再重启。
3. 重启后自动迁移：数据移到 `DSH_HOME/oh-my-dsh`，原位置留一个指向它的链接；profile 里的 OMD 设置和默认预设同步更新，旧会话照常打开。
4. 你自己建的模型渠道名和密钥变量名不会被改。

### 独立插件的数据

OMD 已经包含 Workflow、Rewind、Persona、Extensions 和 Workbench，升级 OMD 时不用再单独装这些。人格数据在 `DSH_HOME/dsh-persona-plugin/`。完整备份还要包括撤回备份、Workflow 预算和项目脚本、网页导入和外观数据，见[数据清单](architecture.md#数据由对应功能保留)。

<a id="build-approval"></a>

## 安装脚本被拦截

只有安装报 `ERR_PNPM_IGNORED_BUILDS` 或明确提示构建脚本未批准时才用这一节。

先结束任务、完整退出 DSH 并备份。用这个 DSH 自带的命令行、原来的 `DSH_HOME` 和 profile（桌面版必须用应用自带的命令行），重试刚才被拦截的那个已核对的 `.tgz`：

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop ignored-builds
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop approve-builds '<从上一条输出复制的完整依赖键>'
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add 'file:/absolute/path/to/verified-package.tgz'
```

依赖键要从输出里完整复制（可能带 `@file:`），不要凭包名猜。批准会运行这个包的安装脚本，所以只批准来源、DSH 版本和 SHA-256 都核对过的包。`ignored-builds` 里没有目标包时，核对 profile 和安装包，不要用 `--all` 或关闭脚本检查来绕过。

<a id="web-to-desktop"></a>

## 从网页版换到桌面版

只有用同一个 `DSH_HOME`，桌面版才能看到网页版的数据。

1. 记下旧版本、启动方式、数据目录、Web profile、端口、必要的插件和外部数据。
2. 停掉网页版和自动拉起的服务，完整退出桌面版，备份全部数据。
3. 让桌面版用同一个数据目录。网页版默认是用户目录下的 `.dsh`；自定义目录需要在桌面版的真实启动入口里设置 `DSH_HOME`。
4. 先装好匹配的桌面版和 OMD、启用并完整重启，再打开旧的 OMD 会话。不要把整套 Web profile 覆盖到 `profiles/desktop`。
5. 核对桌面版的模型渠道、插件、OMD 设置和外观。旧的纯 DSH 会话不会自动变成 OMD 会话。
6. 打开几个旧会话看看原文、附件和任务，再新建会话读一个文件试试。

要搬到默认目录时，只在目标目录不存在时整体复制，保留原件，不要把两套数据合并。切换后不要再用旧网页版写这个目录。

<a id="legacy-history-failure"></a>

### 旧会话显示"历史加载失败"

记下完整报错和会话 ID，保留数据，然后按[排障](troubleshooting.md#按症状处理)定位。OMD 能识别的旧记录会生成兼容副本，原 `session.jsonl` 保留。重启后再打开那个会话核对正文、附件和任务。加载失败不是删数据的理由，也不要手改原日志。

<a id="回退"></a>

## 回退

停掉新版，用旧版 DSH 和 OMD 打开升级前那份备份的副本，并给它单独的 `DSH_HOME`。升级后的数据留着，不要让新旧版本轮流写同一个目录。

<a id="candidate-install"></a>

## 收到本地构建的安装包

核对它对应的 DSH 版本、来源和校验值。本地包可能和公开 Release 版本号相同但内容不同；main 分支上的修复不代表已经进了正式 Release。构建方法见[开发](development.md)。
