# OpenCU

OpenCU 是 DSH 插件：新控制核心、浏览器／原生／扩展后端配合真实 REA 前端组件。AI 像使用其他工具一样调用电脑；页面、活动和监看自然呈现，没有单独的 CU 控制台。

当前源码默认适配 DSH `0.2.1-rc.2`，当前发行版本为 `2.0.8-dsh.0.2.1-rc.2`；`0.2.1-rc.1` 使用独立 SDK 构建入口。只支持这两个宿主。

## 加载

各宿主分别精确匹配 SDK 与框架：DSH `0.2.1-rc.1`／`0.2.1-rc.2` 均使用 Cordis `4.0.5`／Schemastery `3.18.5`。插件包根入口和 `opencu/dsh` 均为 Cordis Host 插件，依赖宿主真实 `tools` 和 `attachments` 服务。不需要另开 OpenCU 服务，也不接受外部 origin/token。由 DSH profile 加载：

```yaml
- insert:
    - id: opencu
      name: opencu/dsh
      config:
        dataDir: /absolute/path/to/opencu-data
```

独立插件默认注册工具，普通会话无需额外启用 CU；集成方如需限定工具作用域，可设置 `registerTools: false` 并调用 `installTools`。第一次调用懒启动同一 controller 与所需后端。浏览器进程由插件拥有，原生 helper 由后端托管；工具取消会等待 stop 的真实输入释放。插件停用／DSH profile 退出调用 close 并等待释放和关闭，失败保留 controller 状态并报错，不清空失败冒充成功。原生 helper 缺失或权限未获批，会报告真实后端警告或错误。

数据目录优先使用 config.dataDir，其次 DSH_HOME/opencu，最后 ~/.opencu；现有数据不迁移或删除。core 使用持久目录锁，下载／批注／控制恢复状态继续保存。

浏览器恢复按目标身份隔离。成功释放和部分成功中的逐目标回执写入原控制状态，下一次派发前撤销；只读调用和明确未派发的拒绝不会制造新的释放责任。已确认关闭、或冷恢复中已有释放回执且已离线的目标可清理；缺少回执的历史目标保留为未核验记录，不因从列表消失而冒充已释放。显式选择并恢复另一浏览器目标、或冷恢复时新建标签，可以独立继续；此时 `recoveryIsolated: true` 与 `releasePending: true` 表示仍有其他目标待恢复。原生键鼠共享输入流仍须全部释放成功，显式停止不会被新建标签绕过。侧栏、Chromium 与扩展的已知单页故障不封锁其他页，连接级未知故障仍保留保护；回归见 `test/recovery-isolation.test.mjs`，由现有 `npm test` 执行。

内置浏览器下载以桌面 DownloadItem 的回执维护进度和最终结果；实时同步与冷恢复共用校验、版本选择和文件检查。完成、失败、取消及历史移除不会被迟到进度覆盖，相同回执不重复写索引。桌面 `updatedAtMs` 在同一下载内单调递增，保持暂停／继续的先后；旧桥接相同毫秒的进度仍按接收顺序兼容。冷启动暂未得到宿主确认的活动下载显示不可操作，原进度原样保留，不把推断写成永久失败；后续真实回执可以恢复显示。旧版已保存的这类推断按原错误标识读取兼容。

完成状态与文件可用性分开：文件缺失、大小改变或无法访问时保留历史和具体文件错误，不阻断其他下载。首次确认文件时计算 SHA256，未能确认的文件须在匹配的完成回执下补验；实际附件交付继续校验摘要。历史清理保留文件和移除标记，损坏索引与真实写盘错误继续明确失败。下载状态检查见 `test/sidebar-downloads.test.mjs`，桌面事件与时钟检查见 `test/sidebar-download-host.test.mjs`，均由现有 `npm test` 执行。

目标选择、动作派发、返回目标校验与控制状态保存使用同一故障收尾边界；派发后的校验或保存失败会阻止后续输入并尝试真实释放。释放失败优先报告 `RELEASE_FAILED`，同时保留保存失败的诊断。普通故障清理保留 JavaScript 对话框，显式停止或退出可关闭对话框。

持久 JavaScript 目标句柄保留绑定时的独立身份；公开的 `id`／`target` 描述和动作参数不能改变绑定。观察、操作与聚焦均携带原身份，宿主先核验再进入授权／执行流程；目标 ID 被复用时返回 `TARGET_IDENTITY_CHANGED`，需重新发现并显式绑定，不重放结果不明的输入。只有控制器已核验的动作返回目标可更新句柄身份；转到新目标时同时清除原目标的观察与截图基线。

