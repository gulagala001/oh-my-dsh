# OpenCU 技术参考

[开发文档](../DEVELOPMENT.md) · [中文首页](../README.md)

工具接口、后台操作、模型输出和前端组件的行为说明，供集成方和贡献者查阅。构建、打包和故障验证见[开发文档](../DEVELOPMENT.md)。

## 能力与边界

工具提供真实目标发现、选择、观察、操作、文件交付和持久 JavaScript。浏览器键盘输入按实际按键、编辑目标与输入类型标记，剪贴板编辑及原生表单控件的默认输入也属于本次操作；派发结束立即清理标记，不用延时窗口屏蔽真实人工输入。已删除强制 takeover 协议；人类鼠标、键盘、滚动、焦点与页面变化通过 userActivity 等观察信息交给 AI，由 AI 决定是否继续、重新观察或中断。程序不因 human／userActivity 标记暂停、拒绝输入或触发全局停止；人类明确停止任务或停止 LLM 时才按取消流程终止。stop 用于明确任务取消并确认输入释放；故障／冷恢复的 resume 核验身份，不能清状态绕过。截图保存到真实 DSH attachments 并返回持久 ImageAttachmentRef。普通批注保存不标记为 AI 操作，也不取消工具。macOS 人工活动通知使用已授权的只读输入监听，只保存所选目标的活动种类、时间与序号，不保存按键内容、不请求权限或改变控制权；缺少输入监听权限时明确报告不可检测。产品鼠标使用同一 REA 原件，承载层透明且点击穿透；可见浏览器页面和 macOS 等待到达回执后发送对应输入，隐藏页面明确延后视觉回执而不阻塞后台输入，Windows/Linux 的原生移动通过独立显示通道传给所属 DSH 窗口，不以动画回执冒充输入成功。取消会隐藏鼠标并释放实际按键。内置浏览器鼠标的位置／可见性独立于单次动作活动状态；macOS 原生鼠标不再 1.5 秒超时隐藏，在动作间隙保留最后位置，取消／释放／目标失效时移除。托管浏览器和扩展页面沿用同一 REA 鼠标，在页面存续期间不按空闲时间隐藏。Windows/Linux 显式前台输入保留系统指针，同时把真实位置接到同一 REA 鼠标；后台无障碍动作不移动系统指针；Windows 物理像素由宿主换算为 DIP，Linux X11 单屏按真实比例换算，Wayland 使用 portal 逻辑坐标与显示器原点。鼠标在动作间隙保持，取消／目标失效／helper 或所属窗口退出时清理；用户鼠标不被覆盖层捕获。

浏览器 action 支持 navigate/back/forward/reload/newTab/closeTab/activate/click/doubleClick/move/mouseDown/mouseUp/scroll/drag/keyDown/keyUp/press/type/fill/selectOption/upload/download。元素 ID 只使用最新观察；坐标遵循观察声明的坐标空间。

