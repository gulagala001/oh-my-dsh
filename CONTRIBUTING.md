# 参与改进 Oh My DSH

[文档目录](docs/README.md) · [本地开发](docs/development.md) · [排障指南](docs/troubleshooting.md)

欢迎修复 Bug、改善交互和完善文档；不确定如何分类时可新建普通 Issue。
- 异常复现：[Bug 模板](https://github.com/gulagala001/oh-my-dsh/issues/new?template=bug-report.yml)。
- 功能与体验建议：[建议模板](https://github.com/gulagala001/oh-my-dsh/issues/new?template=feature-request.yml)。
- 第三方插件：[投稿入口](docs/plugin-submissions.md)。

## 开发

- OMD 自有代码采用根目录 MIT；第三方材料遵守原许可证。修改许可时同步包元数据、双语首页和来源说明；公开文件门禁核对声明及包内 LICENSE。
- 工作过程标题的结构布局统一维护在 `scripts/chat-style-adapter.mjs`，经原生 Chat 样式归属生效，不放回皮肤开关内。`test/process-header-layout.test.mjs` 用原生标题渲染器和固定 CSS 在现有 Chromium 中检查原生／主题、窄宽、中英文及大字体，接入文档 CI 的已有浏览器环境。

- 优先使用宿主公共 SDK 和扩展点，不手改 SDK、生成文件或 `vendor/opencu/` 发行快照。
- OpenCU、Workflow、Rewind、Persona 与 BTW 在各自独立仓库维护；通过对应 `scripts/sync-*.mjs` 同步快照和来源清单，不直接手改 vendor 或 `plugins/persona` 文件。同步包含公开文档、文档清单和检查脚本的输入，按独立包的实际分发清单维护。OpenCU 同版本的直接服务端模块、宿主源码与文档可用 `sync-opencu.mjs <source> --files <paths...>` 同步已提交文件，保留原构建产物；清单记录来源提交与实际文件摘要，不继续声称对应旧整包摘要。文件集合、版本、前端或生成输入变化仍走完整构建／包同步。前端／宿主构建只针对受影响部分执行。
- 组件及价格同步命令会自动重新生成设置页与公开来源清单。手工修改其他来源输入后运行 `npm run credits:write`，并用 `npm run docs:check` 检查一致性。
- 系统提示词原文与许可保存在 `src/prompt-styles/upstream/<来源>/`，`source.json` 固定提交、核对日期与原始字节哈希；公开样本必须注明非官方与核验边界。适配只处理真实宿主差异，不改写行为风格。修改来源后重建 `node scripts/check-prompt-styles.mjs --write`，再执行 `npm run prompts:check`；构建、CI 与 prepack 检查同一份原文、构建器和适配锚点。来源说明原位维护于提示词指南、第三方声明和项目目录，不新增内部维护流水。
- 回退存储策略变更需同步独立插件、内置快照、使用指南及发行说明，并验证容量限制、低磁盘空间、并发写入和清理后的恢复。
- 工作目录适配同时验证首次发送前的原生队列时序、权限根、子代理、冷恢复及 Finder 实际目标；`scripts/build-open-in-app.mjs` 在构建时核对 rc.3 原生客户端字节与两个选择器替换点。构建指纹不能代替真实目录验收。
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
- 每版（含补丁版）新增 `docs/release-<版本>.md`（当前示例：`docs/release-1.1.0.md`） 并登记 `docs/structure.json` 与站点集合；`CHANGELOG.md` 以当前双语正文开头并保留旧版正文，历史页面保留，更新当前导航与固定安装入口；更新推荐目录固定包；更新器按完整宿主版本发现发行，不登记产品功能系列白名单。
- `main` 不跟踪构建产物：发版提交在完整构建后用 `git add -f lib plugins/*/lib` 带上产物，再打 tag 并上传 Release 包；应用内更新安装的是 Release 包。
- 发行准备页和 CHANGELOG 明示未发布，发行清单使用 `unpublished: true`，既有公开安装入口保持可用；公开发布时同步更新状态、当前导航、徽章和固定安装入口。尚未发布的修复记入更新日志“未发布”部分；来源与许可见[第三方声明](THIRD_PARTY_NOTICES.md)。

文档结构、语言对应和页面变更流程见[文档维护规范](docs/documentation.md)，检查命令：`npm run docs:check`。

发行上传前执行 `node scripts/check-release-assets.mjs --dir <待发目录>`，核对当前包的实际 SHA256、`metadata.json`（schema、包名、完整版本、hostVersion、file／filename、sourceCommit）与 `SHA256SUMS`。OMAA 还需同内容的 `<包名>.tgz.metadata.json` 和 `<包名>.tgz.sha256`；当前发行的 CI 使用同一契约检查，历史附件保留。