JavaScript 单元无论成功还是抛错，都等已发出的后端请求收尾后再返回；并发调用中一个失败不会让其他请求脱离单元的执行时限。普通错误保留持久绑定和原错误，已完成的动作不回滚；请求卡住或用户取消时，由 Host 终止 worker 并等待真实输入释放，释放失败保留恢复状态并优先报告。每次 API 调用仍须 `await`，此收尾机制不会重放输入。

单元结束不代表输入责任已经结束。Host 与 REPL 共用释放记账，除显式持键／持鼠外，也保留普通动作返回的 `RELEASE_FAILED`、停止失败，以及输入已派发后被 JavaScript 对话框打断的责任。关闭空闲会话仍须重试实际释放；失败保留重试入口，不报告清理成功。明确停止收到成功回执后清空责任，对话框处理只清除对应目标；已确认释放的空闲会话退出不额外停止其他输入任务。

目标发现及选择／恢复内部的只读库存等待可被取消，不占住停止和退出的输入释放队列。调用方单独取消库存读取只结束该读取；停止、超时和退出仍等待实际释放回执，失败继续报告 `RELEASE_FAILED`。停止后可重新发现目标，但发现不会恢复控制；迟到库存不得继续选择、查询后续提供方或覆盖诊断，恢复仍核验原目标身份。此机制不提前返回已派发的输入或有副作用的选择／释放操作。

Chrome／Edge 扩展沿用同一只读取消边界，覆盖清单、选择与输入前身份检查、聚焦检查和导航后的页面读取。Host 将操作取消信号传至扩展，选择、聚焦与动作共用取消释放回执处理；明确停止后仍可单独聚焦，再次停止能取消这次聚焦。释放会中断占用串行控制队列的读取，并拒绝取消前排队的控制命令，避免旧清单再次挡住释放；其他标签的独立监看继续运行。调试器附着、建页、聚焦和输入派发仍等待真实回执，取消后不再继续后续副作用；已创建的标签保留并报告，迟到读取不重新附着目标或恢复输入。

内置浏览器的绑定记住实际 renderer 连接；每次连接的 `connectionId` 校验库存、会话、轮询与结果消息，旧连接的释放回执只能清理自身责任，不影响替代连接。断连不等于输入已释放，重连后须重选原目标，旧操作不会重放。客户端释放失败时保留 guest 供重试，释放未确认前不接受重连输入。若原窗口或标签已关闭且不能重连，可在“电脑与浏览器”设置中检查旧连接，并在确认原目标已关闭后清除引用；该操作不会恢复任务或自动重试输入。

监看与工具输入使用独立通道，捕获按目标合并；帧等待超过 12 秒返回监看错误，不改工具目标、不设置输入释放失败。原生和扩展的监看超时只结束对应请求，不断开输入连接；隐藏窗口的动画帧等待设有上限。关闭控制器先释放输入，再由后端清理捕获，不无限等待监看帧。

Chrome / Edge 扩展的 loopback bridge 由插件自动管理，监听本机 19390–19399 的首个可用端口，只服务扩展协议，不承载另一套网页或控制核心。扩展仅首次安装；AI 首次使用时自动弹「允许连接此浏览器？」窗口，单击「允许并记住」，不再复制连接信息。配对身份与凭据分别保存在私有数据目录和浏览器 local storage；固定扩展 ID，正常浏览器／DSH／电脑重启和保留身份、数据的更新后自动恢复。断开先取消并确认释放输入，然后暂停自动连接；撤销配对后需要重新允许。每次重连创建新 epoch，旧目标必须重新发现，不重放旧输入。多浏览器 profile 明确选择，不擅自连接全部。

浏览器资源使用 Playwright 的共享缓存，不捆绑 Node、Chromium 或独立应用。宿主使用 Node >=22.19。缺少 Chromium 时，可从 DSH 的“电脑与浏览器”设置安装匹配的 Playwright 浏览器资源；由插件管理安装进程，关闭时终止尚未完成的安装。

