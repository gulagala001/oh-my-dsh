# DSH 0.2.0-rc.2 适配与验证

当前配对为 **OMD 0.3.0 / DSH 0.2.0-rc.2 / OpenCU 1.2.0**。DSH 0.1.7-rc.2 用户继续使用 OMD 0.2.2；历史准备快照不再作为本版发行基线。

## 固定来源

官方标签为 `dsh-v0.2.0-rc.2`，提交为 `639ed015397290b3745d163aafe02ffee4aa3f84`。SDK 和两个组件快照采用相同版本：`vendor/dsh.json` 记录原生/Conversation 组件，`vendor/opencu/vendor/dsh-chat.json` 记录共享 Chat。源码差异、许可及文件 SHA-256 均随包保留。

Chat 合并了 rc.2 的嵌套文字动画，同时保留 OMD/OpenCU 的计数、失败/中断提示和紧凑布局。原生组件按新标签重新同步，保留已有上下文、待办、工作流、权限及数据恢复设计；不顺带改动主 Agent 提示词。

## 安装闭包

官方 npm 的 web-app 精确依赖了尚未发布的 `dsh-client-ui-settings-account@0.2.0-rc.2`。根 pnpm override 指向 OpenCU 快照内、按同一标签未修改包源码构建的归档；来源和 SHA-256 见 `vendor/opencu/vendor/dsh-sdk/source.json`。它是开发/离线宿主安装补齐，不是官方 npm 发行包，不替换官方桌面的账号组件，也不降级为 rc.1。

官方桌面安装路径不依赖该开发补齐。Web 安装使用[锁定源码指南](upgrade.md)，保留原数据目录、profile 和端口。上游补发后，应同时删除补齐归档和 override、重新生成锁文件，并再次验证干净安装，避免保留失去用途的兼容残留。

## 验证范围

已完成官方固定源码的完整构建、适配后 Chat/Conversation 类型检查、OMD 构建、29 项真实宿主回归及官方 macOS rc.2 安装/重启/卸载恢复验证。最终各平台、源码宿主、独立 OpenCU 共存和发行包结果见[本版说明](release-0.3.0.md)与对应 Release 的验证记录。

Windows 桌面包的大小与 SHA-512 已从官方对应 feed 固定，实际安装/运行由独立 Windows 测试记录证明，不用下载校验替代运行验证。没有执行的模型长任务、外部桌面程序和迁移组合不列为已验收范围。
