# 产品页与文档站

[English](README_EN.md) · [文档目录](../README.md)

入口为 [中文产品页](../index.html) 与 [英文产品页](../index_EN.html)。产品页使用纯 HTML、CSS 与 JavaScript，无第三方字体或外部脚本依赖。Markdown 是文档的唯一作者源，GitHub 可直接阅读；普通静态服务需要先生成可读的 HTML 文档。

## 构建与托管

在仓库根目录准备开发依赖和本地 Chromium 后执行：

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm docs:build
```

Linux CI 使用 `pnpm exec playwright install --with-deps chromium`，安装浏览器所需的系统库与字体。仓库的 Documentation CI 按此顺序构建并运行浏览器验证；合并到 main 后，只部署验证通过的 `dist/site` 到 [GitHub Pages](https://gulagala001.github.io/oh-my-dsh/)。PR 仅构建和验证，不部署。

将 **`dist/site`** 作为静态站点根目录托管。根入口进入 `docs/index.html`，公开 Markdown 转成对应的 `.html`，并保留仓库的相对目录结构。因此 `docs/README.html` 中的项目介绍会正确进入根目录 `README.html`；页内片段、图片和产品页中的文档入口也会保持有效。可部署在域名根目录或子路径，服务端无需 Markdown 中间件。

只托管源码中的 `docs` 目录时，文档仍是 Markdown 文件，浏览器可能显示原文或下载文件。不要把整个仓库作为静态站点目录。

`scripts/build-docs.mjs` 使用已有 `marked` 与 `htmlparser2`，按显式白名单发布中英文指南、版本记录和公共素材；源码与 vendor 引用链接回 GitHub。构建核对每个内部链接和章节，私密文档引用、符号链接、缺失目标或重复 ID 会中止构建；原始研究、内部实施计划、本地交接、账号配置与工作记录不进入站点。

中英文页面使用各自的导航、目录、复制反馈与辅助标签。语言入口优先跳转到同一篇文档的对应译文；没有译文时进入另一语言的文档目录。英文导航中的未翻译专项资料标为 Chinese。历史发行记录保留原文；发行说明的存在不代表对应候选已公开发行。

Markdown 中的 Mermaid 图示在构建时使用固定版本的官方 `@mermaid-js/tiny` 和已有 Playwright 生成本地静态 SVG，保留折叠源码和放大入口。站点不交付 Mermaid 浏览器运行时，也不依赖 CDN；禁用脚本仍可查看图形与源码。图示只在需要时启动一次隔离的 headless Chromium，构建结束关闭。

图示采用静态文本标签和标题／描述，不执行图中的脚本、链接或远程请求。Tiny 不包含 Mindmap、Architecture、KaTeX 和 ELK；请求 ELK 布局时按[官方行为](https://mermaid.js.org/config/usage.html#elk-and-the-tiny-build)回退 Dagre。缺少 Chromium、语法错误或不支持的图示会中止构建，明确报告文件与图号，保留旧产物。单图渲染超过 30 秒也会中止构建。修改 Mermaid 时重新构建，生成的 SVG 不作为另一份作者源维护。

## 阅读与展示

- `site.css`：简洁的产品版面、响应式与减少动态效果适配。首屏呈现产品名、版本边界与真实工作台；同一份 Launchpad 发布清单贯穿要求、操作、回查和交付。
- `site.js`：实拍切换、主题明暗、安装标签、复制与图片预览。
- `docs.css`、`docs.js`：黑白阅读版面、文档导航、章节目录、页内定位和代码复制。章节跳转展开对应折叠内容；图片加载失败可重试或打开原图。长代码与表格独立横向滚动；复制被浏览器拒绝时选中文本并提示手动复制。正文和原生折叠导航在禁用 JavaScript 时仍可阅读。
- `media/manifest.json`：当前实拍文件哈希、原图与局部对应关系。

展示页直接呈现真实截图。移动菜单、标签键盘操作、加载失败重试与原图入口保留；README 与产品页共用同一份实拍素材。

图片来自当前展示素材，具体使用边界见 [演示与素材来源](../showcase.md)。站点不包含模型调用、登录或安装执行逻辑。

安装入口固定到已公开的 alpha.1 与 rc.2 两个 `0.10.0` tag 和对应 `trisoul_x-<完整版本>.tgz`。不用 GitHub latest 选择安装包。源码候选与较新的本地 OpenCU 实现单独标注，不能将 GitHub main 构建或旧包说成包含本地新功能。

更新版本时同步两种语言的安装来源、宿主版本与下载链接。文档、静态站点与产品预览检查分别位于 `test/documentation.test.mjs`、`test/docs-site.test.mjs` 和 `test/site-preview-ui.test.mjs`；实际通过情况以本次运行结果为准。