Windows 原生 helper 由系统 Windows PowerShell 编译随包 C#，需要 Windows 10 1703+、.NET Framework 的 UI Automation；使用物理像素，受 UIPI 和应用 UIA 支持限制，不自动提权；全局输入仅在显式前台模式运行。Linux 原生 helper 使用 `/usr/bin/python3`、X11/XTest 和可选 `python3-pyatspi`；缺少 AT-SPI 时后台语义动作不可用，XComposite 截图和显式前台坐标操作仍可按系统能力使用，但不能读取 AX 或 Unicode 输入。Hyprland 不实现 RemoteDesktop portal，因此走自身 IPC：`hyprctl` 负责窗口与指针，`grim` 采集当前可见的前台窗口所在屏幕区域，`ydotool`（需 `ydotoold`）负责输入，不可由当前键盘布局输入的字符使用 `wtype`。无障碍能力按应用在 `a11y` 字段上报（`application`／`not-exposed`／`client-unavailable`），只有 `application` 提供无障碍输入与后台动作。选择、观察和监看不移动窗口或切换焦点；目标不在前台时截图明确不可用，后台输入无可用路由时在派发前拒绝。经用户同意后显式调用 `focus`／`activate`：若目标与其它窗口共用工作区，将它移到专用工作区 `opencu`；目标独占工作区时不搬动。接管提示条需要 GTK3、gtk-layer-shell 与 Pycairo，显示动作、目标及输入字符数，不展示或保存输入正文；helper 每 2 秒刷新心跳，退出后提示条在 8 秒内自行关闭。提问时 `away` 先释放持键与持鼠，再交还视图并保留隔离窗口；回合结束时加 `relinquish`，恢复窗口位置并关闭提示条，保留目标选择。下一次前台操作须重新显式聚焦，自动预览不恢复接管。交还只恢复仍停留在接管工作区的用户视图，并在控制器执行队列中复核会话归属；同一会话转去操作浏览器也会归还此前的原生窗口。取消终止输入子进程并释放持有输入；释放失败明确报告，不能显示为成功交还。Wayland 使用 xdg-desktop-portal 的 RemoteDesktop／ScreenCast 和 PipeWire；在“电脑与浏览器”设置中点击“选择共享桌面”，由系统选择单个显示器并授权本次键鼠输入，不请求永久权限。依赖系统 `python3-gi`、GStreamer introspection／PipeWire／PNG 插件和 `libxkbcommon`；缺失时明确报错。支持共享显示器真实截图、逻辑／像素坐标换算、键鼠／Unicode 输入；提供 AT-SPI 和有效桌面坐标时也可绑定应用。截图范围明确为共享显示器，不冒充应用独占截图。会话撤权／退出关闭 portal 和媒体流，取消释放输入；Wayland 不提供全局人工活动通知。Windows 只读输入 hook／Linux XInput2 人工活动监听已接入，分别排除本 helper 标记的输入／XTEST 事件；只保存活动种类、时间与序号，不记录文本，不强制接管。监听依赖或权限不足时观察明确报告不可用。

### 后台操作

选择目标与聚焦分离：`select`／`getApp`／`getTab` 不激活窗口或标签；只有显式 `focus`／`activate` 改变前台。`getApp({id:应用ID, windowId})` 与完整窗口 ID 绑定同一进程实例的精确窗口；应用有多个窗口时返回候选，不按列表顺序猜主窗口。输入默认 `inputMode: 'background'`，后台不可用时不自动降级为全局键鼠。目标的 `control` 字段（JavaScript 目标通过 `capabilities.control()`）说明路由和限制；`delivery` 仅说明提交方式，`effectVerified: false` 要求后续观察，不能当作界面变化已成功。原生 `process-posted` 的未确认回执会自动输出，即使代码丢弃动作返回值，也不会被后续截图隐藏。

