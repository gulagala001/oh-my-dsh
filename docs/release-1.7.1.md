# Oh My DSH 1.7.1

适配 **DSH 0.1.7-alpha.2**，内置 **OpenCU 1.1.1**。

## 更新内容

- 适配 DSH 0.1.7-alpha.2，内置 OpenCU 1.1.1，保留上下文、任务验证、BT、预算、PTC 和四套皮肤。
- 融合原生滚动跟随、历史定位、统一代码卡片和多行排队消息编辑；保留完成汇总、展开阅读状态与紧凑间距。
- 后台任务默认不再受连续三次唤醒限制；显式设置上限仍生效，保留插话唤醒和输出预览。
- 适配 MCP 文本与图片内容投影及统一 token 保留预算，承接宿主重连、模块加载和 PowerShell 改进。
- 安装入口分为自己安装和 AI 安装；AI 手册覆盖环境识别、数据备份、版本配对、升级与回退。

## 两种安装方式

**自己安装：** 等待正在执行的任务结束，停止旧服务并完整备份实际 DSH_HOME，沿用原数据目录、profile 和端口，再运行：

```sh
npx --yes @deepseek-ai/dsh@0.1.7-alpha.2 plugin --profile web add github:gulagala001/oh-my-dsh#v1.7.1
npx --yes @deepseek-ai/dsh@0.1.7-alpha.2 --profile web
```

自定义 profile 将 `web` 换成原名称，自定义端口继续加 `--port`。全局安装、源码启动和卸载见[使用指南](https://github.com/gulagala001/oh-my-dsh/blob/v1.7.1/docs/usage.md#安装到现有-dsh推荐)。

**让 AI 安装：** 将以下内容发给能操作本地终端的 AI：

> 请按 https://github.com/gulagala001/oh-my-dsh/blob/main/docs/upgrade.md 帮我安装或升级 Oh My DSH。识别现有环境，备份并保留模型、会话、配置和皮肤，完成后确认实际运行版本。

从 alpha.1 升级继续使用 V4 会话，无需重新迁移；从更旧版本升级时保留原日志和恢复记录。版本面板的“当前版本”应显示 1.7.1；“最新版本”只代表远端发布记录。

源码、安装包和 SHA-256 校验文件见本版本附件。
