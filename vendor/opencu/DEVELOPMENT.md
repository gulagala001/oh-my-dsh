# OpenCU

OpenCU 是 DSH 插件：新控制核心、浏览器／原生／扩展后端配合真实 REA 前端组件。AI 像使用其他工具一样调用电脑；页面、活动和监看自然呈现，没有单独的 CU 控制台。

源码默认适配 DSH `0.2.2-rc.3`。`rc1`、`021rc2`、`021rc3` 分别使用精确匹配的 SDK、冻结依赖锁与宿主适配器；每份包只用于自己的完整宿主版本。

## 加载

各宿主分别精确匹配 SDK 与框架：DSH `0.2.1-rc.1`／`0.2.1-rc.2`／`0.2.2-rc.3` 均使用 Cordis `4.1.0`／Schemastery `3.19.0`。插件包根入口和 `opencu/dsh` 均为 Cordis Host 插件，依赖宿主真实 `tools` 和 `attachments` 服务。不需要另开 OpenCU 服务，也不接受外部 origin/token。由 DSH profile 加载：

```yaml
- insert:
    - id: opencu
      name: opencu/dsh
      config:
        dataDir: /absolute/path/to/opencu-data
```

独立插件默认注册工具，普通会话无需额外启用 CU；集成方如需限定工具作用域，可设置 `registerTools: false` 并调用 `installTools`。第一次调用懒启动同一 controller 与所需后端。浏览器进程由插件拥有，原生 helper 由后端托管；有输入责任的工具取消使用 interrupt 并等待真实释放；只有明确停止使用 stop。插件停用／DSH profile 退出调用 close 并等待释放和关闭，失败保留 controller 状态并报错，不清空失败冒充成功。原生 helper 缺失或权限未获批，会报告真实后端警告或错误。

目标发现独立于输入队列，单个只读请求取消不会等待其他会话的输入或查询，也不会释放它们持有的输入。等待共享初始化／重配置的调用可以取消自己的等待；共享运行时仍由插件管理，其他会话继续使用。明确停止记录来源、所属会话和时间，自动清理不覆盖该记录；旧状态没有来源时不推断。工具错误提供去重、限量的逐目标释放障碍，完整明细保留在状态中。

排队中的观察也能取消，取消后不会迟到执行。原生目标发现、核验、观察与权限读取的超时仅结束该次只读请求，迟到回执丢弃，不关闭 helper 或释放其他操作的键鼠；真实输入回执丢失、协议损坏、进程退出仍执行原有失败隔离和释放流程。

rc.5 宿主适配同时修正 Desktop Office 初始化和工具取消：Office 子插件在同一同步阶段注册，再统一等待各自依赖；宿主退出后不继续注册或发送就绪。工具直接抛出调用方取消原因时返回标准取消标记，其他异常保持原样。`host/apply.mjs` 将修正应用到匹配源码，需重建 `dsh-desktop-host` 与 `dsh-tools`；仅更新插件不会替换宿主内的这两项代码。

桌面欢迎页复用同一 Host 已签发给桌面壳的 Cookie，不依赖另一个 Cookie 存储重复认证。原生 HTTP 请求限制为该 Host 的同一来源并拒绝重定向，账号及设置仍走原有 RPC 和权限校验。该修正还需重建桌面主进程。

数据目录优先使用 config.dataDir，其次 DSH_HOME/opencu，最后 ~/.opencu；现有数据不迁移或删除。core 使用持久目录锁，下载／批注／控制恢复状态继续保存。

浏览器控制权与故障按实际目标身份隔离。单页操作、选择或新建失败只隔离相应目标，保留其他已核验页面的控制权；不会重放已派发或结果不明的动作。成功释放和部分成功中的逐目标回执持久化，下一次派发前撤销；只读调用和明确未派发的拒绝不会制造新的释放责任。缺少释放回执的历史浏览器目标保留隔离；浏览器与原生应用统一按实际输入范围恢复，旧断连浏览器不再阻塞正常原生应用。原生恢复先确认共享硬件输入释放，冷启动显式打开新应用也走同一路径，无需先绑定另一个应用。共享原生键鼠释放失败仍阻止控制，不能用浏览器恢复绕过。

