# 参与改进 Oh My DSH

[文档目录](docs/README.md) · [本地开发](docs/development.md) · [排障指南](docs/troubleshooting.md)

欢迎修复 Bug、改善交互和完善文档；不确定如何分类时可新建普通 Issue。
- 异常复现：[Bug 模板](https://github.com/gulagala001/oh-my-dsh/issues/new?template=bug-report.yml)。
- 功能与体验建议：[建议模板](https://github.com/gulagala001/oh-my-dsh/issues/new?template=feature-request.yml)。
- 第三方插件：[投稿入口](docs/plugin-submissions.md)。

## 开发

- 优先使用宿主公共 SDK 和扩展点，不手改 SDK、生成文件或 `vendor/opencu/` 发行快照。
- OpenCU、Workflow、Rewind、Persona 与 BTW 在各自独立仓库维护；通过对应 `scripts/sync-*.mjs` 同步快照和来源清单，不直接手改 vendor 或 `plugins/persona` 文件。同步包含公开文档、文档清单和检查脚本的输入，按独立包的实际分发清单维护。OpenCU 同版本的直接服务端模块、宿主源码与文档可用 `sync-opencu.mjs <source> --files <paths...>` 同步已提交文件，保留原构建产物；清单记录来源提交与实际文件摘要，不继续声称对应旧整包摘要。文件集合、版本、前端或生成输入变化仍走完整构建／包同步。前端／宿主构建只针对受影响部分执行。
- 组件及价格同步命令会自动重新生成设置页与公开来源清单。手工修改其他来源输入后运行 `npm run credits:write`，并用 `npm run docs:check` 检查一致性。
- 系统提示词原文与许可保存在 `src/prompt-styles/upstream/<来源>/`，`source.json` 固定提交、核对日期与原始字节哈希；公开样本必须注明非官方与核验边界。适配只处理真实宿主差异，不改写行为风格。修改来源后重建 `node scripts/check-prompt-styles.mjs --write`，再执行 `npm run prompts:check`；构建、CI 与 prepack 检查同一份原文、构建器和适配锚点。来源说明原位维护于提示词指南、第三方声明和项目目录，不新增内部维护流水。
- 测试使用隔离数据目录与受控模型；个人配置、会话、密钥和原始用户报告不进入提交或安装包。
- 专注实现，尽量少做测试；按需做最小构建／启动检查，仅为具体问题或用户明确要求做定点验证（含 CU）。兼容调查按需查[插件兼容性](docs/plugin-compatibility.md)。
- PR 说明问题、最终行为、验证结果和未覆盖范围；跳过或模拟通过不等于对应平台的真实验证通过。

## 文档与发行

- 文档构建：`node scripts/build-docs.mjs`，检查链接与锚点并渲染图示，无需启动 DSH。
- 公开文件检查：`node scripts/check-public-files.mjs`，核对 Git 文件、新增历史和安装包中的私有资料；本地缺少 `origin/main` 时明确报告未检查新增历史，不把它当作发布授权。
- 首页截图与动图放在 `docs/images/`，中英文入口同步，尺寸不超过素材原宽；在 `docs/images/readme-screenshots.json` 记录来源、尺寸与哈希。
- 新指南接入[文档目录](docs/README.md)，中英入口保持对应；安装命令标明环境，发布说明区分已发布与未发布。
- 版本使用完整宿主前缀加 `omd.主版本.功能版本.补丁版本`；功能更新递增功能位并归零补丁，修复递增补丁位。
- 发行同步包版本、tag、发行清单、README 徽章与安装命令、升级与本版说明；内置组件版本以 vendor 清单为准。
- 每版（含补丁版）新增 `docs/release-<版本>.md` 并登记 `docs/structure.json` 与站点集合；`CHANGELOG.md` 以当前双语正文开头并保留旧版正文，历史页面保留，更新当前导航与固定安装入口。
- `main` 不跟踪构建产物：发版提交在完整构建后用 `git add -f lib plugins/*/lib` 带上产物，再打 tag 并上传 Release 包；应用内更新安装的是 Release 包。
- 尚未发布的修复记入更新日志“未发布”部分；来源与许可见[第三方声明](THIRD_PARTY_NOTICES.md)。

文档结构、语言对应和页面变更流程见[文档维护规范](docs/documentation.md)，检查命令：`npm run docs:check`。
