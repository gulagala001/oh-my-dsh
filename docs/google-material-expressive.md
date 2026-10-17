# Google Material · 全新布局

[文档目录](README.md) · [外观指南](skins.md) · [其他布局](README.md#按需查阅)

在「设置 → 外观 → 皮肤」选择 **Google Material · 全新布局**。版本 1.0.0，id 和 layout 均为 `google-material-expressive`。

本套从空白建立，以 Google Material 3 Expressive、Android 设置模式与 Gemini 对话布局为参考。独立的参数、布局、外观设置和字体资源位于 `src/client/skins/google-material-expressive/`。当前指引使用[外观入口](skins.md)，不恢复已删除的研究／交接文档。

## 布局与覆盖

- 桌面采用蓝灰侧栏、80 px 收起导航和圆角主内容区。会话列表、设置入口与新建按钮遵循统一的选中态与形状。
- 对话包含浅深主题、胶囊输入区、发送/停止、附件、模型与模式、范围和 BT、代码块、工具记录和菜单。
- 设置使用大尺寸双栏表面，覆盖通用、模型、内置插件、外观、Oh My DSH、推荐插件、Agent 预设和已归档会话；OMD 六个子页均保留原有功能和保存行为。
- 小于 840 CSS px 时，导航以带遮罩的侧边面板打开；选择会话、按 Escape 或点击遮罩可关闭。小于 600 px 时使用顶栏菜单入口。
- 窄屏设置有「设置分类」入口，分类列表和详情分别呈现；Escape 先返回详情，再按宿主规则关闭设置。
- OMD 控制台使用一个原生内容标签（概览、上下文、记忆、调用日志、后台日志），保留文件、终端和第三方入口，右栏支持宿主宽度调整。真实文件内容不添加色彩滤镜；不带入旧后续 CU 的浏览器装饰或引用配色承诺。

## 字体

界面与正文使用 Google Sans Flex（400、500、600、700），代码使用 Google Sans Code（400、500、700）。中文使用 Noto Sans SC 的 UI 可变字重子集与常用正文子集，共 3,768 个字符；其余字符使用系统中文字体回退。字体、九个 Material Symbols 图标全部内嵌，离线可用。

字体资产、来源、字重及许可在 [assets](../src/client/skins/google-material-expressive/assets/README.md)。宿主的阅读字号设置继续生效。外观页提供真实字体示例。

## 打包与恢复

`node scripts/build.mjs` 自动构建内置皮肤。独立导出使用：

```sh
node scripts/pack-skin.mjs src/client/skins/google-material-expressive /输出目录/google-material-expressive.omd-skin.json
```

皮肤文件约 942 KiB，低于 1 MiB 限制；完整布局需要本版插件内置的适配器。导出分发时附带字体许可文件。切换到其他皮肤或恢复默认后，新布局、导航遮罩、焦点监听和辅助属性会随之清理。

支持浅色、深色、跟随系统、减少动态效果；偏好保存在当前浏览器站点。恢复默认入口始终位于外观页；异常时可通过 `?omd-skin=default` 临时恢复默认界面。

## 查看效果

[新版图集](release-visuals.md) · [外观设置](skins.md) · [安装与版本配对](install.md)
