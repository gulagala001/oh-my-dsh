# iOS Liquid Glass 外观

[文档目录](README.md) · [外观指南](skins.md)

在 **设置 → 外观 → 皮肤** 选 **iOS Liquid Glass · 全新布局**（id 为 `ios-liquid-glass`），刷新后保持选择，明暗跟随 DSH 的设置。

## 样子

| 界面 | 设计 |
| --- | --- |
| 桌面布局 | 冷白 / 深蓝环境背景，独立圆角玻璃侧栏，留白与大导航标题 |
| 侧栏 | 新会话胶囊、项目与会话层级、蓝色选中态、底部设置、可折叠窄栏 |
| 手机 | 600px 以下浮动底部导航；展开后为完整会话导航页，选中会话、新建或切换插件后返回内容 |
| 对话 | 蓝色用户气泡、清晰正文、独立过程折叠、圆角代码块、操作与失败状态 |
| 输入区 | 悬浮玻璃输入卡、圆形发送 / 停止、权限与模型选择、工作台与电脑入口、用量详情 |
| 新会话 | 玻璃品牌图标、标题、项目与预设选择、输入卡 |
| 设置 | 圆角玻璃浮层、彩色图标导航、分组列表、分段选择、表单、开关、保存栏 |
| 设置分页 | 通用设置、模型、内置插件、外观、Oh My DSH、推荐插件、Agent 预设、已归档会话 |
| 控制台 | 玻璃侧面板、一个 OMD 控制台原生内容标签：概览 / 上下文 / 记忆 / 调用日志 / 后台日志，DSH 其他入口、缩放和全屏照常可用 |
| 浮层 | 菜单、下拉、对话框、提示、焦点、悬停、按下和禁用状态 |
| 辅助选项 | 浅色、深色、跟随系统；降低透明与动态效果；系统减少动态效果 / 透明度、高对比度 |

材质参考 [Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials)：导航与控件使用透明、模糊、高光边缘与阴影，正文保持清晰。玻璃效果用 CSS 模糊和渐变实现，没有 iOS 原生的实时折射。字体用系统字体，不附带 Apple 字体。文件内容和电脑画面不加玻璃滤镜。

默认用户气泡和主按钮使用较深的蓝色。自定义配色可分别调整按钮和气泡的前景色；搭配时注意文字与背景的对比度，参考 [Apple Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)。

## 源文件与构建

源目录为 `src/client/skins/ios-liquid-glass/`：`skin.json` 定义身份与布局，`tokens.css` 定义明暗设计参数，`native.css` 定义材质与控件，`layout.css` 负责 DSH 布局适配。

`node scripts/build.mjs` 自动生成 `src/client/skins/bundled/ios-liquid-glass.json` 并编译前端。单独打包：

```sh
node scripts/pack-skin.mjs src/client/skins/ios-liquid-glass dist/skins/ios-liquid-glass.omd-skin.json
```

布局适配器由 OMD 自带。导入的 JSON 可以改颜色和材质，不能带脚本或布局代码。恢复默认会移除这套外观的全部样式。
