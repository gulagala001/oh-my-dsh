# 制作皮肤

[文档目录](README.md) · [外观指南](skins.md)

## 目录结构

每套皮肤一个目录：

- `skin.json`：`{"schemaVersion":1,"id":"my-skin","name":"皮肤名称","version":"1.0.0"}`。id 以小写字母开头，只能用小写字母、数字和连字符，最长 48 个字符，不能是 `default`。
- `tokens.css`：下面说的三个参数块，设计预览和正式打包共用。
- `native.css`：可选，给 OMD 真实组件加的额外样式。不能用预览页的类名。
- `assets/`：本套用到的本地图片、字体和许可。
- `theme.css`：可选，只给独立设计预览用，**不会打进皮肤包**。

## 打包

运行 `node scripts/pack-skin.mjs <皮肤目录>`，生成 `deliverables/<id>.omd-skin.json`。`native.css` 里 `url(assets/...)` 引用的 PNG、JPEG、WebP、GIF、SVG 和 WOFF2／WOFF／TTF／OTF 会被内嵌，包最大 1 MB。参考截图不会自动打进去。

字体优先用系统字体。要自带字体时，在 `tokens.css` 或 `native.css` 写 `@font-face`，`src` 指向 `assets/` 下的单个本地文件，附上许可和中文回退字体。不支持远程 CDN。

导入 OMD 后可以看到 `native.css`、浏览器里的实际 CSS 值和真实组件上的效果。

## 参数

`tokens.css` 必须有且只有三个块：`.omd { ... }`、`.omd[data-appearance="light"] { ... }`、`.omd[data-appearance="dark"] { ... }`，每条声明都要有分号。完整示例见 `test/fixtures/skin.json` 里的 tokens（那只是测试数据）。

公共块必填：`--omd-font-ui`、`--omd-font-body`、`--omd-font-mono`、`--omd-font-size`、`--omd-line-height`、`--omd-gap`、`--omd-radius-control`、`--omd-radius-panel`、`--omd-radius-composer`、`--omd-shadow`、`--omd-duration`。

浅色和深色块各自必填（都加 `--omd-` 前缀）：`bg`、`surface`、`surface-solid`、`sidebar`、`text`、`muted`、`border`、`hover`、`selected`、`accent`、`on-accent`、`focus`、`success`、`warning`、`danger`、`code-bg`。

- 必填项要写具体的 CSS 值。`surface-solid` 必须不透明，降低透明效果时用它当背景。
- 每块最多再加 96 个自己的 `--omd-*` 参数给 `native.css` 用，可以用 `var(--omd-本套参数)` 引用已有参数，不能缺失或循环引用。
- 可选参数：`--omd-user-bg`（用户气泡，默认 selected）、`--omd-button-bg`／`--omd-button-fg`／`--omd-button-hover`（主按钮，默认 accent／on-accent／混色悬停）、`--omd-switch-on`（开关和复选框开启色，默认 accent）。浅深色分别填。

这些参数会映射到 DSH 的 `--dsw-alias-*`（正文、背景、表面、边框、菜单、弹窗、代码、状态和强调色）和 OMD 工作台的 `--tx-*`、`--cx-*`。用户的字号设置和功能布局仍由 DSH 管。自定义主题请用 `--omd-*` 引用颜色，写死的颜色不会跟着配色变。

## 组件样式

```css
.omd [data-omd-part="composer"] {
  background: var(--omd-surface);
  backdrop-filter: blur(18px);
  box-shadow: var(--omd-shadow);
}
.omd[data-appearance="dark"] [data-omd-part="sidebar"] {
  background-color: var(--omd-sidebar);
}
.omd [data-omd-part="settings-nav-item"][data-omd-state="selected"] {
  background: var(--omd-selected);
}
```

`data-omd-part` 是皮肤编译器认的别名，不一定是真实的 DOM 属性。DSH 版本变化由维护者统一映射，你不用写 DSH 构建后的随机类名。

| 别名 | 对应 |
| --- | --- |
| sidebar／header／conversation | 侧栏／会话页头／会话主体 |
| composer／input／tool | 输入框外壳／输入区域／过程和工具折叠行 |
| workbench／settings | OMD 工作台／OMD 设置和外观页 |
| dialog／menu | 弹窗／菜单（含 portal） |
| code／button | 所有代码／所有按钮，只放真正通用的样式 |
| settings-shell／settings-nav／settings-nav-item／settings-content | DSH 设置弹窗、侧栏、导航项、内容区 |
| settings-row／settings-tabs／tab | OMD 表单行、页签组、单个页签 |
| segments／segment／savebar | 分段控件、单个选项、保存栏 |
| form-control／field-input／select／file-input | 表单控件、文字和数字输入、原生下拉、文件输入（不含聊天输入框） |
| checkbox／switch | 复选框、开关 |
| button-primary／button-quiet／icon-button／send | 主按钮、轻按钮、已知的图标按钮、发送／停止 |
| sidebar-row／message-user | 侧栏会话和新建行、用户消息气泡 |
| process-toggle／tool-group／tool-row | 过程折叠标题、操作列表容器、单条记录 |
| code-block／code-inline／statusbar | pre 代码块（不含语言标题栏）、行内代码、底部状态栏 |

皮肤的组件规则优先于 DSH 的默认样式，同一组件命中多条规则时按 CSS 顺序。图标别名只覆盖明确映射过的入口。原生下拉展开的系统菜单保持系统样式。

**选择器**：`.omd`，可选 `[data-appearance="light|dark"]`，可选一个组件别名，可选一个 `[data-omd-state="selected|checked|disabled"]`，再加 `:hover`、`:active`、`:focus-visible`、`:focus-within`、`:disabled`、`:checked` 中的一个。可以用逗号分组、`@media` 和 `@supports`；不支持嵌套、除 `@font-face` 外的 at-rule、伪元素和 `!important`。

**属性**：背景（含图片、尺寸、位置、重复）、文字颜色、边框（颜色、宽度、样式、圆角）、阴影、背景模糊、字体族、字重、字距、outline（颜色、宽度、样式、偏移）、`accent-color`、`caret-color`、`font-variant-numeric`。不能改 display、position、尺寸、overflow、pointer-events 等布局属性。完整规则在 `src/client/skins/format.mjs`。

## 完整布局

`skin.json` 里可以加 `"layout": "ios-liquid"`、`"codex-desktop"`、`"claude-cli-terminal"` 或 `"google-material-expressive"`，用 OMD 自带的布局适配器。它会接管侧栏、导航、输入区、设置和工作台，并提供窄屏导航。不同皮肤可以共用一个布局。未知布局会被拒绝，旧版 OMD 不认识的布局也会拒绝导入。恢复默认、换到没指定布局的皮肤或卸载时，布局样式和监听都会清掉。

降低效果时会去掉背景模糊和动画，页头、侧栏、输入框、工作台、设置和菜单用不透明背景；系统的减少动态效果始终生效。不要给文件内容或电脑截图加整体滤镜。

## 检查清单

在 OMD 里预览，逐个打开通用、模型、内置插件、外观、Oh My DSH（全部子页）、推荐插件、Agent 预设和已归档会话，检查：

- 浅色、深色、跟随系统的切换
- 选中、焦点、禁用、开关状态，下拉和菜单
- 导入更新、刷新后保留、恢复默认
- 390px 窄窗
- 代码、文件和电脑预览，长文字、运行中和失败状态

配色和排版的可读性要逐套用眼睛看。
