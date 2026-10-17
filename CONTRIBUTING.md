# 参与改进 Oh My DSH

[文档目录](docs/README.md) · [本地开发](docs/development.md) · [排障指南](docs/troubleshooting.md)

欢迎修复 Bug、改善交互和完善文档；不确定如何分类时可新建普通 Issue。
- 异常复现：[Bug 模板](https://github.com/gulagala001/oh-my-dsh/issues/new?template=bug-report.yml)。
- 功能与体验建议：[建议模板](https://github.com/gulagala001/oh-my-dsh/issues/new?template=feature-request.yml)。
- 第三方插件：[投稿入口](docs/plugin-submissions.md)。

## 开发

- 优先使用宿主公共 SDK 和扩展点，不手改 SDK、生成文件或 `vendor/opencu/` 发行快照。
- OpenCU 在独立项目从零重写，最后通过薄接口接入；当前 0.10 过渡快照保持固定，不继续修补或同步旧实现。
- 测试使用隔离数据目录与受控模型；个人配置、会话、密钥和原始用户报告不进入提交或安装包。
- 专注实现，尽量少做测试；按需做最小构建／启动检查，仅为具体问题或用户明确要求做定点验证（含 CU）。兼容调查按需查[插件兼容性](docs/plugin-compatibility.md)。
- PR 说明问题、最终行为、验证结果和未覆盖范围；跳过或模拟通过不等于对应平台的真实验证通过。

## 文档与发行

- 文档检查：`node --test test/documentation.test.mjs`，无需启动宿主或浏览器。
- 公开文件检查：`node scripts/check-public-files.mjs`，核对 Git 文件、新增历史和安装包中的私有资料；本地缺少 `origin/main` 时明确报告未检查新增历史，不把它当作发布授权。
- 新指南接入[文档目录](docs/README.md)，中英入口保持对应；安装命令标明环境，发布说明区分已发布与未发布。
- 版本使用完整宿主前缀加 `omd.主版本.功能版本.补丁版本`；功能更新递增功能位并归零补丁，修复递增补丁位。
- 发行同步包版本、tag、发行清单、README 徽章与安装命令、升级与本版说明；内置组件版本以 vendor 清单为准。
- 尚未发布的修复记入更新日志“未发布”部分；来源与许可见[第三方声明](THIRD_PARTY_NOTICES.md)。
