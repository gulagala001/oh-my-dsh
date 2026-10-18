# Claude CLI · 全新终端布局

[文档目录](README.md) · [外观指南](skins.md) · [其他布局](README.md#按需查阅)

在「设置 → 外观 → 皮肤」选择 **Claude CLI · 全新终端布局**。它的 ID 是 `claude-cli-terminal`。明暗跟随 DSH 的「明暗模式」设置。

这是一套从零实现的终端外观：暖黑/纸白底色、陶土橙强调、等宽文字、横线输入区、左对齐对话、紧凑工具记录、目录式会话导航和终端配置面板。覆盖宿主完整设置、Oh My DSH 六个子页、右侧工作台、菜单和窄屏导航。布局不改变 DSH 的模型、权限、工具执行或设置含义。

## 字体

皮肤内嵌 **JetBrains Mono Regular / SemiBold** 两个 WOFF2 文件，导航、正文、输入、设置和代码使用同一字体族。加载皮肤后不访问字体 CDN，也不要求电脑预先安装字体。关闭代码连字，保留 `=>`、`!=` 等字符的原始形状，便于与终端输出对应。

中文依次回退到本机的 Noto Sans Mono CJK SC、Sarasa Mono SC、PingFang SC、Microsoft YaHei。中文字体不内嵌，具体字形取决于系统；不会把英文字体描述成包含中文字形。字号继续尊重 DSH 用户设置。

字体来自 [JetBrains 官方仓库](https://github.com/JetBrains/JetBrainsMono)，采用 OFL-1.1。原许可及每个下载文件的来源和 SHA-256 保存在 `src/client/skins/claude-cli-terminal/assets/`。它是本皮肤为一致性选定的字体，不声称是 Claude Code 唯一的官方终端字体。

## 构建与导入

运行 `node scripts/build.mjs` 时会从独立目录生成内置皮肤；运行 `node scripts/pack-skin.mjs src/client/skins/claude-cli-terminal` 可生成可导入的 `.omd-skin.json`。字体已经内嵌在 JSON 中，无需另拷贝素材。

完整布局由本插件内置的 `claude-cli-terminal` 适配器提供，因此应使用含该适配器的插件版本。旧版导入器不认识这个布局时会拒绝包，不保证自动降级。普通导入 CSS 仍不允许注入布局代码或 JavaScript。

600px 以下，展开会话导航时以整页导航呈现；选择会话或新建后自动返回对话。设置分类横向滚动，内容保持单栏。恢复默认或切换皮肤会移除本套样式，品牌插槽恢复原有呈现。

## 查看效果

[功能展示](showcase.md) · [外观设置](skins.md) · [安装与版本配对](install.md)
