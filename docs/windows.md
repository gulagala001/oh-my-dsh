# Windows 插件使用

Windows 上使用同一套 Oh My DSH 插件、任务、记忆和工作台。内置浏览器使用独立配置；已有 Chrome 扩展和原生桌面提供开发适配。桌面部分使用 Windows 前台输入、UI Automation 和窗口捕获，不同应用的兼容性需要在目标设备上验证。

需要 Node.js 24、pnpm 11.23.0、Git 和 PowerShell 7。首次准备 Windows Chrome 连接或安装桌面控制还需要 **.NET 10 SDK** 和可访问 NuGet 的网络；编译后的程序自带运行时，不要求每次运行都启动 SDK。

## 安装与试用

已有 **DSH 0.1.5-rc.1 Web** 时，先停止服务，在 PowerShell 7 中安装插件：

```powershell
dsh plugin --profile web add github:gulagala001/oh-my-dsh
if ($LASTEXITCODE -ne 0) { throw '插件安装失败' }
dsh web
```

打开启动时打印的登录链接，新建会话并选择 **Oh My DSH**，通过输入区的 **工作台** 和 **电脑** 使用插件。已有模型、凭据和会话沿用 DSH；自定义 profile 或 `DSH_HOME` 应保持原配置。此方式无需先下载 ZIP、手动构建或另起一套服务。

### 从源码独立试用（可选）

在 PowerShell 7 中进入完整源码目录。DSH 0.1.5-rc.1 的本地 `link:` 转发尚有路径含空格的限制，源码可放在 `C:\src\oh-my-dsh`。

```powershell
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw '安装依赖失败' }
pnpm build
if ($LASTEXITCODE -ne 0) { throw '构建失败' }
$env:DSH_HOME = Join-Path $env:LOCALAPPDATA 'oh-my-dsh-win-dev'
$env:PORT = '3090'
pnpm start
```

打开启动打印的登录链接，在 DSH 中配置自己的模型。电脑面板可独立打开内置浏览器；若没有 Chrome，在源码目录执行 `pnpm exec playwright install chromium`。

内置浏览器隐藏网页原生及 CSS 滚动条，使全页截图前后的排版保持稳定；页面和嵌套区域仍可用滚轮、键盘或滚动工具操作。

## 连接已有 Chrome

1. 打开 **电脑 → 运行环境与权限 → 准备 Chrome 连接**，等待本机程序编译与注册完成。
2. 在 Chrome 打开 `chrome://extensions`，开启开发者模式，加载面板显示的扩展目录。
3. 等待显示“已连接 Oh My DSH”，选择已有测试标签，再让助手操作。

连接注册在当前 Windows 用户下，不需要管理员启动。若该 Chrome 已连接另一个 Oh My DSH 实例，会说明冲突并保留原连接；请先在原实例移除连接。

更新后若显示“待重新加载”，回到 Chrome 扩展管理页点击重新加载。**Chrome 连接详情 → 移除 Chrome 连接** 会停止操控并移除本机注册，网页和扩展目录保留，再次使用时重新准备。

## 原生桌面控制

需要 Windows 10 2004 或更新版本，支持 x64 与 ARM64 构建。在 **电脑 → 运行环境与权限 → 安装桌面控制** 中编译并安装。助手可发现 Windows 应用目录中的已安装应用和运行窗口；`getApp` 接受发现列表中的名称／ID 或完整 `.exe` 路径，必要时启动应用，再核对真实进程与窗口。应用名或窗口不唯一时，选择具体 ID 和窗口；失效的进程／窗口引用不会自动重开应用。

单屏 125%、150%、200% 显示缩放按物理像素统一处理截图、控件位置与鼠标输入；缩放改变后旧截图坐标失效，需要重新观察。

Windows 使用前台操控；保持桌面解锁，鼠标或键盘介入会停止助手。点击悬浮卡片只放大查看，不暂停任务或激活应用。停止操作后，独立预览仍可继续观察；关闭预览不会关闭应用。

运行时提供控件读取、窗口截图、键盘输入、点击、拖拽、文本赋值／选择和粘贴。滚动依赖控件的 UI Automation 滚动模式；应用不提供相应模式时会说明限制。Windows 快捷键使用 Ctrl／Alt／Shift／Win；`super` 对应 Win，不能当成 Mac 的 Command。

出现更新提示时点击 **更新桌面控制**；安装损坏时可点击 **修复桌面控制**。更新先校验新程序，切换失败时保留旧安装；之后重新选择应用。

在 **桌面控制版本 → 移除桌面控制** 中卸载运行时。移除会停止原生操控与预览，保留应用窗口、用户文件和浏览器连接；之后可以重新安装。程序损坏时会用 .NET 10 SDK 重建独立卸载程序；若停止或文件删除尚未确认，会保留相应安装信息供重试。额外文件和无法确认归属的目录会保留。

停止操控不会关闭启动的应用。锁屏、提升权限窗口和应用兼容性不能据基础自检结果推定可用。

## 在本机运行自检

Computer Use 的 Windows 构建、自检与原生测试随实现迁入 [OpenCU](https://github.com/gulagala001/opencu)。完整步骤见 [OpenCU Windows 指南](https://github.com/gulagala001/opencu/blob/main/docs/windows.md#在本机运行自检)。Oh My DSH 安装时自动包含运行所需的 OpenCU，无需另装一套插件。