控制器区分明确停止与生命周期中断：超时、取消、重置和有输入责任的会话清理使用 interrupt，不写入 explicitlyStopped；空闲重置、纯 JavaScript 超时和只读超时不停止共享控制器。已存在的用户停止不会被自动清理解除。恢复统一核验实际目标及释放回执：cua.resume(targetId) 恢复目标，cua.resume({browserId}) 恢复一个已连接浏览器，即使没有标签也可随后新建；该调用自身不新建、不聚焦、不删除旧责任。恢复成功将精确释放的目标回执传给 Worker 与 REPL，仅清除对应的持键和不确定输入责任；其他目标的持键与不确定输入仍保持；明确继续并完成隔离恢复后，旧全局停止重试交还控制器持久隔离，不再由空闲会话反复中断全局。未完成恢复的停止仍保持并重试。未派发输入的恢复失败不会创建新会话的清理责任，已恢复目标不会因空闲重置或会话切换再次触发全局中断。明确停止后仅在用户请求继续时恢复。设置中确认关闭旧连接成功后回到可恢复状态，失败仍保留原责任。回归见 test/recovery-isolation.test.mjs、test/computer-pending-calls.test.mjs 和 test/control-recovery.test.mjs，由现有 npm test 执行。

内置浏览器下载以桌面 DownloadItem 的回执维护进度和最终结果；实时同步与冷恢复共用校验、版本选择和文件检查。完成、失败、取消及历史移除不会被迟到进度覆盖，相同回执不重复写索引。桌面 `updatedAtMs` 在同一下载内单调递增，保持暂停／继续的先后；旧桥接相同毫秒的进度仍按接收顺序兼容。冷启动暂未得到宿主确认的活动下载显示不可操作，原进度原样保留，不把推断写成永久失败；后续真实回执可以恢复显示。旧版已保存的这类推断按原错误标识读取兼容。

完成状态与文件可用性分开：文件缺失、大小改变或无法访问时保留历史和具体文件错误，不阻断其他下载。首次确认文件时计算 SHA256，未能确认的文件须在匹配的完成回执下补验；实际附件交付继续校验摘要。历史清理保留文件和移除标记，损坏索引与真实写盘错误继续明确失败。下载状态检查见 `test/sidebar-downloads.test.mjs`，桌面事件与时钟检查见 `test/sidebar-download-host.test.mjs`，均由现有 `npm test` 执行。

目标选择、动作派发、返回目标校验与控制状态保存使用同一故障收尾边界；派发后的校验或保存失败会阻止后续输入并尝试真实释放。释放失败优先报告 `RELEASE_FAILED`，保留具体目标和诊断；浏览器故障保留健康目标，原生共享输入故障仍使用全局收尾。普通故障清理保留 JavaScript 对话框，显式停止或退出可关闭对话框。

持久 JavaScript 目标句柄保留绑定时的独立身份；公开的 `id`／`target` 描述和动作参数不能改变绑定。观察、操作与聚焦均携带原身份，宿主先核验再进入授权／执行流程；目标 ID 被复用时返回 `TARGET_IDENTITY_CHANGED`，需重新发现并显式绑定，不重放结果不明的输入。只有控制器已核验的动作返回目标可更新句柄身份；转到新目标时同时清除原目标的观察与截图基线。

JavaScript 单元无论成功还是抛错，都等已发出的后端请求收尾后再返回；并发调用中一个失败不会让其他请求脱离单元的执行时限。普通错误保留持久绑定和原错误，已完成的动作不回滚；原生工具及 PTC 的错误文本保留错误码、控制状态和可执行的恢复提示，完整诊断仍在错误对象中；请求卡住或用户取消时，由 Host 终止 worker 并等待真实输入释放，释放失败保留恢复状态并优先报告。每次 API 调用仍须 `await`，此收尾机制不会重放输入。

单元结束不代表输入责任已经结束。Host 与 REPL 共用释放记账，除显式持键／持鼠外，也保留普通动作返回的 `RELEASE_FAILED`、停止失败，以及输入已派发后被 JavaScript 对话框打断的责任。关闭空闲会话仍须重试实际释放；失败保留重试入口，不报告清理成功。明确停止收到成功回执后清空责任，对话框处理只清除对应目标；已确认释放的空闲会话退出不额外停止其他输入任务。

