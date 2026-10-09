# OMD 插件兼容性调查与实施计划

目标是在 OMD 全部现有功能和使用体验保持不变的前提下，使同版本原版 DSH 能使用的大部分插件，在接入整套 OMD 后仍能直接安装、启用和共存。范围包括上下文、Dream、Todo 与验证、Pro／Ultracode、CodeGraph、PTC、OpenCU、前端、宿主适配和 OMAA 联动；本轮合并 OpenUI 适配并一起验收。根据用户 2026-10-09 的最新指令，完成后暂不发布，保留提交、产物与证据，等待隔壁大工程统一整合。

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
6. 按完整宿主前缀和 OMD 三段版本号准备交付，源码、产物与清单一致；暂不创建发行或部署，发布需等待用户重新授权。

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

## 本轮交付状态（暂不发布）

核心实现及 OpenUI 分支已合并到两份兼容性工作分支，未合入主分支或创建本轮 tag／Release。alpha 的 OpenUI 合并提交为 `b88b986`，rc.2 为 `537a36f`。原生 Tools 保持官方实现；必要 Jobs、命令执行及工作流增强保留，Loader 特殊事务限制到实际 OMD provider。共享模型投影收敛到一次可逆包装，工具取消保留原生上下文与错误边界；宿主配置继承按原生模块名处理。OpenCU 整体更新对应独立来源，OMD／OMAA 装饰保留原组件声明、状态和历史装饰元数据，消除共装后的重复注册循环。

| 验证范围 | 实际结果与证据边界 |
| --- | --- |
| 完整 OMD CI | alpha 提交 `3d5de286dada669c0eabd69077798e77cd600e0a` 的 [CI](https://github.com/gulagala001/oh-my-dsh/actions/runs/37911225935)，rc.2 提交 `01736a37ee2d75df9d5ebe149be97825d4569bd2` 的 [CI](https://github.com/gulagala001/oh-my-dsh/actions/runs/37911614592) 均全部成功。包含 Linux 两版 Node、Windows 四分片，以及 macOS 原生会话八基线、有限交错和实际 Web；不由此推断 Windows 桌面硬件流程已测 |
| 第三方原生插件 | 六个固定版本的原版对照和两宿主×两安装顺序完成；同宿主的原生安装结果一致，实际根工具／技能、界面贡献、启停、重启和卸载验证通过。alpha 原版拒绝 Turn Rewind 的该版本，OMD 同样拒绝，不能计为成功安装或绕过；rc.2 接受。完整矩阵绑定较早冻结包，最新候选的后续修复另有针对性真实宿主回归 |
| OMAA 正常生命周期 | 两宿主的最终 v6 OMAA 与 candidate-v2 OMD 实际验证五个保存会话、原生／增强 workflow、同一 Run ID 恢复且不重复子执行、原生卸载及冷重启。故障隔离场景和独立对抗审查另记录对应包与 SDK |
| OpenUI／IUI 共装 | 同一最终 OMD／OMAA 与隔壁冻结 IUI 在两宿主实际共同安装；五产品主题、设置、模式正常，原生技能加载、交互表单、保存刷新与作品展开通过，主模型查看实拍。IUI 尚未发布，推荐入口的未发布保护继续保留 |
| 开发约束 | 本地工作约定及公开 CONTRIBUTING 均明确原生生态兼容、全功能保留、两种加载顺序与生命周期验证、可选增强故障隔离；本地约定文件不提交或打包 |

冻结的 OMD candidate-v2 分别为 `0.2.1-alpha.1.omd.0.11.0`（SHA256 `aaee18f26789dd695568051eb60f6a0e2f72de06845f8d1c7797f5256bf734a0`）与 `0.2.0-rc.2.omd.0.11.0`（SHA256 `1c4188fca4b05e87b8b4c5e8e362845f917da9aaf7649991dc942ce77f66d073`），绑定上述代码提交；后续文档提交不能冒充同一 tarball 的来源。

本轮真实插件业务测试使用本地脚本 provider；付费账号／OAuth 全业务、全部第三方版本、Desktop ASAR、Computer Use 硬件动作及未测平台不在该结果内。CodeGraph 实际建索引使用校验过的完整官方运行包作为缓存前提，不能据此声称 registry 可选依赖下载已成功。所有失败、跳过和旧候选结果保留各自范围，不合并计算通过率。
