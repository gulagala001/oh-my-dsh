# Computer Use：Codex 与 Vibex 对照及实现取舍

日期：2026-09-10。用途：实现前评估；尚未开始开发 Computer Use 插件。

**范围补正：本文是代码取舍评估，不是完整产品对标规格。用户要求先排除遗漏，当前产品实现暂停，完整性核查与未解项见 [对标基线](/Users/mac/Projects/trisoul_x/COMPUTER_USE_BASELINE.md)。**

**结论：Computer Use 插件整体新写，接入 trisoulx；默认不搬 Vibex 产品代码。**

Codex 的实际能力与使用体验是对标目标。Vibex 提供经过踩坑的配方、部分算法和测试场景，但它的寻址、输入、状态与取消机制不能直接承载这个目标。给旧模块套一层兼容接口，会把后续工作变成长期修补。用户在评估过程中明确强调不能为省事保留旧模块，并倾向整体重新实现；据此，建议把旧资产作为经验与验收场景来源，插件实现自主新写。新写仍需使用适合的宿主能力和成熟基础库，不等于重造所有通用依赖。

**后续范围扩展（2026-09-10）：用户要求不限于 Vibex 寻找更优基础。当前推荐调整为“trisoulx 产品与会话／观察契约自主实现，系统执行基础先对照开源候选实测后决定嵌入或派生”。不预先锁死原生驱动必须从零写。** 外部候选不是已批准依赖，也尚未安装或实测；详情见下节。

## 不限于 Vibex 的候选路线

| 部分／候选 | 当前判断 | 已核实依据及限制 |
| --- | --- | --- |
| **Cua Driver（优先验证）** | 更接近 Codex 背景操控目标的原生基础；评估固定版本后嵌入／维护小范围派生 | 当前 Rust workspace `0.26.1`，MIT，含 Mac／Windows／Linux 平台实现、快照元素句柄、MCP／CLI／原生 SDK。官方安装要求 Mac 14+，与本机 14.8.7 对应；支持矩阵明确包含拒绝与未证明项目，不能把总测试通过数当全部动作已成功 |
| **Peekaboo（对照候选）** | 重点核对元素缓存、后台派发、失效拒绝、剪贴板和可见反馈；不预置第二套生产后端 | MIT；文档明确区分“事件派发”与“效果验证”。发布版说明要求 Mac 15+，基础库 Package.swift 声明 Mac 14，须区分产品与库的实际构建／运行兼容性；不能要求用户先升级系统来迁就选型 |
| **Playwright（浏览器基础）** | 优先用于定位、表单、导航、可操作性等待与自动化测试；插件自己的目标／观察／会话契约仍需实现 | 官方动作等待检查可见、稳定、接收事件、启用状态。`connectOverCDP` 被官方说明为低于原生 Playwright 连接的保真度；外置已有 profile 接管和内置浏览器 UI 不能被一个 CDP 连接代替 |
| MacosUseSDK／Terminator | 附加参考，当前不优先 | MacosUseSDK 为 MIT、Mac 12+ 的 Swift 底层库；Terminator 当前官方 README 明确 Windows-only。不能把两者混成已成熟跨平台引擎，也没有证据证明更适合当前完整目标 |
| browser-use / VM 框架 | 按用途使用，不整体引入第二套 agent | trisoulx 已有主模型循环；可借鉴浏览器环境／测试设施。VM 适合可重复验收，不等于控制用户正在使用的真实桌面 |

当前证据指向的实现组合：**自主插件界面与运行时 + 经过实测选定的原生 driver + 浏览器自动化基础 + 我们自己的同任务验收**。优先减少系统底层重复研究，保留对目标绑定、取消、用户接管、状态进入模型及最终体验的控制。

