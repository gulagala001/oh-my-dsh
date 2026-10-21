<a name="readme-top"></a>

<h1 align="center">Glyph · 动态字符</h1>

<p align="center"><strong>让鲸鱼、背景与控件在同一张字符网格中流动。</strong><br>DeepSeek Harness 主题</p>

<p align="center"><strong>简体中文</strong> · <a href="README_EN.md">English</a></p>

<p align="center"><a href="#install">开始使用</a> · <a href="#behavior">显示与交互</a> · <a href="LICENSE">MIT 许可</a></p>

- **立体字符鲸鱼**：独立尾鳍动作、明暗与体积，镜头在全身、头部和尾鳍特写间连续切换。
- **局部响应**：鼠标扰动附近字符，点击背景产生传播波纹；动态避开正文与输入区。
- **原生交互保持可用**：控件随滚动同步，文字仍可选择、复制，保留中文输入和无障碍语义。

<a id="install"></a>

## 快速开始

适用 **DSH 0.2.1-rc.2**。目前提供源码与本地可安装包；在线下载和市场收录以正式发布页面为准。

在仓库根目录构建：

```bash
node scripts/build-glyph-theme.mjs
npm pack ./plugins/glyph-theme
```

在目标 DSH 的插件管理中添加生成的 `dsh-glyph-theme-1.0.0-dsh.0.2.1-rc.2.tgz`，按宿主提示启用或重载。CLI 示例中的路径和 profile 替换为实际值：

```bash
dsh plugin --profile web add file:/absolute/path/dsh-glyph-theme-1.0.0-dsh.0.2.1-rc.2.tgz
```

**第一次使用：** 新建会话，移动鼠标并点击空白背景。鲸鱼与局部字符会响应；输入区应保持可读和可输入。

<a id="behavior"></a>

## 显示与交互

主题以深黑与亮白组织界面，支持宿主明暗模式。打开思考强度面板可看到轨道流动、档位明暗、滑块流光和呼吸；最高档使用 DeepSeek 蓝色并联动背景宽波，关闭面板后自然淡出。

| 内容 | 处理方式 |
| --- | --- |
| 背景、导航和外层控件 | 使用字符网格与主题动效。 |
| 消息正文、输入区 | 保留可读的原生文字与交互，动效避让内容。 |
| 设置、菜单与弹窗 | 保持实色阅读面；字符控件随原生滚动与裁切同步，不穿透上层浮窗。 |
| 图片、视频、PDF、iframe 和代码编辑器 | 保持原始内容渲染；外层控件跟随主题。 |
| 减少动态效果 | 跟随系统偏好，也可从“设置 → Glyph 字符主题”关闭或降低动效。 |

主题偏好保存在当前浏览器。独立安装默认显示 DeepSeek Harness 名称与标题，保留字符风格和用户明确自定义的文字。

## 常见问题

<details>
<summary>主题是否会改变模型或思考能力？</summary>

不会。思考强度面板的动效反映当前档位；模型、实际能力与请求参数仍由 DSH 负责。

</details>

<details>
<summary>动画太多，或者想恢复普通外观？</summary>

在“设置 → Glyph 字符主题”降低或关闭动态效果，或从插件管理停用主题。停用后使用宿主原有外观。

</details>

## 许可

代码采用 [MIT](LICENSE)。DeepSeek 名称和图形属于对应权利人，不表示官方隶属或背书。

[返回顶部](#readme-top)
