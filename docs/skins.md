# OMD 原生皮肤

在「设置 → 外观」选择四套从零制作的完整主题：

| 主题 | 设计特点 |
| --- | --- |
| [Codex Desktop](codex-desktop.md) | 黑白强调、冷灰侧栏、悬浮工作台、系统字体与贯通顶栏 |
| [iOS Liquid Glass](ios-liquid-glass.md) | 圆角玻璃面板、分组设置、悬浮输入区与窄屏导航 |
| [Claude CLI](claude-cli-terminal.md) | 暖黑与纸白、陶土橙、等宽字体、终端式输入和目录导航 |
| [Google Material](google-material-expressive.md) | Android / Google 风格的导航与设置，本地打包 Google Sans、Noto Sans SC 和 Material Symbols |

四套主题均覆盖侧栏、对话、输入区、设置与工作台，并适配明暗和窄屏。Codex Desktop 版本为 1.0.1，其他三套为 1.0.0。早期五套视觉皮肤已移除；浏览器若仍选中已移除的内置 id，会恢复默认外观。

也可以导入 `.omd-skin.json`。导入同一 id 会更新原有皮肤。皮肤与降低特效选项保存在当前浏览器、当前站点；明暗模式使用 DSH 的设置，可选浅色、深色、跟随系统。皮肤包不执行 JavaScript、不需要网络。

「恢复默认皮肤」保留已导入的文件；「移除当前皮肤」删除当前皮肤并恢复默认。格式无效的导入不会替换当前皮肤；启动时损坏的记录会跳过。必要时在当前地址追加 `?omd-skin=default`（已有查询参数时追加 `&omd-skin=default`）可临时以默认外观打开设置。

内置皮肤始终保留在列表中。同 id 的导入版本可以覆盖内置版本，移除导入版本后，列表恢复内置版本。随包字体的许可见 [skin-font-licenses](skin-font-licenses)。

同页的「每次加载历史」提供 50、200、500 条，默认 200。初次打开对话及「加载更早」使用这个数量；不改变模型上下文，也不自动展开操作记录。插件通过客户端适配原生分页请求，卸载后恢复宿主默认数量。

## 制作与打包

每套皮肤独立目录，包含：

- `skin.json`：`{"schemaVersion":1,"id":"my-skin","name":"皮肤名称","version":"1.0.0"}`。id 用小写字母开头，限小写字母、数字、连字符，最长 48 字符，不能为 `default`。
- `tokens.css`：下面三个参数块。它同时用于设计预览与生产打包，是两者共享的参数来源。
- `native.css`：可选，真实 OMD 组件的额外视觉样式。不能直接使用预览页面的类名。
- `assets/`：本套引用的本地图片与素材许可。
- `theme.css`：若存在，仅用于独立设计预览，**不会打入生产皮肤包**。

运行 `node scripts/pack-skin.mjs <皮肤目录>`，得到该目录的 `deliverables/<id>.omd-skin.json`。打包器将 native.css 中的 `url(assets/...)` 图片内嵌，支持 PNG、JPEG、WebP、GIF、SVG 和 WOFF2/WOFF/TTF/OTF 字体；包上限 1 MB。参考截图不会自动装入皮肤。字体优先系统字体栈；需要自托管字体时可在 tokens.css 或 native.css 写 @font-face，src 指向 assets/ 下的单一本地文件，附带许可和中文回退。打包后内嵌字体，不支持远程 CDN。

制作目录的独立预览不是生产界面的精确复制。打包后必须在 OMD 中导入验证；这一步验证 native.css、浏览器 CSS 值及实际组件覆盖。打包成功不代表视觉验收通过。

## 参数

`tokens.css` 必须且只能有 `.omd { ... }`、`.omd[data-appearance="light"] { ... }`、`.omd[data-appearance="dark"] { ... }` 三个块；每条声明必须有分号。完整示例见 `test/fixtures/skin.json` 的 tokens（该文件只是测试数据）。

