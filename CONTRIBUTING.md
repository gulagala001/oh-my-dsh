# 参与改进 Oh My DSH

[文档目录](docs/README.md) · [本地开发](docs/development.md) · [排障指南](docs/troubleshooting.md)

欢迎修复 Bug、改善交互和完善文档；不确定如何分类时可新建普通 Issue。
- 异常复现：[Bug 模板](https://github.com/gulagala001/oh-my-dsh/issues/new?template=bug-report.yml)。
- 功能与体验建议：[建议模板](https://github.com/gulagala001/oh-my-dsh/issues/new?template=feature-request.yml)。
- 第三方插件：[投稿入口](docs/plugin-submissions.md)。

## 开发

- OMD 自有代码采用根目录 MIT；第三方材料遵守原许可证。修改许可时同步包元数据、双语首页和来源说明；公开文件门禁核对声明及包内 LICENSE。
- Claude Desktop 的固定 CDS 来源与适配范围维护于 `src/client/skins/claude-desktop/source.json`，原许可在 `vendor/licenses/Open-Claude-UI-MIT.txt`。参考原文 Git blob 指纹、手势／滚动／单图预览的适配及保留边界同存该来源记录，升级时人工核对上游；现有 `credits:check` 检查清单生成一致性。主题用法和截图沿用 `docs/skins.md` 与 `docs/site/media/`，来源加入项目目录后重新生成双语清单；主题与配色增减须同步双语入口、主题基座及网站预览。现有文档／打包检查核对路径与来源清单，视觉效果与窄屏交互仍需隔离浏览器核验。
- 工作过程标题的结构布局统一维护在 `scripts/chat-style-adapter.mjs`，经原生 Chat 样式归属生效，不放回皮肤开关内。`test/process-header-layout.test.mjs` 用原生标题渲染器和固定 CSS 在现有 Chromium 中检查原生／主题、窄宽、中英文及大字体，仅在相关 UI／样式／宿主源码或依赖锁发生变化的 PR 中运行；手动 CI 可勾选 `layout`。纯文档与版本更新不安装 Chromium。

- 优先使用宿主公共 SDK 和扩展点，不手改 SDK、生成文件或 `vendor/opencu/` 发行快照。
- OpenCU、Workflow、Rewind、Persona 与 BTW 在各自独立仓库维护；通过对应 `scripts/sync-*.mjs` 同步快照和来源清单，不直接手改 vendor 或 `plugins/persona` 文件。同步包含公开文档、文档清单和检查脚本的输入，按独立包的实际分发清单维护。OpenCU 同版本的直接服务端模块、宿主源码与文档可用 `sync-opencu.mjs <source> --files <paths...>` 同步已提交文件，保留原构建产物；清单记录来源提交与实际文件摘要，不继续声称对应旧整包摘要。文件集合、版本、前端或生成输入变化仍走完整构建／包同步。前端／宿主构建只针对受影响部分执行。
- 组件及价格同步命令会自动重新生成设置页与公开来源清单。手工修改其他来源输入后运行 `npm run credits:write`，并用 `npm run docs:check` 检查一致性。
- 系统提示词原文与许可保存在 `src/prompt-styles/upstream/<来源>/`，`source.json` 固定提交、核对日期与原始字节哈希；公开样本必须注明非官方与核验边界。适配只处理真实宿主差异，不改写行为风格。修改来源后重建 `node scripts/check-prompt-styles.mjs --write`，再执行 `npm run prompts:check`；构建、CI 与 prepack 检查同一份原文、构建器和适配锚点。来源说明原位维护于提示词指南、第三方声明和项目目录，不新增内部维护流水。
- 回退存储策略变更需同步独立插件、内置快照、使用指南及发行说明，并验证容量限制、低磁盘空间、并发写入和清理后的恢复。
- 独立聊天从创建到发送保持同一会话与目录，标题命名不改变文件位置。工作目录适配同时验证权限根、子代理、冷恢复、历史文件链接及 Finder 实际目标；`scripts/build-open-in-app.mjs` 在构建时核对 rc.3 原生客户端字节与两个选择器替换点。构建指纹不能代替真实目录验收。
- 测试使用隔离数据目录与受控模型；个人配置、会话、密钥和原始用户报告不进入提交或安装包。
- 专注实现，尽量少做测试；按需做最小构建／启动检查，仅为具体问题或用户明确要求做定点验证（含 CU）。兼容调查按需查[插件兼容性](docs/plugin-compatibility.md)。
- PR 说明问题、最终行为、验证结果和未覆盖范围；跳过或模拟通过不等于对应平台的真实验证通过。

## 文档与发行

- 文档构建：`node scripts/build-docs.mjs`，检查链接与锚点并渲染图示，无需启动 DSH。
- 插件自有日志事件通过宿主 `appendPluginRecord` 写入；普通 `Session.append` 不接收 `ignorable`。涉及事件持久化时用真实 Session 与原生冷恢复检查，不能以宽松替身代替存储契约。
- 工具契约检查：`npm run tools:check`，核对自有工具的 Native 对象参数及 TypeScript／Python SDK；自有注册使用 `checkedTool`，范围与互斥要求由工具执行层校验并写入参数说明。构建、CI 和 prepack 执行同一检查。
- 第三方目录升级须核对原作者固定工件与 SHA-256、实际宿主加载和设置入口。兼容构建使用 `scripts/build-intent-compat.mjs` 等固定输入构建器，保留功能、原许可和来源；包内产品 README／兼容说明／双语更新日志由构建器一并生成，不放宽宿主版本要求。预检页面的按需浏览器回归为 `node --test test/plugin-preflight-page.test.mjs`，使用已有浏览器，可通过 `OMD_TEST_BROWSER` 指定路径，不自动下载。
- 公开文件检查：`node scripts/check-public-files.mjs`，核对 Git 文件、新增历史和安装包中的私有资料；本地缺少 `origin/main` 时明确报告未检查新增历史，不把它当作发布授权。
- 首页截图与动图放在 `docs/images/`，中英文入口同步，尺寸不超过素材原宽；在 `docs/images/readme-screenshots.json` 记录来源、尺寸与哈希。
- 新指南接入[文档目录](docs/README.md)，中英入口保持对应；安装命令标明环境，发布说明区分已发布与未发布。
- 版本使用完整宿主前缀加 `omd.主版本.功能版本.补丁版本`；功能更新递增功能位并归零补丁，修复递增补丁位。
- 发行同步包版本、tag、发行清单、README 徽章与安装命令、升级与本版说明；内置组件版本以 vendor 清单为准。
- 每版（含补丁版）新增 `docs/release-<版本>.md`（当前示例：`docs/release-1.1.2.md`） 并登记 `docs/structure.json` 与站点集合；`CHANGELOG.md` 以当前双语正文开头并保留旧版正文，历史页面保留，更新当前导航与固定安装入口；更新推荐目录固定包；更新器按完整宿主版本发现发行，不登记产品功能系列白名单。
- `main` 不跟踪构建产物：发版提交在完整构建后用 `git add -f lib plugins/*/lib` 带上产物，再打 tag 并上传 Release 包；应用内更新安装的是 Release 包。
- 发行准备页和 CHANGELOG 明示未发布，发行清单使用 `unpublished: true`，既有公开安装入口保持可用；公开发布时同步更新状态、当前导航、徽章和固定安装入口。尚未发布的修复记入更新日志“未发布”部分；来源与许可见[第三方声明](THIRD_PARTY_NOTICES.md)。

CI 只构建一次，并用 `node scripts/test-ci.mjs run core --built` 汇总受维护的回归检查；单独执行 `npm test` 仍会准备计量模块。Auto Compact、原生插件生命周期和标题栏检查共用这个入口，OPS 不重复运行。公开文件与文档结构共用快速门禁；文档站在 main 的相关变更通过检查后自动发布，不重复手动构建。实际安装包检查与发布附件校验继续保留。

文档结构、语言对应和页面变更流程见[文档维护规范](docs/documentation.md)，检查命令：`npm run docs:check`。

发行上传前执行 `node scripts/check-release-assets.mjs --dir <待发目录>`，核对当前包的实际 SHA256、`metadata.json`（schema、包名、完整版本、hostVersion、file／filename、sourceCommit）与 `SHA256SUMS`。OMAA 还需同内容的 `<包名>.tgz.metadata.json` 和 `<包名>.tgz.sha256`；当前发行的 CI 使用同一契约检查，历史附件保留。

文档构建仍生成静态 Mermaid 图示，CI 通过 `OMD_DOCS_CHROMIUM` 复用 runner 预装的 Chrome，不下载另一份浏览器。旧桌面／rc.2 热安装验收报告验证器不再随每次 PR 自动运行，真实宿主验收时按需调用；实际源码的 OpenCU 导入和会话控制器就绪检查已合并进 core。Release 附件工作流仅在发布／编辑 Release 或手动触发时核对对应 tag，不随无关源码推送重复下载旧包。

市场投稿与更新遵循[文档维护规范](docs/documentation.md)和[当前市场记录](docs/releases.md#市场同步记录2026-10-28)：依各市场规则与实际需要维护同一条目，禁止无实质变化的逐版改帖、重复投稿与催审。自动索引不逐版通知；先核对最新模板和审核意见再写入外部系统。

运行包排除网站媒体、站点静态资源、文档站构建和评测／性能工具；源码与网站保留完整内容，包内文档插图链接到公开资源。`scripts/package-policy.mjs` 由公开文件／prepack 和实际包交付检查共同执行。保留离线准备、启动诊断、构建输入和 vendor 原始快照；源码目录是开发入口。composer 槽位由 `scripts/chat-style-adapter.mjs` 在指纹验证后进行 AST 提取并直接导出，缺失、重复、未知 ID 或动态顺序均阻止构建；变更运行 `node --test test/chat-style-adapter.test.mjs`，受影响客户端需重建。

宿主浏览器组件统一使用 `scripts/host-build-contracts.mjs` 校验 SDK／组件身份、ModuleLoader 注册结构、样式归属数量和唯一替换锚点；通过宿主解析依赖，不能扫描 `.pnpm` 布局选副本，离线平铺布局须能生成相同产物。源码位置编辑按原始 AST 从后向前应用。`host-build-contracts` 与现有实际包交付回归接入 core；归档检查同时核对源 package.json、声明入口和安装补丁及包内文档链接，源码链接可用不能代替安装包检查。仅存在于源码仓库的文档入口链接到公开源码，站点指南链接到线上产品页。
