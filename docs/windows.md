# Windows 插件使用

[文档目录](README.md) · [首次使用](getting-started.md) · [安装与升级](upgrade.md) · [排障](troubleshooting.md)

Windows 上的任务、上下文、记忆、工作流与主题不以原生桌面控制为前提。当前源码为 **`0.2.1-rc.2.omd.0.17.3` / DSH `0.2.1-rc.2`**；安装与宿主适配见[版本配对](install.md)。原生桌面能力与系统权限条件见[OpenCU 使用指南](computer-use.md)。

## 环境与版本

| 使用方式 | 环境要求与边界 |
| --- | --- |
| 官方桌面 | 使用应用内插件页或桌面自带 CLI，按实际完整宿主版本配对；`desktop` 是独立保留 profile，普通 Web CLI 不能代替它。 |
| Web／源码 | Node.js ≥22.19（建议 24）、Git、PowerShell 7，以及该 checkout 的 `packageManager` 指定版本。当前候选是 pnpm 11.28.5；公开 0.10 文档使用 11.23.0。 |
| 当前 0.2.1-rc.2 源码 | SDK、组件、依赖和锁文件必须匹配 DSH `0.2.1-rc.2`。其他宿主使用各自独立构建；Windows 系统依赖和权限需在实际设备上准备。 |

公开固定配对仍是 **DSH `0.2.1-alpha.1` / OMD `0.2.1-alpha.1.omd.0.10.0`**，或[固定 rc.2 桌面配对](upgrade.md#desktop)。这些例子只对应已存在的公开资产，不包含本地恢复的新行为，不暗示当前所有官方桌面更新源仍为 rc.2。

## 安装与试用

以下只演示公开 **alpha.1 Web**。已有环境先结束任务、停止服务并备份实际 `DSH_HOME`，沿用原 profile 和端口；首次可用 `web`。在 PowerShell 7 中运行：

```powershell
npx --yes @deepseek-ai/dsh@0.2.1-alpha.1 plugin --profile web add https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-alpha.1.omd.0.10.0/trisoul_x-0.2.1-alpha.1.omd.0.10.0.tgz
if ($LASTEXITCODE -ne 0) { throw '插件安装失败；保留原生错误，不绕过门禁' }
npx --yes @deepseek-ai/dsh@0.2.1-alpha.1 --profile web
```

打开启动时打印的登录链接，新建会话选择 **Oh My DSH**。已有模型、凭据和会话沿用 DSH；检查当前版本、原模型、旧会话／附件、外观和一次无副作用工具调用。公开安装无需克隆、手动构建或另起服务；有实际脚本批准错误再看[对应排障](upgrade.md#build-approval)，不使用 version exemption。

### 从源码独立试用（可选）

源码使用完整 checkout，本地 `link:` 建议使用不含空格的路径，例如 `C:\src\oh-my-dsh`。按[精简开发入口](development.md#源码运行)准备该 checkout 的匹配依赖／锁文件。以下命令要求已有匹配宿主的完整源码与锁文件。缺少匹配锁时不能直接执行 frozen 安装：

```powershell
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw '安装依赖失败' }
pnpm build
if ($LASTEXITCODE -ne 0) { throw '构建失败' }
$env:DSH_HOME = Join-Path $env:LOCALAPPDATA 'oh-my-dsh-win-dev'
$env:PORT = '3090'
pnpm start
```

先确认隔离目录／端口未被使用，保持原工作宿主不动。离线环境按[离线搬运](troubleshooting.md#offline)准备同系统、同架构的完整输出；复制别的平台 `node_modules` 不等于 Windows 安装。

## 日常非 CU 操作

- OMD 控制台使用一个原生内容标签（概览、上下文、记忆、调用日志、后台日志），保留文件、终端、原生浏览器及第三方入口；不需要先连接电脑控制。
- OMD-PTC 保留原生 Tools、SDK、权限与取消。业务经 `run_code`，匹配作用域中的四个后台直调控制见[运行状态](runtime-state-background.md#omd-ptc)。Windows Shell 使用 `pwsh`／`tools.pwsh`，相对路径跟随当前执行目录。
- 自动 Chat 保存目录不是共享项目；私人 Chat 及其未加入真实工作区的后代保持隔离。[Dream](dream-memory.md)
- 监控的部分用量是 `≥` 下界，缺失回执为未知，不按零；硬件占用是宿主进程采样，不是任务进度。[监控](monitoring.md)
- 皮肤使用本机字体回退；可按系统偏好开启减少动态效果与高对比度。

## 连接已有 Chrome

新版 OpenCU 内置于 OMD。打开“设置 → 电脑与浏览器”，安装 Chrome／Edge 扩展并按提示首次配对；使用你选择的浏览器 profile。详见[电脑与浏览器](computer-use.md)。

## 原生桌面控制

新版 OpenCU 使用 Windows UI Automation／Win32，需要 Windows 10 1703+ 和系统 .NET Framework。后台操作取决于应用的 UIA 支持，受 UIPI 限制，不自动提权；需要前台输入时先经用户同意。

多屏混合缩放、声音及账号／云端专用集成不在当前范围。普通 Office 窗口按原生应用路径操作，具体控件取决于应用的无障碍支持。

## WSL 控制 Windows 桌面

保留历史按需入口：[固定 0.10 WSL 桥接指南](https://github.com/gulagala001/oh-my-dsh/blob/v0.2.1-alpha.1.omd.0.10.0/docs/windows.md#wsl-控制-windows-桌面)。桥接所用外部程序应与实际旧包配套，不从后续 OpenCU 浮动 `main` 获取程序冒充冻结输入，不修改当前 `vendor/opencu/`。它只接通桌面后端；只读自检不能代替真实截图、输入、停止与进程清理。

## 在本机运行自检

源码构建与本地运行入口见[开发文档](development.md#按需测试)。遇到问题请提供完整版本、系统、最小复现步骤与脱敏后的第一处错误。
