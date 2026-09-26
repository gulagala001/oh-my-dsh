# Oh My DSH 0.1.7-rc.2.13

适配 DSH 0.1.7-rc.2 Web 与官方桌面，内置 OpenCU 1.1.7。

## WSL Windows 桌面桥接

WSL 中运行的 DSH 可以通过 `computerUseNativeBinary` 调用手动指定的 Windows 桌面程序。设置界面显示实际 Windows 桌面和捕获状态，保留程序身份、协议和磁盘／连接构建检查；模型使用实际 Windows 后端的操作说明。

不需要在插件安装目录反复打补丁，不绑定固定用户名、盘符或服务名。Windows 程序需要使用配套脚本构建，再配置 WSL 可访问的路径；安装、更新和移除由用户手动管理。发行包不含预编译 Windows `.exe`。构建、配置及只读自检步骤见 [WSL 使用指南](windows.md#wsl-控制-windows-桌面)。

普通 Linux、macOS 和原生 Windows 保留各自的后端行为。浏览器和 Chrome 扩展的运行位置及安装方式不变。

## 升级

在版本面板更新，或在原生插件管理器安装 `github:gulagala001/oh-my-dsh#v0.1.7-rc.2.13`。Web 用户重启原 DSH 服务；桌面用户完整退出并重启应用与 Host，确认当前版本为 0.1.7-rc.2.13。已有 Oh My DSH 用户无需另外安装 OpenCU。

## 验证

本地 macOS 回归覆盖 OpenCU 的后端选择、程序校验、会话与窗口清理、运行时文档和 Windows 设置界面；Oh My DSH 验证发行快照、组件准备、宿主卸载重载、普通／PTC／Chrome 扩展工具接入及版本更新逻辑。详细执行结果见发行附件 `verification.log`。

WSL 检测和 Windows 程序响应使用自动测试夹具，WSL 真机的截图、输入、停止及进程清理尚未验收。只读连接自检不等于完整操控验证。远端 CI 以对应提交的 Actions 实际结论为准。
