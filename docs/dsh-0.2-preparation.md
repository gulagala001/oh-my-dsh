# DSH 0.2 适配与验证

当前开发候选为 **OMD 0.2.1-alpha.2.omd.0.12.1 / DSH 0.2.1-alpha.2 / OpenCU 1.4.1**，未正式发布。官方固定来源为 `dsh-v0.2.1-alpha.2`、提交 `d743267388641bc76f17c45ce8b4c231aed1d32c`。DSH SDK、原生组件与共享 Chat 均对齐此版；rc.2 和 alpha.1 使用各自独立的 SDK、快照、锁文件及产物。

alpha.2 工作流使用公共原生 activation API，执行目录读取公共 `working_directory`，PTC 展示遵循对应宿主能力。跨版本安装、插件共存与数据恢复须分别验证，不能仅修改 peer 范围宣称支持。[当前候选说明与验证边界](release-0.2.1-alpha.2.omd.0.12.1.md) · [本地候选安装](upgrade.md#candidate-install)。

## 已发布的 alpha.1 配对

公开 Web／源码配对为 **OMD 0.2.1-alpha.1.omd.0.10.0 / DSH 0.2.1-alpha.1 / OpenCU 1.3.0**。现有 rc.2 桌面的公开配对为 **OMD 0.2.0-rc.2.omd.0.10.0 / DSH 0.2.0-rc.2**，见[桌面发行说明](release-0.2.0-rc.2.omd.0.10.0.md)。下述内容保留该公开版本的来源与验证范围。

## 固定来源

官方标签 `dsh-v0.2.1-alpha.1`，提交 `5badb15009ae1756c3afe0ae0cef1faafc290ccc`。Cordis 4.0.5-alpha.1 与 Schemastery 3.18.5-alpha.1 同步官方 SDK，避免重复模块身份。DSH SDK 和两个组件快照采用相同版本：`vendor/dsh.json` 记录原生与 Conversation，`vendor/opencu/vendor/dsh-chat.json` 记录共享 Chat。源码差异、许可及文件 SHA-256 随包保留。

保留新版的语义草稿引用、输入预填、工具准备状态、独立输入区统计和插件样式卸载行为。沿用既有 OMD 补丁与完整能力，移除失效的旧接线。公开版从公开源码基线构建，不采入本机实验架构。

## 安装闭包与验证

宿主及 SDK 固定完整官方 npm 版本，不混用 rc.2。当前验证结果及未覆盖范围见[发行说明](release-0.2.1-alpha.1.omd.0.10.0.md)。官方桌面大小与 SHA-512 仅在更新源实际提供新版元数据后更新，不用 rc.2 校验结果替代新版运行验证。
