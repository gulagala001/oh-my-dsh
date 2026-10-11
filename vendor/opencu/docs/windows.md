# Windows 上使用 OpenCU

[简体中文](windows.md) · [English](windows_EN.md) · [首页](../README.md) · [使用指南](usage.md) · [开发](development.md)

公开 **1.3.0**实现 Windows 浏览器、Chrome 连接与原生桌面。桌面用前台输入、UI Automation和捕获，旧版有单屏 125%、150%、200% 验证。**本轮未发布 1.6.1 新实现未做 Windows 实机验收**，历史结果不代替本轮测试。

## 条件与安装

Node.js ≥22.19、pnpm 11.23.0、Git、PowerShell 7。首次准备 1.3.0 Chrome 连接／桌面需 **.NET 10 SDK**和 NuGet 网络，生成程序自包含。桌面需 Windows 10 2004+、x64／ARM64对应构建、解锁的交互桌面。

结束任务并停服务，按宿主安装。alpha.1：

```powershell
npx --yes @deepseek-ai/dsh@0.2.1-alpha.1 plugin --profile web add github:gulagala001/opencu#v1.3.0
if ($LASTEXITCODE -ne 0) { throw 'OpenCU installation failed' }
npx --yes @deepseek-ai/dsh@0.2.1-alpha.1 --profile web
```

rc.2：

```powershell
npx --yes @deepseek-ai/dsh@0.2.0-rc.2 plugin --profile web add github:gulagala001/opencu#v1.3.0-dsh.0.2.0-rc.2
if ($LASTEXITCODE -ne 0) { throw 'OpenCU installation failed' }
npx --yes @deepseek-ai/dsh@0.2.0-rc.2 --profile web
```

打开打印的登录链接，在 **电脑 → 运行环境与权限**检查；沿用模型、会话、profile和 `DSH_HOME`。桌面应用用自己的管理入口／CLI，不用其他 Web CLI 管理 `desktop` profile。[下载与校验](../README.md#安装)。公开 1.3.0 没有本地 1.6.1 的预编译 Electron 与新设置。

## 浏览器与已有 Chrome

内置浏览器用本机 Chrome／Chromium独立配置，不自动继承登录。没有可用浏览器可在插件目录执行 `pnpm exec playwright install chromium`，或指定路径。

1. **运行环境与权限 → 准备 Chrome 连接**，等待编译与用户注册。
2. 在 `chrome://extensions`启用开发者模式，加载面板显示的目录。
3. 连接成功后用 `@Chrome`或标签引用选择原标签。

无须管理员启动。另一个实例连接时保留原连接并提示冲突，先在原实例移除。更新后重新加载扩展。**移除 Chrome 连接**删本机注册但保留网页／目录，Chrome 中可自行删扩展；停止不退出 Chrome。

## 原生桌面

**运行环境与权限 → 安装桌面控制**在 1.3.0 本机编译。按发现的真实名称、ID或完整 `.exe`路径选应用，不唯一时选具体窗口，失效引用不自动重开。

需前台交互，鼠标／键盘介入会停止助手；确认后接手，完成再恢复。锁屏、提升权限窗口不属普通控制。缩放变化后重新观察，不复用旧坐标；多屏混合缩放不在范围。

支持控件、截图、键盘、点击、拖拽、赋值／选择和粘贴；滚动依赖应用的 UI Automation模式。Ctrl／Alt／Shift／Win为 Windows 快捷键，`super`是 Win。Markdown／HTML效果由应用决定，错误后先看是否已插入。

预览点击只查看，不激活应用；停止后仍可看，关预览不关应用，停止不退出启动的应用。基础检查通过不代表其他应用、锁屏或架构全部兼容。

## 更新与卸载

先停服务，重用固定安装命令，重启原 profile。运行时按提示更新／修复，之后重选应用；切换失败保留旧安装。

**桌面控制版本 → 移除桌面控制**停止并移除，保留窗口、文件和 Chrome连接。损坏时可能需 SDK重建卸载程序；停止／删除未确认保留信息重试，不删不明归属文件。

插件卸载用同版 CLI：

```powershell
npx --yes @deepseek-ai/dsh@0.2.1-alpha.1 plugin --profile web remove opencu
```

保留会话和数据，共享使用者需要时保留运行时。[完整说明](usage.md#更新与卸载)。

## WSL 控制 Windows 桌面

WSL中 DSH可手动指定 `OhMyDsh.Desktop.exe`。仅 Microsoft内核标识且设置 `computerUseNativeBinary`时启用，普通 Linux不获得桌面。

Windows中用**配套源码**构建：

```powershell
$env:TRISOUL_CU_WINDOWS_NATIVE_OUTPUT = 'C:\DSH-WinDesktop'
node scripts/build-computer-use-windows-native.mjs
if ($LASTEXITCODE -ne 0) { throw 'Desktop build failed' }
```

默认架构跟随 Node.js，`TRISOUL_CU_WINDOWS_ARCH`可设 `x64`／`arm64`。用项目脚本保留身份，不使用标记 `development`的程序。WSL的 `opencu`配置写实际路径并重启：

```yaml
computerUseNativeBinary: /mnt/c/DSH-WinDesktop/OhMyDsh.Desktop.exe
```

源码目录只读检查：

```sh
node scripts/check-wsl-desktop.mjs /mnt/c/DSH-WinDesktop/OhMyDsh.Desktop.exe
```

检查身份、内部连接、交互桌面和捕获，不点击／输入／启动应用，不能代替完整 WSL真机验收。Windows需解锁并允许启动程序。

外部程序手动管理，无面板安装／更新／移除。更新先停止操作与服务，替换配套程序再重启。桥接不改变浏览器／扩展位置。

## 源码与诊断

按[开发指南](development.md)取固定 tag，路径建议不含空格如 `C:\src\opencu`：

```powershell
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
pnpm build
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
$env:DSH_HOME = Join-Path $env:LOCALAPPDATA 'opencu-win-dev'
$env:PORT = '3090'
pnpm start
```

开发者 Windows专项：

```powershell
pnpm exec playwright install chromium
if ($LASTEXITCODE -ne 0) { throw 'Test browser installation failed' }
node scripts/test-windows.mjs
```

独立数据、合成页面与自有窗口，可能操作桌面，保持解锁且避免并行输入。不用真实账号／个人浏览器。`report.json`与日志区分通过、失败、跳过和未执行；跳过不算通过。[测试说明](development.md#测试与验收)。日常用户可直接反馈版本与错误，无需承担工程验收。
