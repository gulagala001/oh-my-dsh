<a name="readme-top"></a>

<h1 align="center">OpenCU</h1>

<p align="center"><strong>让 AI 操作浏览器与电脑，让你看见并参与过程。</strong><br>DeepSeek Harness 插件</p>

<p align="center"><strong>简体中文</strong> · <a href="README_EN.md">English</a></p>

<p align="center">
  <a href="https://github.com/gulagala001/opencu/releases/tag/v2.1.1-dsh.0.2.1-rc.3"><img alt="OpenCU 2.1.1" src="https://img.shields.io/badge/release-OpenCU%202.1.0-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/opencu/releases"><img alt="GitHub 累计下载量" src="https://img.shields.io/github/downloads/gulagala001/opencu/total?style=flat-square&amp;label=GitHub%20downloads&amp;color=0969da"></a>
  <a href="#readme-install"><img alt="DSH 0.2.1-rc.3" src="https://img.shields.io/badge/DSH-0.2.1--rc.3-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/opencu/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/gulagala001/opencu?style=flat-square&amp;color=0969da"></a>
</p>

<p align="center"><a href="#readme-install"><strong>开始使用</strong></a> · <a href="DEVELOPMENT.md">完整文档</a> · <a href="https://github.com/gulagala001/opencu/issues">反馈</a></p>

<p align="center"><a href="docs/images/browser-annotations.jpg"><img src="docs/images/browser-annotations.jpg" alt="浏览器现场与批注 / Browser view and annotations" width="880"></a></p>

<a id="install"></a>
<a name="readme-install"></a>

## 快速开始

**适用环境：** DSH **0.2.1-rc.3**, Node.js **22.19+**.

完整内置浏览器、侧栏批注与原生监看需要匹配的 Host／Client／preload 适配；插件包不会自动修改宿主。Chrome／Edge 扩展需要首次配对，桌面控制需要系统权限。

### 1. 安装

打开实际使用的 DSH 实例，在 **插件 → ＋ 添加插件** 中粘贴：

```text
https://github.com/gulagala001/opencu/releases/download/v2.1.1-dsh.0.2.1-rc.3/opencu-2.1.1-dsh.0.2.1-rc.3.tgz
```

等当前任务结束后，按宿主提示启用或完整重启该实例，沿用原 profile 与数据。其他宿主、升级和卸载见[安装指南](docs/install.md) · [SHA256SUMS](https://github.com/gulagala001/opencu/releases/download/v2.1.1-dsh.0.2.1-rc.3/SHA256SUMS).

### 2. 先试这一件事

打开 **设置 → 电脑与浏览器**，确认后端可用，再在会话中输入：

```text
用浏览器打开 https://example.com，读取页面标题和主要文字，不填写或提交任何内容。
```

**成功标志：** 工具返回实际页面内容；具备对应宿主适配时，会话内显示页面预览与活动。

## 观察、操作，再检查结果

OpenCU 通过 DSH 原生工具调用操作真实浏览器和桌面应用。页面、活动和预览留在会话中；你可以观察现场、指出具体位置，也可以收起预览继续看对话。

- **浏览器**：发现标签页、读取内容、导航、填写表单、处理文件选择和下载。
- **桌面应用**：通过系统无障碍接口和输入路由观察与操作，按后端报告实际可用能力。
- **协作反馈**：网页、图片与文字批注保留位置和上下文；保存批注与提交到对话是两个动作。

<a id="后台操作"></a>

## 选择适合的浏览器路径

| 路径 | 条件 |
| --- | --- |
| DSH 内置浏览器 | 匹配的桌面 Host、Client 与 preload 适配。 |
| 托管 Chromium | 使用独立浏览环境；缺少浏览器资源时可从设置准备。 |
| Chrome／Edge 扩展 | 使用你选择的 profile；首次配对后连接，撤销后需重新授权。 |

默认后台选择与操作；绑定或观看目标不会主动切走你的窗口。后台不支持时返回明确限制，需经用户同意再使用前台模式。人工操作后重新观察，取消时释放持键与持鼠；动作已派发不等于界面已成功。

展开预览、滚动、调整窗口或切换焦点导致当前操作无法继续时，会保留原会话。若操作已经开始，先确认松开该目标的键鼠，再重新观察并继续，不会自动重放旧动作。等待应用或浏览器授权不会耗尽执行时限并清空绑定；输入释放未确认或目标身份变化时仍保留必要保护。

## 支持范围

macOS 使用 Accessibility 与定向输入；Windows 使用 UI Automation；Linux 使用 AT-SPI／X11、Hyprland IPC 或 Wayland portal。能力取决于后端、系统授权与目标应用。Web 服务控制的是服务所在机器，不能直接控制访问网页的另一台电脑。

多屏混合缩放、声音、账号云服务及完整 Playwright 等价能力不在当前范围。不同平台尚未完成全部实机验证；不要仅凭安装成功推断所有应用均可操作。

## 常见问题

<details>
<summary>为什么看得到目标，但不能在后台输入？</summary>

观察和输入是不同能力。按返回的具体限制选择受支持的目标；需要前台输入时先取得用户同意，再明确聚焦目标，不用全局输入掩盖失败。

</details>

<details>
<summary>关掉预览会停止任务吗？</summary>

关闭预览只隐藏观看目标，任务与操作绑定继续存在。停止任务使用原生停止入口；重新打开预览后继续查看实际现场。

</details>

<details>
<summary>升级会清掉配对和浏览历史吗？</summary>

安装匹配包时沿用原 profile、DSH_HOME 和 OpenCU 数据目录，先备份再升级。正常保留身份和数据的重启可恢复扩展配对。[安装与维护](docs/install.md)

</details>

## 开发与来源

`computer_use` 提供持久 JavaScript 环境，按需给出当前浏览器／应用的接口与观察说明。[API 契约](src/dsh/computer-docs.mjs) · [开发文档](DEVELOPMENT.md)

前端使用 REA 来源组件与薄适配。各来源的权利与许可范围见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)；仓库未声明覆盖全部材料的统一开源许可证，不能将第三方界面素材视为项目原创授权。

## 文档与支持

| 我想做什么 | 去哪里 |
| --- | --- |
| 安装、升级、卸载 | [安装指南](docs/install.md) |
| 了解使用方法与边界 | [使用文档](DEVELOPMENT.md) |
| 查看版本变化 | [Releases](https://github.com/gulagala001/opencu/releases) |
| 反馈问题 | [Issues](https://github.com/gulagala001/opencu/issues) |

反馈时请提供完整 DSH／插件版本、实际入口、最小复现步骤，以及预期和实际表现；日志与截图先移除私人数据。

<p align="center"><a href="#readme-top">返回顶部</a> · <a href="https://github.com/gulagala001/opencu/releases">版本与下载</a> · <a href="https://github.com/gulagala001/opencu/issues">反馈</a></p>

[文档结构与贡献](docs/documentation.md)
