# Google Material 外观

[文档目录](README.md) · [外观指南](skins.md)

在 **设置 → 外观 → 皮肤** 选 **Google Material · 全新布局**（id 为 `google-material-expressive`）。这套外观参考 Material 3 Expressive、Android 设置和 Gemini 的对话布局，源文件在 `src/client/skins/google-material-expressive/`。

## 样子

- 桌面采用蓝灰侧栏、80 px 收起导航和圆角主内容区。会话列表、设置入口与新建按钮遵循统一的选中态与形状。
- 对话包含浅深主题、胶囊输入区、发送/停止、附件、模型与模式、范围和 BT、代码块、工具记录和菜单。
- 设置使用大尺寸双栏表面，覆盖通用、模型、内置插件、外观、Oh My DSH、推荐插件、Agent 预设和已归档会话，OMD 各子页的功能和保存方式不变。
- 小于 840 CSS px 时，导航以带遮罩的侧边面板打开；选择会话、按 Escape 或点击遮罩可关闭。小于 600 px 时使用顶栏菜单入口。
- 窄屏设置有「设置分类」入口，分类列表和详情分别呈现；Escape 先返回详情，再按 DSH 的规则关闭设置。
- OMD 控制台使用一个原生内容标签（概览、上下文、记忆、调用日志、后台日志），保留文件、终端和第三方入口，右栏可以调宽度。文件内容不加色彩滤镜。

## 字体

界面与正文使用 Google Sans Flex（400、500、600、700），代码使用 Google Sans Code（400、500、700）。中文使用 Noto Sans SC 的 UI 可变字重子集与常用正文子集，共 3,768 个字符；其余字符使用系统中文字体回退。字体、九个 Material Symbols 图标全部内嵌，离线可用。

字体资产、来源、字重及许可在 [assets](../src/client/skins/google-material-expressive/assets/README.md)。DSH 的阅读字号设置照常生效。外观页提供真实字体示例。

## 打包与恢复

`node scripts/build.mjs` 自动构建内置皮肤。独立导出使用：

```sh
node scripts/pack-skin.mjs src/client/skins/google-material-expressive /输出目录/google-material-expressive.omd-skin.json
```

皮肤文件约 942 KiB（上限 1 MiB），完整布局需要 OMD 自带的适配器。分发导出文件时请附上字体许可。换别的皮肤或恢复默认后，这套外观的样式和监听都会清掉。

支持浅色、深色、跟随系统、减少动态效果，偏好存在当前浏览器。外观页始终有恢复默认；界面出问题时，在地址后加 `?omd-skin=default` 可以临时恢复默认。
