# 在 Windows 上使用

[文档目录](README.md) · [首次使用](getting-started.md) · [升级](upgrade.md) · [排障](troubleshooting.md)

在 Windows 上，任务、上下文、记忆、Workflow 和外观都不依赖桌面控制，装好就能用。电脑操作的系统要求见[电脑与浏览器](computer-use.md)。

## 环境

| 用法 | 需要 |
| --- | --- |
| 桌面版 | 用应用里的插件页或应用自带的命令行安装。桌面版的 `desktop` profile 是单独的，网页版的命令行管不到它 |
| 网页版或源码 | Node.js 24.9.0+、Git、PowerShell 7，以及仓库 `packageManager` 指定的 pnpm（当前 11.28.5） |

当前 OMD 1.3.12 对应 DSH 0.2.2-rc.1。旧版 DSH 用对应的旧版安装包，见[安装指南](install.md)。

## 安装

- **[交给 AI 装](install.md#ai)**：复制整段指令，AI 核对你的环境后安装。
- **[自己装](install.md#gui)**：点左侧 **插件** → 右上角 **＋ 添加插件**，粘贴安装包地址，点 **安装**。桌面版和网页版都能用。

已经在用的先备份，装好后完整重启应用或网页服务。第一次用网页版和命令行安装见[命令行安装](install.md#cli)。只有遇到构建脚本未批准时才看[安装脚本被拦截](upgrade.md#build-approval)。

### 从源码试用

源码放在不含空格的路径，比如 `C:\src\oh-my-dsh`，依赖准备见[开发](development.md#源码运行)。用单独的数据目录和端口，不影响你平时用的 DSH：

```powershell
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw '安装依赖失败' }
pnpm build
if ($LASTEXITCODE -ne 0) { throw '构建失败' }
$env:DSH_HOME = Join-Path $env:LOCALAPPDATA 'oh-my-dsh-win-dev'
$env:PORT = '3090'
pnpm start
```

先确认这个目录和端口没被占用。离线环境按[离线安装](troubleshooting.md#offline)准备，别的平台的 `node_modules` 不能拿来用。

## 日常使用

- OMD 控制台在右侧栏，不需要先连接电脑操作。文件、终端、浏览器和第三方入口都还在。
- OMD-PTC 模式下，业务工具走 `run_code`，后台任务工具可以直接调用，见[运行状态](runtime-state-background.md#omd-ptc)。Shell 用 `pwsh`，相对路径跟随当前执行目录。
- 自动建的聊天文件夹不是共享项目，记忆互相隔离。见 [Dream](dream-memory.md)。
- 监控里带 `≥` 的是已知最低值，服务商没报的显示为未知。见[监控](monitoring.md)。
- 外观用系统字体回退，可以按系统偏好减少动态效果和开启高对比度。

## 连接 Chrome／Edge

打开 **设置 → 电脑与浏览器**，安装 Chrome 或 Edge 扩展，按提示第一次连接，选你想让 AI 用的那个浏览器 profile。见[电脑与浏览器](computer-use.md)。

## 操作桌面应用

OpenCU 在 Windows 上用 UI Automation 和 Win32，需要 Windows 10 1703 以上和系统自带的 .NET Framework。能不能在后台操作取决于应用对 UIA 的支持；受 UIPI 限制，不会自动提权，需要前台操作时会先问你。

多显示器不同缩放、声音、账号和云端专用功能暂不支持。Office 窗口按普通桌面应用操作，能操作哪些控件取决于应用的无障碍支持。

遇到问题请提供完整版本、系统、最短复现步骤和第一条报错（去掉隐私信息）。
