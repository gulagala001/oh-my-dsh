# 参与改进 Oh My DSH

[文档目录](docs/README.md) · [首次使用](docs/getting-started.md) · [排障指南](docs/troubleshooting.md)

欢迎修复 Bug、改善交互和完善文档。复现异常使用 [Bug 模板](https://github.com/gulagala001/oh-my-dsh/issues/new?template=bug-report.yml)，流程或体验改进使用[建议模板](https://github.com/gulagala001/oh-my-dsh/issues/new?template=feature-request.yml)，第三方插件投稿使用[单独入口](docs/plugin-submissions.md)。不确定如何分类时，也可以直接新建普通 Issue。

## 开发与修复

按[本地开发说明](docs/usage.md#本地开发或独立试用)安装依赖并构建。使用独立测试数据目录和测试模型，不把个人配置、会话、密钥或原始用户报告加入提交。

1. 先复现具体问题，记录触发条件、实际结果和预期结果。涉及宿主兼容时区分 Web、官方桌面、安装来源及版本。
2. 修复根因，同时移除失效逻辑并更新对应文档。缺陷适合自动化时，加入能在修复前失败的回归用例；纯文字或低风险调整不必建立复杂测试。
3. 运行相关测试；修改前端后先 `pnpm build`，再验证真实点击、错误反馈、重试及窄屏／明暗主题。涉及插件安装和生命周期时，检查原生模式、切换、重启和卸载。
4. 在 PR 模板中写明问题、最终行为、验证方式和未覆盖的平台；内容按改动规模填写。模拟通过、真实程序验证通过与用户设备验证通过应分别说明。

例如，本地验证文档与安装更新逻辑：

```sh
node --test test/documentation.test.mjs test/start.test.mjs test/version-update.test.mjs test/recommended-plugin-manager.test.mjs
```

完整回归需要先构建，并准备 Playwright Chromium：

```sh
pnpm build
pnpm exec playwright install chromium
node --test --test-concurrency=1 test/*.test.mjs
```

需要真实平台或在线服务的用例会注明启用条件。条件不满足而跳过的测试不能算作该平台已验证。

## 文档与发行

安装说明沿用户的实际路径组织：选择环境 → 安装 → 确认生效 → 日常使用 → 排障／恢复。桌面、Web 和源码安装分别写明入口；更新、停用和卸载继续沿用原安装方式。

版本更新时同时核对 `package.json`、发布清单、README 徽章、安装命令、升级手册和本版说明。内置组件以 `vendor/opencu.json` 等发行清单为准。不要把尚未发布的修复写成已可通过现有 tag 安装；先记录在更新日志的“未发布”部分。

新增用户指南时，在 [文档目录](docs/README.md)补上对应任务入口，并在页面顶部提供返回路径。文档检查会核对各安装指南中的全部目标版本、徽章和内置组件版本，并检查当前用户文档的本地文件与章节链接；历史版本说明和研究记录不作为当前安装指南扫描。它不替代实际安装验证，也不检查外部网站的可达性。

修改文档后，可直接运行 `node --test test/documentation.test.mjs`，无需启动 DSH 或安装浏览器。链接文字应说明读者会看到什么；安装命令标明适用环境，发布说明区分已发布、开发分支和未验证范围。

这一组织方式参考了 [Cline 的按环境选择安装路径](https://docs.cline.bot/getting-started/installing-cline)、[Aider 的安装后上手入口](https://aider.chat/docs/install.html)和 [OpenCode 的按症状排障流程](https://opencode.ai/docs/troubleshooting/)。借鉴流程时结合 OMD 的宿主插件机制；每项改进都应能解释它解决了哪个实际问题。
