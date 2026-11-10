# Claude CLI 外观

[文档目录](README.md) · [外观指南](skins.md)

在「设置 → 外观 → 皮肤」选择 **Claude CLI · 全新终端布局**。（id 为 `claude-cli-terminal`），明暗跟随 DSH 的设置。

一套终端风格的外观：暖黑／纸白底色、陶土橙强调、等宽文字、横线输入区、左对齐对话、紧凑工具记录、目录式会话导航和终端配置面板。设置页、OMD 各子页、右侧工作台、菜单和窄屏导航都换了样子，模型、权限和工具的行为不变。

## 字体

皮肤内嵌 **JetBrains Mono Regular／SemiBold**，导航、正文、输入、设置和代码都用它，不联网下载字体，也不用你先装。代码连字是关的，`=>`、`!=` 显示原样，和终端输出一致。

中文依次回退到本机的 Noto Sans Mono CJK SC、Sarasa Mono SC、PingFang SC、Microsoft YaHei。中文字体不内嵌，字形取决于你的系统。字号跟随 DSH 的设置。

字体来自 [JetBrains 官方仓库](https://github.com/JetBrains/JetBrainsMono)，采用 OFL-1.1。原许可及每个下载文件的来源和 SHA-256 保存在 `src/client/skins/claude-cli-terminal/assets/`。

## 构建与导入

运行 `node scripts/build.mjs` 时会从独立目录生成内置皮肤；运行 `node scripts/pack-skin.mjs src/client/skins/claude-cli-terminal` 可生成可导入的 `.omd-skin.json`。字体已经内嵌在 JSON 中，无需另拷贝素材。

完整布局由 OMD 自带的 `claude-cli-terminal` 适配器提供，旧版 OMD 不认识这个布局，会拒绝导入。导入的 CSS 不能带布局代码或 JavaScript。

600px 以下，展开会话导航时以整页导航呈现；选择会话或新建后自动返回对话。设置分类横向滚动，内容保持单栏。恢复默认或切换皮肤会移除本套样式，品牌插槽恢复原有呈现。

