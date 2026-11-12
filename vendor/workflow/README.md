<a name="readme-top"></a>

<h1 align="center">DSH Workflow</h1>

<p align="center"><strong>把多步任务写成脚本，交给多个子代理并行去做，中断了还能接着跑。</strong><br>DeepSeek Harness 插件</p>

<p align="center"><strong>简体中文</strong> · <a href="README_EN.md">English</a></p>

<p align="center">
  <a href="https://github.com/gulagala001/dsh-workflow/releases/tag/v0.1.10-dsh.0.2.2-rc.2"><img alt="DSH Workflow 0.1.10" src="https://img.shields.io/badge/release-0.1.10-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/dsh-workflow/releases"><img alt="GitHub 下载量" src="https://img.shields.io/github/downloads/gulagala001/dsh-workflow/total?style=flat-square&amp;label=GitHub%20downloads&amp;color=0969da"></a>
  <a href="#readme-install"><img alt="DSH 0.2.2-rc.2" src="https://img.shields.io/badge/DSH-0.2.2--rc.2-0969da?style=flat-square"></a>
  <a href="https://github.com/gulagala001/dsh-workflow/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/gulagala001/dsh-workflow?style=flat-square&amp;color=0969da"></a>
</p>

<p align="center"><a href="#readme-install"><strong>开始使用</strong></a> · <a href="docs/workflow.md">完整用法</a> · <a href="https://github.com/gulagala001/dsh-workflow/issues">反馈</a></p>

<a name="readme-install"></a>

## 快速开始

**需要：** DSH **0.2.2-rc.2**，Node.js **24.9.0+**。子代理用你在 DSH 里配好的模型和权限，按正常用量计费。

### 1. 安装

在 DSH 里打开 **插件 → ＋ 添加插件**，粘贴：

```text
https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.10-dsh.0.2.2-rc.2/dsh-workflow-plus-0.1.10-dsh.0.2.2-rc.2.tgz
```

等手头的任务跑完，按提示启用或重启 DSH，原来的设置和会话都还在。命令行安装、升级和卸载见[安装指南](docs/install.md)，校验文件：[SHA256SUMS](https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.10-dsh.0.2.2-rc.2/SHA256SUMS)。

### 2. 先试一件事

在一个项目里输入：

```text
使用 workflow 并行审查 auth 和 storage，汇总发现；不要修改文件。
```

会话标题旁会出现工作流面板，列出每个阶段和子代理的进度。每个子代理在自己的子会话里运行，可以点开查看。

## 能做什么

- **组合步骤**：`parallel()` 并行，`pipeline()` 让每一项依次经过后面的阶段，`phase()` 和 `log()` 报告进度。
- **保存复用**：直接传入脚本，或把脚本存进项目的 `.omd/workflows/`，以后按名字调用。
- **中断续跑**：传入上次的 `resumeFromRunId`，前面已经成功、脚本也没改过的调用直接用上次的结果，从第一处变化或失败的地方重新跑。
- **隔离改动**：子代理加上 `isolation: 'worktree'`，就在独立的 Git worktree 里改代码，改完留给你检查和合并。
- **输出预算**：在消息末尾写 `+500k` 或 `+1m`，用量到了就不再派新任务。
- **后台运行**：`run_in_background: true` 放到后台，用 `job_output` 看结果，用 `job_kill` 停止。

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

## 使用范围

| 场景 | 说明 |
| --- | --- |
| 嵌套工作流 | 最多一层，和外层共用并发数、预算和取消 |
| 续跑 | 只在同一个会话内有效；第一处变化之后的调用都会重新执行 |
| worktree 隔离 | 需要本地 Git 仓库；还没提交的改动不会带进 worktree |
| 输出预算 | 到达目标后停止派新任务，正在跑的会跑完，所以实际用量可能略超 |

## 常见问题

<details>
<summary>续跑会把做过的事再做一遍吗？</summary>

前面成功且没变的调用不会重跑，第一处变化之后的会。如果任务里有发消息、写数据库这类操作，续跑前先确认上次做到了哪一步。

</details>

<details>
<summary>卸载会删掉脚本和 worktree 吗？</summary>

不会。脚本在项目的 `.omd/workflows/`，worktree 在 `.omd/worktrees/`，运行记录和预算在 `DSH_HOME/dsh-workflow/`。

</details>

## 开发和许可

安装包名是 `dsh-workflow-plus`，只从本仓库的 Release 下载；npm 上名字相近的包不是本项目。

```bash
node scripts/prepare-host-sdk.mjs
pnpm install --frozen-lockfile --ignore-scripts --config.strict-dep-builds=false
pnpm build
```

[架构说明](docs/architecture.md)。代码用 [MIT](LICENSE) 许可，第三方来源见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

反馈问题请写明 DSH 和插件版本、操作步骤、期望和实际结果，日志和截图先去掉个人信息：[Issues](https://github.com/gulagala001/dsh-workflow/issues)。