目标发现及选择／恢复内部的只读库存等待可被取消，不占住停止和退出的输入释放队列。调用方单独取消库存读取只结束该读取；停止、超时和退出仍等待实际释放回执，失败继续报告 `RELEASE_FAILED`。停止后可重新发现目标，但发现不会恢复控制；迟到库存不得继续选择、查询后续提供方或覆盖诊断，恢复仍核验原目标身份。此机制不提前返回已派发的输入或有副作用的选择／释放操作。

Chrome／Edge 扩展沿用同一只读取消边界，覆盖清单、选择与输入前身份检查、聚焦检查和导航后的页面读取。Host 将操作取消信号传至扩展，选择、聚焦与动作共用取消释放回执处理；明确停止后仍可单独聚焦，再次停止能取消这次聚焦。释放会中断占用串行控制队列的读取，并拒绝取消前排队的控制命令，避免旧清单再次挡住释放；其他标签的独立监看继续运行。调试器附着、建页、聚焦和输入派发仍等待真实回执，取消后不再继续后续副作用；已创建的标签保留并报告，迟到读取不重新附着目标或恢复输入。

内置浏览器的绑定记住实际 renderer 连接；每次连接的 `connectionId` 校验库存、会话、轮询与结果消息，旧连接的释放回执只能清理自身责任，不影响替代连接。断连不等于输入已释放，重连后须重选原目标，旧操作不会重放。客户端释放失败时保留 guest 供重试，释放未确认前不接受重连输入。若原窗口或标签已关闭且不能重连，可在“电脑与浏览器”设置中检查旧连接，并在确认原目标已关闭后清除引用；该操作不会恢复任务或自动重试输入。

监看与工具输入使用独立通道，捕获按目标合并；帧等待超过 12 秒返回监看错误，不改工具目标、不设置输入释放失败。原生和扩展的监看超时只结束对应请求，不断开输入连接；隐藏窗口的动画帧等待设有上限。关闭控制器先释放输入，再由后端清理捕获，不无限等待监看帧。

Chrome / Edge 扩展的 loopback bridge 由插件自动管理，监听本机 19390–19399 的首个可用端口，只服务扩展协议，不承载另一套网页或控制核心。扩展仅首次安装；AI 首次使用时自动弹「允许连接此浏览器？」窗口，单击「允许并记住」，不再复制连接信息。配对身份与凭据分别保存在私有数据目录和浏览器 local storage；固定扩展 ID，正常浏览器／DSH／电脑重启和保留身份、数据的更新后自动恢复。断开先取消并确认释放输入，然后暂停自动连接；撤销配对后需要重新允许。每次重连创建新 epoch，旧目标必须重新发现，不重放旧输入。多浏览器 profile 明确选择，不擅自连接全部。

浏览器资源使用 Playwright 的共享缓存，不捆绑 Node、Chromium 或独立应用。宿主使用 Node >=24.9.0。缺少 Chromium 时，可从 DSH 的“电脑与浏览器”设置安装匹配的 Playwright 浏览器资源；由插件管理安装进程，关闭时终止尚未完成的安装。

需要隔离检查页面渲染、WebGL 或截图时，可从 `opencu/browser` 导入 `withIsolatedBrowser(check, options)`。`check` 接收 `{ context, signal }`，可使用完整 Playwright 页面 API；把相关检查放在同一回调中复用浏览器。`options` 支持临时目录父路径 `directory`、`launchOptions`、检查时限 `timeoutMs` 和取消 `signal`。入口创建独立临时资料目录，保留 `--use-mock-keychain`／`--password-store=basic`，并在成功、抛错、检查超时或取消后关闭自己的浏览器及删除临时目录；自定义参数与默认参数过滤不会移除凭据隔离。CDP 和外部传入的浏览器上下文保持原有凭据与生命周期。直接启动 Chromium 时，独立资料目录与这两个隔离参数须同时保留，无头模式本身不隔离钥匙串。

## 能力与接口

工具接口、后台操作、模型输出和前端组件的行为见[技术参考](docs/technical-reference.md)。Chrome／Edge 扩展和原生后端的协议分别见 [extension/README.md](extension/README.md) 和 [native/README.md](native/README.md)。

## 构建和本地插件包