公共块必填：`--omd-font-ui`、`--omd-font-body`、`--omd-font-mono`、`--omd-font-size`、`--omd-line-height`、`--omd-gap`、`--omd-radius-control`、`--omd-radius-panel`、`--omd-radius-composer`、`--omd-shadow`、`--omd-duration`。

浅深色各自必填（均加 `--omd-`）：`bg`、`surface`、`surface-solid`、`sidebar`、`text`、`muted`、`border`、`hover`、`selected`、`accent`、`on-accent`、`focus`、`success`、`warning`、`danger`、`code-bg`。允许在这些必填参数之外定义本套 `--omd-*` 派生参数（每块最多 96 项），供 native.css 使用。必填字段使用具体 CSS 值，附加参数可用 `var(--omd-本套参数)` 引用已有参数，不支持缺失或循环引用；surface-solid 应为不透明表面，作为降低透明效果时的背景。

宿主颜色通过主题服务映射到 `--dsw-alias-*`，涵盖正文、背景、抬升表面、边框、菜单、弹窗、代码、状态与强调色；OMD 工作台参数同步映射到 `--tx-*` 和 `--cx-*`。输入框、控件、面板应用对应圆角；界面字体、输入/正文和代码字体分别使用三种字体参数。原有用户字号设置与功能布局保持由宿主管理。

## 原生组件样式

```css
.omd [data-omd-part="composer"] {
  background: var(--omd-surface);
  backdrop-filter: blur(18px);
  box-shadow: var(--omd-shadow);
}
.omd[data-appearance="dark"] [data-omd-part="sidebar"] {
  background-color: var(--omd-sidebar);
}
.omd [data-omd-part="button"]:focus-visible {
  outline: 2px solid var(--omd-focus);
}
```

`data-omd-part` 是皮肤编译器的选择器别名，不保证是实际 DOM 属性。维护者集中映射宿主版本变化，制作者不用写宿主构建后的随机类名。

| 别名 | 目标 |
| --- | --- |
| sidebar / header / conversation | 侧栏 / 会话页头 / 会话主体 |
| composer / input / tool | 输入框外壳 / 输入区域 / 过程与工具折叠行 |
| workbench / settings | OMD 工作台 / OMD 设置及外观页 |
| dialog / menu | 包括 portal 在内的弹窗 / 菜单 |
| code / button | 代码块与行内代码 / 按钮 |

选择器接受 `.omd`、可选的 `[data-appearance="light|dark"]`、可选的组件别名与选中状态（见下文），以及 `:hover`、`:active`、`:focus-visible`、`:focus-within`、`:disabled`、`:checked` 之一。可使用逗号分组、@media 和 @supports；不支持嵌套规则、除 @font-face 以外的其他 at-rule、伪元素或 !important。

允许属性：背景及背景图片/尺寸/位置/重复、文字颜色、边框及颜色/宽度/样式/圆角、阴影、背景模糊、字体族/字重/字距、outline 及颜色/宽度/样式/偏移。不得改 display、position、尺寸、overflow、pointer-events 等功能布局。完整字段由 `src/client/skins/format.mjs` 定义。

需要完整布局时，元数据可选 `"layout": "ios-liquid"`、`"layout": "codex-desktop"`、`"layout": "claude-cli-terminal"` 或 `"layout": "google-material-expressive"`，启用由插件内置、随宿主版本验证的布局适配器。它覆盖桌面侧栏、导航、输入区、设置与工作台，并提供对应的窄屏导航；Google Material 在 840px 以下使用模态导航和独立设置分类页，600px 以下使用顶栏菜单。同一布局可由不同皮肤复用。导入的 CSS 仍不能提供任意布局规则或代码；未知布局会被拒绝。恢复默认、切换到未指定布局的皮肤或卸载时，会移除布局样式，导航监听器停止接管。此字段需要包含该适配器的新版插件；不认识该布局的旧版会拒绝导入。

