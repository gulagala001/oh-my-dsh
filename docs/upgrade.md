# 升级、迁移与回退

[English](upgrade_EN.md) · [安装](install.md) · [备份](#2-停止并完整备份) · [Web 转桌面](#web-to-desktop) · [排障](troubleshooting.md)

**首次安装直接用 [AI 指令](install.md#ai) 或 [“添加插件”步骤](install.md#gui)。** 本页供已有用户升级、换运行方式或恢复数据时使用。升级 OMD 不等于升级 DSH，也不会自动安装桌面宿主适配。

<a id="目标版本与完成标准"></a>

## 1. 识别真实运行环境

核对正在使用的 DSH 完整版本、桌面／Web、数据目录（DSH_HOME）和 profile。桌面使用 desktop；Web 沿用原启动命令中的 profile。终端 PATH 上的另一份 dsh 可能不是你正在用的实例。

OMD 0.100.0 已正式发布。DSH **0.2.1-rc.2** 对应 OMD **0.99.3**，DSH **0.2.1-rc.1** 对应 OMD **0.99.3**，从[下载页](releases.md)选择完整匹配的一行。0.2.0-rc.2 是另一个版本。较新或定制环境没有匹配升级时，保留现状，不为装插件降级宿主。

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

<a id="desktop"></a>
<a id="desktop-cli"></a>

## 3. 按原安装方式升级

备份完成后，重新打开桌面应用或原 Web 服务，在 **插件 → ＋ 添加插件** 中粘贴[安装页](install.md#gui)提供的匹配包地址。需要更换同一插件的安装来源时也使用此入口。若你的 DSH 版本明确提示第三方插件须先卸载再安装，备份后按该版本提示处理，不删除插件的用户数据。

也可把 [AI 安装／升级指令](install.md#ai)交给 AI，或在停止服务后使用[补充 CLI 步骤](install.md#cli)。继续使用原 profile、数据目录和 Web 端口。安装完成后完整重启此次更新的应用／服务。

OMD 版本面板更新的是当前 profile 中的插件，不是 DSH 本体；远端“最新版本”也不等于本机已安装版本。

<a id="package-name"></a>

### 早期版本升级到 `oh-my-dsh` 包名

当前插件包名为 `oh-my-dsh`。早期版本使用另一个包名，插件页会把两者显示为两个插件：

1. 备份后直接安装新包，不必先卸载旧版。
2. 新版启动时发现旧版仍在运行，会停用旧版（数据保留）并提示重启；完整重启后即可在“插件”页面移除旧版 Oh My DSH。仍看到提示时，先在“插件”页面手动停用旧版，再完整重启。
3. 重启后自动迁移：数据目录改为 `DSH_HOME/oh-my-dsh`，原位置保留指向它的兼容链接；profile 中的 OMD 设置、默认预设和设置导入记录同步更新；旧会话继续按 Oh My DSH 打开，任务、档案和记录照常显示。
4. 你自建的模型渠道名称和密钥变量名属于个人配置，不会被改动。

需要回到早期版本时，按[回退](#回退)使用升级前的完整备份，不让新旧版本交替写同一数据目录。

### 独立插件与数据迁移

0.99.3 已组合 Workflow、Rewind、Persona、Extensions、Workbench 等插件能力。已有 OMD 用户按整包升级，不必再重复安装同一功能；另装的独立产品继续由 DSH 插件页管理。独立包按自身完整宿主版本选择，不把 OMD 的兼容范围套到所有插件。

人格首次接入迁移已有全局与会话选择，冲突预设保留内容；以后数据按 profile 存在 `DSH_HOME/dsh-persona-plugin/`。完整备份还应包含撤回备份、Workflow 预算与项目脚本、网页导入和外观本地数据。会话导出与原文档案分别保留，先恢复会话再导入对应原文。[完整数据清单](architecture.md#数据由对应功能保留)

## 4. 处理必要的版本差异

更换 DSH 时，为其他必要插件及桌面宿主适配一并准备匹配版本。保留模型渠道、权限设置、数据和第三方插件，按对应 DSH 发行说明处理迁移，不通过修改包版本号强行混装。

继续使用旧宿主时，沿用[旧版固定发行与文档](releases.md#旧版用户--older-hosts)。

## 5. 少量检查并交付

确认当前安装版本、OMD 已启用、新会话可选择 Oh My DSH，以及原模型、会话／附件、外观和第三方插件仍在。发现缺失时先核对数据目录和 profile，不先删除或重建数据。

<a id="build-approval"></a>

### 安装脚本被拦截，插件页没有批准入口

仅在安装报 `ERR_PNPM_IGNORED_BUILDS` 或明确提示构建脚本未批准时使用，不能据空的待批准列表推断脚本已运行，也不假定所有 OMD 包都有安装脚本。

先结束任务、完整退出并备份。使用原宿主 CLI、实际 `DSH_HOME` 和同一 profile；桌面必须用应用自带 CLI。下例重试刚被拦截的同一已核验本地 `.tgz`。若原安装用 URL、现在改为本地 `file:`，先尝试本地包；仍被拦截时复制这次的依赖键，不复用 URL 的旧键：

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop ignored-builds
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop approve-builds '<从上一条输出复制的完整依赖键>'
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add 'file:/absolute/path/to/verified-package.tgz'
```

替换两处占位内容，只选择核对过来源、完整宿主版本与 SHA-256 的目标包；完整键可能含 `@file:`，不能只凭包名猜键。批准会执行目标包的安装脚本，请只批准已确认来源的包；确认退出码 0 与脚本完成，再逐包重试同一归档，保留已有允许／拒绝规则。Web 用原服务配套 CLI 与原 profile；Windows 用其实际桌面入口。

若 `ignored-builds` 没列出目标包，保留错误并核对 profile 和归档，不用 `--all`、`ignoreScripts`、空白 profile 或 version exemption 绕过。安装退出码 0 后完整重启并检查首次实际操作；原生拒绝如实记录。

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

## 回退

停止新版，用原宿主／插件打开升级前完整备份的副本，并使用独立 DSH_HOME。保留升级后的数据，不让新旧版本交替写同一目录。

<a id="candidate-install"></a>

## 收到本地构建包时

核对完整宿主版本、来源和归档校验值。本地包与公开 Release 可能版本标签相同、内容不同；按该包的说明使用，不把 main 上的修复视为已经进入固定 Release。见[发行范围](releases.md)及[开发文档](development.md)。