需要隔离检查页面渲染、WebGL 或截图时，可从 `opencu/browser` 导入 `withIsolatedBrowser(check, options)`。`check` 接收 `{ context, signal }`，可使用完整 Playwright 页面 API；把相关检查放在同一回调中复用浏览器。`options` 支持临时目录父路径 `directory`、`launchOptions`、检查时限 `timeoutMs` 和取消 `signal`。入口创建独立临时资料目录，保留 `--use-mock-keychain`／`--password-store=basic`，并在成功、抛错、检查超时或取消后关闭自己的浏览器及删除临时目录；自定义参数与默认参数过滤不会移除凭据隔离。CDP 和外部传入的浏览器上下文保持原有凭据与生命周期。直接启动 Chromium 时，独立资料目录与这两个隔离参数须同时保留，无头模式本身不隔离钥匙串。

## 能力与边界

工具提供真实目标发现、选择、观察、操作、文件交付和持久 JavaScript。已删除强制 takeover 协议；用户活动通过 userActivity 通知，不停止控制、不要求用户点恢复。stop 用于明确任务取消并确认输入释放；故障／冷恢复的 resume 核验身份，不能清状态绕过。截图保存到真实 DSH attachments 并返回持久 ImageAttachmentRef。普通批注保存不标记为 AI 操作，也不取消工具。macOS 人工活动通知使用已授权的只读输入监听，只保存所选目标的活动种类、时间与序号，不保存按键内容、不请求权限或改变控制权；缺少输入监听权限时明确报告不可检测。产品鼠标使用同一 REA 原件，承载层透明且点击穿透；可见浏览器页面和 macOS 等待到达回执后发送对应输入，隐藏页面明确延后视觉回执而不阻塞后台输入，Windows/Linux 的原生移动通过独立显示通道传给所属 DSH 窗口，不以动画回执冒充输入成功。取消会隐藏鼠标并释放实际按键。内置浏览器鼠标的位置／可见性独立于单次动作活动状态；macOS 原生鼠标不再 1.5 秒超时隐藏，在动作间隙保留最后位置，取消／释放／目标失效时移除。托管浏览器和扩展页面沿用同一 REA 鼠标，在页面存续期间不按空闲时间隐藏。Windows/Linux 显式前台输入保留系统指针，同时把真实位置接到同一 REA 鼠标；后台无障碍动作不移动系统指针；Windows 物理像素由宿主换算为 DIP，Linux X11 单屏按真实比例换算，Wayland 使用 portal 逻辑坐标与显示器原点。鼠标在动作间隙保持，取消／目标失效／helper 或所属窗口退出时清理；用户鼠标不被覆盖层捕获。

浏览器 action 支持 navigate/back/forward/reload/newTab/closeTab/activate/click/doubleClick/move/mouseDown/mouseUp/scroll/drag/keyDown/keyUp/press/type/fill/selectOption/upload/download。元素 ID 只使用最新观察；坐标遵循观察声明的坐标空间。

Windows 原生 helper 由系统 Windows PowerShell 编译随包 C#，需要 Windows 10 1703+、.NET Framework 的 UI Automation；使用物理像素，受 UIPI 和应用 UIA 支持限制，不自动提权；全局输入仅在显式前台模式运行。Linux 原生 helper 使用 `/usr/bin/python3`、X11/XTest 和可选 `python3-pyatspi`；缺少 AT-SPI 时后台语义动作不可用，XComposite 截图和显式前台坐标操作仍可按系统能力使用，但不能读取 AX 或 Unicode 输入。Hyprland 不实现 RemoteDesktop portal，因此走自身 IPC：`hyprctl` 负责窗口与指针，`grim` 采集当前可见的前台窗口所在屏幕区域，`ydotool`（需 `ydotoold`）负责输入，不可由当前键盘布局输入的字符使用 `wtype`。无障碍能力按应用在 `a11y` 字段上报（`application`／`not-exposed`／`client-unavailable`），只有 `application` 提供无障碍输入与后台动作。选择、观察和监看不移动窗口或切换焦点；目标不在前台时截图明确不可用，后台输入无可用路由时在派发前拒绝。经用户同意后显式调用 `focus`／`activate`：若目标与其它窗口共用工作区，将它移到专用工作区 `opencu`；目标独占工作区时不搬动。接管提示条需要 GTK3、gtk-layer-shell 与 Pycairo，显示动作、目标及输入字符数，不展示或保存输入正文；helper 每 2 秒刷新心跳，退出后提示条在 8 秒内自行关闭。提问时 `away` 先释放持键与持鼠，再交还视图并保留隔离窗口；回合结束时加 `relinquish`，恢复窗口位置并关闭提示条，保留目标选择。下一次前台操作须重新显式聚焦，自动预览不恢复接管。交还只恢复仍停留在接管工作区的用户视图，并在控制器执行队列中复核会话归属；同一会话转去操作浏览器也会归还此前的原生窗口。取消终止输入子进程并释放持有输入；释放失败明确报告，不能显示为成功交还。Wayland 使用 xdg-desktop-portal 的 RemoteDesktop／ScreenCast 和 PipeWire；在“电脑与浏览器”设置中点击“选择共享桌面”，由系统选择单个显示器并授权本次键鼠输入，不请求永久权限。依赖系统 `python3-gi`、GStreamer introspection／PipeWire／PNG 插件和 `libxkbcommon`；缺失时明确报错。支持共享显示器真实截图、逻辑／像素坐标换算、键鼠／Unicode 输入；提供 AT-SPI 和有效桌面坐标时也可绑定应用。截图范围明确为共享显示器，不冒充应用独占截图。会话撤权／退出关闭 portal 和媒体流，取消释放输入；Wayland 不提供全局人工活动通知。Windows 只读输入 hook／Linux XInput2 人工活动监听已接入，分别排除本 helper 标记的输入／XTEST 事件；只保存活动种类、时间与序号，不记录文本，不强制接管。监听依赖或权限不足时观察明确报告不可用。