降低特效会移除背景模糊与动画，并为主要面板使用 solid 背景；系统减少动态效果设置始终生效。不要给真实文件内容或电脑截图添加整体滤镜。

## 验证

至少检查两种明暗、系统模式切换、导入更新、刷新保存、默认恢复、390px 窄窗、菜单/弹窗、代码/文件与电脑预览、长文字/禁用/焦点/运行/失败状态，并保留实际 OMD 截图。色彩和排版可读性需要逐套检查，接口验证无法证明任意设计都没有视觉问题。


## 原生组件补充（1.1 制作接口）

保留原有别名及 schemaVersion 1。皮肤组件规则优先于宿主的默认视觉样式；映射中的选择器使用统一优先级，同一组件命中多个规则时遵循 CSS 顺序。布局、隐藏和事件仍归宿主。

| 别名 | 真实目标 |
| --- | --- |
| settings-shell / settings-nav / settings-nav-item / settings-content | 完整 DSH 设置弹窗、侧栏、导航项、内容区（覆盖各宿主分页） |
| settings-row / settings-tabs / tab | OMD 表单行、页签组、单个页签 |
| segments / segment / savebar | 分段控件组、单个选项、保存操作区 |
| form-control / field-input / select / file-input | 普通表单控件、文字/数字输入、原生下拉、文件输入；不包含聊天输入本体 |
| checkbox / switch | 普通复选框、具有 switch 语义的开关 |
| button-primary / button-quiet / icon-button / send | 主要操作、轻按钮、已知图标操作、发送/停止按钮 |
| sidebar-row / message-user | 侧栏会话/新建行、用户消息气泡 |
| process-toggle / tool-group / tool-row | 过程折叠标题、操作列表容器、具体记录行（不是同一个层级） |
| code-block / code-inline / statusbar | pre 代码块、pre 外的行内代码、底部状态信息 |

通用 `button` 和 `code` 继续覆盖全部按钮、pre/code；应只放确实通用的样式。`code-block` 只到 pre，不包括宿主代码语言标题栏。图标别名只涵盖当前明确映射的入口，不能假定所有小按钮都命中。设置只设容器背景不代表内部控件已覆盖。原生 select 展开的系统菜单保留系统行为；文件选择按钮由宿主统一使用当前皮肤的表面、边框与圆角，皮肤不需要伪元素。

可以在部件后添加 `[data-omd-state="selected|checked|disabled"]`（每次一个），由宿主映射真实 aria/checked 状态；其后可再加一个受支持的伪类。例：

```css
.omd [data-omd-part="settings-nav-item"][data-omd-state="selected"] {
  background: var(--omd-selected);
  color: var(--omd-text);
}
.omd [data-omd-part="switch"][data-omd-state="checked"] {
  background: var(--omd-switch-on);
}
.omd [data-omd-part="input"] { background: transparent; border: 0; }
```

新增可用属性：`accent-color`、`caret-color`、`font-variant-numeric`；新增 `:active` 和 `:checked`。不开放任意属性选择器或布局属性。

可选参数：`--omd-user-bg`（用户气泡，默认 selected）、`--omd-button-bg` / `--omd-button-fg` / `--omd-button-hover`（主要按钮，默认 accent/on-accent/混色悬停）、`--omd-switch-on`（开关和复选框开启色，默认 accent）。按外观分别填写具体值；其它派生 token 只有被 native.css 引用才产生效果。这些新参数不是必填项，旧包继续可用。

开启降低特效时，页头、侧栏、输入外壳、工作台、设置弹窗、菜单均使用不透明背景。真实截图、文件内容不得被皮肤滤镜改变。

制作验收以真实 OMD 为准：至少逐项打开通用、模型、内置插件、外观、Oh My DSH（全部子页）、推荐插件、Agent 预设、已归档会话，检查浅深色、选中/焦点/禁用/开关、下拉和菜单、导入/默认恢复与 390px 窄窗。仅预览截图不算生产通过。
