# OpenCU 1.1.7

适配 DSH 0.1.7-rc.2 Web 与官方桌面版。

## WSL Windows 桌面桥接

- WSL 明确配置 `computerUseNativeBinary` 后，使用 Windows 原生桌面后端；路径不绑定特定用户或盘符。
- 检查外部程序身份、协议、构建标识及磁盘／连接一致性；普通 Linux、macOS 和原生 Windows 保持各自的后端选择与版本校验。
- 运行环境显示 Windows 桌面和捕获状态；外部程序由用户手动管理，不提供无法执行的安装、修复或移除按钮。
- 首次加载、回读及重置后的应用操作说明均按实际桌面后端选择，保留 Windows 前台操作、快捷键与权限边界。
- 提供只读自检脚本 `scripts/check-wsl-desktop.mjs`，验证连接、桌面与捕获状态及应用枚举。

配置与构建步骤见 [Windows 指南](windows.md#wsl-控制-windows-桌面)。需要先构建 Windows 桌面程序并配置 WSL 可访问的路径；发行包不含预编译 `.exe`。本次桥接不改变浏览器与 Chrome 扩展的运行位置和安装方式。

## 升级

安装 `github:gulagala001/opencu#v1.1.7` 后完整重启 DSH。使用 Oh My DSH 的用户更新到 0.1.7-rc.2.13 即可，无需重复安装 OpenCU。外部桌面程序更新时应先停止操控与 DSH 服务，再替换并重启。

## 验证范围

本地 macOS 回归覆盖 WSL／非 WSL 后端选择、外部程序身份与协议拒绝、旧连接检测、只读会话、管理器与持久执行运行时、窗口分享清理，以及真实浏览器中的 Windows 设置界面。发行附件 `verification.log` 保留本次版本的执行结果。

WSL 检测与 Windows 程序响应在这些自动回归中使用夹具；WSL 真机截图、输入、停止及 Windows 进程清理尚未验收。Windows 专项和全量 CI 可在对应提交的 Actions 查看，不能将已触发等同于通过。
