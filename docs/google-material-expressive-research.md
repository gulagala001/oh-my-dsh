# DSH · Google / Android 全新皮肤调研

调研日期：2026-09-20。本文保留调研时的来源和设计基线；实现与使用方式见 [Google Material · 全新布局](google-material-expressive.md)。

目标：从零设计一套覆盖 DSH 整体布局、导航、对话、设置、工作台及各类状态的 Google / Android 风格皮肤。以 Material 3 Expressive 为组件与交互基线，以实际 Gemini 网页补充对话布局参考。新设计独立命名、独立目录，不继承旧 Material 皮肤、DS 的旧设计或另一个会话的 Codex 设计；宿主接口与皮肤加载契约可继续使用。

## 已查阅的一手资料

| 资料 | 用途与核验范围 |
| --- | --- |
| [Material Design 3 官方站](https://m3.material.io/) | 已实看首页。当前站点包含 2026 I/O 更新入口及 M3 Expressive 设计资料。作为全套设计的总入口。 |
| [Google Design：Expressive 设计研究](https://design.google/library/expressive-material-design-google-research) | 已读。用色彩、大小、形状、运动与容器分组突出关键操作；熟悉的操作模式仍需保留。 |
| [Android / Wear OS Expressive 发布介绍](https://blog.google/products-and-platforms/platforms/android/material-3-expressive-android-wearos-launch/) | 已读，2025-05-13 发布。区分 Android 手机和 Wear OS 的设计范围；本项目采用手机及大屏规律。 |
| [Navigation rail 概览](https://m3.material.io/components/navigation-rail/overview)及[规格](https://m3.material.io/components/navigation-rail/specs) | 已在浏览器读取并实看。新版有 collapsed / expanded 两种轨道，展开轨道承担旧 drawer 的用途，可采用常驻或模态方式。一级目的地与会话历史列表需要分层。 |
| [Android 设置设计](https://developer.android.com/design/ui/mobile/guides/patterns/settings) | 已读并实看[官方示意图](https://developer.android.com/static/images/design/ui/mobile/settings_1.png)。参考分组、标签与当前值、子页和列表—详情结构。 |
| [Android 布局与导航模式](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns) | 已读。根据窗口空间转换导航形式，关键动作保持清晰。 |
| [Window size classes](https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes) | 已读。官方宽度分界为 600、840、1200、1600 dp；Web 需按 CSS 视口转译并重新验证，不能视为物理像素。 |
| [列表—详情自适应布局](https://developer.android.com/develop/adaptive-apps/guides/list-detail) | 已读。宽窗同时呈现列表与详情，窄窗逐级进入，适合设置与资料浏览。 |
| [Android 色彩系统](https://developer.android.com/design/ui/mobile/guides/styles/color) | 已读。按色彩角色组织浅深主题与 tonal surfaces，使用 primary / container / on-container 等成对角色。 |
| [Material Motion physics](https://m3.material.io/styles/motion/overview/how-it-works) | 已在浏览器读取完整正文。新版采用弹簧物理模型，区分空间运动和颜色、透明度变化；后者不应回弹越界。 |
| [Making Google Sans Flex](https://design.google/library/google-sans-flex-font)及[官方源码仓库](https://github.com/googlefonts/googlesans-flex) | 已读。Google Sans Flex 已开放使用，仓库注明 OFL；可用于界面字体，代码可选 Google Sans Code。字体文件仍需实际检查字符覆盖与体积。 |
| [Material Symbols](https://developers.google.com/fonts/docs/material_symbols) | 已读。官方图标支持填充、字重、光学尺寸等变化，提供 SVG 与字体。适合统一图标并区分选中状态。 |
| [Android Accessibility](https://developer.android.com/design/ui/mobile/guides/foundations/accessibility) | 已读。触控目标、文字/图标对比度、清晰标签和多种状态提示纳入验证。 |
| [Gemini 当前网页](https://gemini.google.com/app) | 实看 1280×720 未登录界面：展开左栏、底部设置入口、中央欢迎区、白色胶囊输入框、淡蓝弥散背景。未登录后的历史列表和完整设置未实测。 |
| [Gemini 2026 新设计公告](https://blog.google/innovation-and-ai/products/gemini-app/next-evolution-gemini-app/) | 已读，2026-05-19 发布，称其产品设计语言为 Neural Expressive。它与通用 Material 3 Expressive 分别记录，不把 Gemini 产品特性当作 Android 的通用规范。 |
| [Material Web 官方仓库](https://github.com/material-components/material-web) | 已查 README：维护模式。官方 rail 资源表亦未提供 Web 实现。接入策略以 DSH 现有 React 结构和独立适配为主，不以安装组件库作为完成依据。 |
| [官方 Figma M3 Design Kit](https://www.figma.com/community/file/1035203688168086460) | 入口已从 Material 官网核对；尚未打开文件检查内部组件。后续精调尺寸和状态时可使用。 |

## 设计方向

以下是结合 DSH 工作流作出的设计选择，属于本项目方案，不是 Google 的逐条强制要求。

1. **对话布局参考 Gemini，控件、导航和设置遵循 Material 3 Expressive。** 使用淡蓝调表面、明确的层级、胶囊主操作、圆角分组和统一字体。欢迎页可以有低强度蓝色光晕；长对话和设置采用稳定的实色阅读表面。
2. **保留 DSH 的内容密度。** 标题、主要动作和分组边界有明确尺寸差异；代码、工具日志、模型表单保持适合工作的密度。
3. **相似度覆盖结构和行为。** 一级导航、会话列表、展开/折叠、设置分类、弹窗、快捷操作、按钮状态和动效使用同一套语言。
4. **浅深色分别设计。** 浅色为蓝灰底与浅色容器；深色为带蓝调的深灰底与逐层提亮容器。颜色值在实际稿件中确定并测对比度。
5. **素材使用官方来源。** Google Sans Flex、Material Symbols 等按需自托管并保留许可；中文检查系统回退或可用的 Noto Sans CJK。视觉品牌继续使用 DSH。

## 整体布局草案

### 桌面与大窗口

- 左侧：可展开/收起的主导航，顶部菜单与「新对话」主操作；展开态显示会话/项目组织与历史列表，设置固定在下部。
- 中央：会话标题、模型与会话操作；正文有合理最大阅读宽度；输入框随中央可用空间居中。
- 右侧：按需打开的工作台/预览。对话与辅助内容并排，空间不足时转换为单独面板。
- 全局设置：独立的大尺寸设置表面，左侧分类、右侧表单；长内容独立滚动，保存区保持可达。

会话历史是内容列表，不把数十个会话都做成一级 rail 按钮。是否能在折叠后保留有效的导航轨道，需要在宿主布局服务中验证。

### 中等与窄窗口

| CSS 视口宽度草案 | 对话与导航 | 设置与工作台 |
| --- | --- | --- |
| ≥1200 px | 默认可展开左栏；空间充足时保留右侧辅助面板 | 设置列表—详情双栏；表单限制最大宽度 |
| 840–1199 px | 默认收起主导航；右面板打开时动态分配正文空间 | 支持双栏，达到正文最小可用宽度前先折叠辅助区域 |
| 600–839 px | 紧凑导航；历史列表作为覆盖面板打开 | 设置以列表/详情切换为主，工作台按需覆盖 |
| <600 px | 顶部应用栏和可关闭的导航面板；正文单栏；输入区适应软键盘 | 设置逐级进入，明确返回；工作台与预览为全屏页或适当的 sheet |

这些是 Web 初稿断点，后续用实际内容验证。还要覆盖低高度横屏。窄屏只有在存在合适且真实的多个一级目的地时才使用底部导航，避免与输入框争用空间。

## 全界面覆盖清单

| 区域 | 需要重新设计的内容 | 必验状态或行为 |
| --- | --- | --- |
| 应用外壳 | 窗口背景、导航区、主内容区、右侧面板、分隔与缩放 | 展开/收起、窄窗、浏览器缩放、低高度 |
| 侧边栏 | 品牌、新建、项目/会话列表、分组、选中指示、行操作、底部设置 | 长标题、空列表、选中、悬停、菜单、滚动、折叠后可达 |
| 欢迎页 | 欢迎标题、主输入框、现有快捷入口 | 窄屏、空白、中文换行、减少动态效果 |
| 会话页头 | 标题、模型入口、更多操作、工作台入口 | 长标题、切换会话、运行中 |
| 消息 | 用户气泡、助手正文、Markdown、表格、引用、复制等已有操作 | 长文本、长链接、选区、加载更早、错误 |
| 推理与操作记录 | 折叠标题、进度、嵌套工具记录、结果摘要 | 运行、完成、失败、展开/收起、长输出 |
| 输入区 | 附件、模型与模式、范围、BT、发送/停止、已有工具入口 | 多行、禁用、中文输入法、上传中、拖放、运行中停止 |
| 设置容器 | 标题、分类、子页、滚动、关闭/返回、保存区 | 开关页签后状态、未保存、保存中、失败与撤销 |
| 通用设置 | 所有原有控件与说明 | 明暗/字号/语言等实际宿主项，按真实字段盘点 |
| 模型 | 提供方、模型列表、编辑表单、菜单与校验 | 空值、密码字段、长名称、错误、禁用 |
| 内置插件 | 插件列表、启用控件、配置区域 | 开/关、依赖与不可用、长配置 |
| 外观 | 新皮肤展示、浅深/系统选择、减少效果、导入、恢复默认、历史条数 | 即时生效、刷新保存、同 id 更新、损坏包、默认恢复 |
| Oh My DSH 全部子页 | 常用、基础组件、模型与身份、实验性功能、高级、全局背景 | 分组行、展开高级项、主从依赖、保存冲突、状态提示 |
| 推荐插件 | 卡片/列表、说明、原有安装或连接入口 | 加载、可用、不可用、失败、长内容 |
| Agent 预设 | 列表、选择与编辑区域 | 当前项、名称溢出、空数据 |
| 已归档会话 | 列表与已有恢复/管理操作 | 空列表、长标题、菜单、恢复反馈 |
| 工作台 | 任务、上下文、摘要、电脑、监控五个区及其二级页面 | 列表/详情、选择、过滤、加载、错误、空状态 |
| 文件与代码预览 | 标签栏、语言栏、复制/下载、滚动、行内代码 | 长行、表格、明暗、多个标签 |
| Computer Use | 工具记录、预览外框、状态与已有控制按钮 | 等待、运行、停止/接管/恢复等实际支持状态；截图内容保真 |
| 全局浮层 | 模型/BT/行操作菜单、对话框、提示、通知 | portal 主题一致、边界避让、焦点与 Escape、恢复焦点 |
| 基础控件 | 按钮、图标按钮、输入、select、开关、复选框、单选、分段、tabs | hover、pressed、selected、focus-visible、disabled、error |

这是一张待实现及待验证的覆盖表，不能当作完成表。宿主更新或其他会话调整功能后，按真实界面补齐入口，不通过新增虚构功能填补视觉稿。

## 字体、形状、状态与动效

- 字体：界面与标题优先 Google Sans Flex；代码优先 Google Sans Code 或清晰的本地等宽回退。中文必须实际测量换行、基线和字重，不能只验英文字样。
- 字号草案：正文 15–16 CSS px，次要信息 12–14 px，页面标题 28–32 px；消息阅读字号继续尊重用户设置。
- 形状：主按钮/选中指示用胶囊；设置分组和面板用较大圆角；组内行通过紧密连接表达归属。各层圆角与间距统一定义，避免随组件临时拼值。
- 配色：主操作、选中态、普通容器、抬升容器、错误各有角色，浅深主题成对实现。暂不假设网页可以读取 Android 系统壁纸颜色。
- 状态：选中不仅改变色彩，也结合填充、文字或图标；键盘焦点可见。普通文字目标对比度至少 4.5:1，关键非文本目标至少 3:1；触控场景目标区域按 48 CSS px 起验证（Web 适配值）。
- 动效：导航展开、sheet、选择指示和开关可用轻量弹簧；颜色/透明度过渡不回弹。运行进度保持可辨识，文本流式输出与滚动不引入跳动。遵循系统减少动态效果。
- 交互契约：已有需要保存的表单继续明确保存；已有即时生效的设置维持即时反馈。外观层不擅自改变参数生效时机。

## 与当前仓库的接入关系

查阅范围是宿主接口和功能入口，没有读取旧 Material 皮肤的视觉内容作为设计底稿。工作区存在其他会话的持续修改；以下记录是调研时的快照，落地前复读相关公共文件。

| 入口 | 已确认事实 | 新皮肤接入方式 |
| --- | --- | --- |
| `package.json` | DSH 宿主依赖为 `0.1.6-alpha.2`，React 18 | 以此版本实际布局、控件与生命周期为验证对象 |
| `src/client/skins/format.mjs` | 导入 CSS 为受限视觉规则；布局元数据采用白名单 | 新增独立 `google-material-expressive` 布局标识；保持导入规则的受限性质 |
| `src/client/skins/runtime.mjs` | 负责选中皮肤、持久化、主题同步、样式安装与卸载 | 新布局只在选中时生效；默认恢复、其他皮肤切换和卸载需清理完整 |
| `src/client/skins/settings.jsx` | 外观设置通过宿主 slot 接入；已有按布局分派的入口 | 为新皮肤提供独立外观呈现，沿用已有设置行为 |
| `src/client/skins/mapping.mjs` | 将皮肤参数映射到宿主主题与 portal | 使用公共语义映射；必要补充以真实漏项为依据 |
| `src/client/index.jsx` | 工作台五个区域与 composer 插槽均已存在 | 调整呈现与布局，保留任务、上下文、摘要、电脑和监控能力 |
| `src/client/context-client.mjs` | OMD 六个设置子页及保存行为 | 覆盖所有子页与控件，不只覆盖外观页 |
| `docs/skins.md` | 皮肤自包含、无远程依赖，包限制 1 MB | 字体/图标需子集化或按需打包；先测体积再决定素材组织 |

拟新增目录为 `src/client/skins/google-material-expressive/`，从空白建立 tokens、原生视觉规则、布局适配与必要的 React 展示组件。布局若涉及新导航节点或交互，应使用宿主服务与 slot，而不是移动 React 已拥有的 DOM、用文本匹配重命名菜单或模拟点击隐藏按钮。

另一个会话在编辑 Codex 方案，公共入口的修改需要在接入时以最新内容作小范围合并；新皮肤资产和视觉规则保持独立。通用 Computer Use 实现继续遵守独立仓库与 vendor 快照契约。

## 后续制作与验收顺序

1. 从零制作同一套风格的桌面对话、展开侧栏、完整设置、右侧工作台，以及窄屏对话/设置关键稿；浅深两套同时考虑。
2. 将官方资料中的间距、字号、颜色角色、形状和状态落实为参数；用真实中文和代码内容比较密度与相似度。
3. 接入独立皮肤与布局，逐项覆盖上述实际功能；运行现有皮肤格式/生命周期回归，并补充新布局真正有价值的交互回归。
4. 在真实 OMD 打开全部设置页及工作台，检查 390、600、840、1200、1440 px 及断点附近、低高度和 200% 缩放；以实际截图和点击行为验证。
5. 验证刷新、模式切换、恢复默认、其他皮肤切换、重启/卸载、菜单 portal、长输出、减少动态效果与焦点管理。只有实际执行过的项目记录为通过。

以上记录的是调研阶段的判断与制作要求，不作为测试完成声明。实际实现及验证入口见 [皮肤说明](google-material-expressive.md)。