### 后台操作

选择目标与聚焦分离：`select`／`getApp`／`getTab` 不激活窗口或标签；只有显式 `focus`／`activate` 改变前台。输入默认 `inputMode: 'background'`，后台不可用时不自动降级为全局键鼠。目标的 `control` 字段（JavaScript 目标通过 `capabilities.control()`）说明路由和限制；`delivery` 仅说明提交方式，`effectVerified: false` 要求后续观察，不能当作界面变化已成功。

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

[运行时说明](<src/dsh/computer-docs.mjs>)统一拥有 `computer_use` 主入口及 `core`／`browser`／`native` 文档。首次使用或重置后的第一个调用仅执行一个入口，可将返回值绑定到变量；读取返回文档和状态后，再决定下一步操作，不在该次调用中追加其他 API、等待或观察。首次自动显示基础文档，绑定应用或标签时显示对应文档及初始 AX；`getBrowser` 仅绑定浏览器并显示文档，不创建或选择标签，也不返回初始 AX。绑定和输入默认后台，不绕过目标保护或隐式回退全局键鼠。上下文压缩后调用 `cua.rewriteDocumentation()` 恢复文档与全量基线，不重置绑定。

AX 默认返回紧凑语义文本，保留元素身份、层级、值、状态和动作；`details:true` 获取完整节点与几何。身份稳定且基线完整时返回差分，`disableDiffing:true` 强制全量；截图、静默观察、目标切换、截断或失效基线会恢复全量。截图返回附件引用。内置 guest 的透明捕获在可信 surface 中按页面深浅方案补齐默认 Canvas 背景，保留显式背景及原始尺寸，不修改网页。观察自动输出一次，`emit:false` 仅供代码读取。

浏览器 AX 观察合并 Chromium 实际公开的同源、跨源和跨进程子框架，按框架及文档身份保存元素与层级；网页为 iframe 指定其他 ARIA 角色仍可读取其可访问内容，隐藏框架不额外公开控件。三种浏览器后端共用采集与路由，完整观察和身份复核成功后才发布新节点表。子框架导航、替换或移除后，旧元素会在输入前被拒绝，应在同一标签重新观察并使用新 ID；不能按节点数字或框架标题匹配新文档。

