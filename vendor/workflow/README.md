<a name="readme-top"></a>

<h1 align="center">DSH Workflow</h1>

<p align="center"><strong>保存、组合与续跑工作流，沿用 DSH 原生子代理。</strong><br>DeepSeek Harness 插件</p>

<p align="center"><strong>简体中文</strong> · <a href="README_EN.md">English</a></p>

<p align="center">
  <a href="https://github.com/gulagala001/dsh-workflow/releases/tag/v0.1.3-dsh.0.2.1-rc.2"><img alt="0.1.3" src="https://img.shields.io/badge/release-0.1.3-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/dsh-workflow/releases"><img alt="GitHub 累计下载量" src="https://img.shields.io/github/downloads/gulagala001/dsh-workflow/total?style=flat-square&amp;label=GitHub%20downloads&amp;color=0969da"></a>
  <a href="#readme-install"><img alt="DSH 0.2.1-rc.2" src="https://img.shields.io/badge/DSH-0.2.1--rc.2-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/dsh-workflow/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/gulagala001/dsh-workflow?style=flat-square&amp;color=0969da"></a>
</p>

<p align="center"><a href="#readme-install"><strong>开始使用</strong></a> · <a href="docs/workflow.md">完整文档</a> · <a href="https://github.com/gulagala001/dsh-workflow/issues">反馈</a></p>

<a name="readme-install"></a>

## 快速开始

**适用环境：** DSH **0.2.1-rc.2**, Node.js **22.19+**.

子代理沿用宿主模型与权限，并产生正常模型用量。续跑会重新执行成功前缀之后的调用；先核对已有产物与副作用。

### 1. 安装

打开实际使用的 DSH 实例，在 **插件 → ＋ 添加插件** 中粘贴：

```text
https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.3-dsh.0.2.1-rc.2/dsh-workflow-plus-0.1.3-dsh.0.2.1-rc.2.tgz
```

等当前任务结束后，按宿主提示启用或完整重启该实例，沿用原 profile 与数据。其他宿主、升级和卸载见[安装指南](docs/install.md) · [SHA256SUMS](https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.3-dsh.0.2.1-rc.2/SHA256SUMS).

### 2. 先试这一件事

在配置好模型的会话中输入：

```text
使用 workflow 并行审查 auth 和 storage，汇总发现；不要修改文件。
```

**成功标志：** 会话工作流面板显示真实阶段、成员与状态，子代理在原生子会话中运行。

## 把重复任务写成可以继续的工作流

- **组合步骤**：用 `parallel()`、`pipeline()`、`phase()` 和 `log()` 表达实际依赖与执行状态。
- **保存与复用**：直接传入脚本，或使用 `scriptPath` 与项目中的命名工作流。
- **恢复与隔离**：从成功调用前缀续跑；需要文件隔离时使用 Git worktree，保留结果供检查和合并。

### 最小工作流

```js
export const meta = {
  name: 'review-modules',
  description: 'Review two modules',
  phases: [{ title: 'Review' }],
};
phase('Review');
return await parallel([
  () => agent('Review auth for correctness. Do not edit files.', { label: 'auth' }),
  () => agent('Review storage for correctness. Do not edit files.', { label: 'storage' }),
]);
```

会话标题旁的工作流入口展示阶段与成员；子代理由原生子会话承载。`run_in_background: true` 使用原生 Jobs，以 `job_output` 查看、`job_kill` 停止。[完整用法](docs/workflow.md)

## 运行边界

| 能力 | 条件与行为 |
| --- | --- |
| 嵌套工作流 | 支持一层，沿用共享并发、总调用数、取消信号与预算。 |
| `resumeFromRunId` | 在同会话内复用未变化且已成功的调用前缀，其后调用重新执行。 |
| `isolation: 'worktree'` | 从当前 Git HEAD 创建独立目录；保留有改动结果，不自动合并。 |
| 共享输出 Token 目标 | 用户消息末尾 `+500k`／`+1m`；达到目标停止新派发，已运行调用可收尾。 |

缺少可信用量时停止继续派发；模型请求、网络和文件权限继续由宿主与工具提供方负责。

## 常见问题

<details>
<summary>续跑会重新做已经完成的操作吗？</summary>

只复用符合条件的成功调用前缀，之后的调用会重新执行。先核对已有产物和外部副作用，不把续跑当任意操作的事务重放。

</details>

<details>
<summary>卸载会删除脚本或 worktree 吗？</summary>

插件不会主动删除已保存脚本、运行记录和 worktree。项目使用 `.omd/workflows/`、`.omd/worktrees/`，独立运行与预算数据位于 `DSH_HOME/dsh-workflow/`。

</details>

## 开发与许可

安装标识为 `dsh-workflow-plus`，通过固定 GitHub Release 分发；不要安装其他作者的 npm 同名近似包。

```bash
pnpm install --frozen-lockfile --ignore-scripts --config.strict-dep-builds=false
pnpm build
```

[架构](docs/architecture.md)。采用 [MIT](LICENSE)，第三方来源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 文档与支持

| 我想做什么 | 去哪里 |
| --- | --- |
| 安装、升级、卸载 | [安装指南](docs/install.md) |
| 了解使用方法与边界 | [使用文档](docs/workflow.md) |
| 查看版本变化 | [Releases](https://github.com/gulagala001/dsh-workflow/releases) |
| 反馈问题 | [Issues](https://github.com/gulagala001/dsh-workflow/issues) |

反馈时请提供完整 DSH／插件版本、实际入口、最小复现步骤，以及预期和实际表现；日志与截图先移除私人数据。

<p align="center"><a href="#readme-top">返回顶部</a> · <a href="https://github.com/gulagala001/dsh-workflow/releases">版本与下载</a> · <a href="https://github.com/gulagala001/dsh-workflow/issues">反馈</a></p>

[文档结构与贡献](docs/documentation.md)
