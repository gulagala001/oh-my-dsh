# OMD 插件兼容性调查与实施计划

目标是在 OMD 全部现有功能和使用体验保持不变的前提下，使同版本原版 DSH 能使用的大部分插件，在接入整套 OMD 后仍能直接安装、启用和共存。范围包括上下文、Dream、Todo 与验证、Pro／Ultracode、CodeGraph、PTC、OpenCU、前端、宿主适配和 OMAA 联动；本轮完成后合并 OpenUI 适配，一起验收和发布。

## 源码和宿主基线

以 OMD 0.10.0 的两份完整发行源码为基线。DSH 0.2.1-alpha.1 对应官方提交 `5badb15009ae1756c3afe0ae0cef1faafc290ccc`，DSH 0.2.0-rc.2 对应 `639ed015397290b3745d163aafe02ffee4aa3f84`。每份构建使用对应 SDK、组件和依赖锁定。它们是当前验收代表；未来支持范围随实际发布和验证调整。

## 调查结论

DSH 的 bundle 是有序配置层，插件共享原生服务，并通过作用域、事件和可逆注册贡献能力。OMD 推荐安装入口已经调用原生 Plugin Manager。兼容性整改主要涉及安装之后的服务、工具和界面组合。[官方架构](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/docs/architecture.md)、[原生插件管理器](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/boot/plugin-manager/README.md)。

调查的 Subscriptions、OpenDesign、Turn Rewind、Status Rotator、dsh-market 和 OMD intent 均在 profile 根注册能力。因此，本轮以实际根服务、工具、技能和界面贡献的共存为重点。仅扩展 standard 预设的第三方插件有独立的作用域边界，不能据此推断上述插件都会失效。

| 接入点 | 当前问题或风险 | 实施方向 |
| --- | --- | --- |
| Tools | 为 PTC 的四个直接控制工具替换全局工具注册器 | 使用原生作用域工具接口保留 SDK、可见工具和执行约束，验证等价后取消全局替换 |
| Jobs 与命令执行 | 后台预览、硬期限、回执等增强仍需要宿主能力；原生没有完整非消费终态读取接口 | 保留必要的版本匹配补丁，校正原配置继承，避免删除现有能力 |
| Loader | OMD 组件替换依赖卸载顺序和完整客户端图；当前补丁还覆盖普通插件更新 | 将特殊退役与客户端图事务限制到实际涉及 OMD provider 的更新 |
| 模型请求 | 多个投影共用 helper，但仍各自包装共享方法 | 共用一次方法包装和可逆投影注册，保留顺序、冻结消息与 prepared-call 所有权 |
| 前端 | 模型选择装饰可能覆盖第三方实现，历史分页包装可能在卸载后残留 | 保留原生与第三方贡献，继续提供 OMD 模式入口，补卸载失活保护 |
| OpenCU 渲染 | 装饰用户消息和工具视图时可能丢失第三方的 store、inject 或子槽位上下文 | 在 OpenCU 源仓库修正，保留第三方渲染契约，再整体同步发行快照 |
| OMAA | 已配置但失效的 OMD 可拖住基础预设或使预设失败 | 将可选增强的可用性与基础预设分离，正常桥接保持全部现有能力 |

原生 Tools 的作用域模式、可见性和执行管线可用于减少全局替换。[固定 Tools 源码](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/core/tools/src/index.ts)。原生 Jobs 的 `readAt` 提供非消费流读取，但任意 producer 的终态结果缺少等价公开读取入口，因此完整后台能力的接入仍需保留对应补丁。[固定 Jobs 源码](https://github.com/deepseek-ai/deepseek-harness/blob/5badb15009ae1756c3afe0ae0cef1faafc290ccc/packages/jobs/jobs/src/index.ts)。

## 实施顺序

1. 固定基线，复现具体服务、渲染和卸载问题，建立独立断言。
2. 调整作用域 PTC、请求投影和宿主配置继承，收窄 Loader 事务；主模型负责核心实现。
3. 并行修正 OMD 前端与 OpenCU 渲染，调整 OMAA 可选增强边界；清理失效实现和相关文档。
4. 用两版原生宿主运行功能回归和真实插件对照，执行完整会话模拟基线、有限交错及真实 Web 操作。
5. 合并 OpenUI 交付提交，重建两版完整产物，再验证共同安装和生命周期，完成独立审查。
6. 按完整宿主前缀和 OMD 三段版本号发布，包、tag、清单和文档一致；保留原发行与可恢复路径。

## 验收目标

| 范围 | 必须保留或验证的行为 |
| --- | --- |
| OMD 全功能 | 上下文、原话附件、Dream、任务证据、后台期限、Pro／Ultracode、子代理、工作流、电脑操作、模式和全部外观入口无退化 |
| 原生与 PTC 工具 | 第三方根工具和技能在正确作用域可用；PTC 完整 SDK、直接控制、开关切换、嵌套调用、非法直接调用拒绝和取消均正常 |
| 真实插件 | 原版 DSH、OMD、OMAA 和共同安装进行对照，覆盖 Subscriptions、OpenDesign、Status Rotator、OMD intent，以及合并后的 OpenUI |
| 生命周期 | 原生安装、反向安装顺序、启停、更新、重启、卸载；旧会话、草稿、设置和其他插件保留 |
| 前端 | 第三方组件的注入、状态和子槽位不丢失；OMD 模式仍可操作；明暗主题、普通消息和电脑引用均正常 |
| 故障隔离 | OMD 未加载或增强接口缺失时，OMAA 基础预设仍可实际启动；已启用增强的正常路径保持原能力 |
| 发行 | 对应宿主 SDK、快照和锁文件一致；正式发布前核对两份产物、来源、公开附件和合并提交 |

原生宿主自身拒绝的插件版本继续遵守原生兼容检查，不能计作 OMD 共存通过。测试报告分别记录实际宿主、操作系统、执行路径和未覆盖范围；跳过、资源清理失败和预算耗尽不计通过。