默认源码及根 `package-lock.json` 精确锁定 rc.2，先运行 `node scripts/prepare-host-sdk.mjs` 准备官方标签对应的 SDK，再运行 `npm ci`。发布构建使用独立 SDK、独立 staging 和真实 REA 编译。实际 SDK 清单、完整 pnpm 锁与必要 workspace overrides 固定在 `host/build-inputs/{rc1,021rc2}/`；这些 SDK 输入保留原构建使用的字节，两个宿主均使用 Electron `44.7.0`。REA 的独立清单与完整锁固定在 `host/build-inputs/frontend/`。

`scripts/build-targets.mjs` 从公开输入创建本地 SDK 和前端工作目录，始终使用 `--frozen-lockfile --ignore-scripts`，缺锁、清单不匹配或输入 SHA-256 不匹配即失败，不自动重新解析。构建前还核对安装后的完整解析锁和全部实际 DSH 包版本，拒绝混入另一宿主版本。固定输入的 SHA-256 见 `host/build-inputs/manifest.json`；包内 `lib/host-build.json` 与输出目录 `build.json` 保存所用输入哈希、实际 DSH 包清单与安装解析锁哈希，可直接对照公开源码。

```sh
# NODE 为 Node >=24.9.0，PNPM 为 pnpm 11.28.5 的 pnpm.mjs 入口。
OPENCU_PNPM="$PNPM" "$NODE" scripts/build-targets.mjs
```

默认构建 `rc1` 与 `021rc2` 两个宿主，也可在命令末尾只指定其中一项。

本地复核可设置 `OPENCU_BUILD_ROOT` 和 `OPENCU_PACKAGE_OUT` 指向独立构建与输出目录，保留既有发行工件。

需要 rc.1 源码变体时，在单独源码 checkout 中执行以下命令；该入口同步宿主清单、完整 npm 根解析图、客户端目标与扩展包版本。rc.1 根 npm 锁针对其声明重新生成，与发布构建的 SDK pnpm 锁分别保存；只替换根版本字段不能得到有效变体。恢复 rc.2 时使用 `021rc2`。

```sh
"$NODE" scripts/prepare-host-source.mjs rc1 .
node scripts/prepare-host-sdk.mjs
npm ci
```

输出为工作区 `builds/opencu/<target>/opencu-<version>.tgz`，各宿主分别打包，不混装。每份包包含共用完整 core/native/browser/extension、独立重建的 REA client、真实 macOS arm64 helper 和宿主补丁；不会捆绑 SDK、node_modules、研究原件或用户数据。打包入口通过 `scripts/native-package-modes.mjs` 恢复 npm/pnpm 归一化移除的 helper 执行位；不改签名或二进制字节，实际解包后必须可执行。

桌面宿主必须在主代理拥有的匹配源码副本执行 `"$NODE" opencu/host/apply.mjs /absolute/owned/dsh-source`。补丁验证目标版本／框架，预检所有修改，拒绝只读 source cache 和安装目录；新增能力只属于显式 OpenCU lease，普通 DSH guest 权限／下载／导航策略保持原样。然后在该宿主副本安装 `electron-chrome-extensions@4.9.0`，更新自己的锁，重建受影响 Host、Client、Web、desktop main 和对应 sandboxed preloads（含 browser surface preload），再按宿主流程打包。不能只装插件或重建 desktop main：通用 accessory 槽及浏览器桥也需要相应 Client 和 preload 工件。

macOS rc.5 的宿主适配还接入 `host/native-runtime.mjs` 和 `host/check-native-runtime.mjs`：在运行时目录生成清单、封装 ASAR 和签名前，隔离 Koffi 的原生符号，修正 node-pty 助手的路径与权限检查，将 Office 原生引擎解析到实际解包目录，并恢复 Mach-O 可执行文件的执行位。正常桌面构建自动执行；重新封装已有 ASAR 时，必须在自己的解包目录手动运行 `node host/native-runtime.mjs /absolute/extracted/app/dsh`，再运行 `node host/check-native-runtime.mjs /absolute/extracted/app/dsh`。后者在独立进程实际验证四种 Koffi 加载入口、终端读写／缩放／退出和原生失败路径。保留已有 unpacked 文件的权限；ASAR 头部没有完整记录它们的执行位，单独比较文件字节不能证明可执行。运行时修复不改原生二进制字节，随后仍须完成原有签名与包完整性校验。