已核读 Cua Driver 的 `background_mutation.rs`：按精确 pid 序列化动作，范围覆盖目标验证、派发与恢复。其 `focus_guard.rs` 同时明确记录 Rust 移植的部分焦点抑制层未移植；当前支持矩阵也将 macOS Electron 后台滚动及像素拖拽标为 `background_unavailable`。这些是需要我们对照 Codex 补齐或选择其他实现的具体差距。它不是现成的完整 Codex 替身。

Cua Driver 的背景路线涉及私有 macOS SkyLight 接口，操作系统升级兼容性须进入验收。嵌入 SDK 也不自动带齐体验：直接 Mac 运行时在没有 AppKit 主线程适配时不提供 agent 光标叠加；退出清理不等同于立即取消在途动作。**因此选型先跑背景输入／拖拽／介入／恢复测试，不先安装后宣布采用。**

本轮读取的源码版本：Cua `b4e3caecd709311d613dde29ddac03e29468bb38`；Peekaboo `6cd38c0d319ab8db52b05d22409072efc4a20021`；MacosUseSDK `a2d7866355bca07faf476c5d180c8664b1992f8c`。它们与发布二进制及其依赖的对应关系仍需在原型阶段核验。

来源：[Cua Driver 接入说明](https://github.com/trycua/cua/tree/main/libs/cua-driver)、[实际动作支持矩阵](https://github.com/trycua/cua/blob/main/libs/cua-driver/docs/action-support.md)、[Cua 安装要求](https://cua.ai/docs/how-to-guides/driver/install)、[进程内 SDK 条件](https://github.com/trycua/cua/blob/main/docs/content/docs/how-to-guides/driver/use-sdk-in-process.mdx)、[Peekaboo](https://github.com/openclaw/Peekaboo)、[Playwright 动作等待](https://playwright.dev/docs/actionability)、[Playwright CDP 限制](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp)。

## 评估依据与边界

- Vibex：`4b44e534ae2878d1b81e0fbaf9dabc373632efe7`，核对桌面、浏览器、录像、授权、互斥及相关调用链。已有未提交改动仅在设计演示 HTML，本次未改 Vibex。
- trisoulx：`034b3788576c0ef56f0e6aae39e3c5f323abc4c7`，DSH `0.1.5-rc.1`；核对插件工具、图片结果、取消信号、输入引用与界面扩展。
- Codex：本机 `unified-computer-use 26.903.61454`、启动器指定的应用随附 `@oai/browser-desktop` 运行时，以及 `computer-use 1.0.1000968` 的接口说明。**当前统一接口为准，旧版 Sky 说明只作补充。** Browser 插件缓存与应用随附服务文件哈希不同，浏览器实现引用统一指向本次检查的应用随附文件，不能混用行号。
- Codex 可读材料包括插件启动器、JS 适配层、接口声明和浏览器服务；Mac 原生执行服务以已编译应用交付，其内部算法不能从这些材料完整确认。不会把浏览器侧的实现细节直接推定为桌面侧实现。
- 本机统一 `getApp` 实现明确检查 Mac 目标；`Target` 表格描述本机 Mac／浏览器能力，不能据此认定 Windows 原生桌面已有相同接口与行为。
- 执行了零桌面副作用的隔离复现：原始 Vibex JS 模块／JXA 模板，在内存假系统中运行；禁止子进程和联网。主线阅读脚本后独立复跑通过。
- **未跑两边的真实应用 A/B，也未进行像素级 UI 对照。** 因而不报告成功率、速度、可复用百分比或精确工期。本文能支持模块取舍，不能证明已经达到 Codex 的实际效果。

## 核心对照

| 维度 | Codex 当前可确认的行为／结构 | Vibex 当前实现 | 对实现选择的影响 |
| --- | --- | --- | --- |
| AI 接口与会话 | 持久 JS 环境；先绑定 app/tab；共享 `Target` 操作面，状态与截图可直接回模型 [C1]、[C2] | `desk-*`、`web_*`、engine HTTP、IPC 多个入口；MCP 又包含终端、文件和应用管理 [V1] | 新建清晰的会话与目标接口，不把旧入口体系带进来 |
| 控件寻址 | 目标对象上的元素编号或坐标；浏览器服务保存文档身份和 AX revision，拒绝过期／跨页面元素，多匹配报错 [C3] | 扫描编号是临时序号；动作主要重新按 role/title 子串找首个；按名称找不到窗口会落首窗 [V2]、[V3] | 重写观察快照与动作寻址，使“刚才看见的控件”能准确对应“现在操作的控件” |
| 应用／窗口身份 | 对外按 app 名、路径、bundle ID 绑定；浏览器 target 有独立身份。Mac 内部窗口绑定细节未完整可见 [C1] | `exe`、`se=进程名:窗序号`、pid、CGWindowID 混用，部分链路只传 `exe+winName` [V2]、[V4] | 重写身份传递与失效规则；禁止显式 pid 不匹配后又凭同名 se 命中 |
| 后台输入 | 官方支持 Mac 后台任务；本机是独立原生服务，对外动作定向 app。不能由此推定其对所有应用都无干扰 [C4] | 文本粘贴／像素动作会 activate、AXRaise，并向全局 HID 事件流投递 [V3] | 背景操作作为新执行层的首要验收条件；旧输入主路径不能原样搬 |
| 动作覆盖 | 统一面包含点击、拖拽、键组合、滚动、文本选择、值设置、纯文本输入、富文本粘贴和附加 AX 动作 [C1] | 有 press/menu/type/click；`press` 可指定 AX action，但没有对等的通用 scroll/selectText，按键是有限白名单，粘贴以纯文本为主 [V3] | 逐项补齐完整能力；不能通过工具名映射声称等价 |
| 状态反馈与等待 | 浏览器侧有导航、首绘、AX 安静窗口等待与捕获后身份复核；Mac 自动等待只从说明／服务接口确认，算法内部不可见 [C3]、[C5] | 多处固定 delay；AX 树全量截断；单动作多返回 `ok`，截图凭证与模型观察分离 [V2]、[V3] | 新建观察与动作后稳定判断；保留超时，不用固定 sleep 代替全部状态判断 |
| 停止与接管 | 插件配置有 Interrupt／Stop／SubagentStop → turn_ended；浏览器侧有 turn/session 管理与资源释放；Mac 暴露用户停止／介入错误，原生中断细节未确认 [C2]、[C3]、[C6] | MCP 收到 cancelled 只回 accepted；人工接管只删锁并记日志；JXA 与 replay 无统一调用方取消信号 [V1]、[V4]、[V5] | 执行、队列、按下未抬起状态、录制和会话结束必须共同设计；重写，不能拿“锁删了”当“已停止” |
| 浏览器控制 | 独立浏览器后端，app/tab 共用操作面；浏览器服务另有定位、滚动后几何稳定和命中检查 [C1]、[C3] | 强绑 Electron webview、renderer 标签账；正文／输入主要是顶层 DOM 脚本；vclick 用页面 `el.click()` [V1]、[V6] | 重写浏览器连接与目标管理。DOM 片段只能逐段评估，不能整块搬 web-mcp |
| 录像与复盘 | 当前接口／官方说明不足以认定它与 Vibex 的 watch/distill 是同一种功能 | 有帧落盘、时戳、录制收尾、恢复提示、多图问答、流程草稿、版本化和有限重修 [V6]、[V7] | 保留工程经验，作为可选增强逐项实现；不能把附加功能数量当成已接近 Codex |
| 用户界面 | 有应用选择、访问设置、操作反馈与人工接管等用户可见流程 [C4] | 应用磁贴、浮窗、树面板、旧 Electron IPC 与主窗口交织 | 在 DSH 的界面扩展点重新实现，并做真实视觉对照；旧界面不作为基础 |

## 旧资产逐项处理

下表保留对技术可抽取性的判断；少量纯逻辑虽具备抽取条件，本轮建议仍是参考后新写，不据此保留旧模块。

| 旧资产 | 决策 | 可保留的价值／不保留原因 |
| --- | --- | --- |
| `ax-bridge.js` | **重写核心，参考配方** | 窗口枚举、AX 读取和截图经验有价值；名称+序号寻址、每次 spawn、启发式窗口 join、全量扫描接口不适合作为最终基础。原生候选路线须用背景操作实测选择，不能只因换语言就宣布更可靠 |
| `mac-desk.js` | **不搬整模块；重新实现操作层** | 1470 行混合权限、焦点、动作、模型请求、存储、截图凭证、回放与学习。需要改变的正是核心职责；继续包裹它没有可靠的稳定边界 |
| 中文输入／剪贴板备份恢复 | **配方保留，实现重新审核** | 多 item／多格式备份、输入法经验值得继承；旧版只写纯文本，备份失败仍会覆盖剪贴板，恢复时未核对期间用户复制的新内容。新实现需覆盖富文本、竞争和取消，不能照抄整段 |
| 双击／拖拽／按键配方 | **配方与测试保留，后台执行重新实现** | clickState、显式 flags、原子 drag 和 mouseUp 清理都值得参考；全局 HID 注入与焦点切换不满足背景目标 |
| `web-mcp.js` | **重写** | HTTP/IPC、标签、授权 UI、终端、桌面和文件混合；标签身份、歧义匹配、取消都有缺口。按 trisoulx 工具与统一 Target 接口重新组织更直接 |
| `web-obs.js` | **参考后新写** | console/network 字段归一化、有界环与丢弃计数具备局部抽取条件，但逻辑小，按新接口直接实现更清楚；webContents 生命周期、debugger 独占与暂停录制接线不搬 |
| `engine-rec.js` | **重新实现，继承失败场景与算法经验** | ACK、时戳拼片、坏帧剔除、容量上限和恢复提示有实际经验。目标绑定、观察通道协作、单例、清理及 Python／模型依赖要重新设计，不能把 535 行整体视为独立录像库 |
| `desk-lock.js` | **重写** | 体量小，身份匹配存在已复现缺陷，释放与取消也不贯通。修旧逻辑再加兼容层不划算 |
| `trust-broker.js` 与旧授权规则 | **重设整合边界，不照搬规则体系** | 应用访问、撤销和操作记录要与 trisoulx/DSH 和 Codex 目标体验整合。旧 flag/token 双轨、三档遗留、AI×app 配对与“焦点税”不应自动成为新产品要求；零散存储／摘要逻辑参考后新写 |
| playbook／autoRepair／distill | **保留设计经验，建立新动作接口后再实现** | 版本与失败现场有价值；旧步骤绑 `exe/title`，录制与回放是单例，成功依赖动作回执。不能抢在稳定操作核心之前搬成主流程 |
| `mac-dock.js`、浮窗、前端应用区 | **插件界面重新实现** | 应用列表和图标读取可参考；排布、贴靠、浮窗和终端联动属于旧产品形态，不带进新插件 |
| `uia-scan.py` | **Windows 读取配方参考** | 已有 UIA 只读能力；不能当作现成 Windows 点击／输入执行器。Windows 操作层需要另行实现和平台实测 |
| 旧探针与踩坑记录 | **保留场景，测试驱动重新适配** | 中文输入、剪贴板格式、双击、拖拽、窗口消失、坐标缩放、录像中断等验收意图值得继承；现有探针大量依赖 Electron、固定测试端口和真实桌面，不能直接当新插件测试套件 |

**当前没有一个旧核心模块被批准原样搬入。** 小段逻辑技术上能抽取，也不构成必须搬运的理由；本轮路线是继承知识与验证要求，重新实现产品代码。

## 支撑取舍的实际证据

隔离复现读取生产模块；JXA 模板用假 System Events 执行，未声称真实应用已复演。脚本同时验证正常窗口选择与非 owner 不能解锁，以排除假对象把所有路径都弄错。

| 输入／条件 | 实际结果 | 意义 |
| --- | --- | --- |
| 已锁 pid=111，再用 pid=222、相同 `se=Editor:0` 申请 | 被当作同一实例；同 owner 再入返回 pid:111 | pid 差异会被 se 匹配覆盖 |
| 传 pid=222、相同 se 人工释放 | 实际释放 pid=111 | 新执行器不能继承此身份规则 |
| 请求不存在的窗口 `Missing`，首窗有 Save | 首窗 Save 被执行，返回 `ok:true` | 目标失效没有可靠拒绝 |
| Save As 排在 Save 前，请求 Save | 执行 Save As，返回 `ok:true` | 子串首匹配不能当高质量元素定位 |
| 目标在第二个同名进程的 DocB | 执行第一个进程 DocA 的按钮 | 上层 pid 选中目标不等于底层动作落到该目标 |
| 两个步骤都回 `ok:true`，前后帧完全相同 | 两步均继续执行，`noEffect:true`，总体 `ok:true` | 回放只证明动作接口成功，没有证明任务完成 |

最后一条是现有明确设计，**不把“图像没变”直接判成 bug 或任务失败**；它只说明必须区分动作回执、可见状态和任务结果。新实现也不能仅凭像素变化判成功。

静态补充：`web-mcp.js:767` 对 `notifications/cancelled` 只返回 accepted；`main.js:200` 的人工释放和 `main.js:2176` 的浮窗释放只删锁、写日志。`ax-bridge.jxa` 有内部超时，但没有传入的调用方取消；replay 循环同样未接取消。这不是完整的用户接管机制。

临时复现材料：[脚本](/tmp/vibex-desktop-readonly.IWZlx4/probe.cjs)、[主线复跑结果](/tmp/vibex-desktop-readonly.IWZlx4/root-rerun.json)。临时目录可能被系统清理；本节输入、输出和源码引用是持久评估记录。

## 为何选择新核心

| 方案 | 取舍 |
| --- | --- |
| 原模块搬进插件，外面改接口 | 不采用。界面能接上，但寻址、前台输入、取消和结果语义不改变，后续成本主要落在兼容与修补 |
| 在旧整体架构内逐项重构 | 不作为主路线。需要同时改动目标身份、每个动作、观察、队列、授权与生命周期，稳定边界太少；保住旧形状没有额外质量收益 |
| **按 Codex 行为整体新写插件，继承已验证经验** | **推荐路线。** 建立统一目标、观察、动作和会话生命周期；Vibex 主要贡献操作配方、算法经验与测试场景，不作为运行依赖 |

规划与判断仍由 trisoulx 现有主模型承担；新增部分是持久执行环境、目标对象、观察与动作服务及用户界面，不额外做一套 agent。附件、模型调用、会话与中断优先复用 DSH 已有机制；浏览器控制后端需要另行实现或接入，不能把 DSH 的 MCP 接入能力等同于已有浏览器执行器。

DSH 已确认提供：`ctx.tools.register`、图像 ContentBlock／附件、工具调用与完成状态呈现、按工具名注册卡片、`AbortSignal`、`@` 引用来源、设置与侧栏扩展。X 已有 [界面扩展][X1] 和 [工具接入][X2]。需要核对的仍有图片经具体模型适配器的实际输入、持续预览的订阅生命周期，以及停止信号到原生进程的贯通。

## 保留在目标内、需要原型定案的能力

- **Mac 后台操控**：必须做本机原型。比较语义动作与进程定向事件投递等路线，观察前台应用、真实光标、按键状态、剪贴板和目标效果。不能预先把全局 HID 前台注入当合格替代，也不能仅凭有 `CGEventPostToPid` 就宣布后台问题已解决。Apple 提供 [进程事件接口][A1]，但 Codex 原生内部路线尚未确认。
- **锁屏继续工作**：保留为对标项。官方说明使用用户开启的授权插件和受控临时解锁，Apple 提供授权插件机制 [C4]、[A2]；它是单独的系统组件工程，不是已证明做不到。本文不把公开机制的存在当作完整同等实现已可行的证明。
- **原生包装与授权身份**：需要验证新宿主下的安装、系统授权、启动／退出和更新；Vibex 当年的 adhoc Electron 授权失败记录是旧环境事实，不能直接变成禁止新实现使用原生 AX 的约束。
- **Windows**：按官方 Windows 实际行为单独实现和验收；当前官方 Windows 使用前台桌面，不支持 Mac 的 locked use [C4]。不把 Mac 完成等同于全平台完成，也不把 Mac 特有能力写成已经存在的 Windows 对标基线。
- **视觉体验与端到端质量**：需要实际对照操作录像／截图和同任务结果。本次可读接口分析不足以确认官方每个 UI 细节或原生算法。

## 实施前最有判别力的验证

第一轮原型应覆盖同一条完整链：绑定目标 → 观察 → 动作 → 稳定观察 → 用户停止／会话结束。先把会决定架构的事实验证清楚，再扩展动作和包装界面。

1. 同名应用／多窗口／窗口关闭重开／页面导航：失效引用应明确拒绝，不能静默切换目标。
2. 同名按钮、动态列表、弹窗与遮挡：明确指定当前观察中的目标，歧义不能猜第一个。
3. 后台操作时用户继续使用另一个应用：分别测前台、真实光标、键入去向和剪贴板，不能只看目标应用有没有变化。
4. 中文、输入法、富文本、选区、组合键、滚动和拖拽：逐项对照 Codex 可见行为；取消时必须释放本次动作持有的按键／鼠标状态。
5. 停止、接管、进程异常、会话结束：停止被确认后不再派发后续动作；已经执行的副作用如实记录，取消不冒充撤销。
6. 观察反馈：同时验证模型收到的内容、用户看到的画面、元素身份与稳定等待；不把截图路径字符串当作模型已看到图片。
7. 成功判定与性能：任务结果使用独立可读回的事实；先测执行器耗时，再测包含模型的端到端耗时，并披露模型／提示词／环境差异。旧 mock 加速倍数与旧 probe 绿灯不直接迁移。
8. 界面：同一任务下逐项对照入口、应用选择、运行卡片、预览、反馈、停止／接管及设置；实机、多尺寸、人工看图后才认可接近程度。

## 主要引用

[C1]: /Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/cua/dist/lib/js/oai_js_cua/src/tinysky_alt/types.d.ts
[C2]: /Users/mac/.codex/plugins/cache/openai-bundled/unified-computer-use/26.903.61454/.codex-plugin/plugin.json
[C3]: /Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/browser-desktop/scripts/browser-service.mjs:1060
[C4]: https://learn.chatgpt.com/docs/computer-use
[C5]: /Users/mac/.codex/plugins/cache/openai-bundled/computer-use/1.0.1000968/.codex-plugin/computer-use-node-repl.md:115
[C6]: /Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/sky/dist/project/cua/sky_js/src/targets/mac/errors.d.ts:14
[V1]: /Users/mac/Projects/vibex/electron/web-mcp.js:363
[V2]: /Users/mac/Projects/vibex/electron/ax-bridge.js:243
[V3]: /Users/mac/Projects/vibex/electron/mac-desk.js:82
[V4]: /Users/mac/Projects/vibex/electron/desk-lock.js:36
[V5]: /Users/mac/Projects/vibex/electron/main.js:200
[V6]: /Users/mac/Projects/vibex/electron/engine-rec.js:196
[V7]: /Users/mac/Projects/vibex/electron/mac-desk.js:1318
[X1]: /Users/mac/Projects/trisoul_x/src/client/index.jsx:309
[X2]: /Users/mac/Projects/trisoul_x/src/dsh-agent.mjs:15
[A1]: https://developer.apple.com/documentation/coregraphics/cgevent/posttopid(_:)
[A2]: https://developer.apple.com/documentation/security/extending-authorization-services-with-plug-ins
