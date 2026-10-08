# OMD 0.9.0：宿主兼容、OMAA 共存与浏览器消歧

分别发布 DSH 0.2.0-rc.2 与 0.2.1-alpha.1 的完整构建；每包使用对应官方 SDK、Conversation、Chat 组件与锁文件。关键版本是当前验收代表，支持范围随官方接口与用户环境调整。当前未开展 0.1.7 回移。

- 集成 OMAA 增强桥接及外观协调，保留 0.7.0 的上下文、Dream、Fast、原生迁移与工作流恢复。OMAA 使用其配对更新源。
- 发布并固定核验 Intent 0.3.0 与 Subscriptions 0.9.8-omd.1 的兼容包；保留原作者与许可证，非上游官方发行。Jevify 不再推荐。
- 内置 OpenCU 1.3.0，重复角色与名称的可操作元素可显示不同区域标签；标签安全引用、有界并计入观察预算，包含 iframe。
- 修复会话来源 ID、Fast 迟到保存及整包 OpenCU 同步的回滚和 Windows npm 调用。

安装与升级按 [升级指南](upgrade.md) 使用对应宿主的固定 tag。新版 alpha 官方桌面包尚未核验，rc.2 桌面继续使用 rc.2 构建。Windows/macOS 系统授权和真实账户操作不由浏览器与隔离 Web 测试代替；Subscriptions 的真实账号 Fast、提供方额度及真实模型效果未作同等验收。
