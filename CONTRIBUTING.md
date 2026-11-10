# 参与改进 Oh My DSH

[文档目录](docs/README.md) · [开发](docs/development.md) · [排障](docs/troubleshooting.md)

欢迎修 Bug、改交互、补文档。拿不准分类就开普通 Issue。

- 报告问题：[Bug 模板](https://github.com/gulagala001/oh-my-dsh/issues/new?template=bug-report.yml)
- 功能建议：[建议模板](https://github.com/gulagala001/oh-my-dsh/issues/new?template=feature-request.yml)
- 推荐第三方插件：开一个建议 Issue，写明仓库、固定发行包、适配的 DSH 版本和许可证。

## 开发约定

- OMD 自己的代码用根目录的 MIT 许可，第三方材料沿用原许可。改许可时同步包元数据、中英首页和来源说明；公开文件检查会核对声明和包内 LICENSE。
- 优先用 DSH 公共 SDK 和扩展点，不手改 SDK、生成文件或 `vendor/opencu/`。
- OpenCU、Workflow、Rewind、Persona 和 BTW 在各自仓库维护，用对应的 `scripts/sync-*.mjs` 同步快照和来源清单，不直接改 vendor 或 `plugins/persona`。OpenCU 同版本的服务端模块、宿主源码和文档可以用 `sync-opencu.mjs <source> --files <paths...>` 只同步已提交的文件；文件集合、版本、前端或生成输入变了，仍走完整构建和包同步。
- 组件和价格的同步命令会自动重新生成设置页和公开来源清单。手改其他来源输入后运行 `npm run credits:write`，再跑 `npm run docs:check`。
- 系统提示词原文和许可放在 `src/prompt-styles/upstream/<来源>/`，`source.json` 记录固定提交、核对日期和原始字节哈希，公开样本要注明非官方。适配只处理宿主差异，不改写风格。改了来源后运行 `node scripts/check-prompt-styles.mjs --write` 和 `npm run prompts:check`。
- Claude Desktop 外观的固定来源和适配范围在 `src/client/skins/claude-desktop/source.json`，原许可在 `vendor/licenses/Open-Claude-UI-MIT.txt`，升级时人工核对上游。增减主题或配色时，同步中英入口、主题基座和网站预览。
- 工作过程标题的布局统一在 `scripts/chat-style-adapter.mjs`，通过原生 Chat 样式生效，不放进皮肤开关。`test/process-header-layout.test.mjs` 只在相关 UI、样式、宿主源码或依赖锁变化时运行，手动 CI 可勾选 `layout`。
- composer 槽位由 `scripts/chat-style-adapter.mjs` 在指纹核对后用 AST 提取导出，槽位缺失、重复、未知或顺序是动态的都会阻止构建。改动后运行 `node --test test/chat-style-adapter.test.mjs` 并重建受影响的客户端。
- Shell 和任务控制的适配在 `scripts/build-host.mjs` 核对固定宿主源码后应用。升级宿主时复核两种 Shell 的终止等待和任务控制的注册位置，并运行 `node --test test/job-wait-cancel.test.mjs`。
- 独立聊天从创建到发送用同一个会话和目录，改标题不挪文件。`scripts/build-open-in-app.mjs` 在构建时核对原生客户端字节和两个选择器替换点；构建指纹只说明替换点没变，真实目录行为另外检查。
- 回退存储策略变更要同步独立插件、内置快照、使用指南和 CHANGELOG，并检查容量上限、低磁盘、并发写入和清理后的恢复。
- 插件自己的日志事件通过宿主 `appendPluginRecord` 写入，普通 `Session.append` 不接收 `ignorable`。涉及事件持久化时，用真实 Session 和原生冷恢复检查。
- 自有工具用 `checkedTool` 注册，范围和互斥要求由工具执行层校验。`npm run tools:check` 核对 Native 对象参数和 TypeScript／Python SDK，构建、CI 和 prepack 都会运行。
- 宿主浏览器组件用 `scripts/host-build-contracts.mjs` 核对 SDK 和组件身份、ModuleLoader 注册、样式归属和唯一替换锚点。依赖通过宿主解析，不扫描 `.pnpm` 目录挑副本；离线平铺布局要能生成相同产物。源码编辑按原始 AST 从后往前应用。
- DSH 0.2.2-rc.1 构建保留原始源码提交和 tag，并在 `vendor/host-artifacts.json` 记录目标官方 npm 工件。构建会逐文件核对复用模块、类型声明和源文件与目标 SDK 的摘要；SDK、框架和锁精确匹配。桌面适配前，七个未修改源码的桌面入口要先重建成和官方包相同的字节。
- 测试用隔离的数据目录和受控模型。个人配置、会话、密钥和用户原始报告不进提交和安装包。
- 尽量少写测试：按需做最小构建和启动检查，只为具体问题做定点验证。兼容问题查[插件兼容](docs/plugin-compatibility.md)。
- PR 写清问题、改后的行为、做过的检查和没覆盖的范围。跳过或模拟通过的检查要如实写。

## 电脑操作（OpenCU）

在独立的 OpenCU 源码里运行 `npm run cu:verify`。同步后在同一台机器上用 `--root ./vendor/opencu --profile matrix` 或 `browser` 检查内置副本，不必重复跑源码的完整套件。实际安装包用 `node scripts/check-opencu-delivery.mjs <actual-package.tgz>` 核对字节、来源清单、native 执行位和生成的客户端，细节见[开发](docs/development.md#按需测试)。超时、取消、缺回执或运行中源码变了，都不算通过。

## 第三方目录

升级第三方目录条目时，核对原作者的固定工件和 SHA-256、宿主能否加载、设置入口是否正常。兼容构建用 `scripts/build-intent-compat.mjs` 这类固定输入的构建器，保留功能、原许可和来源；包内 README、兼容说明和中英更新日志由构建器生成，不放宽宿主版本要求。预检页面的浏览器回归是 `node --test test/plugin-preflight-page.test.mjs`，用已有浏览器（可用 `OMD_TEST_BROWSER` 指定），不自动下载。

## 文档

- 写法、页面职责和体积上限见工作区的 DOCUMENTATION.md。增删页面时同步 `docs/structure.json`、中英入口、`scripts/build-docs.mjs` 的导航和 package.json 的 `files`。
- 提交前运行 `npm run docs:check`。它检查链接、锚点、版本号、内部用语、英文页的全角标点、中英标题数量和体积上限。
- 文档站：`node scripts/build-docs.mjs` 检查链接并渲染 Mermaid 图，不用启动 DSH。CI 通过 `OMD_DOCS_CHROMIUM` 复用 runner 自带的 Chrome。main 上的相关改动通过检查后自动发布。
- 首页截图和动图放在 `docs/images/`，中英文同步，尺寸不超过原图，在 `docs/images/readme-screenshots.json` 记录来源、尺寸和哈希。
- 公开文件检查：`node scripts/check-public-files.mjs` 核对 Git 文件、新增历史和安装包里有没有私人资料。本地没有 `origin/main` 时，它会说明没检查新增历史。

## 发版

版本号是完整宿主前缀加 `omd.主版本.功能版本.补丁版本`：加功能递增功能位并把补丁归零，修 Bug 递增补丁位。

1. 改 package.json 版本，在 `CHANGELOG.md` 顶部写中英双语的新条目。准备中的版本标"未发布"，发行清单用 `unpublished: true`，公开安装入口保持在上一个已发布版本。
2. `main` 不跟踪构建产物。完整构建后，发版提交用 `git add -f lib plugins/*/lib` 带上产物，再打 tag。
3. 上传前运行 `node scripts/check-release-assets.mjs --dir <待发目录>`，核对包的 SHA256、`metadata.json`（schema、包名、完整版本、hostVersion、file／filename、sourceCommit）和 `SHA256SUMS`。
4. Release 正文由 CHANGELOG 生成：`node scripts/check-docs.mjs --release-notes > notes.md`，再 `gh release create … --notes-file notes.md`。不再单独写发行页。
5. 发布后把 `docs/structure.json` 的 `published` 改成新版本，运行 `npm run docs:check`，按报错更新徽章、安装链接和版本号；同步推荐目录的固定包。应用内更新装的是 Release 包，更新器按完整宿主版本查找发行。

CI 只构建一次，用 `node scripts/test-ci.mjs run core --built` 跑全部回归检查；单独 `npm test` 也会准备计量模块。Release 附件工作流只在发布、编辑 Release 或手动触发时运行。

运行包不含网站媒体、站点静态资源、文档站构建和评测工具，包内文档插图链接到公开地址。`scripts/package-policy.mjs` 同时用于公开文件检查、prepack 和实际包检查。离线准备、启动诊断、构建输入和 vendor 原始快照都保留在包里。

## 市场

正式发布后运行 `npm run market:check -- --output .local/market-release`。它只读公开数据，核对发行附件、SHA256 和宿主版本，找出已有的更新 PR，并为同宿主的旧条目生成更新草稿，不会自动投稿或留言。状态含义：

| 状态 | 意思 |
| --- | --- |
| `needs-entry-update` | 按最新贡献规则更新原条目 |
| `awaiting-review` | 已有 PR，等审核 |
| `awaiting-catalog` | 还没在公开目录生效 |
| `installation-synced` | 安装入口已同步 |

每个市场只维护一条条目，没有实质变化不逐版改帖、不重复投稿、不催审。写入外部系统前先看最新模板和审核意见。
