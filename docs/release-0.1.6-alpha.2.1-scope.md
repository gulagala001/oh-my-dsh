# v0.1.6-alpha.2.1：优化、适配与故障修复范围

本版范围是前后端实现优化、DSH 0.1.6-alpha.2 适配和升级相关故障修复；不另设历史记忆专项，不改变已有功能与设计意图。测试结果必须绑定实际发行提交，不能用旧候选或单次通过覆盖后续失败。

## 前后端检查与处理

| 范围 | 本版实现与检查 | 验收依据 |
| --- | --- | --- |
| 宿主、依赖与启动 | 固定 alpha.2 依赖，使用编译后的 CLI，保留 profile 与数据目录；安装、卸载及模式切换不重写模型凭据 | dsh-install、dsh-core、dsh-http、neutral-environment-native |
| 工具调用 | 同版本工具模块出现重复 Symbol 时复用宿主调度器；不重写参数、不重复执行操作，歧义和真实执行错误仍报告 | tool-scheduler-compat、原生 DSH 工具循环 |
| 插件生命周期 | 排除已卸载和正在卸载的条目，等待移除完成；避免误报导入失败，真实失败不被隐藏 | loader-lifecycle-compat、host-lifecycle、dsh-live-plugin |
| 主界面、设置与侧栏 | 适配新会话状态及 slot，用量展开按会话隔离，修复版本弹窗及地址栏焦点时序 | frontend-ui、context-ui、version-ui、computer-use-ui |
| 请求与资源 | 普通只读面板取消迟到读取、隐藏时停止轮询；CU 同会话共享状态请求；写请求不因界面切换被取消，独立预览仍保持更新 | optimization、client-adaptation、浏览器独立视图回归 |
| 统计与归档 | 输入区使用轻量统计响应；监控不加载完整归档到活动缓存；限制解析缓存、检测外部变化，减少无变化写盘和重复序列化 | optimization、HTTP 摘要与完整统计一致性断言 |
| 长会话渲染 | 一次扫描建立各轮操作索引，保留展开后的原始工具记录；构建压缩语法与空白且保留名称 | processSummaries 对照、frontend-ui、benchmark-runtime |
| 网页操控 | 保留两种浏览器、接管、恢复、截图、坐标、批注、文件交付及会话标签组；官方浏览器仅作为独立预览 | computer-use-ui、view、geometry、annotation、downloads、tab-groups |
| 截图与输入时序 | 旧 JPEG 不能绕过合并刷新后的几何版本检查；页面变化、取消或过期输入不得套用新坐标 | browser-frame-fence、geometry、viewport-transaction、preview-navigation |
| Windows 生命周期 | 保留进程所有权验证与真实退出确认；冷启动动作预算包含既有启动预算；仅在新建空白页确认原生加载结束，然后单次导航 | cold-navigation、initial-navigation、browser-action-budget、windows-job、lifecycle |
| 原生桌面与文件 | 检查安装、升级、卸载、输入释放、剪贴板、持久附件和所有权；不替换已授权系统权限，不关闭用户无关应用 | Windows 专项、native、install、attachment、image-coordinates |
| 发行与更新 | 独立 OpenCU 和内嵌发行快照逐文件校验；保留版本编号迁移；发行包不含用户数据、凭据或 node_modules | opencu-distribution、version、实际 TGZ 安装检查、发行校验文件 |

上表列出实现与验收路径，不把平台条件下跳过的测试记作通过，也不等于所有真实模型供应商、所有网站或所有机器均已验证。发布前以对应提交的完整 CI 和 Windows 专项结果为准。

## 冷启动修复的边界

Windows 首次导航曾出现间歇性 `net::ERR_ABORTED`。单纯重复测试可能暂时通过，因此本版增加了明确的原生加载结束确认：仅在刚创建且仍为 `about:blank` 的目标上使用 `Page.stopLoading`，随后完成该空白文档的实际加载，再单次发送用户网址；用户请求本身就是空白页时也只导航一次。取消和初始化错误不会触发导航，已有网页不经过这一初始化路径；不捕获错误后重发网址。新增单元测试覆盖确认尚未返回、取消、目标已改变和原始错误保留。

此前的失败日志和对照结果是历史证据，不应删除或改称通过。该兼容防护与完整回归提供本次发行依据，不宣称已经证明 Chromium 内部所有首航失败都来自同一原因。

## 不变项与性能解释

相对升级前 alpha.10，主提示词、后台提示词、默认频率、原话附件、Todo、前置 Trace、既有审批与权限约定保持原作用；只做必要兼容和回归保护。性能微基准先比较输出相同，再比较具体代码路径的耗时；不把局部索引或归档加速表述为模型推理、准确率或整机的同倍率提升。

误删报告的版本与适用路径、官方源码打包补丁及限制见 [上游补丁说明](upstream-patches/README.md)。打包脚本防护不等于禁止具有写权限的 Agent 执行破坏性命令，也不会自动改写另行安装的全局 DSH。