打包前运行 `node scripts/check-desktop-build.mjs /absolute/extracted/app`，核验实际主窗口及浏览子窗口 preload，并检查 macOS rc.5 原生运行时已完成上述准备；缺少能力、助手执行位或原生加载修正时拒绝打包。封装后的真实宿主仍须定点验证终端启动、错误返回及受影响原生程序。


包只带有效 Host 核心／后端、浏览器扩展、必要 native 来源／helper 和说明。REA 研究原件留在仓库，不把整份研究材料、开发依赖、隔离数据、token、Node 或浏览器塞进发行包。`npm test` 在构建后执行源码登记检查和现有全部 `test/*.test.mjs`；CI 使用下述 `cu:verify -- --profile full` 统一执行生成场景、全部测试与真实 Chromium，不再另跑一次 `npm test`。单独运行真实隔离 DSH smoke：

```sh
OPENCU_DSH_SMOKE=1 node --test test/dsh.test.mjs
```

该检查通过真实 DSH profile launcher、ToolRuntime 和 LocalAttachmentStore 调用插件；不连接预先启动的 OpenCU 服务，不修改当前工作 DSH。本仓库不执行公开发布或日常部署。

### CU／BU 故障验证

长期入口为 `scripts/cu-liveness.mjs`。先在源码 checkout 安装冻结依赖、生成当前客户端产物，并安装匹配的 Playwright Chromium；验证机消费这些产物，不替代构建。已完成当前产物构建时无需重复构建。

```sh
node scripts/prepare-host-sdk.mjs
npm ci
npm run build
npx playwright install chromium
npm run cu:check
npm run cu:verify
```

`cu:verify` 默认选择 `full`，自动启用真实隔离 DSH smoke。SDK 从显式 `OPENCU_DSH_INSTALL`、本地 `.local/cu-dsh-sdk`、当前包或相邻 OMD 安装锚点发现，版本必须与包声明精确一致；缺少 SDK 时报告未完成。独立环境可运行 `npm install --prefix .local/cu-dsh-sdk --no-audit --no-fund --save-exact @deepseek-ai/dsh@0.2.2-rc.3 @deepseek-ai/dsh-attachment-local@0.2.2-rc.3 @deepseek-ai/dsh-system-prompt@0.2.2-rc.3 @deepseek-ai/dsh-tools@0.2.2-rc.3` 准备。`node scripts/cu-liveness.mjs help` 可查看命令入口。Linux CI 使用 `npx playwright install --with-deps chromium`；现有构建／归档及产物一致性检查保持，随后执行一次 `npm run cu:verify -- --profile full`。`cu:check` 已接入 `pretest` 与 `prepack`，打包时仍执行原文档、扩展分发和公开文件门禁；不会在打包前自动运行完整验证机。宿主变体 staging 通过 `OPENCU_SOURCE_ROOT` 指向原源码，`check` 据此核对原源码登记，避免把有意生成的宿主变体误认为未经审查的源码修改。

| 命令或范围 | 实际执行内容 |
| --- | --- |
| `npm run cu:check` | 核对受管源码、等待点、契约和适配测试登记；源码摘要或登记漂移即失败，不启动浏览器 |
| `node scripts/cu-liveness.mjs catalog` | 查看当前源码登记统计；审查修改的归属、等待、取消、释放及迟到续体后，用 `catalog --write` 原位更新登记 |
| `node scripts/cu-liveness.mjs list` | 列出生成场景与不变量，取得可供 `--case` 使用的准确 ID |
| `npm run cu:verify -- --profile matrix` | 执行状态模型生成的有限因果场景及故障交错 |
| `npm run cu:verify -- --profile adapters` | 执行已登记契约对应的现有适配测试 |
| `npm run cu:verify -- --profile browser` | 用隔离的真实 Chromium 执行后端、runtime 和 Worker 的连续交互 |
| `npm run cu:verify -- --profile full` | 生成场景、全部现有 `test/*.test.mjs` 各一次（含真实 DSH 和本机原生检查），以及真实 Chromium |