macOS Electron 的 AX 观察按 [Electron 辅助功能接口](https://www.electronjs.org/docs/latest/tutorial/accessibility) 请求语义树，在当前读取时限内等待其首次激活。请求按进程实例去重，取消后不会重新触发激活延迟，不聚焦窗口或关闭其他辅助客户端的支持；完整语义树仍受应用提供能力和原读取边界约束。截图坐标统一使用所见图片的像素，`click`、`doubleClick`、`move`、定点滚动及拖动同时接受 `[x,y]` 和 `{x,y}`，原生适配自动完成 Retina 换算；非法参数在派发前指出支持形式。`act` 接受动作对象或动作名与参数对象。REPL 保留跨调用绑定；需重复声明时使用 `var`，`let`／`const` 同名声明给出可操作错误并保留原句柄。

- 内置、Playwright 和 Chrome／Edge 扩展浏览器使用目标页 CDP 与焦点模拟；AI 新建标签不激活，内置标签不展开侧栏或切走当前会话。释放只清理 AI 记录的目标输入，并撤销焦点模拟。后台页面暂停动画帧时返回 `visualDeferred`，不伪造游标到达，也不阻塞输入。
- macOS 使用私有事件源和 `postToPid`，不移动系统鼠标；需要明确窗口。后台普通左键点击优先对支持的控件或其子元素执行 `AXPress`，禁用控件直接拒绝；否则，对已观察表格行、单元格或其文本在精确窗口内寻找最近行并使用可写 `AXSelected`，不支持时返回 `BACKGROUND_SELECTION_UNAVAILABLE`，不发送指针输入。多选表格中普通点击只保留目标行；持键、其他鼠标按钮及双击仍沿原事件路径。键盘仅发给应用内部当前键盘窗口，其他窗口用 AX 元素操作或返回 `BACKGROUND_KEYBOARD_UNAVAILABLE`。目标应用仍可能忽略事件或因自身行为激活窗口；这不是全应用无干扰保证。
- Windows 使用 UI Automation 的文本、Invoke／Toggle／SelectionItem／ExpandCollapse 和滚动模式；截图使用 `PrintWindow`，不还原最小化窗口或回退桌面截图。应用拒绝或不提供窗口像素时明确不可用。
- Windows 控件按所选窗口的实时 UIA 祖先链核验归属，允许 WebView2 跨进程子树，仍拒绝同进程的其他窗口。辅助功能读取在 MTA 线程执行，最多等待 5 秒；超时保留绑定，不发布迟到元素，仍可读取窗口截图。旧读取尚未结束时返回 `AX_BUSY`，不会反复创建线程。
- macOS 的直接赋值、AXPress、元素坐标与指定元素输入均复核当前窗口归属；X11／Wayland 的元素坐标和前台命中测试同样按当前窗口祖先链核验，允许窗口内的跨进程控件，拒绝已移到同进程另一窗口的旧元素。
- X11／Wayland 读树达到节点、深度或时间上限后停止枚举子节点并报告截断；Windows／Linux 后台滚动的祖先搜索有固定上限，执行前复核滚动控件仍属于所选窗口。
- 应用与浏览器授权的人工作答时间不消耗 JavaScript 执行预算；取消仍可立即结束等待。`COMPUTER_TIMEOUT` 通过 `details.stage`／`pendingRequests` 标明挂起的后端调用或 JavaScript 阶段。窗口／页面变化时保留绑定；若输入已开始，须确认该目标输入已释放，并在成功重新观察前阻止继续派发，不重放可能已生效的动作。浏览器按页面释放；原生 helper 释放其硬件输入流。`details.control` 给出实际控制状态和恢复方式，`releasedTargetIds` 明确释放范围。未知派发、身份变化与释放失败仍保留停止保护。
- X11 使用 AT-SPI 动作与 XComposite 窗口像素；Wayland 使用 AT-SPI 动作，portal 仍只共享显示器，不提供被遮挡应用的独立像素，非活跃应用截图明确不可用。Windows／Linux 的后台滚动是应用定义的步长，不是精确像素。

不支持的后台操作返回 `FOREGROUND_REQUIRED` 或具体 `BACKGROUND_*_UNAVAILABLE`。经用户同意后才能显式聚焦并传 `inputMode: 'foreground'`；原有焦点、身份、权限和取消保护仍在。Windows SendInput、X11 XTest、Wayland portal 键鼠不会作为隐式兜底。内置浏览器需要重新构建匹配的宿主、双 preload 和侧栏，并声明 `backgroundInput`；只更新插件会明确拒绝旧宿主。

### 模型输出与提示词

[运行时说明](<../src/dsh/computer-docs.mjs>)统一拥有 `computer_use` 主入口及 `core`／`browser`／`native` 文档。首次使用或重置后的第一个调用仅执行一个入口，可将返回值绑定到变量；读取返回文档和状态后，再决定下一步操作，不在该次调用中追加其他 API、等待或观察。首次自动显示基础文档，绑定应用或标签时显示对应文档及初始 AX；`getBrowser` 仅绑定浏览器并显示文档，不创建或选择标签，也不返回初始 AX。绑定和输入默认后台，不绕过目标保护或隐式回退全局键鼠。上下文压缩后调用 `cua.rewriteDocumentation()` 恢复文档与全量基线，不重置绑定。

AX 默认返回紧凑语义文本，保留元素身份、层级、值、状态和动作；`details:true` 获取完整节点与几何。身份稳定且基线完整时返回差分，`disableDiffing:true` 强制全量；截图、静默观察、目标切换、截断或失效基线会恢复全量。截图返回附件引用。内置 guest 的透明捕获在可信 surface 中按页面深浅方案补齐默认 Canvas 背景，保留显式背景及原始尺寸，不修改网页。观察自动输出一次，`emit:false` 仅供代码读取。

浏览器 AX 观察合并 Chromium 实际公开的同源、跨源和跨进程子框架，按框架及文档身份保存元素与层级；网页为 iframe 指定其他 ARIA 角色仍可读取其可访问内容，隐藏框架不额外公开控件。三种浏览器后端共用采集与路由，完整观察和身份复核成功后才发布新节点表。子框架导航、替换或移除后，旧元素会在输入前被拒绝，应在同一标签重新观察并使用新 ID；不能按节点数字或框架标题匹配新文档。

浏览器支持 `tab.playwright` 的角色／文本／标签／placeholder／testId／CSS 定位、过滤、顺序选择、读取及常见输入，以及 `domSnapshot()`；定位器每次按当前文档解析，保留各后端的后台输入和释放路径。支持嵌套 frame（含跨源／OOPIF）、开放 shadow DOM，以及文本／名称／标签等位置的 RegExp。定位器按 timeoutMs 自动等待目标和可操作状态，提供 waitFor 的 visible／hidden／attached／detached 状态；只有确定尚未发送输入的失败才重试，已派发或结果不明的输入不会重放。默认 domSnapshot 按真实 frame session 递归展开可见子 frame，maxNodes／maxChars 由整份快照共享，提交前复核完整 frame owner 拓扑；显式 frameLocator(...).domSnapshot() 从所选 frame 起递归其可见子 frame，不包含根页。定位解析保持同步，点击稳定等待由 CDP 宿主计时并复核同一元素、盒模型及可操作状态；再次滚动后等待目标及父 frame 布局稳定，光标移动后在实际按下前重新核验位置和命中，不对移动后的旧坐标盲点；无脚本 sandbox frame 不依赖页面定时器，也不放宽 sandbox／CSP 或执行网页内联脚本。内置 guest 文本输入在嵌入视图重入后恢复原目标子 frame 的焦点，避免把子 frame 中文丢到主文档；Chrome 扩展对不透明沙盒的 `Not allowed` 限制仍如实返回，不绕过。fill 支持文本、textarea、contenteditable 与 number 控件；number 接受有限数字字符串或空值清空，非法数字在派发前拒绝，保留只读／禁用保护。角色名称忽略 aria-hidden 与视觉隐藏的后代提示，保留显式 aria-labelledby 隐藏引用；原生 label 的名称不混入被标注控件自身的选项或默认正文，文本读取仍返回原正文。内置浏览器的 automation／父子表面 RPC 以结构化信封跨越 Electron IPC 和 contextBridge，在页面侧还原错误码与输入派发状态；主／子 preload 必须声明 `structuredErrors`，旧宿主明确拒绝。旧接口保留，导航增加 `goto`，输入增加 `typeText`，拖动支持起止坐标。浏览器拖动保留显式路径拐点，按有界连续轨迹发送真实指针事件，不合成网页 drag/drop；网页最终效果仍需观察。元素页距 `scroll(id,direction,pages=1)` 按所选元素在其文档内的实时边框尺寸计算，无需截图；`{pixels}` 与原始 delta 仍发送真实 wheel。坐标与原生页距保留截图要求，截图-only 后须刷新 AX 才可使用元素编号；嵌套控件沿浏览器原生滚动传递规则处理，不改写 scrollTop 或猜选祖先。定位器还支持候选相对的 `filter({has,hasNot})`、同目标同 frame 的 `and`／`or` 和即时 `all()`；`or` 按文档顺序去重，`all()` 只固定返回的 nth 列表长度。`click`／`dblclick` 额外接受 `{button,modifiers}`；`modifiers` 为修饰键数组，支持 Shift、Control/Ctrl、Alt/Option、Meta/Cmd/Command/Super 和 ControlOrMeta，名称／别名不区分大小写，ControlOrMeta 由实际浏览器后端映射。非法类型、重复的实际修饰键及显式持键冲突在定位滚动和输入前拒绝；显式空数组也要求无持键。修饰键转接现有 target click 的 key 事务，双击全程持有且只释放本次取得的键；不扩展 force、delay 等未公布参数。`type(text,{timeoutMs})`／`pressSequentially(text,{timeoutMs})` 在当前选择处追加，后者对 ASCII（含标点／回车）发送真实按键，其他 Unicode 逐 code point 走真实文本插入，不提供 delay。匹配的内置宿主与独立浏览器提供 `playwright.expectNavigation(action,{timeoutMs,url,waitUntil})`、`waitForURL(url,{timeoutMs,waitUntil})`、`waitForLoadState({state,timeoutMs})`（兼容 state,options）；导航状态来自只读固定查询，按真实文档 occurrence、独立历史变更序号、URL 和 readyState 判断新导航或已有状态；hash、pushState、replaceState（含 URL 不变）保留同一文档的元素身份，整页导航／重载才废弃旧文档句柄。支持 commit／domcontentloaded／load，拒绝 networkidle。URL 为精确字符串或 RegExp；action 只调用一次，等待超时保留绑定，不重放已派发输入。普通点击最终 mouseUp 完成后发生导航可返回已派发回执，同时要求先观察同一目标的新文档再继续输入；多步动作尚有剩余输入时仍中断。直接导航超时只有在请求已结算且精确释放确认后才可恢复；navigationSettled 不表示页面加载完成，应读取当前状态或等待 URL／加载状态，不能重发导航。`playwright.waitForEvent('download',{timeoutMs})` 必须在同一 cell 内先取 promise 再触发、最后 await，或用按此顺序的 Promise.all；预先排队获取持久历史及目标实际捕获的下载游标，在触发前的控制器串行槽内固定旧 ID，异步历史读取中出现的本次新 ID 不加入旧记录；排除未同步的旧 ID／开始时间及其他目标，只在新下载完成、文件校验和附件生成后返回。独立浏览器以 targetId 归属，内置宿主在真实 DownloadItem 捕获时记录来源 WebContents，读取绑定 guest 的同一 ID 后匹配；旧宿主明确拒绝，扩展仅有浏览器级归属也明确拒绝。返回 handle 的 file 为实际附件，path() 返回 null，不公开内部存储路径；全局 downloads.list 保留原历史用途。方法等待完整登记为当前 cell 的 pending 工作，超时／取消后清除轮询，不留下后续派发。capabilities.actions() 保留控制功能字符串清单，control().waits 公布实际等待支持及边界，新标签继续由 tabs.list 的实时清单辨认并按 ID 绑定。

扩展输入完成后的旧文档标记随文档销毁而失效，不把清理已销毁标记当作输入失败。观察到同标签主文档变化时返回并显示 `navigationObserved`、`inputDispatched`、`reselectRequired`，要求重新发现并绑定当前文档；不重放点击，也不宣称网站效果已验证。输入前 iframe 脱离与未知输入结果仍保留失败语义。控制状态的 `inputReadiness` 区分当前可验证范围、观察／恢复前置和历史未确认释放义务；扩展释放失败按精确连接实例及 epoch 记录，恢复只核销该连接的回执。无归属的旧记录保持未确认，在「电脑与浏览器 → Chrome / Edge 连接 → 检查并恢复」中选择单个目标。原目标重连后可重试释放，永久关闭的离线目标需人工确认退役。每次处理只核销所选目标，保留其他释放义务和停止状态。


独立浏览器在 `capabilities.actions()` 包含 `fileChooserEvents` 时支持 `playwright.waitForEvent('filechooser',{timeoutMs})`：同一 cell 内先订阅，再点击实际文件输入或触发按钮，最后 await；返回句柄提供 `isMultiple()` 与 `setFiles(absolutePathOrPaths,{timeoutMs})`。选择器按目标、框架和文档身份绑定，导航、控件移除、取消或消费后的旧句柄被拒绝，动作不会自动重放；单文件控件拒绝多个文件，禁用控件及禁用 fieldset 子控件拒绝输入。内置与扩展浏览器仍使用最新观察中的 `tab.upload(elementId,absolutePaths)`，尚不提供选择器事件等待。两种上传入口都接受 `[]` 作为明确的清空操作：核实文件选择确已清空，但不合成 `input/change`，因此依赖这些事件维护的网页上传队列可能仍需网页自身的取消／重置操作。

浏览器可选接口由 `await capabilities.list()` 返回 `{id,description}`，再用 `await capabilities.get(id)` 获取已公布接口；控制功能字符串迁至 `capabilities.actions()`，原目标描述中的 capabilities 字段与 `control()` 保留。WebMCP 仅在内置宿主真实原生发现可用时公布，空工具集合有效。每个用户回合先 `fetchTools()`，读取 `description()` 后按明确名称 `call(name,input)`；集合可在同文档的多个 JavaScript cell 复用，新发现、导航或过期注册会使旧集合失效。重名跨框架工具在集合描述中提供唯一调用名，`nativeName` 保留站点原名，并带来源、框架和注册 ID；按所需注册的明确调用名选择。执行中导航／关闭返回 `SITE_TOOL_CONTEXT_CHANGED`，重新观察并获取工具，不推定成功或重放。CDP 确认取消不代表撤销副作用或停止站点已启动的任意异步工作：站点或宿主可能不提供或不遵守 `AbortSignal`；取消后须观察实际结果。

`tab.clipboard.read/readText/write/writeText` 使用 OpenCU 自有无头 Chromium 进程的原生剪贴板，供安全文档上的页面复制与键盘粘贴共用；`control().clipboard` 说明该目标支持情况。条目支持原生 MIME 格式、text 或 base64，写入限一个条目与 16 MiB，HTML 清洗和图片支持由实际 Chromium 决定。API 仅临时授予当前私有 context/origin 权限并在完成或取消后还原，网页自身的 Clipboard API 仍受原生权限约束。内置、扩展、有头及外部 CDP 浏览器明确不支持该隔离接口，不读写用户系统剪贴板。它与 `paste(id,text,{format})` 的直接文本插入语义分别说明；输入开始后的取消不等于写入未发生，应观察或读取后再决定下一步。

[模型结果投影](<../src/dsh/model-output.mjs>)不改控制器或 UI 保存的原始状态：默认摘要化历史目标、观察与批注，保留实时库存、控制失败、所选目标能力和观察身份；`opencu_state({includeHistory:true})` 可读取完整历史。模型侧保留全部可操作节点的语义信息，去除重复文本；完整节点、几何和后端原始属性可通过 details:true 读取。只请求截图时不夹带 AX。截图附件仍按附件 ID 去重。 观察路径可在单次请求内部把已编码截图直接交给附件服务，避免临时文件写回和重复 base64 拷贝；私有传输标识在返回前移除，PNG 字节、目标／观察身份、原有文件回退和取消边界保持不变。未缩放截图复用同一次元数据读取。旧会话内容不改写，本改动不会自动消除已进入上下文的历史冗余。

## REA 前端

**现状**

- 只使用真实 REA 原件；原件、SHA-256 与来源见 [provenance.json](../src/client/rea/provenance.json)。适配层只接数据与宿主协议，不另绘控件、控制台、截图伪网页或浮窗壳。
- 已接入：浏览器面板（地址建议、查找、批注／调整、Tweaks、复制标签与历史分支、历史／下载／站点权限／扩展管理）、来源面板、CU 工具卡、应用访问与系统权限请求卡、同页导航的“电脑与浏览器”设置、图片查看与 Markup、XLSX／PPTX／DOCX 预览与保存、监看菜单／侧栏停靠／浮窗、同内容窗口迁移。
- AI 在每个会话首次使用 DSH 内置浏览器时，默认在侧栏展开对应标签页。“电脑与浏览器”设置中的“内置浏览器”可将首次打开位置改为悬浮窗。后续工具调用保留手动选择。
- 应用窗口关闭后，对应监看画面自动移除。最后一个画面移除时，悬浮窗随之关闭。“隐藏画面”和“隐藏任务”只影响显示，可用“显示已关闭的预览”恢复仍可用的来源。每个会话默认显示最近 5 个目标，其余可展开。临时捕获失败会退避重试。切换会话只撤下画面。
- 样式表每个文档只解析一次，由所有 shadow root 共享。Shiki 语法与主题、wasm、DOCX 预览经 `/api/opencu/rea-assets/` 按需加载，网页批注脚本首次使用时经 `/api/opencu/page-annotations.js` 获取。
- 轮询按需运行：没有任务和画面时预览不轮询，窗口隐藏时降频；应用访问请求随核心事件流更新。
- `lib/` 是构建产物，不进 Git；`npm run build` 重新生成，CI 用 `scripts/check-generated-client.mjs` 核对重建字节一致。只产出经典 `lib/client.js`，需要 ES 工厂的宿主在打包时自行派生。

**边界**

- 新增桌面能力须在匹配宿主源码上应用 `host/` 补丁，并重建 Host、Client 与两个浏览器 preload：`presentationHitRegions`（监看穿透）、`initialNavigation`（复制标签历史）、`structuredErrors`（自动化错误信封）、`backgroundInput`（后台输入）。旧宿主明确拒绝，不随插件自动更新。
- Cookie／站点存储清理当前只支持“所有时间”；下载清理只移除记录，不删除已交付文件。
- 内容寻址的 DSH 原附件只读，可另存到普通目录；预览读取最多 256 MiB，超限拒绝而不截断。
- 浏览器未提供原生 WebMCP 时，Site tools 明确报告不可用；不透明沙盒 frame 的限制如实返回，不绕过。