浏览器支持 `tab.playwright` 的角色／文本／标签／placeholder／testId／CSS 定位、过滤、顺序选择、读取及常见输入，以及 `domSnapshot()`；定位器每次按当前文档解析，保留各后端的后台输入和释放路径。支持嵌套 frame（含跨源／OOPIF）、开放 shadow DOM，以及文本／名称／标签等位置的 RegExp。定位器按 timeoutMs 自动等待目标和可操作状态，提供 waitFor 的 visible／hidden／attached／detached 状态；只有确定尚未发送输入的失败才重试，已派发或结果不明的输入不会重放。默认 domSnapshot 按真实 frame session 递归展开可见子 frame，maxNodes／maxChars 由整份快照共享，提交前复核完整 frame owner 拓扑；显式 frameLocator(...).domSnapshot() 从所选 frame 起递归其可见子 frame，不包含根页。定位解析保持同步，点击稳定等待由 CDP 宿主计时并复核同一元素、盒模型及可操作状态；再次滚动后等待目标及父 frame 布局稳定，光标移动后在实际按下前重新核验位置和命中，不对移动后的旧坐标盲点；无脚本 sandbox frame 不依赖页面定时器，也不放宽 sandbox／CSP 或执行网页内联脚本。内置 guest 文本输入在嵌入视图重入后恢复原目标子 frame 的焦点，避免把子 frame 中文丢到主文档；Chrome 扩展对不透明沙盒的 `Not allowed` 限制仍如实返回，不绕过。fill 支持文本、textarea、contenteditable 与 number 控件；number 接受有限数字字符串或空值清空，非法数字在派发前拒绝，保留只读／禁用保护。角色名称忽略 aria-hidden 与视觉隐藏的后代提示，保留显式 aria-labelledby 隐藏引用；原生 label 的名称不混入被标注控件自身的选项或默认正文，文本读取仍返回原正文。内置浏览器的 automation／父子表面 RPC 以结构化信封跨越 Electron IPC 和 contextBridge，在页面侧还原错误码与输入派发状态；主／子 preload 必须声明 `structuredErrors`，旧宿主明确拒绝。旧接口保留，导航增加 `goto`，输入增加 `typeText`，拖动支持起止坐标。定位器还支持候选相对的 `filter({has,hasNot})`、同目标同 frame 的 `and`／`or` 和即时 `all()`；`or` 按文档顺序去重，`all()` 只固定返回的 nth 列表长度。`type(text,{timeoutMs})`／`pressSequentially(text,{timeoutMs})` 在当前选择处追加，后者对 ASCII（含标点／回车）发送真实按键，其他 Unicode 逐 code point 走真实文本插入，不提供 delay。匹配的内置宿主与独立浏览器提供 `playwright.expectNavigation(action,{timeoutMs,url,waitUntil})`、`waitForURL(url,{timeoutMs,waitUntil})`、`waitForLoadState({state,timeoutMs})`（兼容 state,options）；导航状态来自只读固定查询，按文档 occurrence、URL 和 readyState 判断新导航或已有状态，支持 commit／domcontentloaded／load，拒绝 networkidle。URL 为精确字符串或 RegExp；action 只调用一次，等待超时保留绑定，不重放已派发输入。`playwright.waitForEvent('download',{timeoutMs})` 必须在同一 cell 内先取 promise 再触发、最后 await，或用按此顺序的 Promise.all；预先排队获取持久历史及目标实际捕获的下载游标，在触发前的控制器串行槽内固定旧 ID，异步历史读取中出现的本次新 ID 不加入旧记录；排除未同步的旧 ID／开始时间及其他目标，只在新下载完成、文件校验和附件生成后返回。独立浏览器以 targetId 归属，内置宿主在真实 DownloadItem 捕获时记录来源 WebContents，读取绑定 guest 的同一 ID 后匹配；旧宿主明确拒绝，扩展仅有浏览器级归属也明确拒绝。返回 handle 的 file 为实际附件，path() 返回 null，不公开内部存储路径；全局 downloads.list 保留原历史用途。方法等待完整登记为当前 cell 的 pending 工作，超时／取消后清除轮询，不留下后续派发。capabilities.list 和 control().waits 公布实际支持及边界，新标签继续由 tabs.list 的实时清单辨认并按 ID 绑定。

[模型结果投影](<src/dsh/model-output.mjs>)不改控制器或 UI 保存的原始状态：默认摘要化历史目标、观察与批注，保留实时库存、控制失败、所选目标能力和观察身份；`opencu_state({includeHistory:true})` 可读取完整历史。模型侧保留全部可操作节点的语义信息，去除重复文本；完整节点、几何和后端原始属性可通过 details:true 读取。只请求截图时不夹带 AX。截图附件仍按附件 ID 去重。旧会话内容不改写，本改动不会自动消除已进入上下文的历史冗余。

## REA 前端

**现状**

