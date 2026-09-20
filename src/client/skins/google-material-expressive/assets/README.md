# Google Material 字体与图标

随皮肤自包含打包，不依赖远程 CDN。来源 URL、字重和子集信息见 `fonts.json`。

| 文件 | 用途 | 许可 |
| --- | --- | --- |
| `google-sans-flex-*.woff2` | Google Sans Flex 400 / 500 / 600 / 700；界面和正文的拉丁字符及常用标点 | `Google-Sans-Flex-OFL.txt` |
| `google-sans-code-*.woff2` | Google Sans Code 400 / 500 / 700；代码、等宽数据 | `Google-Sans-Code-OFL.txt` |
| `noto-sans-sc-ui.woff2` | Noto Sans SC 的 UI 字符子集，保留 400–600 字重轴 | `Noto-Sans-SC-OFL.txt` |
| `noto-sans-sc-text.woff2` | 补充常用中文，400 字重；与 UI 子集合计 3,768 个字符 | `Noto-Sans-SC-OFL.txt` |
| `material-symbols.woff2` | Material Symbols Rounded 的九个实际使用图标 | `Material-Symbols-LICENSE.txt` |

中文字符清单在 `noto-sans-sc-characters.txt`。UI 子集优先使用可变字重，正文子集通过单独的 CSS 字体族补齐；其他字符按 Noto Sans CJK、苹方或微软雅黑等平台字库回退。用户在宿主设置中的阅读字号继续生效。

这些 WOFF2 文件由 Google Fonts 官方字体使用 fontTools 子集化生成；未修改字形。源字体名称、版权信息与许可保留在字体及所附文本中。分发独立皮肤时应一起附带这里的许可文件。
