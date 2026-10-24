# 项目、组件与致谢

[English](components_EN.md) · [首页](../README.md) · [完整许可声明](../THIRD_PARTY_NOTICES.md)

本页收录自有独立产品、可选集成、宿主组件、来源素材及锁定依赖。原作者和适配维护者不同的项目分别署名；版本与宿主范围以来源清单和兼容说明为准。

## 独立产品与内置组件

### OpenCU

[项目](https://github.com/gulagala001/opencu) · gulagala001 and contributors

电脑与浏览器观察、操作、批注和预览 内置插件；支持独立安装与共装。

- 固定来源／版本: [2.1.0-dsh.0.2.1-rc.2](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/package.json)
- 许可／归属: See component notices · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/THIRD_PARTY_NOTICES.md)

### DSH Workflow

[项目](https://github.com/gulagala001/dsh-workflow) · gulagala001 and contributors

任务规划、执行、预算与恢复 内置工作流插件。

- 固定来源／版本: [0.1.4-dsh.0.2.1-rc.2](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/workflow/package.json)
- 许可／归属: MIT · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/workflow/THIRD_PARTY_NOTICES.md)

### DSH Rewind

[项目](https://github.com/gulagala001/dsh-undo-plugin) · gulagala001 and contributors

完整回合撤回与会话回退 内置撤回插件。

- 固定来源／版本: [0.1.3-dsh.0.2.1-rc.2](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/rewind/package.json)
- 许可／归属: MIT · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/rewind/THIRD_PARTY_NOTICES.md)

### DSH Persona