- 只使用真实 REA 原件；原件、SHA-256 与来源见 [provenance.json](src/client/rea/provenance.json)。适配层只接数据与宿主协议，不另绘控件、控制台、截图伪网页或浮窗壳。
- 已接入：浏览器面板（地址建议、查找、批注／调整、Tweaks、复制标签与历史分支、历史／下载／站点权限／扩展管理）、来源面板、CU 工具卡、应用访问与系统权限请求卡、同页导航的“电脑与浏览器”设置、图片查看与 Markup、XLSX／PPTX／DOCX 预览与保存、监看菜单／侧栏停靠／浮窗、同内容窗口迁移。
- 监看：关闭只分“隐藏画面”与“隐藏任务”，工具继续运行；“显示已关闭的预览”恢复全部隐藏来源（含侧栏退让）。每个会话默认显示最近 5 个目标，其余可展开；画面加载失败按退避自动重试，超过次数后可手动重试。切会话只撤下显示，不记为主动关闭。
- 样式表每个文档只解析一次，由所有 shadow root 共享。Shiki 语法与主题、wasm、DOCX 预览经 `/api/opencu/rea-assets/` 按需加载，网页批注脚本首次使用时经 `/api/opencu/page-annotations.js` 获取。
- 轮询按需运行：没有任务和画面时预览不轮询，窗口隐藏时降频；应用访问请求随核心事件流更新。
- `lib/` 是构建产物，不进 Git；`npm run build` 重新生成，CI 用 `scripts/check-generated-client.mjs` 核对重建字节一致。只产出经典 `lib/client.js`，需要 ES 工厂的宿主在打包时自行派生。

**边界**

- 新增桌面能力须在匹配宿主源码上应用 `host/` 补丁，并重建 Host、Client 与两个浏览器 preload：`presentationHitRegions`（监看穿透）、`initialNavigation`（复制标签历史）、`structuredErrors`（自动化错误信封）、`backgroundInput`（后台输入）。旧宿主明确拒绝，不随插件自动更新。
- Cookie／站点存储清理当前只支持“所有时间”；下载清理只移除记录，不删除已交付文件。
- 内容寻址的 DSH 原附件只读，可另存到普通目录；预览读取最多 256 MiB，超限拒绝而不截断。
- 浏览器未提供原生 WebMCP 时，Site tools 明确报告不可用；不透明沙盒 frame 的限制如实返回，不绕过。

## 构建和本地插件包

默认源码及根 `package-lock.json` 精确锁定 rc.2，标准源码安装入口为 `npm ci`。发布构建使用独立 SDK、独立 staging 和真实 REA 编译。实际 SDK 清单、完整 pnpm 锁与必要 workspace overrides 固定在 `host/build-inputs/{rc1,021rc2}/`；这些 SDK 输入保留原构建使用的字节，两个宿主均使用 Electron `44.7.0`。REA 的独立清单与完整锁固定在 `host/build-inputs/frontend/`。

`scripts/build-targets.mjs` 从公开输入创建本地 SDK 和前端工作目录，始终使用 `--frozen-lockfile --ignore-scripts`，缺锁、清单不匹配或输入 SHA-256 不匹配即失败，不自动重新解析。构建前还核对安装后的完整解析锁和全部实际 DSH 包版本，拒绝混入另一宿主版本。固定输入的 SHA-256 见 `host/build-inputs/manifest.json`；包内 `lib/host-build.json` 与输出目录 `build.json` 保存所用输入哈希、实际 DSH 包清单与安装解析锁哈希，可直接对照公开源码。

```sh
# NODE 为 Node >=22.19，PNPM 为 pnpm 11.28.5 的 pnpm.mjs 入口。
OPENCU_PNPM="$PNPM" "$NODE" scripts/build-targets.mjs
```

默认构建 `rc1` 与 `021rc2` 两个宿主，也可在命令末尾只指定其中一项。

本地复核可设置 `OPENCU_BUILD_ROOT` 和 `OPENCU_PACKAGE_OUT` 指向独立构建与输出目录，保留既有发行工件。

需要 rc.1 源码变体时，在单独源码 checkout 中执行以下命令；该入口同步宿主清单、完整 npm 根解析图、客户端目标与扩展包版本。rc.1 根 npm 锁针对其声明重新生成，与发布构建的 SDK pnpm 锁分别保存；只替换根版本字段不能得到有效变体。恢复 rc.2 时使用 `021rc2`。

```sh
"$NODE" scripts/prepare-host-source.mjs rc1 .
npm ci
```

