# Google Material · 全新布局

在「设置 → 外观 → 皮肤」选择 **Google Material · 全新布局**。版本 1.0.0，id 和 layout 均为 `google-material-expressive`。

本套从空白建立，以 Google Material 3 Expressive、Android 设置模式与 Gemini 对话布局为参考。独立的参数、布局、外观设置和字体资源位于 `src/client/skins/google-material-expressive/`；资料来源见 [调研记录](google-material-expressive-research.md)。

## 布局与覆盖

- 桌面采用蓝灰侧栏、80 px 收起导航和圆角主内容区。会话列表、设置入口与新建按钮遵循统一的选中态与形状。
- 对话包含浅深主题、胶囊输入区、发送/停止、附件、模型与模式、范围和 BT、代码块、工具记录和菜单。
- 设置使用大尺寸双栏表面，覆盖通用、模型、内置插件、外观、Oh My DSH、推荐插件、Agent 预设和已归档会话；OMD 六个子页均保留原有功能和保存行为。
- 小于 840 CSS px 时，导航以带遮罩的侧边面板打开；选择会话、按 Escape 或点击遮罩可关闭。小于 600 px 时使用顶栏菜单入口。
- 窄屏设置有「设置分类」入口，分类列表和详情分别呈现；Escape 先返回详情，再按宿主规则关闭设置。
- 工作台任务、上下文、摘要、电脑、监控及预览沿用真实宿主功能，右栏仍支持宿主宽度调整。真实文件内容和电脑截图不添加色彩滤镜。

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

## 验证

主要回归入口：`test/google-material-expressive-ui.test.mjs`。它在实际安装的 DSH 插件中覆盖设置、各工作台区域、窄屏导航、发送/停止、主题同步、刷新保持、默认恢复、字体实际渲染、宿主字号与右栏调整，以及禁用/重新启用插件。

可保存实际截图与字体证据：

```sh
TRISOUL_UI_ARTIFACTS=1 node --test test/google-material-expressive-ui.test.mjs
```

产物写入本地 `data/google-material-expressive-qa/`；不会进入发行包。窗口覆盖 1440、1200、840、768、390 px，并检查低高度窗口。原生系统窗口、浏览器页面缩放和其他设备上的行为应以对应实测为准；本套验收使用 Chromium 中的实际 DSH Web 界面。