生成场景覆盖取消、排队、超时、断连、代次更换、重复／迟到回执、输入释放、审批等待、故障恢复、重置及下一会话等已登记关系。`--seed N` 固定场景执行顺序；`--case ID` 只执行该生成场景，不顺带执行适配测试和 Chromium。`--timeout-ms N` 设置单个生成场景的外部监督时限；增大时限不能把死等、未释放输入或错误回执视为通过。

`check` 是源码等待点登记的漂移门禁，不是动态分支全覆盖或所有执行序列的证明。更新 `catalog --write` 只是记录已审查源码；需用受影响动态范围验证修复，不能为了通过检查直接刷新摘要。有限模型和真实浏览器结果也不证明任意网页、应用、驱动或操作系统永无错误。

每轮仅在本 checkout 的 `.local/cu-liveness/run-*` 保存结果：`input.json` 记录执行范围、seed 与源码身份，`summary.json` 汇总真实结果，适配测试输出保存在该轮报告内。生成场景的失败文件位于 `failures/*.json`，保存准确场景与故障回执，可单独重放：

```sh
npm run cu:replay -- --replay .local/cu-liveness/run-EXAMPLE/failures/CASE.json
# 修复源码并完成登记复核后，显式允许使用新源码检验原来的同一场景。
npm run cu:replay -- --replay .local/cu-liveness/run-EXAMPLE/failures/CASE.json --allow-source-change
```

重放默认拒绝源码身份变化，也拒绝不属于当前场景语法的失败记录；`--allow-source-change` 只放开源码身份比较，不放宽断言或篡改原场景。适配测试与 Chromium 失败按报告中的文件、用例及检查点重新执行相应范围，不能把 `summary.json` 当作生成场景的重放文件。这里重放的是隔离合成输入，不会重放用户任务中结果不明的输入。

退出码 `0` 表示本次指定范围通过；`1` 表示检查或验证失败；`2` 表示验证被取消或未完成。退出后同时检查报告的 `profile`、`complete`、`ok` 和覆盖排除项：窄范围成功不等于 `full` 通过。SIGINT／SIGTERM、外部监督超时、缺失／重复回执、未完成等待或残留子进程均不能记成成功；退出码为零但缺少有效检查回执，也不能算通过。源码或生成产物在验证期间变化会使当前结论失效，应验证最终源码。

验证使用本轮私有源码与生成产物副本、独立数据／附件目录、合成夹具和隔离浏览器 profile；依赖按锁文件复用，依赖本身被外部任意修改不属于副本隔离的保证。外部监督只终止本轮进程组及已识别的后代，完成后删除 scratch，保留失败和汇总回执。报告、日志与临时数据不提交、不打包；不访问日常 DSH 的 profile、真实会话、用户浏览器资料或系统剪贴板，不以重启工作宿主获得通过。

运行器目前依赖 POSIX 进程组及进程清单核验，macOS／Linux 可运行；Windows 尚未接通等价的进程树监督，不能把该平台的运行拒绝记作通过。macOS 全量检查还会编译并打开独立测试窗口，以现有签名助手和已授权的 Accessibility／输入／截图权限验证真实输入、应用侧编辑、窗口变化、活动通知、释放、停止与重启。测试不请求或重置系统权限；缺少权限真实报错，不能跳过记作通过。该窗口短暂取得焦点，测试结束即关闭；应用侧编辑和注入的活动通知不冒充物理键鼠事件识别。Windows／Linux 原生硬件及真实 Electron 宿主仍按受影响平台定点验证，合成后端不等于跨平台硬件矩阵。

测试统计按实际请求的每个文件及完整用例名核对。平台或可选宿主排除必须登记准确文件、用例名和理由，并在报告中列明；已登记的 skip 仍是未验证范围，不能加进通过数。未登记的 skip、TODO、未登记排除却整份测试无有效执行，或缺少文件／最终汇总回执，都会失败。人类活动场景验证的是“信息可被 AI 观察，AI 自行决定后续动作”；只有人类明确停止或停止 LLM 才终止执行，不能靠自动暂停、全局 stop 或削减功能消除场景失败。

### 直接调用与采样

源码 checkout 还可用 `scripts/cu-direct.mjs` 直接调用生产 runtime 和持久 Worker REPL。先安装开发依赖并运行 `npm run build:client`，再显式指定隔离数据和附件目录；默认只启用独立无头浏览器，应用许可不会自动批准。该开发入口不启动 DSH 页面，不覆盖宿主工具调度、附件规范化或浮窗交互验证。

