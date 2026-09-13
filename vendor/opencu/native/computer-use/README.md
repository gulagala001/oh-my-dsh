# Native Computer Use 开发运行时

目前在 macOS 14.8.7 / Apple Silicon 上实测。使用条件与当前限制见 [使用指南](../../docs/usage.md#平台与运行条件)。

```sh
node scripts/build-computer-use-native.mjs
```

产物是 `dist/Oh My DSH Computer Use.app`。新安装使用新名称；检测到旧版 `Trisoul Computer Use.app` 时原位更新，保留原 bundle ID、签名身份与权限。安装到 `~/Applications`，开启该应用的辅助功能和屏幕录制权限。也可在 Computer Use 面板的「运行环境与权限」点击「安装桌面控制」：本机编译和签名完成后，原子放入安装目录；重复点击不会覆盖已有应用。此开发安装方式需要 Apple Command Line Tools。更新正在使用的运行时前，应先结束控制会话并退出该应用，随后替换程序并重开。

开发构建自动使用持久本地签名，身份保存于 `~/Library/Application Support/trisoul-x/development-signing` 的专用 keychain。签名时暂时加入 keychain 搜索列表，完成后移除并锁定；不修改 login keychain 内容或系统证书信任。此目录属于本机私有开发材料，不应提交或分发。

发行构建可通过 `TRISOUL_CU_SIGN_IDENTITY` 指定 Developer ID 身份，启用 hardened runtime 和时间戳。当前尚未完成公证、发行安装包和更新器，开发签名不代表已通过这些流程。[Apple 的签名身份说明](https://developer.apple.com/library/archive/technotes/tn2206/_index.html)。

服务通过当前用户独占的 Unix socket 通信。`serve --socket PATH` 启动，`mcp --socket PATH` 提供 JSON 行协议，`stop --socket PATH` 等待停止后退出。普通应用启动使用默认 socket；`--setup`、重新打开应用或 `show_setup` 调用打开权限窗口。原生窗口与网页面板均自动刷新授权状态，只有用户点击系统设置按钮才请求授权。

在已授权的 macOS 上执行真实原生测试：

```sh
TRISOUL_CU_NATIVE_SOCKET=/path/to/runtime.sock node --test test/computer-use-native.test.mjs
```

测试创建独立 AppKit 应用并检查其实际事件与结果；默认测试运行不会操作用户应用。原生后台键盘、窗口焦点和富文本仍须逐应用验证，不能仅凭事件回执认定操作有效。
