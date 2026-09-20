# iOS Liquid Glass

从零制作的一套完整 DSH 外观，独立 id 为 `ios-liquid-glass`。在「设置 → 外观 → 皮肤」选择 **iOS Liquid Glass · 全新布局**，刷新后仍保持选择。明暗模式继续使用 DSH 的设置。

## 覆盖范围

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
| 工作台 | 玻璃侧面板、原生页签、任务 / 上下文 / 摘要 / 电脑 / 监控导航，保留缩放与全屏行为 |
| 浮层 | 菜单、下拉、对话框、提示、焦点、悬停、按下和禁用状态 |
| 辅助选项 | 浅色、深色、跟随系统；降低透明与动态效果；系统减少动态效果 / 透明度、高对比度 |

材质参考 [Apple Materials](https://developer.apple.com/design/human-interface-guidelines/materials)：导航与控件使用透明、模糊、高光边缘与阴影，正文保持清晰。Web 实现采用 CSS backdrop-filter 与渐变，不等同于 iOS 原生合成器的实时光学折射。字体使用本机系统字体；未捆绑 Apple 字体或外部素材。真实文件与电脑画面不添加玻璃滤镜。

## 源文件与构建

源目录为 `src/client/skins/ios-liquid-glass/`：`skin.json` 定义身份与布局，`tokens.css` 定义明暗设计参数，`native.css` 定义材质与控件，`layout.css` 负责宿主布局适配。它使用现有原生控件和行为，不复制会话或设置组件。

`node scripts/build.mjs` 自动生成 `src/client/skins/bundled/ios-liquid-glass.json` 并编译前端。单独打包：

```sh
node scripts/pack-skin.mjs src/client/skins/ios-liquid-glass dist/skins/ios-liquid-glass.omd-skin.json
```

布局适配器由本版 OMD 插件提供。JSON 可以更新颜色与材质并选择该布局；不能携带任意脚本或布局代码。恢复默认皮肤会移除本套所有布局规则。

## 验证

`test/ios-liquid-glass-ui.test.mjs` 在真实 DSH 宿主和隔离数据目录中检查：明暗 / 系统模式、侧栏与手机导航、八个设置分页、1440 / 768 / 390px 布局、菜单、工作台、手机发送与停止、新会话、降低特效、刷新保存及默认恢复。其他皮肤的导入、覆盖、错误恢复与卸载契约由现有皮肤测试覆盖。

设置 `TRISOUL_UI_ARTIFACTS=1` 运行该测试，可在 `data/ios-liquid-glass-qa/` 查看真实页面截图。当前自动验证环境为 Chromium；未宣称 iPhone Safari 或 Windows 桌面壳实机验收。