[项目](https://github.com/gulagala001/dsh-persona-plugin) · gulagala001 and contributors

人格导入、管理、全局和会话选择 内置人格插件。

- 固定来源／版本: [0.1.1-dsh.0.2.1-rc.2](https://github.com/gulagala001/oh-my-dsh/blob/main/plugins/persona/package.json)
- 许可／归属: MIT · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/plugins/persona/THIRD_PARTY_NOTICES.md)

### DSH Extensions

[项目](https://github.com/gulagala001/dsh-extensions) · gulagala001 and contributors

管理技能、MCP、指令、命令与 Hooks 内置扩展管理插件。

- 固定来源／版本: [0.1.1-dsh.0.2.1-rc.2](https://github.com/gulagala001/oh-my-dsh/blob/main/plugins/dsh-extensions/package.json)
- 许可／归属: MIT · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md)

### DeepSeek Workbench

[项目](https://github.com/gulagala001/dsh-deepseek-workbench) · gulagala001 and contributors

DeepSeek 网页工作台和历史导入 内置工作台插件。

- 固定来源／版本: [0.1.2-dsh.0.2.1-rc.2](https://github.com/gulagala001/oh-my-dsh/blob/main/plugins/deepseek-workbench/package.json)
- 许可／归属: MIT · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/plugins/deepseek-workbench/THIRD_PARTY_NOTICES.md)

### DSH BTW

[项目](https://github.com/gulagala001/dsh-btw) · gulagala001 and contributors

临时旁聊、历史、追问和独立停止 内置旁聊插件。

- 固定来源／版本: [0.1.3-dsh.0.2.1-rc.2](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/btw/package.json)
- 许可／归属: MIT · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/btw/LICENSE)

### DSH Theme

[项目](https://github.com/gulagala001/dsh-theme-plugin) · gulagala001 and contributors

主题、配色、背景、字体和外观管理 独立产品；OMD 与它共用外观源码。

- 固定来源／版本: [SHA256:488c7edba1648a1eae208f09bf5bb419aefbe9bc1d2511b9bc04168538cf8042](https://github.com/gulagala001/oh-my-dsh/blob/main/src/client/skins/runtime.mjs)
- 许可／归属: MIT · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#google-material-expressive-skin-fonts-and-icons)

### Glyph

[项目](https://github.com/gulagala001/dsh-theme-plugin) · gulagala001 and contributors

动态字符界面与字符鲸鱼视觉 主题组件；随主题插件提供。

- 固定来源／版本: [1.0.0-dsh.0.2.1-rc.2](https://github.com/gulagala001/oh-my-dsh/blob/main/plugins/glyph-theme/package.json)
- 许可／归属: MIT · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md)

## 可选集成与推荐

### Billion Context

[项目](https://github.com/ranxianglei/billion-context) · ranxianglei

管理长会话的上下文压缩、原文恢复和缓存诊断；在 OMD 上下文页按会话切换。 可选安装／推荐；当前兼容范围见插件兼容说明。

- 固定来源／版本: [0.1.202](https://github.com/gulagala001/oh-my-dsh/blob/main/src/recommended-plugin-catalog.mjs)
- 许可／归属: See upstream license and notices · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/plugin-compatibility.md)

### dsh-ops

[项目](https://github.com/T-Auto/dsh-ops) · 原作者：T-Auto · 兼容适配：gulagala001

增强文件、文档与命令操作，按需加载工具并复用结果；支持普通模式和 PTC，保留原生工具。 可选安装／推荐；当前兼容范围见插件兼容说明。

- 固定来源／版本: [0.2.1-rc.2.ops.0.1.0 / 0.2.1-rc.1.ops.0.1.0](https://github.com/gulagala001/oh-my-dsh/blob/main/src/recommended-plugin-catalog.mjs)
- 许可／归属: See upstream license and notices · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/plugin-compatibility.md)

### DSH Intelligent UI

[项目](https://github.com/gulagala001/dsh-intelligent-ui) · gulagala001

在回答中使用交互图表、表单、计算器、模拟和小游戏。 可选安装／推荐；当前兼容范围见插件兼容说明。

- 固定来源／版本: [0.2.1-rc.2.iui.1.0.12 / 0.2.1-rc.1.iui.1.0.12](https://github.com/gulagala001/oh-my-dsh/blob/main/src/recommended-plugin-catalog.mjs)
- 许可／归属: See upstream license and notices · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/plugin-compatibility.md)

### Oh My Agents Above All

[项目](https://github.com/gulagala001/oh-my-agents-above-all) · gulagala001

选用 Codex、Claude Code、Grok、Pi 与 ZCode 风格的智能体，沿用 DSH 会话和工具。 可选安装／推荐；当前兼容范围见插件兼容说明。

- 固定来源／版本: [0.2.1-rc.2.omaa.0.17.0 / 0.2.1-rc.1.omaa.0.16.5](https://github.com/gulagala001/oh-my-dsh/blob/main/src/recommended-plugin-catalog.mjs)
- 许可／归属: See upstream license and notices · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/plugin-compatibility.md)

### Subscription Login

[项目](https://github.com/V1ki/dsh-plugin-subscriptions) · 原作者：V1ki · OMD 适配：gulagala001

直接登录 ChatGPT、Claude、Grok、Copilot 或 Antigravity 订阅，自动发现模型；支持 ChatGPT Fast、订阅额度及生图。 可选安装／推荐；当前兼容范围见插件兼容说明。

- 固定来源／版本: [0.9.8-omd.1](https://github.com/gulagala001/oh-my-dsh/blob/main/src/recommended-plugin-catalog.mjs)
- 许可／归属: See upstream license and notices · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/plugin-compatibility.md)

### OpenDesign

[项目](https://github.com/omegapaopao/dsh-open-design) · omegapaopao · 技能来源：nexu-io/open-design 及各技能作者

使用 52 个设计技能、模板和设计系统，技能入口为 open-design。 可选安装／推荐；当前兼容范围见插件兼容说明。

- 固定来源／版本: [0.1.0-omd.1.0.0](https://github.com/gulagala001/oh-my-dsh/blob/main/src/recommended-plugin-catalog.mjs)
- 许可／归属: See upstream license and notices · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/plugin-compatibility.md)

### Prompt Optimizer

[项目](https://github.com/WestFox-AwA/dsh-prompt-optimizer) · 原作者：啃轮胎的西狐（WestFox-AwA） · OMD 适配：gulagala001

发送前梳理本轮需求，保留原话，支持审查、自动模式和只读查证；启用后可在输入框选择模式。 可选安装／推荐；当前兼容范围见插件兼容说明。

- 固定来源／版本: [0.3.0](https://github.com/gulagala001/oh-my-dsh/blob/main/src/recommended-plugin-catalog.mjs)
- 许可／归属: See upstream license and notices · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/plugin-compatibility.md)

### DSH Market

[项目](https://github.com/dsh-market/dsh-market) · dsh-market

在 DSH 内浏览、搜索和安装社区插件与主题，支持分类筛选、更新管理及配置备份。安装后在设置中打开插件市场。 可选安装／推荐；当前兼容范围见插件兼容说明。

- 固定来源／版本: [1.66.14](https://github.com/gulagala001/oh-my-dsh/blob/main/src/recommended-plugin-catalog.mjs)
- 许可／归属: See upstream license and notices · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/plugin-compatibility.md)

### Infinite Gen 4

[项目](https://github.com/Minglink/dsh-infinite-gen-4) · Minglink

用于提示词对抗研究和回复状态展示；启用后会向所有会话注入内容生成提示词。 可选安装／推荐；当前兼容范围见插件兼容说明。

- 固定来源／版本: [0.4.0](https://github.com/gulagala001/oh-my-dsh/blob/main/src/recommended-plugin-catalog.mjs)
- 许可／归属: See upstream license and notices · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/plugin-compatibility.md)

### Status Rotator

[项目](https://github.com/01Virex/dsh-status-rotator) · 01Virex

把“深度求索中…”替换为轮换文案，支持打字机、彩色渐变、弹幕和主题词库，可在设置中编辑。 可选安装／推荐；当前兼容范围见插件兼容说明。

- 固定来源／版本: [0.35.0](https://github.com/gulagala001/oh-my-dsh/blob/main/src/recommended-plugin-catalog.mjs)
- 许可／归属: See upstream license and notices · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/plugin-compatibility.md)

### DSH × Blender

[项目](https://github.com/sixtysevenlf/dsh-blender-plugin) · sixtysevenlf

让模型直接操控 Blender：查看视口、编辑场景、渲染、批量任务与事务回滚。需要 Blender 及配套连接插件。 可选安装／推荐；当前兼容范围见插件兼容说明。

- 固定来源／版本: [1.0.5](https://github.com/gulagala001/oh-my-dsh/blob/main/src/recommended-plugin-catalog.mjs)
- 许可／归属: See upstream license and notices · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/plugin-compatibility.md)

### Balance Whale Widget

[项目](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget) · MeteorNOX

在 DSH 界面显示 DeepSeek 余额、今日用量与每轮消耗，支持拖拽吸附、自定义角色和互动泡泡。 可选安装／推荐；当前兼容范围见插件兼容说明。

- 固定来源／版本: [0.3.18](https://github.com/gulagala001/oh-my-dsh/blob/main/src/recommended-plugin-catalog.mjs)
- 许可／归属: See upstream license and notices · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/plugin-compatibility.md)

## 宿主、数据与素材

### DeepSeek Harness / Cordis

[项目](https://github.com/deepseek-ai/deepseek-harness) · DeepSeek and contributors

宿主、会话、工具与界面组件 宿主／来源／素材，具体使用范围见来源记录。

- 固定来源／版本: [0.2.1-rc.2](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/dsh.json)
- 许可／归属: MIT · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#dsh)

### Codex frontend / REA

[项目](https://openai.com/codex/) · OpenAI; source extraction via REA

OpenCU 使用的原始界面组件及来源记录 宿主／来源／素材，具体使用范围见来源记录。

- 固定来源／版本: [SHA256:e2aece5c41c58b884b962488686640410ba4b42fd6eac87483461504d6c57579](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/lib/rea-assets/manifest.json)
- 许可／归属: Original upstream rights apply · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/THIRD_PARTY_NOTICES.md)

### models.dev

[项目](https://github.com/sst/models.dev) · models.dev contributors

模型价格数据 宿主／来源／素材，具体使用范围见来源记录。

- 固定来源／版本: [SHA256:1e6f6274f532e79be26c37cab37a92352b74507f8893345792718c462a9f42ce](https://github.com/gulagala001/oh-my-dsh/blob/main/src/monitor-prices.json)
- 许可／归属: MIT · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#modelsdev-api-pricing-data)

### Prompt Optimizer

[项目](https://github.com/linshenkx/prompt-optimizer) · linshenkx and contributors

提示词优化模板 宿主／来源／素材，具体使用范围见来源记录。

- 固定来源／版本: [SHA256:7d9f0a65779aecd73282732ee6dc6d748ead29ca4da88b0ea6898e4bcef15120](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/prompt-optimizer/manifest.json)
- 许可／归属: MIT at pinned revision · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#prompt-optimizer-templates)

### Google Sans Flex

[项目](https://github.com/googlefonts/googlesans-flex) · Google and contributors

Google Material 字体 宿主／来源／素材，具体使用范围见来源记录。

- 固定来源／版本: [SHA256:60df2acfe528583efd4f3757b5a023fada111b19292a0d853cbc9cd6e755f35c](https://github.com/gulagala001/oh-my-dsh/blob/main/src/client/skins/google-material-expressive/assets/fonts.json)
- 许可／归属: OFL-1.1 · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#google-material-expressive-skin-fonts-and-icons)

### Google Sans Code

[项目](https://github.com/googlefonts/googlesans-code) · Google and contributors

Google Material 等宽字体 宿主／来源／素材，具体使用范围见来源记录。

- 固定来源／版本: [SHA256:60df2acfe528583efd4f3757b5a023fada111b19292a0d853cbc9cd6e755f35c](https://github.com/gulagala001/oh-my-dsh/blob/main/src/client/skins/google-material-expressive/assets/fonts.json)
- 许可／归属: OFL-1.1 · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#google-material-expressive-skin-fonts-and-icons)

### Noto Sans SC

[项目](https://github.com/google/fonts) · Google and contributors

中文字体子集 宿主／来源／素材，具体使用范围见来源记录。

- 固定来源／版本: [SHA256:60df2acfe528583efd4f3757b5a023fada111b19292a0d853cbc9cd6e755f35c](https://github.com/gulagala001/oh-my-dsh/blob/main/src/client/skins/google-material-expressive/assets/fonts.json)
- 许可／归属: OFL-1.1 · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#google-material-expressive-skin-fonts-and-icons)

### Material Symbols

[项目](https://github.com/google/material-design-icons) · Google and contributors

Google Material 图标 宿主／来源／素材，具体使用范围见来源记录。

- 固定来源／版本: [SHA256:60df2acfe528583efd4f3757b5a023fada111b19292a0d853cbc9cd6e755f35c](https://github.com/gulagala001/oh-my-dsh/blob/main/src/client/skins/google-material-expressive/assets/fonts.json)
- 许可／归属: Apache-2.0 · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#google-material-expressive-skin-fonts-and-icons)

### JetBrains Mono

[项目](https://github.com/JetBrains/JetBrainsMono) · JetBrains and contributors

Claude CLI 主题字体 宿主／来源／素材，具体使用范围见来源记录。

- 固定来源／版本: [SHA256:a76abf002c49097d146e86740a3105a5d00450b1592e820a1109a8c5680cd697](https://github.com/gulagala001/oh-my-dsh/blob/main/src/client/skins/claude-cli-terminal/assets/OFL.txt)
- 许可／归属: OFL-1.1 · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#other-bundled-skin-fonts)

### Claude Code prompt reference

[项目](https://github.com/asgeirtj/system_prompts_leaks) · Anthropic; snapshot maintained by asgeirtj

主代理提示词适配的固定比较来源 宿主／来源／素材，具体使用范围见来源记录。

- 固定来源／版本: [SHA256:eeb4fd3517bf2b72b801c7afa3551eb97af08b998d89df078cea38293ceeb595](https://github.com/gulagala001/oh-my-dsh/blob/main/src/cc-adaptation/prompts/main/01-identity.md)
- 许可／归属: Original upstream rights apply · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#codegraph)

### Codex prompt source

[项目](https://github.com/openai/codex) · OpenAI and contributors

系统提示词风格的固定原文与文本构建 必要宿主适配；原文与许可随包保留。

- 固定来源／版本: [0.164.0](https://github.com/gulagala001/oh-my-dsh/blob/main/src/prompt-styles/upstream/codex/source.json)
- 许可／归属: Apache-2.0 · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#system-prompt-style-sources)

### Cursor public prompt sample

[项目](https://github.com/asgeirtj/system_prompts_leaks) · asgeirtj collection; text attributed to Cursor

系统提示词风格的固定原文与文本构建 必要宿主适配；原文与许可随包保留。

- 固定来源／版本: [public sample 2026-06-04](https://github.com/gulagala001/oh-my-dsh/blob/main/src/prompt-styles/upstream/cursor/source.json)
- 许可／归属: Collection license; third-party material unverified · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#system-prompt-style-sources)

### Pi prompt source

[项目](https://github.com/earendil-works/pi) · Mario Zechner and contributors

系统提示词风格的固定原文与文本构建 必要宿主适配；原文与许可随包保留。

- 固定来源／版本: [1.4.0](https://github.com/gulagala001/oh-my-dsh/blob/main/src/prompt-styles/upstream/pi/source.json)
- 许可／归属: MIT · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#system-prompt-style-sources)

### Grok Build prompt source

[项目](https://github.com/xai-org/grok-build) · xAI and contributors

系统提示词风格的固定原文与文本构建 必要宿主适配；原文与许可随包保留。

- 固定来源／版本: [2bdd1d6a](https://github.com/gulagala001/oh-my-dsh/blob/main/src/prompt-styles/upstream/grok/source.json)
- 许可／归属: Apache-2.0 · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#system-prompt-style-sources)

### ZCode prompt source

[项目](https://github.com/zai-org/ZCode) · Z.ai and contributors

系统提示词风格的固定原文与文本构建 必要宿主适配；原文与许可随包保留。

- 固定来源／版本: [3.16.2 (source)](https://github.com/gulagala001/oh-my-dsh/blob/main/src/prompt-styles/upstream/zcode/source.json)
- 许可／归属: Apache-2.0 · [详细声明](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#system-prompt-style-sources)

## 完整锁定依赖清单

下表列出 OMD 与内置 OpenCU 宿主／前端锁文件中的全部 826 个不同包版本，覆盖直接、间接、构建和可选平台依赖。它们是依赖输入，不代表全部在运行时加载。包页面提供原作者／维护者与许可信息，实际随包许可为准。[机器可读清单](dependencies.json)。

| 依赖 | 版本 | 来源锁文件 |
| --- | --- | --- |
| [@agentclientprotocol/sdk](https://www.npmjs.com/package/@agentclientprotocol/sdk/v/1.4.0) | 1.4.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@anthropic-ai/sdk](https://www.npmjs.com/package/@anthropic-ai/sdk/v/0.129.0) | 0.129.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@asamuzakjp/css-color](https://www.npmjs.com/package/@asamuzakjp/css-color/v/3.2.0) | 3.2.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@ast-grep/wasm](https://www.npmjs.com/package/@ast-grep/wasm/v/0.51.0) | 0.51.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@aws-sdk/client-bedrock-runtime](https://www.npmjs.com/package/@aws-sdk/client-bedrock-runtime/v/3.1127.0) | 3.1127.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@aws-sdk/core](https://www.npmjs.com/package/@aws-sdk/core/v/3.977.9) | 3.977.9 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@aws-sdk/credential-provider-env](https://www.npmjs.com/package/@aws-sdk/credential-provider-env/v/3.972.70) | 3.972.70 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@aws-sdk/credential-provider-http](https://www.npmjs.com/package/@aws-sdk/credential-provider-http/v/3.972.72) | 3.972.72 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@aws-sdk/credential-provider-ini](https://www.npmjs.com/package/@aws-sdk/credential-provider-ini/v/3.973.15) | 3.973.15 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@aws-sdk/credential-provider-login](https://www.npmjs.com/package/@aws-sdk/credential-provider-login/v/3.972.77) | 3.972.77 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@aws-sdk/credential-provider-node](https://www.npmjs.com/package/@aws-sdk/credential-provider-node/v/3.972.82) | 3.972.82 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@aws-sdk/credential-provider-process](https://www.npmjs.com/package/@aws-sdk/credential-provider-process/v/3.972.70) | 3.972.70 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@aws-sdk/credential-provider-sso](https://www.npmjs.com/package/@aws-sdk/credential-provider-sso/v/3.973.14) | 3.973.14 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@aws-sdk/credential-provider-web-identity](https://www.npmjs.com/package/@aws-sdk/credential-provider-web-identity/v/3.972.76) | 3.972.76 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@aws-sdk/eventstream-handler-node](https://www.npmjs.com/package/@aws-sdk/eventstream-handler-node/v/3.972.34) | 3.972.34 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@aws-sdk/middleware-eventstream](https://www.npmjs.com/package/@aws-sdk/middleware-eventstream/v/3.972.29) | 3.972.29 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@aws-sdk/middleware-websocket](https://www.npmjs.com/package/@aws-sdk/middleware-websocket/v/3.972.52) | 3.972.52 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@aws-sdk/nested-clients](https://www.npmjs.com/package/@aws-sdk/nested-clients/v/3.997.44) | 3.997.44 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@aws-sdk/signature-v4-multi-region](https://www.npmjs.com/package/@aws-sdk/signature-v4-multi-region/v/3.996.46) | 3.996.46 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@aws-sdk/token-providers](https://www.npmjs.com/package/@aws-sdk/token-providers/v/3.1116.0) | 3.1116.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@aws-sdk/token-providers](https://www.npmjs.com/package/@aws-sdk/token-providers/v/3.1127.0) | 3.1127.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@aws-sdk/types](https://www.npmjs.com/package/@aws-sdk/types/v/3.974.5) | 3.974.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@aws-sdk/xml-builder](https://www.npmjs.com/package/@aws-sdk/xml-builder/v/3.972.40) | 3.972.40 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@aws/lambda-invoke-store](https://www.npmjs.com/package/@aws/lambda-invoke-store/v/0.3.0) | 0.3.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@babel/code-frame](https://www.npmjs.com/package/@babel/code-frame/v/7.29.7) | 7.29.7 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@babel/generator](https://www.npmjs.com/package/@babel/generator/v/7.29.7) | 7.29.7 | [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@babel/helper-globals](https://www.npmjs.com/package/@babel/helper-globals/v/7.29.7) | 7.29.7 | [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@babel/helper-string-parser](https://www.npmjs.com/package/@babel/helper-string-parser/v/7.29.7) | 7.29.7 | [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@babel/helper-validator-identifier](https://www.npmjs.com/package/@babel/helper-validator-identifier/v/7.29.7) | 7.29.7 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@babel/parser](https://www.npmjs.com/package/@babel/parser/v/7.29.7) | 7.29.7 | [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@babel/runtime](https://www.npmjs.com/package/@babel/runtime/v/7.29.7) | 7.29.7 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@babel/template](https://www.npmjs.com/package/@babel/template/v/7.29.7) | 7.29.7 | [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@babel/traverse](https://www.npmjs.com/package/@babel/traverse/v/7.29.7) | 7.29.7 | [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@babel/types](https://www.npmjs.com/package/@babel/types/v/7.29.8) | 7.29.8 | [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@colbymchenry/codegraph-darwin-arm64](https://www.npmjs.com/package/@colbymchenry/codegraph-darwin-arm64/v/1.6.0) | 1.6.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@colbymchenry/codegraph-darwin-x64](https://www.npmjs.com/package/@colbymchenry/codegraph-darwin-x64/v/1.6.0) | 1.6.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@colbymchenry/codegraph-linux-arm64](https://www.npmjs.com/package/@colbymchenry/codegraph-linux-arm64/v/1.6.0) | 1.6.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@colbymchenry/codegraph-linux-x64](https://www.npmjs.com/package/@colbymchenry/codegraph-linux-x64/v/1.6.0) | 1.6.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@colbymchenry/codegraph-win32-arm64](https://www.npmjs.com/package/@colbymchenry/codegraph-win32-arm64/v/1.6.0) | 1.6.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@colbymchenry/codegraph-win32-x64](https://www.npmjs.com/package/@colbymchenry/codegraph-win32-x64/v/1.6.0) | 1.6.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@colbymchenry/codegraph](https://www.npmjs.com/package/@colbymchenry/codegraph/v/1.6.0) | 1.6.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@csstools/color-helpers](https://www.npmjs.com/package/@csstools/color-helpers/v/5.1.0) | 5.1.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@csstools/css-calc](https://www.npmjs.com/package/@csstools/css-calc/v/2.1.4) | 2.1.4 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@csstools/css-color-parser](https://www.npmjs.com/package/@csstools/css-color-parser/v/3.1.0) | 3.1.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@csstools/css-parser-algorithms](https://www.npmjs.com/package/@csstools/css-parser-algorithms/v/3.0.5) | 3.0.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@csstools/css-tokenizer](https://www.npmjs.com/package/@csstools/css-tokenizer/v/3.0.4) | 3.0.4 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/cordis-plugin-group](https://www.npmjs.com/package/@deepseek-ai/cordis-plugin-group/v/1.0.5) | 1.0.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/cordis-plugin-include](https://www.npmjs.com/package/@deepseek-ai/cordis-plugin-include/v/1.0.10) | 1.0.10 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/cordis-plugin-loader](https://www.npmjs.com/package/@deepseek-ai/cordis-plugin-loader/v/1.0.6) | 1.0.6 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/cordis-plugin-timer](https://www.npmjs.com/package/@deepseek-ai/cordis-plugin-timer/v/1.1.7) | 1.1.7 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/cordis](https://www.npmjs.com/package/@deepseek-ai/cordis/v/4.0.5) | 4.0.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@deepseek-ai/cosmokit](https://www.npmjs.com/package/@deepseek-ai/cosmokit/v/1.8.6) | 1.8.6 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-acp-app](https://www.npmjs.com/package/@deepseek-ai/dsh-acp-app/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-acp](https://www.npmjs.com/package/@deepseek-ai/dsh-acp/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-agent-default-model](https://www.npmjs.com/package/@deepseek-ai/dsh-agent-default-model/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-agent-instructions](https://www.npmjs.com/package/@deepseek-ai/dsh-agent-instructions/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-agent-loop](https://www.npmjs.com/package/@deepseek-ai/dsh-agent-loop/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-agent-preset-registry](https://www.npmjs.com/package/@deepseek-ai/dsh-agent-preset-registry/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-agent-preset](https://www.npmjs.com/package/@deepseek-ai/dsh-agent-preset/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-agent-tool-presentation](https://www.npmjs.com/package/@deepseek-ai/dsh-agent-tool-presentation/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-agent](https://www.npmjs.com/package/@deepseek-ai/dsh-agent/v/0.2.1-rc.1) | 0.2.1-rc.1 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-agent](https://www.npmjs.com/package/@deepseek-ai/dsh-agent/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-anonymous-user-id](https://www.npmjs.com/package/@deepseek-ai/dsh-anonymous-user-id/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-api-account-controller](https://www.npmjs.com/package/@deepseek-ai/dsh-api-account-controller/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-api-gateway](https://www.npmjs.com/package/@deepseek-ai/dsh-api-gateway/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-api-job-controller](https://www.npmjs.com/package/@deepseek-ai/dsh-api-job-controller/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-api-remote-access](https://www.npmjs.com/package/@deepseek-ai/dsh-api-remote-access/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-api-remotes](https://www.npmjs.com/package/@deepseek-ai/dsh-api-remotes/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-api-session-controller](https://www.npmjs.com/package/@deepseek-ai/dsh-api-session-controller/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-api-settings-controller](https://www.npmjs.com/package/@deepseek-ai/dsh-api-settings-controller/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-api-terminal-controller](https://www.npmjs.com/package/@deepseek-ai/dsh-api-terminal-controller/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-api-workspace-controller](https://www.npmjs.com/package/@deepseek-ai/dsh-api-workspace-controller/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-api-workspace-files](https://www.npmjs.com/package/@deepseek-ai/dsh-api-workspace-files/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-app-boot](https://www.npmjs.com/package/@deepseek-ai/dsh-app-boot/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-atomic-write](https://www.npmjs.com/package/@deepseek-ai/dsh-atomic-write/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-attachment-local](https://www.npmjs.com/package/@deepseek-ai/dsh-attachment-local/v/0.2.1-rc.1) | 0.2.1-rc.1 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-attachment-local](https://www.npmjs.com/package/@deepseek-ai/dsh-attachment-local/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-attachment](https://www.npmjs.com/package/@deepseek-ai/dsh-attachment/v/0.2.1-rc.1) | 0.2.1-rc.1 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-attachment](https://www.npmjs.com/package/@deepseek-ai/dsh-attachment/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-authorization](https://www.npmjs.com/package/@deepseek-ai/dsh-authorization/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-base](https://www.npmjs.com/package/@deepseek-ai/dsh-base/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-bash-local](https://www.npmjs.com/package/@deepseek-ai/dsh-bash-local/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-bash-sandbox](https://www.npmjs.com/package/@deepseek-ai/dsh-bash-sandbox/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-brand](https://www.npmjs.com/package/@deepseek-ai/dsh-brand/v/0.2.1-rc.1) | 0.2.1-rc.1 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-brand](https://www.npmjs.com/package/@deepseek-ai/dsh-brand/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-chunked-list](https://www.npmjs.com/package/@deepseek-ai/dsh-chunked-list/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-connection](https://www.npmjs.com/package/@deepseek-ai/dsh-client-connection/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-file-upload](https://www.npmjs.com/package/@deepseek-ai/dsh-client-file-upload/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-hmr](https://www.npmjs.com/package/@deepseek-ai/dsh-client-hmr/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-locale](https://www.npmjs.com/package/@deepseek-ai/dsh-client-locale/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-modules](https://www.npmjs.com/package/@deepseek-ai/dsh-client-modules/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-product-analytics](https://www.npmjs.com/package/@deepseek-ai/dsh-client-product-analytics/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-resources](https://www.npmjs.com/package/@deepseek-ai/dsh-client-resources/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-shortcuts](https://www.npmjs.com/package/@deepseek-ai/dsh-client-shortcuts/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-agent-preset](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-agent-preset/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-approval](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-approval/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-attachment](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-attachment/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-brand-official](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-brand-official/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-chat](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-chat/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-commands](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-commands/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-conversation](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-conversation/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-cordis](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-cordis/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-deepseek-model-label-1017](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-deepseek-model-label-1017/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-deliverables](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-deliverables/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-directory-picker-browse](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-directory-picker-browse/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-directory-picker-native](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-directory-picker-native/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-goal](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-goal/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-input-trigger](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-input-trigger/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-jobs](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-jobs/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-layout](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-layout/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-message-feedback](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-message-feedback/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-model-selection](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-model-selection/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-open-in-app](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-open-in-app/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-permission-presets](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-permission-presets/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-plan](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-plan/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-plugin-manager](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-plugin-manager/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-plugin-market](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-plugin-market/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-reference](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-reference/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-renderer](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-renderer/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-schedule](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-schedule/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-secret-mask](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-secret-mask/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-session](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-session/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-settings-account](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-settings-account/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-settings-agent-loop](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-settings-agent-loop/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-settings-general](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-settings-general/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-settings-models](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-settings-models/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-settings-plugin-inventory](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-settings-plugin-inventory/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-settings-plugins](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-settings-plugins/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-settings-session-log](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-settings-session-log/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-settings-shell](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-settings-shell/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-settings-subagent](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-settings-subagent/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-settings-web-search](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-settings-web-search/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-settings](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-settings/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-shortcuts](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-shortcuts/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-sidebar-browser](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-sidebar-browser/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-sidebar-documentpreview](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-sidebar-documentpreview/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-sidebar-files](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-sidebar-files/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-sidebar-right](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-sidebar-right/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-sidebar-terminal](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-sidebar-terminal/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-sidebar](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-sidebar/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-skill](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-skill/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-subagent](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-subagent/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-theme](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-theme/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-tool](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-tool/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-trajectory](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-trajectory/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-user-questions](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-user-questions/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-workflow-run](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-workflow-run/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-client-ui-workspace](https://www.npmjs.com/package/@deepseek-ai/dsh-client-ui-workspace/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-cmdline](https://www.npmjs.com/package/@deepseek-ai/dsh-cmdline/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-command-compact](https://www.npmjs.com/package/@deepseek-ai/dsh-command-compact/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-command-feedback](https://www.npmjs.com/package/@deepseek-ai/dsh-command-feedback/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-command-goal](https://www.npmjs.com/package/@deepseek-ai/dsh-command-goal/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-commands](https://www.npmjs.com/package/@deepseek-ai/dsh-commands/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-compaction-basic](https://www.npmjs.com/package/@deepseek-ai/dsh-compaction-basic/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-compaction-image-offload](https://www.npmjs.com/package/@deepseek-ai/dsh-compaction-image-offload/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-compaction-tool-result-pruner](https://www.npmjs.com/package/@deepseek-ai/dsh-compaction-tool-result-pruner/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-compaction](https://www.npmjs.com/package/@deepseek-ai/dsh-compaction/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-config-editor](https://www.npmjs.com/package/@deepseek-ai/dsh-config-editor/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-cordis-client-runner](https://www.npmjs.com/package/@deepseek-ai/dsh-cordis-client-runner/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-cordis-host-runner](https://www.npmjs.com/package/@deepseek-ai/dsh-cordis-host-runner/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-credentials-local](https://www.npmjs.com/package/@deepseek-ai/dsh-credentials-local/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-credentials](https://www.npmjs.com/package/@deepseek-ai/dsh-credentials/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-deepseek-account-platform](https://www.npmjs.com/package/@deepseek-ai/dsh-deepseek-account-platform/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-deepseek-account](https://www.npmjs.com/package/@deepseek-ai/dsh-deepseek-account/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-deepseek-llm-api-extensions](https://www.npmjs.com/package/@deepseek-ai/dsh-deepseek-llm-api-extensions/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-deque](https://www.npmjs.com/package/@deepseek-ai/dsh-deque/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-experimental-agent-team-profile](https://www.npmjs.com/package/@deepseek-ai/dsh-experimental-agent-team-profile/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-experimental-agent-team](https://www.npmjs.com/package/@deepseek-ai/dsh-experimental-agent-team/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-experimental-api-speech-to-text](https://www.npmjs.com/package/@deepseek-ai/dsh-experimental-api-speech-to-text/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-experimental-auto-review](https://www.npmjs.com/package/@deepseek-ai/dsh-experimental-auto-review/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-experimental-badge-skill-bundle](https://www.npmjs.com/package/@deepseek-ai/dsh-experimental-badge-skill-bundle/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-experimental-client-ui-agent-team](https://www.npmjs.com/package/@deepseek-ai/dsh-experimental-client-ui-agent-team/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-experimental-client-ui-cot-translation](https://www.npmjs.com/package/@deepseek-ai/dsh-experimental-client-ui-cot-translation/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-experimental-client-ui-voice-input](https://www.npmjs.com/package/@deepseek-ai/dsh-experimental-client-ui-voice-input/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-experimental-cot-translation-bundle](https://www.npmjs.com/package/@deepseek-ai/dsh-experimental-cot-translation-bundle/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-experimental-inspector-profile](https://www.npmjs.com/package/@deepseek-ai/dsh-experimental-inspector-profile/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-experimental-inspector](https://www.npmjs.com/package/@deepseek-ai/dsh-experimental-inspector/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-experimental-plugin-market-bundle](https://www.npmjs.com/package/@deepseek-ai/dsh-experimental-plugin-market-bundle/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-experimental-ralph-bundle](https://www.npmjs.com/package/@deepseek-ai/dsh-experimental-ralph-bundle/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-experimental-session-inspector](https://www.npmjs.com/package/@deepseek-ai/dsh-experimental-session-inspector/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-experimental-session-search](https://www.npmjs.com/package/@deepseek-ai/dsh-experimental-session-search/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-experimental-session-titles-bundle](https://www.npmjs.com/package/@deepseek-ai/dsh-experimental-session-titles-bundle/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-experimental-speech-to-text-sensevoice](https://www.npmjs.com/package/@deepseek-ai/dsh-experimental-speech-to-text-sensevoice/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-experimental-speech-to-text](https://www.npmjs.com/package/@deepseek-ai/dsh-experimental-speech-to-text/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-experimental-terminal-bundle](https://www.npmjs.com/package/@deepseek-ai/dsh-experimental-terminal-bundle/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-experimental-tool-agent-team](https://www.npmjs.com/package/@deepseek-ai/dsh-experimental-tool-agent-team/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-experimental-tool-worktree](https://www.npmjs.com/package/@deepseek-ai/dsh-experimental-tool-worktree/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-experimental-translator](https://www.npmjs.com/package/@deepseek-ai/dsh-experimental-translator/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-experimental-voice-input-bundle](https://www.npmjs.com/package/@deepseek-ai/dsh-experimental-voice-input-bundle/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-experimental-worktree](https://www.npmjs.com/package/@deepseek-ai/dsh-experimental-worktree/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-file-reference-local](https://www.npmjs.com/package/@deepseek-ai/dsh-file-reference-local/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-file-reference](https://www.npmjs.com/package/@deepseek-ai/dsh-file-reference/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-fs-local](https://www.npmjs.com/package/@deepseek-ai/dsh-fs-local/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-fs-observation-policy](https://www.npmjs.com/package/@deepseek-ai/dsh-fs-observation-policy/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-fs-sandbox](https://www.npmjs.com/package/@deepseek-ai/dsh-fs-sandbox/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-fs](https://www.npmjs.com/package/@deepseek-ai/dsh-fs/v/0.2.1-rc.1) | 0.2.1-rc.1 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-fs](https://www.npmjs.com/package/@deepseek-ai/dsh-fs/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-goal-round-driver](https://www.npmjs.com/package/@deepseek-ai/dsh-goal-round-driver/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-goal](https://www.npmjs.com/package/@deepseek-ai/dsh-goal/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-harness-dev-context](https://www.npmjs.com/package/@deepseek-ai/dsh-harness-dev-context/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-headless](https://www.npmjs.com/package/@deepseek-ai/dsh-headless/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-hmr](https://www.npmjs.com/package/@deepseek-ai/dsh-hmr/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-home-paths](https://www.npmjs.com/package/@deepseek-ai/dsh-home-paths/v/0.2.1-rc.1) | 0.2.1-rc.1 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-home-paths](https://www.npmjs.com/package/@deepseek-ai/dsh-home-paths/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-host-directory-picker-auto](https://www.npmjs.com/package/@deepseek-ai/dsh-host-directory-picker-auto/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-host-directory-picker-browse](https://www.npmjs.com/package/@deepseek-ai/dsh-host-directory-picker-browse/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-host-directory-picker-native](https://www.npmjs.com/package/@deepseek-ai/dsh-host-directory-picker-native/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-host-directory-picker](https://www.npmjs.com/package/@deepseek-ai/dsh-host-directory-picker/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-host-frontend-static](https://www.npmjs.com/package/@deepseek-ai/dsh-host-frontend-static/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-host-open-in-app](https://www.npmjs.com/package/@deepseek-ai/dsh-host-open-in-app/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-host-plugin-inventory](https://www.npmjs.com/package/@deepseek-ai/dsh-host-plugin-inventory/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-host-product-telemetry-otel](https://www.npmjs.com/package/@deepseek-ai/dsh-host-product-telemetry-otel/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-host-webserver](https://www.npmjs.com/package/@deepseek-ai/dsh-host-webserver/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-http-proxy](https://www.npmjs.com/package/@deepseek-ai/dsh-http-proxy/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-jobs-local](https://www.npmjs.com/package/@deepseek-ai/dsh-jobs-local/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-jobs](https://www.npmjs.com/package/@deepseek-ai/dsh-jobs/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-launch-environment](https://www.npmjs.com/package/@deepseek-ai/dsh-launch-environment/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-lazy-require](https://www.npmjs.com/package/@deepseek-ai/dsh-lazy-require/v/0.2.1-rc.1) | 0.2.1-rc.1 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-lazy-require](https://www.npmjs.com/package/@deepseek-ai/dsh-lazy-require/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-llm-deepseek-account](https://www.npmjs.com/package/@deepseek-ai/dsh-llm-deepseek-account/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-llm-deepseek-api-key](https://www.npmjs.com/package/@deepseek-ai/dsh-llm-deepseek-api-key/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-llm-deepseek](https://www.npmjs.com/package/@deepseek-ai/dsh-llm-deepseek/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-llm-pi-ai](https://www.npmjs.com/package/@deepseek-ai/dsh-llm-pi-ai/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-llm-retry](https://www.npmjs.com/package/@deepseek-ai/dsh-llm-retry/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-llm](https://www.npmjs.com/package/@deepseek-ai/dsh-llm/v/0.2.1-rc.1) | 0.2.1-rc.1 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-llm](https://www.npmjs.com/package/@deepseek-ai/dsh-llm/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-mcp-client](https://www.npmjs.com/package/@deepseek-ai/dsh-mcp-client/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-mcp-resources](https://www.npmjs.com/package/@deepseek-ai/dsh-mcp-resources/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-message-feedback](https://www.npmjs.com/package/@deepseek-ai/dsh-message-feedback/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-native-command](https://www.npmjs.com/package/@deepseek-ai/dsh-native-command/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-office-to-pdf](https://www.npmjs.com/package/@deepseek-ai/dsh-office-to-pdf/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-otel](https://www.npmjs.com/package/@deepseek-ai/dsh-otel/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-output-retention](https://www.npmjs.com/package/@deepseek-ai/dsh-output-retention/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-package-manifest](https://www.npmjs.com/package/@deepseek-ai/dsh-package-manifest/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-permission-presets](https://www.npmjs.com/package/@deepseek-ai/dsh-permission-presets/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-persona](https://www.npmjs.com/package/@deepseek-ai/dsh-persona/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-plan-mode](https://www.npmjs.com/package/@deepseek-ai/dsh-plan-mode/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-plugin-manager](https://www.npmjs.com/package/@deepseek-ai/dsh-plugin-manager/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-plugin-market-index](https://www.npmjs.com/package/@deepseek-ai/dsh-plugin-market-index/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-plugin-market](https://www.npmjs.com/package/@deepseek-ai/dsh-plugin-market/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-plugin-package-inventory-deepseek](https://www.npmjs.com/package/@deepseek-ai/dsh-plugin-package-inventory-deepseek/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-ptc-runtime-node](https://www.npmjs.com/package/@deepseek-ai/dsh-ptc-runtime-node/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-ptc-runtime](https://www.npmjs.com/package/@deepseek-ai/dsh-ptc-runtime/v/0.2.1-rc.1) | 0.2.1-rc.1 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-ptc-runtime](https://www.npmjs.com/package/@deepseek-ai/dsh-ptc-runtime/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-pwsh-local](https://www.npmjs.com/package/@deepseek-ai/dsh-pwsh-local/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-pwsh-sandbox](https://www.npmjs.com/package/@deepseek-ai/dsh-pwsh-sandbox/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-repeat-tool-reminder](https://www.npmjs.com/package/@deepseek-ai/dsh-repeat-tool-reminder/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-sandbox-local](https://www.npmjs.com/package/@deepseek-ai/dsh-sandbox-local/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-sandbox-policy](https://www.npmjs.com/package/@deepseek-ai/dsh-sandbox-policy/v/0.2.1-rc.1) | 0.2.1-rc.1 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-sandbox-policy](https://www.npmjs.com/package/@deepseek-ai/dsh-sandbox-policy/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-sandbox-windows-acl](https://www.npmjs.com/package/@deepseek-ai/dsh-sandbox-windows-acl/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-sandbox](https://www.npmjs.com/package/@deepseek-ai/dsh-sandbox/v/0.2.1-rc.1) | 0.2.1-rc.1 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-sandbox](https://www.npmjs.com/package/@deepseek-ai/dsh-sandbox/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-schedule](https://www.npmjs.com/package/@deepseek-ai/dsh-schedule/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-scope](https://www.npmjs.com/package/@deepseek-ai/dsh-scope/v/0.2.1-rc.1) | 0.2.1-rc.1 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-scope](https://www.npmjs.com/package/@deepseek-ai/dsh-scope/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-sdk-app](https://www.npmjs.com/package/@deepseek-ai/dsh-sdk-app/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-sdk-jsonrpc-server](https://www.npmjs.com/package/@deepseek-ai/dsh-sdk-jsonrpc-server/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-sdk-minimal](https://www.npmjs.com/package/@deepseek-ai/dsh-sdk-minimal/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-sdk-protocol](https://www.npmjs.com/package/@deepseek-ai/dsh-sdk-protocol/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-session-checkpoint-policy](https://www.npmjs.com/package/@deepseek-ai/dsh-session-checkpoint-policy/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-session-format-catalog](https://www.npmjs.com/package/@deepseek-ai/dsh-session-format-catalog/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-session-format-v0-to-v1](https://www.npmjs.com/package/@deepseek-ai/dsh-session-format-v0-to-v1/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-session-format-v1-to-v2](https://www.npmjs.com/package/@deepseek-ai/dsh-session-format-v1-to-v2/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-session-format-v2-to-v3](https://www.npmjs.com/package/@deepseek-ai/dsh-session-format-v2-to-v3/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-session-format-v3-to-v4](https://www.npmjs.com/package/@deepseek-ai/dsh-session-format-v3-to-v4/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-session-format](https://www.npmjs.com/package/@deepseek-ai/dsh-session-format/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-session-log-deepseek](https://www.npmjs.com/package/@deepseek-ai/dsh-session-log-deepseek/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-session-log-export](https://www.npmjs.com/package/@deepseek-ai/dsh-session-log-export/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-session-persistence-jsonl](https://www.npmjs.com/package/@deepseek-ai/dsh-session-persistence-jsonl/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-session-persistence](https://www.npmjs.com/package/@deepseek-ai/dsh-session-persistence/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-session-projection-cache](https://www.npmjs.com/package/@deepseek-ai/dsh-session-projection-cache/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-session-projection](https://www.npmjs.com/package/@deepseek-ai/dsh-session-projection/v/0.2.1-rc.1) | 0.2.1-rc.1 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-session-projection](https://www.npmjs.com/package/@deepseek-ai/dsh-session-projection/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-session-query-sqlite](https://www.npmjs.com/package/@deepseek-ai/dsh-session-query-sqlite/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-session-query](https://www.npmjs.com/package/@deepseek-ai/dsh-session-query/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-session-reference](https://www.npmjs.com/package/@deepseek-ai/dsh-session-reference/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-session-stats](https://www.npmjs.com/package/@deepseek-ai/dsh-session-stats/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-session-telemetry-otel](https://www.npmjs.com/package/@deepseek-ai/dsh-session-telemetry-otel/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-session-telemetry](https://www.npmjs.com/package/@deepseek-ai/dsh-session-telemetry/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-session-title-all-prompts-llm](https://www.npmjs.com/package/@deepseek-ai/dsh-session-title-all-prompts-llm/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-session-title-first-prompt-llm](https://www.npmjs.com/package/@deepseek-ai/dsh-session-title-first-prompt-llm/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-session-title-llm](https://www.npmjs.com/package/@deepseek-ai/dsh-session-title-llm/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-session-title](https://www.npmjs.com/package/@deepseek-ai/dsh-session-title/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-session-turn-outline](https://www.npmjs.com/package/@deepseek-ai/dsh-session-turn-outline/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-session](https://www.npmjs.com/package/@deepseek-ai/dsh-session/v/0.2.1-rc.1) | 0.2.1-rc.1 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-session](https://www.npmjs.com/package/@deepseek-ai/dsh-session/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-settings](https://www.npmjs.com/package/@deepseek-ai/dsh-settings/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-shell-env](https://www.npmjs.com/package/@deepseek-ai/dsh-shell-env/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-shell](https://www.npmjs.com/package/@deepseek-ai/dsh-shell/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-skill-badge](https://www.npmjs.com/package/@deepseek-ai/dsh-skill-badge/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-skill-filesystem](https://www.npmjs.com/package/@deepseek-ai/dsh-skill-filesystem/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-skill-office](https://www.npmjs.com/package/@deepseek-ai/dsh-skill-office/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-skill](https://www.npmjs.com/package/@deepseek-ai/dsh-skill/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-spill-local](https://www.npmjs.com/package/@deepseek-ai/dsh-spill-local/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-spill-policy](https://www.npmjs.com/package/@deepseek-ai/dsh-spill-policy/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-spill](https://www.npmjs.com/package/@deepseek-ai/dsh-spill/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-storage-domain](https://www.npmjs.com/package/@deepseek-ai/dsh-storage-domain/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-storage-json](https://www.npmjs.com/package/@deepseek-ai/dsh-storage-json/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-storage](https://www.npmjs.com/package/@deepseek-ai/dsh-storage/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-subagent-fork-in-process](https://www.npmjs.com/package/@deepseek-ai/dsh-subagent-fork-in-process/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-subagent-spawn-in-process](https://www.npmjs.com/package/@deepseek-ai/dsh-subagent-spawn-in-process/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-subagent](https://www.npmjs.com/package/@deepseek-ai/dsh-subagent/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-subprocess-local](https://www.npmjs.com/package/@deepseek-ai/dsh-subprocess-local/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-subprocess](https://www.npmjs.com/package/@deepseek-ai/dsh-subprocess/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-system-prompt](https://www.npmjs.com/package/@deepseek-ai/dsh-system-prompt/v/0.2.1-rc.1) | 0.2.1-rc.1 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-system-prompt](https://www.npmjs.com/package/@deepseek-ai/dsh-system-prompt/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-terminal-bash](https://www.npmjs.com/package/@deepseek-ai/dsh-terminal-bash/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-terminal](https://www.npmjs.com/package/@deepseek-ai/dsh-terminal/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-time-context](https://www.npmjs.com/package/@deepseek-ai/dsh-time-context/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-timeout](https://www.npmjs.com/package/@deepseek-ai/dsh-timeout/v/0.2.1-rc.1) | 0.2.1-rc.1 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-timeout](https://www.npmjs.com/package/@deepseek-ai/dsh-timeout/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-tmux-context](https://www.npmjs.com/package/@deepseek-ai/dsh-tmux-context/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-token-meter](https://www.npmjs.com/package/@deepseek-ai/dsh-token-meter/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-tool-ask-user](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-ask-user/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-tool-bash-persistent](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-bash-persistent/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-tool-bash](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-bash/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-tool-call-timeout-policy](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-call-timeout-policy/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-tool-cordis](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-cordis/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-tool-fs-search](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-fs-search/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-tool-fs](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-fs/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-tool-goal](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-goal/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-tool-jobs](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-jobs/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-tool-present](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-present/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-tool-pwsh-persistent](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-pwsh-persistent/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-tool-pwsh](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-pwsh/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-tool-ralph](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-ralph/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-tool-schedule](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-schedule/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-tool-session-query](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-session-query/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-tool-skill](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-skill/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-tool-str-replace-editor](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-str-replace-editor/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-tool-subagent-control](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-subagent-control/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-tool-subagent](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-subagent/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-tool-terminal](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-terminal/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-tool-todo](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-todo/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-tool-web](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-web/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-tool-workflow](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-workflow/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-tool-working-directory](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-working-directory/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-tool-workspace-dependencies](https://www.npmjs.com/package/@deepseek-ai/dsh-tool-workspace-dependencies/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-tools](https://www.npmjs.com/package/@deepseek-ai/dsh-tools/v/0.2.1-rc.1) | 0.2.1-rc.1 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-tools](https://www.npmjs.com/package/@deepseek-ai/dsh-tools/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-typert-loader](https://www.npmjs.com/package/@deepseek-ai/dsh-typert-loader/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-typert-protocol](https://www.npmjs.com/package/@deepseek-ai/dsh-typert-protocol/v/0.2.1-rc.1) | 0.2.1-rc.1 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-typert-protocol](https://www.npmjs.com/package/@deepseek-ai/dsh-typert-protocol/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-typert-registry](https://www.npmjs.com/package/@deepseek-ai/dsh-typert-registry/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-user-approval](https://www.npmjs.com/package/@deepseek-ai/dsh-user-approval/v/0.2.1-rc.1) | 0.2.1-rc.1 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-user-approval](https://www.npmjs.com/package/@deepseek-ai/dsh-user-approval/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-user-questions](https://www.npmjs.com/package/@deepseek-ai/dsh-user-questions/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-util-code-language](https://www.npmjs.com/package/@deepseek-ai/dsh-util-code-language/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-util-crypto](https://www.npmjs.com/package/@deepseek-ai/dsh-util-crypto/v/0.2.1-rc.1) | 0.2.1-rc.1 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-util-crypto](https://www.npmjs.com/package/@deepseek-ai/dsh-util-crypto/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-util-time](https://www.npmjs.com/package/@deepseek-ai/dsh-util-time/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-util-values](https://www.npmjs.com/package/@deepseek-ai/dsh-util-values/v/0.2.1-rc.1) | 0.2.1-rc.1 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-util-values](https://www.npmjs.com/package/@deepseek-ai/dsh-util-values/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-util-workspace-path](https://www.npmjs.com/package/@deepseek-ai/dsh-util-workspace-path/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-web-app](https://www.npmjs.com/package/@deepseek-ai/dsh-web-app/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-web-deepseek-api](https://www.npmjs.com/package/@deepseek-ai/dsh-web-deepseek-api/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-web-fetch-http](https://www.npmjs.com/package/@deepseek-ai/dsh-web-fetch-http/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-web-frontend](https://www.npmjs.com/package/@deepseek-ai/dsh-web-frontend/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-web-search-deepseek](https://www.npmjs.com/package/@deepseek-ai/dsh-web-search-deepseek/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-web](https://www.npmjs.com/package/@deepseek-ai/dsh-web/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-win32-process](https://www.npmjs.com/package/@deepseek-ai/dsh-win32-process/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-workflow-ptc](https://www.npmjs.com/package/@deepseek-ai/dsh-workflow-ptc/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-workflow](https://www.npmjs.com/package/@deepseek-ai/dsh-workflow/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-working-directory](https://www.npmjs.com/package/@deepseek-ai/dsh-working-directory/v/0.2.1-rc.1) | 0.2.1-rc.1 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-working-directory](https://www.npmjs.com/package/@deepseek-ai/dsh-working-directory/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-workspace-changes](https://www.npmjs.com/package/@deepseek-ai/dsh-workspace-changes/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh-workspace](https://www.npmjs.com/package/@deepseek-ai/dsh-workspace/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/dsh](https://www.npmjs.com/package/@deepseek-ai/dsh/v/0.2.1-rc.2) | 0.2.1-rc.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/libreoffice-kit-darwin-arm64](https://www.npmjs.com/package/@deepseek-ai/libreoffice-kit-darwin-arm64/v/0.1.5) | 0.1.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/libreoffice-kit-darwin-x64](https://www.npmjs.com/package/@deepseek-ai/libreoffice-kit-darwin-x64/v/0.1.5) | 0.1.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/libreoffice-kit-wasm](https://www.npmjs.com/package/@deepseek-ai/libreoffice-kit-wasm/v/0.1.5) | 0.1.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/libreoffice-kit-win32-arm64](https://www.npmjs.com/package/@deepseek-ai/libreoffice-kit-win32-arm64/v/0.1.5) | 0.1.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/libreoffice-kit-win32-x64](https://www.npmjs.com/package/@deepseek-ai/libreoffice-kit-win32-x64/v/0.1.5) | 0.1.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/libreoffice-kit](https://www.npmjs.com/package/@deepseek-ai/libreoffice-kit/v/0.1.5) | 0.1.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/node-addon-system-darwin-arm64](https://www.npmjs.com/package/@deepseek-ai/node-addon-system-darwin-arm64/v/0.1.2) | 0.1.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/node-addon-system-darwin-x64](https://www.npmjs.com/package/@deepseek-ai/node-addon-system-darwin-x64/v/0.1.2) | 0.1.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/node-addon-system-linux-arm64](https://www.npmjs.com/package/@deepseek-ai/node-addon-system-linux-arm64/v/0.1.2) | 0.1.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/node-addon-system-linux-x64](https://www.npmjs.com/package/@deepseek-ai/node-addon-system-linux-x64/v/0.1.2) | 0.1.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/node-addon-system](https://www.npmjs.com/package/@deepseek-ai/node-addon-system/v/0.1.2) | 0.1.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@deepseek-ai/schemastery](https://www.npmjs.com/package/@deepseek-ai/schemastery/v/3.18.5) | 3.18.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@earendil-works/pi-ai](https://www.npmjs.com/package/@earendil-works/pi-ai/v/1.1.0) | 1.1.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@earendil-works/pi-telemetry](https://www.npmjs.com/package/@earendil-works/pi-telemetry/v/1.1.0) | 1.1.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@electron-internal/extract-zip](https://www.npmjs.com/package/@electron-internal/extract-zip/v/1.0.5) | 1.0.5 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@electron/get](https://www.npmjs.com/package/@electron/get/v/5.1.0) | 5.1.0 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@emnapi/runtime](https://www.npmjs.com/package/@emnapi/runtime/v/1.11.3) | 1.11.3 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@esbuild/aix-ppc64](https://www.npmjs.com/package/@esbuild/aix-ppc64/v/0.25.12) | 0.25.12 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@esbuild/android-arm](https://www.npmjs.com/package/@esbuild/android-arm/v/0.25.12) | 0.25.12 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@esbuild/android-arm64](https://www.npmjs.com/package/@esbuild/android-arm64/v/0.25.12) | 0.25.12 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@esbuild/android-x64](https://www.npmjs.com/package/@esbuild/android-x64/v/0.25.12) | 0.25.12 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@esbuild/darwin-arm64](https://www.npmjs.com/package/@esbuild/darwin-arm64/v/0.25.12) | 0.25.12 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@esbuild/darwin-x64](https://www.npmjs.com/package/@esbuild/darwin-x64/v/0.25.12) | 0.25.12 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@esbuild/freebsd-arm64](https://www.npmjs.com/package/@esbuild/freebsd-arm64/v/0.25.12) | 0.25.12 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@esbuild/freebsd-x64](https://www.npmjs.com/package/@esbuild/freebsd-x64/v/0.25.12) | 0.25.12 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@esbuild/linux-arm](https://www.npmjs.com/package/@esbuild/linux-arm/v/0.25.12) | 0.25.12 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@esbuild/linux-arm64](https://www.npmjs.com/package/@esbuild/linux-arm64/v/0.25.12) | 0.25.12 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@esbuild/linux-ia32](https://www.npmjs.com/package/@esbuild/linux-ia32/v/0.25.12) | 0.25.12 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@esbuild/linux-loong64](https://www.npmjs.com/package/@esbuild/linux-loong64/v/0.25.12) | 0.25.12 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@esbuild/linux-mips64el](https://www.npmjs.com/package/@esbuild/linux-mips64el/v/0.25.12) | 0.25.12 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@esbuild/linux-ppc64](https://www.npmjs.com/package/@esbuild/linux-ppc64/v/0.25.12) | 0.25.12 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@esbuild/linux-riscv64](https://www.npmjs.com/package/@esbuild/linux-riscv64/v/0.25.12) | 0.25.12 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@esbuild/linux-s390x](https://www.npmjs.com/package/@esbuild/linux-s390x/v/0.25.12) | 0.25.12 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@esbuild/linux-x64](https://www.npmjs.com/package/@esbuild/linux-x64/v/0.25.12) | 0.25.12 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@esbuild/netbsd-arm64](https://www.npmjs.com/package/@esbuild/netbsd-arm64/v/0.25.12) | 0.25.12 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@esbuild/netbsd-x64](https://www.npmjs.com/package/@esbuild/netbsd-x64/v/0.25.12) | 0.25.12 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@esbuild/openbsd-arm64](https://www.npmjs.com/package/@esbuild/openbsd-arm64/v/0.25.12) | 0.25.12 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@esbuild/openbsd-x64](https://www.npmjs.com/package/@esbuild/openbsd-x64/v/0.25.12) | 0.25.12 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@esbuild/openharmony-arm64](https://www.npmjs.com/package/@esbuild/openharmony-arm64/v/0.25.12) | 0.25.12 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@esbuild/sunos-x64](https://www.npmjs.com/package/@esbuild/sunos-x64/v/0.25.12) | 0.25.12 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@esbuild/win32-arm64](https://www.npmjs.com/package/@esbuild/win32-arm64/v/0.25.12) | 0.25.12 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@esbuild/win32-ia32](https://www.npmjs.com/package/@esbuild/win32-ia32/v/0.25.12) | 0.25.12 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@esbuild/win32-x64](https://www.npmjs.com/package/@esbuild/win32-x64/v/0.25.12) | 0.25.12 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@eslint-community/regexpp](https://www.npmjs.com/package/@eslint-community/regexpp/v/4.12.2) | 4.12.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@google/genai](https://www.npmjs.com/package/@google/genai/v/2.21.0) | 2.21.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@hono/node-server](https://www.npmjs.com/package/@hono/node-server/v/2.1.1) | 2.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@img/colour](https://www.npmjs.com/package/@img/colour/v/1.1.0) | 1.1.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@img/sharp-darwin-arm64](https://www.npmjs.com/package/@img/sharp-darwin-arm64/v/0.35.5) | 0.35.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@img/sharp-darwin-x64](https://www.npmjs.com/package/@img/sharp-darwin-x64/v/0.35.5) | 0.35.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@img/sharp-freebsd-wasm32](https://www.npmjs.com/package/@img/sharp-freebsd-wasm32/v/0.35.5) | 0.35.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@img/sharp-libvips-darwin-arm64](https://www.npmjs.com/package/@img/sharp-libvips-darwin-arm64/v/1.3.4) | 1.3.4 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@img/sharp-libvips-darwin-x64](https://www.npmjs.com/package/@img/sharp-libvips-darwin-x64/v/1.3.4) | 1.3.4 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@img/sharp-libvips-linux-arm](https://www.npmjs.com/package/@img/sharp-libvips-linux-arm/v/1.3.4) | 1.3.4 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@img/sharp-libvips-linux-arm64](https://www.npmjs.com/package/@img/sharp-libvips-linux-arm64/v/1.3.4) | 1.3.4 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@img/sharp-libvips-linux-ppc64](https://www.npmjs.com/package/@img/sharp-libvips-linux-ppc64/v/1.3.4) | 1.3.4 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@img/sharp-libvips-linux-riscv64](https://www.npmjs.com/package/@img/sharp-libvips-linux-riscv64/v/1.3.4) | 1.3.4 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@img/sharp-libvips-linux-s390x](https://www.npmjs.com/package/@img/sharp-libvips-linux-s390x/v/1.3.4) | 1.3.4 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@img/sharp-libvips-linux-x64](https://www.npmjs.com/package/@img/sharp-libvips-linux-x64/v/1.3.4) | 1.3.4 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@img/sharp-libvips-linuxmusl-arm64](https://www.npmjs.com/package/@img/sharp-libvips-linuxmusl-arm64/v/1.3.4) | 1.3.4 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@img/sharp-libvips-linuxmusl-x64](https://www.npmjs.com/package/@img/sharp-libvips-linuxmusl-x64/v/1.3.4) | 1.3.4 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@img/sharp-linux-arm](https://www.npmjs.com/package/@img/sharp-linux-arm/v/0.35.5) | 0.35.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@img/sharp-linux-arm64](https://www.npmjs.com/package/@img/sharp-linux-arm64/v/0.35.5) | 0.35.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@img/sharp-linux-ppc64](https://www.npmjs.com/package/@img/sharp-linux-ppc64/v/0.35.5) | 0.35.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@img/sharp-linux-riscv64](https://www.npmjs.com/package/@img/sharp-linux-riscv64/v/0.35.5) | 0.35.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@img/sharp-linux-s390x](https://www.npmjs.com/package/@img/sharp-linux-s390x/v/0.35.5) | 0.35.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@img/sharp-linux-x64](https://www.npmjs.com/package/@img/sharp-linux-x64/v/0.35.5) | 0.35.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@img/sharp-linuxmusl-arm64](https://www.npmjs.com/package/@img/sharp-linuxmusl-arm64/v/0.35.5) | 0.35.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@img/sharp-linuxmusl-x64](https://www.npmjs.com/package/@img/sharp-linuxmusl-x64/v/0.35.5) | 0.35.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@img/sharp-wasm32](https://www.npmjs.com/package/@img/sharp-wasm32/v/0.35.5) | 0.35.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@img/sharp-webcontainers-wasm32](https://www.npmjs.com/package/@img/sharp-webcontainers-wasm32/v/0.35.5) | 0.35.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@img/sharp-win32-arm64](https://www.npmjs.com/package/@img/sharp-win32-arm64/v/0.35.5) | 0.35.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@img/sharp-win32-ia32](https://www.npmjs.com/package/@img/sharp-win32-ia32/v/0.35.5) | 0.35.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@img/sharp-win32-x64](https://www.npmjs.com/package/@img/sharp-win32-x64/v/0.35.5) | 0.35.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@joplin/turndown-plugin-gfm](https://www.npmjs.com/package/@joplin/turndown-plugin-gfm/v/1.0.68) | 1.0.68 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@jridgewell/gen-mapping](https://www.npmjs.com/package/@jridgewell/gen-mapping/v/0.3.13) | 0.3.13 | [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@jridgewell/resolve-uri](https://www.npmjs.com/package/@jridgewell/resolve-uri/v/3.1.2) | 3.1.2 | [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@jridgewell/sourcemap-codec](https://www.npmjs.com/package/@jridgewell/sourcemap-codec/v/1.6.0) | 1.6.0 | [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@jridgewell/trace-mapping](https://www.npmjs.com/package/@jridgewell/trace-mapping/v/0.3.31) | 0.3.31 | [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [@js-temporal/polyfill](https://www.npmjs.com/package/@js-temporal/polyfill/v/0.5.1) | 0.5.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@keyv/serialize](https://www.npmjs.com/package/@keyv/serialize/v/1.1.1) | 1.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@koromix/koffi-darwin-arm64](https://www.npmjs.com/package/@koromix/koffi-darwin-arm64/v/3.1.1) | 3.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@koromix/koffi-darwin-x64](https://www.npmjs.com/package/@koromix/koffi-darwin-x64/v/3.1.1) | 3.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@koromix/koffi-freebsd-arm64](https://www.npmjs.com/package/@koromix/koffi-freebsd-arm64/v/3.1.1) | 3.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@koromix/koffi-freebsd-ia32](https://www.npmjs.com/package/@koromix/koffi-freebsd-ia32/v/3.1.1) | 3.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@koromix/koffi-freebsd-x64](https://www.npmjs.com/package/@koromix/koffi-freebsd-x64/v/3.1.1) | 3.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@koromix/koffi-linux-arm64](https://www.npmjs.com/package/@koromix/koffi-linux-arm64/v/3.1.1) | 3.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@koromix/koffi-linux-ia32](https://www.npmjs.com/package/@koromix/koffi-linux-ia32/v/3.1.1) | 3.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@koromix/koffi-linux-loong64](https://www.npmjs.com/package/@koromix/koffi-linux-loong64/v/3.1.1) | 3.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@koromix/koffi-linux-riscv64](https://www.npmjs.com/package/@koromix/koffi-linux-riscv64/v/3.1.1) | 3.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@koromix/koffi-linux-x64](https://www.npmjs.com/package/@koromix/koffi-linux-x64/v/3.1.1) | 3.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@koromix/koffi-openbsd-ia32](https://www.npmjs.com/package/@koromix/koffi-openbsd-ia32/v/3.1.1) | 3.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@koromix/koffi-openbsd-x64](https://www.npmjs.com/package/@koromix/koffi-openbsd-x64/v/3.1.1) | 3.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@koromix/koffi-win32-arm64](https://www.npmjs.com/package/@koromix/koffi-win32-arm64/v/3.1.1) | 3.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@koromix/koffi-win32-ia32](https://www.npmjs.com/package/@koromix/koffi-win32-ia32/v/3.1.1) | 3.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@koromix/koffi-win32-x64](https://www.npmjs.com/package/@koromix/koffi-win32-x64/v/3.1.1) | 3.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@mermaid-js/tiny](https://www.npmjs.com/package/@mermaid-js/tiny/v/12.0.0) | 12.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@mixmark-io/domino](https://www.npmjs.com/package/@mixmark-io/domino/v/2.2.0) | 2.2.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@modelcontextprotocol/client](https://www.npmjs.com/package/@modelcontextprotocol/client/v/2.2.0) | 2.2.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@modelcontextprotocol/core](https://www.npmjs.com/package/@modelcontextprotocol/core/v/2.2.0) | 2.2.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk/v/1.30.0) | 1.30.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@mozilla/readability](https://www.npmjs.com/package/@mozilla/readability/v/0.6.0) | 0.6.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@opentelemetry/api-logs](https://www.npmjs.com/package/@opentelemetry/api-logs/v/0.222.0) | 0.222.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@opentelemetry/api](https://www.npmjs.com/package/@opentelemetry/api/v/1.9.1) | 1.9.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@opentelemetry/core](https://www.npmjs.com/package/@opentelemetry/core/v/2.11.0) | 2.11.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@opentelemetry/otlp-exporter-base](https://www.npmjs.com/package/@opentelemetry/otlp-exporter-base/v/0.222.0) | 0.222.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@opentelemetry/otlp-transformer](https://www.npmjs.com/package/@opentelemetry/otlp-transformer/v/0.222.0) | 0.222.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@opentelemetry/resources](https://www.npmjs.com/package/@opentelemetry/resources/v/2.11.0) | 2.11.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@opentelemetry/sdk-logs](https://www.npmjs.com/package/@opentelemetry/sdk-logs/v/0.222.0) | 0.222.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@opentelemetry/sdk-metrics](https://www.npmjs.com/package/@opentelemetry/sdk-metrics/v/2.11.0) | 2.11.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@opentelemetry/sdk-trace](https://www.npmjs.com/package/@opentelemetry/sdk-trace/v/2.11.0) | 2.11.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@opentelemetry/semantic-conventions](https://www.npmjs.com/package/@opentelemetry/semantic-conventions/v/1.43.0) | 1.43.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@protobufjs/aspromise](https://www.npmjs.com/package/@protobufjs/aspromise/v/1.1.2) | 1.1.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@protobufjs/base64](https://www.npmjs.com/package/@protobufjs/base64/v/1.1.2) | 1.1.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@protobufjs/codegen](https://www.npmjs.com/package/@protobufjs/codegen/v/2.0.5) | 2.0.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@protobufjs/eventemitter](https://www.npmjs.com/package/@protobufjs/eventemitter/v/1.1.1) | 1.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@protobufjs/fetch](https://www.npmjs.com/package/@protobufjs/fetch/v/1.1.1) | 1.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@protobufjs/float](https://www.npmjs.com/package/@protobufjs/float/v/1.0.2) | 1.0.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@protobufjs/path](https://www.npmjs.com/package/@protobufjs/path/v/1.1.2) | 1.1.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@protobufjs/pool](https://www.npmjs.com/package/@protobufjs/pool/v/1.1.0) | 1.1.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@protobufjs/utf8](https://www.npmjs.com/package/@protobufjs/utf8/v/1.1.2) | 1.1.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@sec-ant/readable-stream](https://www.npmjs.com/package/@sec-ant/readable-stream/v/0.4.1) | 0.4.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@selderee/plugin-htmlparser2](https://www.npmjs.com/package/@selderee/plugin-htmlparser2/v/0.12.0) | 0.12.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@sindresorhus/is](https://www.npmjs.com/package/@sindresorhus/is/v/7.2.0) | 7.2.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@sindresorhus/merge-streams](https://www.npmjs.com/package/@sindresorhus/merge-streams/v/4.0.0) | 4.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@smithy/core](https://www.npmjs.com/package/@smithy/core/v/3.33.3) | 3.33.3 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@smithy/credential-provider-imds](https://www.npmjs.com/package/@smithy/credential-provider-imds/v/4.5.2) | 4.5.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@smithy/fetch-http-handler](https://www.npmjs.com/package/@smithy/fetch-http-handler/v/5.8.0) | 5.8.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@smithy/node-http-handler](https://www.npmjs.com/package/@smithy/node-http-handler/v/4.12.1) | 4.12.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@smithy/signature-v4](https://www.npmjs.com/package/@smithy/signature-v4/v/5.7.3) | 5.7.3 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@smithy/types](https://www.npmjs.com/package/@smithy/types/v/4.18.0) | 4.18.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@stablelib/base64](https://www.npmjs.com/package/@stablelib/base64/v/1.0.1) | 1.0.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@standard-schema/spec](https://www.npmjs.com/package/@standard-schema/spec/v/1.1.0) | 1.1.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@swc/helpers](https://www.npmjs.com/package/@swc/helpers/v/0.5.23) | 0.5.23 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@toon-format/toon](https://www.npmjs.com/package/@toon-format/toon/v/4.4.0) | 4.4.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@types/http-cache-semantics](https://www.npmjs.com/package/@types/http-cache-semantics/v/4.2.0) | 4.2.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@types/node](https://www.npmjs.com/package/@types/node/v/22.20.1) | 22.20.1 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@types/node](https://www.npmjs.com/package/@types/node/v/24.19.2) | 24.19.2 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [@types/node](https://www.npmjs.com/package/@types/node/v/26.5.0) | 26.5.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@types/retry](https://www.npmjs.com/package/@types/retry/v/0.12.0) | 0.12.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@vscode/ripgrep-darwin-arm64](https://www.npmjs.com/package/@vscode/ripgrep-darwin-arm64/v/1.18.0) | 1.18.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@vscode/ripgrep-darwin-x64](https://www.npmjs.com/package/@vscode/ripgrep-darwin-x64/v/1.18.0) | 1.18.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@vscode/ripgrep-linux-arm](https://www.npmjs.com/package/@vscode/ripgrep-linux-arm/v/1.18.0) | 1.18.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@vscode/ripgrep-linux-arm64](https://www.npmjs.com/package/@vscode/ripgrep-linux-arm64/v/1.18.0) | 1.18.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@vscode/ripgrep-linux-ia32](https://www.npmjs.com/package/@vscode/ripgrep-linux-ia32/v/1.18.0) | 1.18.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@vscode/ripgrep-linux-ppc64](https://www.npmjs.com/package/@vscode/ripgrep-linux-ppc64/v/1.18.0) | 1.18.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@vscode/ripgrep-linux-riscv64](https://www.npmjs.com/package/@vscode/ripgrep-linux-riscv64/v/1.18.0) | 1.18.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@vscode/ripgrep-linux-s390x](https://www.npmjs.com/package/@vscode/ripgrep-linux-s390x/v/1.18.0) | 1.18.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@vscode/ripgrep-linux-x64](https://www.npmjs.com/package/@vscode/ripgrep-linux-x64/v/1.18.0) | 1.18.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@vscode/ripgrep-win32-arm64](https://www.npmjs.com/package/@vscode/ripgrep-win32-arm64/v/1.18.0) | 1.18.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@vscode/ripgrep-win32-ia32](https://www.npmjs.com/package/@vscode/ripgrep-win32-ia32/v/1.18.0) | 1.18.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@vscode/ripgrep-win32-x64](https://www.npmjs.com/package/@vscode/ripgrep-win32-x64/v/1.18.0) | 1.18.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@vscode/ripgrep](https://www.npmjs.com/package/@vscode/ripgrep/v/1.18.0) | 1.18.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@vscode/tree-sitter-wasm](https://www.npmjs.com/package/@vscode/tree-sitter-wasm/v/0.3.1) | 0.3.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@xterm/addon-serialize](https://www.npmjs.com/package/@xterm/addon-serialize/v/0.14.0) | 0.14.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [@xterm/headless](https://www.npmjs.com/package/@xterm/headless/v/6.0.0) | 6.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [accepts](https://www.npmjs.com/package/accepts/v/2.0.0) | 2.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [acorn](https://www.npmjs.com/package/acorn/v/8.18.0) | 8.18.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [agent-base](https://www.npmjs.com/package/agent-base/v/7.1.4) | 7.1.4 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [agent-base](https://www.npmjs.com/package/agent-base/v/9.0.0) | 9.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [ajv-formats](https://www.npmjs.com/package/ajv-formats/v/3.0.1) | 3.0.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [ajv](https://www.npmjs.com/package/ajv/v/8.20.0) | 8.20.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [argparse](https://www.npmjs.com/package/argparse/v/2.0.1) | 2.0.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [base64-js](https://www.npmjs.com/package/base64-js/v/1.5.1) | 1.5.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [bignumber.js](https://www.npmjs.com/package/bignumber.js/v/9.3.1) | 9.3.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [body-parser](https://www.npmjs.com/package/body-parser/v/2.3.0) | 2.3.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [bowser](https://www.npmjs.com/package/bowser/v/2.14.1) | 2.14.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [brotli](https://www.npmjs.com/package/brotli/v/1.3.3) | 1.3.3 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [buffer-equal-constant-time](https://www.npmjs.com/package/buffer-equal-constant-time/v/1.0.1) | 1.0.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [bundle-name](https://www.npmjs.com/package/bundle-name/v/4.1.0) | 4.1.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [byte-counter](https://www.npmjs.com/package/byte-counter/v/0.1.0) | 0.1.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [bytes](https://www.npmjs.com/package/bytes/v/3.1.2) | 3.1.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [cacheable-lookup](https://www.npmjs.com/package/cacheable-lookup/v/7.0.0) | 7.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [cacheable-request](https://www.npmjs.com/package/cacheable-request/v/13.0.19) | 13.0.19 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [call-bind-apply-helpers](https://www.npmjs.com/package/call-bind-apply-helpers/v/1.0.2) | 1.0.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [call-bound](https://www.npmjs.com/package/call-bound/v/1.0.4) | 1.0.4 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [chokidar](https://www.npmjs.com/package/chokidar/v/5.0.0) | 5.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [clone](https://www.npmjs.com/package/clone/v/2.1.2) | 2.1.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [commander](https://www.npmjs.com/package/commander/v/15.0.0) | 15.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [compressible](https://www.npmjs.com/package/compressible/v/2.0.18) | 2.0.18 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [compression](https://www.npmjs.com/package/compression/v/1.8.1) | 1.8.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [content-disposition](https://www.npmjs.com/package/content-disposition/v/1.1.0) | 1.1.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [content-type](https://www.npmjs.com/package/content-type/v/1.0.5) | 1.0.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [content-type](https://www.npmjs.com/package/content-type/v/2.1.0) | 2.1.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [cookie-signature](https://www.npmjs.com/package/cookie-signature/v/1.2.2) | 1.2.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [cookie](https://www.npmjs.com/package/cookie/v/0.7.2) | 0.7.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [cors](https://www.npmjs.com/package/cors/v/2.8.6) | 2.8.6 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [cross-spawn](https://www.npmjs.com/package/cross-spawn/v/7.0.6) | 7.0.6 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [cssstyle](https://www.npmjs.com/package/cssstyle/v/4.6.0) | 4.6.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [data-uri-to-buffer](https://www.npmjs.com/package/data-uri-to-buffer/v/4.0.1) | 4.0.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [data-urls](https://www.npmjs.com/package/data-urls/v/5.0.0) | 5.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [debug](https://www.npmjs.com/package/debug/v/2.6.9) | 2.6.9 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [debug](https://www.npmjs.com/package/debug/v/4.4.3) | 4.4.3 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [decimal.js](https://www.npmjs.com/package/decimal.js/v/10.6.0) | 10.6.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [decompress-response](https://www.npmjs.com/package/decompress-response/v/10.0.0) | 10.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [deepmerge-ts](https://www.npmjs.com/package/deepmerge-ts/v/8.0.2) | 8.0.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [default-browser-id](https://www.npmjs.com/package/default-browser-id/v/5.0.1) | 5.0.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [default-browser](https://www.npmjs.com/package/default-browser/v/5.5.1) | 5.5.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [define-lazy-prop](https://www.npmjs.com/package/define-lazy-prop/v/3.0.0) | 3.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [depd](https://www.npmjs.com/package/depd/v/2.0.0) | 2.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [detect-libc](https://www.npmjs.com/package/detect-libc/v/2.1.2) | 2.1.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [dfa](https://www.npmjs.com/package/dfa/v/1.2.0) | 1.2.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [diff](https://www.npmjs.com/package/diff/v/9.0.0) | 9.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [dom-serializer](https://www.npmjs.com/package/dom-serializer/v/2.0.0) | 2.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [domelementtype](https://www.npmjs.com/package/domelementtype/v/2.3.0) | 2.3.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [domhandler](https://www.npmjs.com/package/domhandler/v/5.0.3) | 5.0.3 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [domutils](https://www.npmjs.com/package/domutils/v/3.2.2) | 3.2.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [dunder-proto](https://www.npmjs.com/package/dunder-proto/v/1.0.1) | 1.0.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [ecdsa-sig-formatter](https://www.npmjs.com/package/ecdsa-sig-formatter/v/1.0.11) | 1.0.11 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [ee-first](https://www.npmjs.com/package/ee-first/v/1.1.1) | 1.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [electron-chrome-extensions](https://www.npmjs.com/package/electron-chrome-extensions/v/4.9.0) | 4.9.0 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [electron](https://www.npmjs.com/package/electron/v/44.7.0) | 44.7.0 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [encodeurl](https://www.npmjs.com/package/encodeurl/v/2.0.0) | 2.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [entities](https://www.npmjs.com/package/entities/v/4.5.0) | 4.5.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [entities](https://www.npmjs.com/package/entities/v/6.0.1) | 6.0.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [entities](https://www.npmjs.com/package/entities/v/7.0.1) | 7.0.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [env-paths](https://www.npmjs.com/package/env-paths/v/3.0.0) | 3.0.0 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [es-define-property](https://www.npmjs.com/package/es-define-property/v/1.0.1) | 1.0.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [es-errors](https://www.npmjs.com/package/es-errors/v/1.3.0) | 1.3.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [es-object-atoms](https://www.npmjs.com/package/es-object-atoms/v/1.1.2) | 1.1.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [esbuild](https://www.npmjs.com/package/esbuild/v/0.25.12) | 0.25.12 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [escape-html](https://www.npmjs.com/package/escape-html/v/1.0.3) | 1.0.3 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [etag](https://www.npmjs.com/package/etag/v/1.8.1) | 1.8.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [eventsource-parser](https://www.npmjs.com/package/eventsource-parser/v/3.1.1) | 3.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [eventsource](https://www.npmjs.com/package/eventsource/v/3.0.7) | 3.0.7 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [execa](https://www.npmjs.com/package/execa/v/10.0.1) | 10.0.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [express-rate-limit](https://www.npmjs.com/package/express-rate-limit/v/8.7.0) | 8.7.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [express](https://www.npmjs.com/package/express/v/5.2.1) | 5.2.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [extend](https://www.npmjs.com/package/extend/v/3.0.2) | 3.0.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [fast-deep-equal](https://www.npmjs.com/package/fast-deep-equal/v/3.1.3) | 3.1.3 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [fast-sha256](https://www.npmjs.com/package/fast-sha256/v/1.3.0) | 1.3.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [fast-uri](https://www.npmjs.com/package/fast-uri/v/3.1.7) | 3.1.7 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [fetch-blob](https://www.npmjs.com/package/fetch-blob/v/3.2.0) | 3.2.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [fflate](https://www.npmjs.com/package/fflate/v/0.8.3) | 0.8.3 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [figures](https://www.npmjs.com/package/figures/v/6.1.0) | 6.1.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [finalhandler](https://www.npmjs.com/package/finalhandler/v/2.1.1) | 2.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [fontkit](https://www.npmjs.com/package/fontkit/v/2.0.4) | 2.0.4 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [form-data-encoder](https://www.npmjs.com/package/form-data-encoder/v/4.1.0) | 4.1.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [formdata-polyfill](https://www.npmjs.com/package/formdata-polyfill/v/4.0.10) | 4.0.10 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [forwarded](https://www.npmjs.com/package/forwarded/v/0.2.0) | 0.2.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [fresh](https://www.npmjs.com/package/fresh/v/2.0.0) | 2.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [function-bind](https://www.npmjs.com/package/function-bind/v/1.1.2) | 1.1.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [gaxios](https://www.npmjs.com/package/gaxios/v/7.3.1) | 7.3.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [gcp-metadata](https://www.npmjs.com/package/gcp-metadata/v/8.1.2) | 8.1.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [get-intrinsic](https://www.npmjs.com/package/get-intrinsic/v/1.3.0) | 1.3.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [get-proto](https://www.npmjs.com/package/get-proto/v/1.0.1) | 1.0.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [get-stream](https://www.npmjs.com/package/get-stream/v/9.0.1) | 9.0.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [google-auth-library](https://www.npmjs.com/package/google-auth-library/v/10.9.1) | 10.9.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [google-logging-utils](https://www.npmjs.com/package/google-logging-utils/v/1.1.3) | 1.1.3 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [gopd](https://www.npmjs.com/package/gopd/v/1.2.0) | 1.2.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [got](https://www.npmjs.com/package/got/v/14.6.6) | 14.6.6 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [graceful-fs](https://www.npmjs.com/package/graceful-fs/v/4.2.11) | 4.2.11 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [has-symbols](https://www.npmjs.com/package/has-symbols/v/1.1.0) | 1.1.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [hasown](https://www.npmjs.com/package/hasown/v/2.0.4) | 2.0.4 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [hono](https://www.npmjs.com/package/hono/v/4.13.7) | 4.13.7 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [html-encoding-sniffer](https://www.npmjs.com/package/html-encoding-sniffer/v/4.0.0) | 4.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [html-to-text](https://www.npmjs.com/package/html-to-text/v/10.0.1) | 10.0.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [htmlparser2](https://www.npmjs.com/package/htmlparser2/v/10.1.0) | 10.1.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [http-cache-semantics](https://www.npmjs.com/package/http-cache-semantics/v/4.2.0) | 4.2.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [http-errors](https://www.npmjs.com/package/http-errors/v/2.0.1) | 2.0.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [http-proxy-agent](https://www.npmjs.com/package/http-proxy-agent/v/7.0.2) | 7.0.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [http-proxy-agent](https://www.npmjs.com/package/http-proxy-agent/v/9.1.0) | 9.1.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [http2-wrapper](https://www.npmjs.com/package/http2-wrapper/v/2.2.1) | 2.2.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [https-proxy-agent](https://www.npmjs.com/package/https-proxy-agent/v/7.0.6) | 7.0.6 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [https-proxy-agent](https://www.npmjs.com/package/https-proxy-agent/v/9.1.0) | 9.1.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [human-signals](https://www.npmjs.com/package/human-signals/v/8.0.1) | 8.0.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [iconv-lite](https://www.npmjs.com/package/iconv-lite/v/0.6.3) | 0.6.3 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [iconv-lite](https://www.npmjs.com/package/iconv-lite/v/0.7.3) | 0.7.3 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [inherits](https://www.npmjs.com/package/inherits/v/2.0.4) | 2.0.4 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [ip-address](https://www.npmjs.com/package/ip-address/v/10.7.0) | 10.7.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [ipaddr.js](https://www.npmjs.com/package/ipaddr.js/v/1.9.1) | 1.9.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [ipaddr.js](https://www.npmjs.com/package/ipaddr.js/v/2.5.0) | 2.5.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [is-docker](https://www.npmjs.com/package/is-docker/v/3.0.0) | 3.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [is-in-ssh](https://www.npmjs.com/package/is-in-ssh/v/1.0.0) | 1.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [is-inside-container](https://www.npmjs.com/package/is-inside-container/v/1.0.0) | 1.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [is-plain-obj](https://www.npmjs.com/package/is-plain-obj/v/4.1.0) | 4.1.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [is-potential-custom-element-name](https://www.npmjs.com/package/is-potential-custom-element-name/v/1.0.1) | 1.0.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [is-promise](https://www.npmjs.com/package/is-promise/v/4.0.0) | 4.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [is-stream](https://www.npmjs.com/package/is-stream/v/4.0.1) | 4.0.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [is-unicode-supported](https://www.npmjs.com/package/is-unicode-supported/v/2.1.0) | 2.1.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [is-wsl](https://www.npmjs.com/package/is-wsl/v/3.1.1) | 3.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [isexe](https://www.npmjs.com/package/isexe/v/2.0.0) | 2.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [jose](https://www.npmjs.com/package/jose/v/6.2.12) | 6.2.12 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [js-tokens](https://www.npmjs.com/package/js-tokens/v/4.0.0) | 4.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [js-yaml](https://www.npmjs.com/package/js-yaml/v/4.3.2) | 4.3.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [jsbi](https://www.npmjs.com/package/jsbi/v/4.3.2) | 4.3.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [jsdom](https://www.npmjs.com/package/jsdom/v/26.1.0) | 26.1.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [jsesc](https://www.npmjs.com/package/jsesc/v/3.1.0) | 3.1.0 | [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [json-bigint](https://www.npmjs.com/package/json-bigint/v/1.0.0) | 1.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [json-schema-to-ts](https://www.npmjs.com/package/json-schema-to-ts/v/3.1.1) | 3.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [json-schema-traverse](https://www.npmjs.com/package/json-schema-traverse/v/1.0.0) | 1.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [json-schema-typed](https://www.npmjs.com/package/json-schema-typed/v/8.0.2) | 8.0.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [jwa](https://www.npmjs.com/package/jwa/v/2.0.1) | 2.0.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [jws](https://www.npmjs.com/package/jws/v/4.0.1) | 4.0.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [keyv](https://www.npmjs.com/package/keyv/v/5.6.0) | 5.6.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [koffi](https://www.npmjs.com/package/koffi/v/3.1.1) | 3.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [leac](https://www.npmjs.com/package/leac/v/0.7.0) | 0.7.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [long](https://www.npmjs.com/package/long/v/5.3.2) | 5.3.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [loose-envify](https://www.npmjs.com/package/loose-envify/v/1.4.0) | 1.4.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [lowercase-keys](https://www.npmjs.com/package/lowercase-keys/v/3.0.0) | 3.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [lru-cache](https://www.npmjs.com/package/lru-cache/v/10.4.3) | 10.4.3 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [marked](https://www.npmjs.com/package/marked/v/18.0.12) | 18.0.12 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [math-intrinsics](https://www.npmjs.com/package/math-intrinsics/v/1.1.0) | 1.1.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [media-typer](https://www.npmjs.com/package/media-typer/v/1.1.1) | 1.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [merge-descriptors](https://www.npmjs.com/package/merge-descriptors/v/2.0.0) | 2.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [mime-db](https://www.npmjs.com/package/mime-db/v/1.54.0) | 1.54.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [mime-types](https://www.npmjs.com/package/mime-types/v/3.0.2) | 3.0.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [mimic-response](https://www.npmjs.com/package/mimic-response/v/4.0.0) | 4.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [minisearch](https://www.npmjs.com/package/minisearch/v/7.2.0) | 7.2.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [ms](https://www.npmjs.com/package/ms/v/2.0.0) | 2.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [ms](https://www.npmjs.com/package/ms/v/2.1.3) | 2.1.3 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [negotiator](https://www.npmjs.com/package/negotiator/v/0.6.4) | 0.6.4 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [negotiator](https://www.npmjs.com/package/negotiator/v/1.1.0) | 1.1.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [node-addon-api](https://www.npmjs.com/package/node-addon-api/v/7.1.1) | 7.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [node-addon-native-custom-loader](https://www.npmjs.com/package/node-addon-native-custom-loader/v/0.1.9) | 0.1.9 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [node-addon-require-builtin-darwin-arm64](https://www.npmjs.com/package/node-addon-require-builtin-darwin-arm64/v/0.1.9) | 0.1.9 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [node-addon-require-builtin-darwin-x64](https://www.npmjs.com/package/node-addon-require-builtin-darwin-x64/v/0.1.9) | 0.1.9 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [node-addon-require-builtin-linux-arm64-gnu](https://www.npmjs.com/package/node-addon-require-builtin-linux-arm64-gnu/v/0.1.9) | 0.1.9 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [node-addon-require-builtin-linux-arm64-musl](https://www.npmjs.com/package/node-addon-require-builtin-linux-arm64-musl/v/0.1.9) | 0.1.9 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [node-addon-require-builtin-linux-x64-gnu](https://www.npmjs.com/package/node-addon-require-builtin-linux-x64-gnu/v/0.1.9) | 0.1.9 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [node-addon-require-builtin-linux-x64-musl](https://www.npmjs.com/package/node-addon-require-builtin-linux-x64-musl/v/0.1.9) | 0.1.9 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [node-addon-require-builtin-win32-arm64-msvc](https://www.npmjs.com/package/node-addon-require-builtin-win32-arm64-msvc/v/0.1.9) | 0.1.9 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [node-addon-require-builtin-win32-ia32-msvc](https://www.npmjs.com/package/node-addon-require-builtin-win32-ia32-msvc/v/0.1.9) | 0.1.9 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [node-addon-require-builtin-win32-x64-msvc](https://www.npmjs.com/package/node-addon-require-builtin-win32-x64-msvc/v/0.1.9) | 0.1.9 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [node-addon-require-builtin](https://www.npmjs.com/package/node-addon-require-builtin/v/0.1.9) | 0.1.9 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [node-domexception](https://www.npmjs.com/package/node-domexception/v/1.0.0) | 1.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [node-fetch](https://www.npmjs.com/package/node-fetch/v/3.3.2) | 3.3.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [node-pty](https://www.npmjs.com/package/node-pty/v/1.2.0-beta.15) | 1.2.0-beta.15 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [normalize-url](https://www.npmjs.com/package/normalize-url/v/8.1.1) | 8.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [npm-run-path](https://www.npmjs.com/package/npm-run-path/v/6.0.0) | 6.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [nwsapi](https://www.npmjs.com/package/nwsapi/v/2.2.28) | 2.2.28 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [object-assign](https://www.npmjs.com/package/object-assign/v/4.1.1) | 4.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [object-inspect](https://www.npmjs.com/package/object-inspect/v/1.13.4) | 1.13.4 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [on-finished](https://www.npmjs.com/package/on-finished/v/2.4.1) | 2.4.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [on-headers](https://www.npmjs.com/package/on-headers/v/1.1.0) | 1.1.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [once](https://www.npmjs.com/package/once/v/1.4.0) | 1.4.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [open](https://www.npmjs.com/package/open/v/11.0.2) | 11.0.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [openai](https://www.npmjs.com/package/openai/v/7.19.0) | 7.19.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [p-cancelable](https://www.npmjs.com/package/p-cancelable/v/4.0.1) | 4.0.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [p-limit](https://www.npmjs.com/package/p-limit/v/7.3.3) | 7.3.3 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [p-retry](https://www.npmjs.com/package/p-retry/v/4.6.2) | 4.6.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [pako](https://www.npmjs.com/package/pako/v/0.2.9) | 0.2.9 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [parse-ms](https://www.npmjs.com/package/parse-ms/v/4.0.0) | 4.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [parse5](https://www.npmjs.com/package/parse5/v/7.3.0) | 7.3.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [parseley](https://www.npmjs.com/package/parseley/v/0.13.1) | 0.13.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [parseurl](https://www.npmjs.com/package/parseurl/v/1.3.3) | 1.3.3 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [partial-json](https://www.npmjs.com/package/partial-json/v/0.1.7) | 0.1.7 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [path-key](https://www.npmjs.com/package/path-key/v/3.1.1) | 3.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [path-key](https://www.npmjs.com/package/path-key/v/4.0.0) | 4.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [path-to-regexp](https://www.npmjs.com/package/path-to-regexp/v/8.4.2) | 8.4.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [peberminta](https://www.npmjs.com/package/peberminta/v/0.10.0) | 0.10.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [picocolors](https://www.npmjs.com/package/picocolors/v/1.1.1) | 1.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [picomatch](https://www.npmjs.com/package/picomatch/v/4.0.7) | 4.0.7 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [pkce-challenge](https://www.npmjs.com/package/pkce-challenge/v/5.0.1) | 5.0.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [playwright-core](https://www.npmjs.com/package/playwright-core/v/1.63.0) | 1.63.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [playwright](https://www.npmjs.com/package/playwright/v/1.63.0) | 1.63.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [powershell-utils](https://www.npmjs.com/package/powershell-utils/v/0.1.0) | 0.1.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [powershell-utils](https://www.npmjs.com/package/powershell-utils/v/0.2.1) | 0.2.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [pretty-ms](https://www.npmjs.com/package/pretty-ms/v/9.3.1) | 9.3.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [progress](https://www.npmjs.com/package/progress/v/2.0.3) | 2.0.3 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [protobufjs](https://www.npmjs.com/package/protobufjs/v/7.6.6) | 7.6.6 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [proxy-addr](https://www.npmjs.com/package/proxy-addr/v/2.0.7) | 2.0.7 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [proxy-agent-negotiate](https://www.npmjs.com/package/proxy-agent-negotiate/v/1.1.0) | 1.1.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [punycode](https://www.npmjs.com/package/punycode/v/2.3.1) | 2.3.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [qs](https://www.npmjs.com/package/qs/v/6.16.0) | 6.16.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [quick-lru](https://www.npmjs.com/package/quick-lru/v/5.1.1) | 5.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [range-parser](https://www.npmjs.com/package/range-parser/v/1.3.0) | 1.3.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [raw-body](https://www.npmjs.com/package/raw-body/v/3.0.2) | 3.0.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [react-compiler-runtime](https://www.npmjs.com/package/react-compiler-runtime/v/1.0.0) | 1.0.0 | [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [react-dom](https://www.npmjs.com/package/react-dom/v/18.3.1) | 18.3.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [react-dom](https://www.npmjs.com/package/react-dom/v/19.2.7) | 19.2.7 | [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [react](https://www.npmjs.com/package/react/v/18.3.1) | 18.3.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [react](https://www.npmjs.com/package/react/v/19.2.7) | 19.2.7 | [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [readdirp](https://www.npmjs.com/package/readdirp/v/5.1.1) | 5.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [require-from-string](https://www.npmjs.com/package/require-from-string/v/2.0.2) | 2.0.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [resolve-alpn](https://www.npmjs.com/package/resolve-alpn/v/1.2.1) | 1.2.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [resolve.exports](https://www.npmjs.com/package/resolve.exports/v/2.0.3) | 2.0.3 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [responselike](https://www.npmjs.com/package/responselike/v/4.0.2) | 4.0.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [restructure](https://www.npmjs.com/package/restructure/v/3.0.2) | 3.0.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [retry](https://www.npmjs.com/package/retry/v/0.13.1) | 0.13.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [router](https://www.npmjs.com/package/router/v/2.2.0) | 2.2.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [rrweb-cssom](https://www.npmjs.com/package/rrweb-cssom/v/0.8.0) | 0.8.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [run-applescript](https://www.npmjs.com/package/run-applescript/v/7.1.0) | 7.1.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [safe-buffer](https://www.npmjs.com/package/safe-buffer/v/5.2.1) | 5.2.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [safer-buffer](https://www.npmjs.com/package/safer-buffer/v/2.1.2) | 2.1.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [saxes](https://www.npmjs.com/package/saxes/v/6.0.0) | 6.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [scheduler](https://www.npmjs.com/package/scheduler/v/0.23.2) | 0.23.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [scheduler](https://www.npmjs.com/package/scheduler/v/0.27.0) | 0.27.0 | [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [selderee](https://www.npmjs.com/package/selderee/v/0.12.0) | 0.12.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [semver](https://www.npmjs.com/package/semver/v/7.8.5) | 7.8.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [send](https://www.npmjs.com/package/send/v/1.2.1) | 1.2.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [serve-static](https://www.npmjs.com/package/serve-static/v/2.2.1) | 2.2.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [setprototypeof](https://www.npmjs.com/package/setprototypeof/v/1.2.0) | 1.2.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [sharp](https://www.npmjs.com/package/sharp/v/0.35.5) | 0.35.5 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [shebang-command](https://www.npmjs.com/package/shebang-command/v/2.0.0) | 2.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [shebang-regex](https://www.npmjs.com/package/shebang-regex/v/3.0.0) | 3.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [sherpa-onnx-darwin-arm64](https://www.npmjs.com/package/sherpa-onnx-darwin-arm64/v/1.13.8) | 1.13.8 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [sherpa-onnx-darwin-x64](https://www.npmjs.com/package/sherpa-onnx-darwin-x64/v/1.13.8) | 1.13.8 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [sherpa-onnx-linux-arm64](https://www.npmjs.com/package/sherpa-onnx-linux-arm64/v/1.13.8) | 1.13.8 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [sherpa-onnx-linux-x64](https://www.npmjs.com/package/sherpa-onnx-linux-x64/v/1.13.8) | 1.13.8 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [sherpa-onnx-node](https://www.npmjs.com/package/sherpa-onnx-node/v/1.13.8) | 1.13.8 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [sherpa-onnx-win-ia32](https://www.npmjs.com/package/sherpa-onnx-win-ia32/v/1.13.8) | 1.13.8 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [sherpa-onnx-win-x64](https://www.npmjs.com/package/sherpa-onnx-win-x64/v/1.13.8) | 1.13.8 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [side-channel-list](https://www.npmjs.com/package/side-channel-list/v/1.0.1) | 1.0.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [side-channel-map](https://www.npmjs.com/package/side-channel-map/v/1.0.1) | 1.0.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [side-channel-weakmap](https://www.npmjs.com/package/side-channel-weakmap/v/1.0.2) | 1.0.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [side-channel](https://www.npmjs.com/package/side-channel/v/1.1.1) | 1.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [signal-exit](https://www.npmjs.com/package/signal-exit/v/4.1.0) | 4.1.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [standardwebhooks](https://www.npmjs.com/package/standardwebhooks/v/1.1.1) | 1.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [statuses](https://www.npmjs.com/package/statuses/v/2.0.2) | 2.0.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [strip-final-newline](https://www.npmjs.com/package/strip-final-newline/v/4.0.0) | 4.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [sumchecker](https://www.npmjs.com/package/sumchecker/v/3.0.1) | 3.0.1 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [symbol-tree](https://www.npmjs.com/package/symbol-tree/v/3.2.4) | 3.2.4 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [tiny-inflate](https://www.npmjs.com/package/tiny-inflate/v/1.0.3) | 1.0.3 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [tldts-core](https://www.npmjs.com/package/tldts-core/v/6.1.86) | 6.1.86 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [tldts](https://www.npmjs.com/package/tldts/v/6.1.86) | 6.1.86 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [toidentifier](https://www.npmjs.com/package/toidentifier/v/1.0.1) | 1.0.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [tough-cookie](https://www.npmjs.com/package/tough-cookie/v/5.1.2) | 5.1.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [tr46](https://www.npmjs.com/package/tr46/v/5.1.1) | 5.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [ts-algebra](https://www.npmjs.com/package/ts-algebra/v/2.0.0) | 2.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [tslib](https://www.npmjs.com/package/tslib/v/2.8.1) | 2.8.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [turndown](https://www.npmjs.com/package/turndown/v/7.2.4) | 7.2.4 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [type-fest](https://www.npmjs.com/package/type-fest/v/4.41.0) | 4.41.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [type-is](https://www.npmjs.com/package/type-is/v/2.1.0) | 2.1.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [typebox](https://www.npmjs.com/package/typebox/v/1.3.27) | 1.3.27 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [typescript](https://www.npmjs.com/package/typescript/v/6.0.3) | 6.0.3 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [undici-types](https://www.npmjs.com/package/undici-types/v/6.21.0) | 6.21.0 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [undici-types](https://www.npmjs.com/package/undici-types/v/7.24.6) | 7.24.6 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [undici-types](https://www.npmjs.com/package/undici-types/v/8.9.0) | 8.9.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [undici](https://www.npmjs.com/package/undici/v/7.30.1) | 7.30.1 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [undici](https://www.npmjs.com/package/undici/v/8.11.2) | 8.11.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [unicode-properties](https://www.npmjs.com/package/unicode-properties/v/1.4.1) | 1.4.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [unicode-trie](https://www.npmjs.com/package/unicode-trie/v/2.0.0) | 2.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [unicorn-magic](https://www.npmjs.com/package/unicorn-magic/v/0.3.0) | 0.3.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [unpipe](https://www.npmjs.com/package/unpipe/v/1.0.0) | 1.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [vary](https://www.npmjs.com/package/vary/v/1.1.2) | 1.1.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [w3c-xmlserializer](https://www.npmjs.com/package/w3c-xmlserializer/v/5.0.0) | 5.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [web-streams-polyfill](https://www.npmjs.com/package/web-streams-polyfill/v/3.3.3) | 3.3.3 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [web-tree-sitter](https://www.npmjs.com/package/web-tree-sitter/v/0.26.0) | 0.26.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [webidl-conversions](https://www.npmjs.com/package/webidl-conversions/v/7.0.0) | 7.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [whatwg-encoding](https://www.npmjs.com/package/whatwg-encoding/v/3.1.1) | 3.1.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [whatwg-mimetype](https://www.npmjs.com/package/whatwg-mimetype/v/4.0.0) | 4.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [whatwg-url](https://www.npmjs.com/package/whatwg-url/v/14.2.0) | 14.2.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [which-command](https://www.npmjs.com/package/which-command/v/0.1.0) | 0.1.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [which](https://www.npmjs.com/package/which/v/2.0.2) | 2.0.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [wrappy](https://www.npmjs.com/package/wrappy/v/1.0.2) | 1.0.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [ws](https://www.npmjs.com/package/ws/v/8.21.3) | 8.21.3 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [wsl-utils](https://www.npmjs.com/package/wsl-utils/v/1.0.0) | 1.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [xml-name-validator](https://www.npmjs.com/package/xml-name-validator/v/5.0.0) | 5.0.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [xmlchars](https://www.npmjs.com/package/xmlchars/v/2.2.0) | 2.2.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [yaml](https://www.npmjs.com/package/yaml/v/2.8.1) | 2.8.1 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [yaml](https://www.npmjs.com/package/yaml/v/2.9.0) | 2.9.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [yocto-queue](https://www.npmjs.com/package/yocto-queue/v/1.2.2) | 1.2.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [yoctocolors](https://www.npmjs.com/package/yoctocolors/v/2.2.0) | 2.2.0 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [zod-to-json-schema](https://www.npmjs.com/package/zod-to-json-schema/v/3.25.2) | 3.25.2 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) |
| [zod](https://www.npmjs.com/package/zod/v/4.4.3) | 4.4.3 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |
| [zod](https://www.npmjs.com/package/zod/v/4.5.4) | 4.5.4 | [pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/frontend/pnpm-lock.yaml) |
| [zod](https://www.npmjs.com/package/zod/v/4.6.7) | 4.6.7 | [vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/rc1/pnpm-lock.yaml) · [vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/host/build-inputs/021rc2/pnpm-lock.yaml) |

## 历史与维护

JasonQQ 的 BTW 实现在 OMD 0.99.0 及以前使用，0.99.1 已切换为自有 DSH BTW；历史发行来源保留对应署名。当前条目由 `src/project-catalog.json`、推荐目录、组件清单和依赖锁文件共同生成。改变输入后运行 `npm run credits:write`；`npm run credits:check` 会拒绝过期文档或运行时清单。