```sh
node scripts/cu-direct.mjs --data-dir /absolute/isolated/cu/data --output-dir /absolute/isolated/cu/output --metrics-output /absolute/isolated/cu/calls.jsonl
```

标准输入每行一个 JSON，例如 `{"id":"inventory","code":"await cua.getState()","title":"Inspect targets"}`；后续行复用同一 REPL。`method` 可取 `run`（默认）、`request`、`reset`、`readImage`、`close`。普通操作按输入顺序执行；`reset`／`close` 可取消正在运行和仍在排队的操作。脚本也导出 `createDirectSession(options)`，返回 `pid` 与同名异步方法；`run` 保留生产结果并附 `timing.totalMs`。缺少已启用浏览器或 macOS 原生后端所需的客户端构建资产时提前返回 `BUILD_REQUIRED`；指标写入失败单独报告 `metricsError`，成功输入不会因此变成执行失败。正常结束必须调用 `close()`，取消或失败后应先观察状态，再决定是否继续。

原生应用可通过 `--config '{"browserEnabled":false,"nativeEnabled":true}'` 启用，仍需已有的原生辅助程序和系统权限。等待应用许可时，外部调用方用 `request('appApprovals/pending')` 查询当前会话的请求，核对应用名称和目标后，再显式调用 `request('appApprovals/respond', {requestId, action: 'accept', persist: 'session'})`；永久允许使用 `persist: 'always'`，拒绝使用 `action: 'decline'`。这两个接口在 stdio 中也可越过正在等待的 `run`，例如 `{"id":"pending","method":"request","endpoint":"appApprovals/pending"}`，再发送 `{"id":"decision","method":"request","endpoint":"appApprovals/respond","args":{"requestId":"查询返回的 id","action":"accept","persist":"session"}}`。入口自动限定当前会话，调用方可省略 `conversationId`，显式传入其他会话会被拒绝；不会自动批准，reset／close／取消后的旧请求不能再批准。其他 `request`（包括 `act`）继续排队。

`scripts/cu-metrics.mjs` 可独立采样指定进程树：`node scripts/cu-metrics.mjs sample --root PID --output /absolute/isolated/cu/process.jsonl --summary /absolute/isolated/cu/summary.json --interval 500 --duration 30000`。记录 RSS、进程数、系统平滑 CPU、连续快照间实际观察到的 CPU 时间差、阶段与采样错误；调用记录只保留固定标签、耗时、字节数和状态，不保存代码、标题或正文。RSS 可能重复计入共享页；CPU 差值会遗漏新生、退出及采样间短命进程，不能据此比较不同宿主的 CU 独占开销。汇总的峰值、计数和总和精确，中位数在超过 1,024 个值后由固定容量样本估算；原始采样仍写入 JSONL。SIGINT／SIGTERM 只停止采样器并刷新汇总，不终止测量目标。

隔离发行目录通过 `OPENCU_SOURCE_ROOT` 指向真实源码目录；文档检查从该目录读取 Git 清单，并核对当前构建目录的文档内容。

### DSH 0.2.2-rc.1 构建输入

`host/build-inputs/022rc1/` 锁定 rc.1 SDK 与 Electron。`source.json` 分别记录原始公开源码提交、官方 rc.1 桌面包及构建提交；七个原始桌面入口重建后必须与该官方包逐字节一致。随后在该独立源码目录执行 `node host/apply.mjs <source> --target 0.2.2-rc.1`，该入口核对 Git 来源、未改动源码和全部原始桌面入口摘要后才应用适配。不能更改旧源码的版本冒充新版来源。

### DSH 0.2.2-rc.3 构建输入

`host/build-inputs/022rc2/` 固定插件依赖。构建命令为 `OPENCU_PNPM="$PNPM" node scripts/build-targets.mjs 022rc2`。SDK 取自官方标签 `dsh-v0.2.2-rc.3` 的提交 `38a6a5c965aa99ab525161efb7cc5cf1fe62fced`，使用上游冻结锁构建。桌面适配保留宿主原有的登录回执，并在打包时检查原生终端和文档转换模块。