输出为工作区 `builds/opencu/<target>/opencu-<version>.tgz`，各宿主分别打包，不混装。每份包包含共用完整 core/native/browser/extension、独立重建的 REA client、真实 macOS arm64 helper 和宿主补丁；不会捆绑 SDK、node_modules、研究原件或用户数据。打包入口通过 `scripts/native-package-modes.mjs` 恢复 npm/pnpm 归一化移除的 helper 执行位；不改签名或二进制字节，实际解包后必须可执行。

桌面宿主必须在主代理拥有的匹配源码副本执行 `"$NODE" opencu/host/apply.mjs /absolute/owned/dsh-source`。补丁验证目标版本／框架，预检所有修改，拒绝只读 source cache 和安装目录；新增能力只属于显式 OpenCU lease，普通 DSH guest 权限／下载／导航策略保持原样。然后在该宿主副本安装 `electron-chrome-extensions@4.9.0`，更新自己的锁，重建受影响 Host、Client、Web、desktop main 和对应 sandboxed preloads（含 browser surface preload），再按宿主流程打包。不能只装插件或重建 desktop main：通用 accessory 槽及浏览器桥也需要相应 Client 和 preload 工件。

打包前运行 `node scripts/check-desktop-build.mjs /absolute/extracted/app`，用当前客户端兼容检查核验实际主窗口及浏览子窗口 preload；缺少能力时拒绝打包。此检查只核验编译后的桥接接口，宿主操作及前端启动仍须用匹配安装包定点验证。


包只带有效 Host 核心／后端、浏览器扩展、必要 native 来源／helper 和说明。REA 研究原件留在仓库，不把整份研究材料、开发依赖、隔离数据、token、Node 或浏览器塞进发行包。`npm test` 在构建后运行全部回归，与 CI 相同；真实隔离 DSH smoke 可选执行：

```sh
OPENCU_DSH_SMOKE=1 node --test test/dsh.test.mjs
```

该检查通过真实 DSH profile launcher、ToolRuntime 和 LocalAttachmentStore 调用插件；不连接预先启动的 OpenCU 服务，不修改当前工作 DSH。本仓库不执行公开发布或日常部署。

源码 checkout 还可用 `scripts/cu-direct.mjs` 直接调用生产 runtime 和持久 Worker REPL。先安装开发依赖并运行 `npm run build:client`，再显式指定隔离数据和附件目录；默认只启用独立无头浏览器，应用许可不会自动批准。该开发入口不启动 DSH 页面，不覆盖宿主工具调度、附件规范化或浮窗交互验证。

```sh
node scripts/cu-direct.mjs --data-dir /absolute/isolated/cu/data --output-dir /absolute/isolated/cu/output --metrics-output /absolute/isolated/cu/calls.jsonl
```

标准输入每行一个 JSON，例如 `{"id":"inventory","code":"await cua.getState()","title":"Inspect targets"}`；后续行复用同一 REPL。`method` 可取 `run`（默认）、`request`、`reset`、`readImage`、`close`。脚本也导出 `createDirectSession(options)`，返回 `pid` 与同名异步方法；`run` 保留生产结果并附 `timing.totalMs`。缺少浏览器构建资产时提前返回 `BUILD_REQUIRED`；指标写入失败单独报告 `metricsError`，成功输入不会因此变成执行失败。正常结束必须调用 `close()`，取消或失败后应先观察状态，再决定是否继续。

`scripts/cu-metrics.mjs` 可独立采样指定进程树：`node scripts/cu-metrics.mjs sample --root PID --output /absolute/isolated/cu/process.jsonl --summary /absolute/isolated/cu/summary.json --interval 500 --duration 30000`。记录 RSS、进程数、系统平滑 CPU、连续快照间实际观察到的 CPU 时间差、阶段与采样错误；调用记录只保留固定标签、耗时、字节数和状态，不保存代码、标题或正文。RSS 可能重复计入共享页；CPU 差值会遗漏新生、退出及采样间短命进程，不能据此比较不同宿主的 CU 独占开销。汇总的峰值、计数和总和精确，中位数在超过 1,024 个值后由固定容量样本估算；原始采样仍写入 JSONL。SIGINT／SIGTERM 只停止采样器并刷新汇总，不终止测量目标。

隔离发行目录通过 `OPENCU_SOURCE_ROOT` 指向真实源码目录；文档检查从该目录读取 Git 清单，并核对当前构建目录的文档内容。
