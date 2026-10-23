# DSH Workflow — 安装与维护

[English](install_EN.md) · [返回首页](../README.md#readme-install)

**DSH 0.2.1-rc.2 · Node.js ≥22.19 · 0.1.1**

子代理沿用宿主模型与权限，并产生正常模型用量。续跑会重新执行成功前缀之后的调用；先核对已有产物与副作用。

## 安装到当前实例

在实际使用的实例打开 **插件 → ＋ 添加插件**，粘贴固定发行地址：

```text
https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.3-dsh.0.2.1-rc.2/dsh-workflow-plus-0.1.3-dsh.0.2.1-rc.2.tgz
```

等当前任务结束后按宿主提示启用或重启，沿用原 profile、DSH_HOME、模型配置和会话。

下载后可核对同一发行版的 [SHA256SUMS](https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.3-dsh.0.2.1-rc.2/SHA256SUMS).

### 首次成功检查

在配置好模型的会话中输入：

```text
使用 workflow 并行审查 auth 和 storage，汇总发现；不要修改文件。
```

会话工作流面板显示真实阶段、成员与状态，子代理在原生子会话中运行。

<details>
<summary>命令行安装</summary>

使用同一 DSH 实例对应的 CLI，将 `web` 换成实际 profile。

```bash
dsh plugin --profile web add "https://github.com/gulagala001/dsh-workflow/releases/download/v0.1.3-dsh.0.2.1-rc.2/dsh-workflow-plus-0.1.3-dsh.0.2.1-rc.2.tgz"
```

</details>

## 升级、回退与卸载

先备份现有 profile 与相关数据，再安装匹配宿主的固定版本；不为安装插件自动替换或降级 DSH。更新失败保留原数据和第一处错误。回退时选择此前匹配包并核对对应数据说明；只恢复代码不等于撤销数据变更。

在当前实例插件页移除，或使用：

```bash
dsh plugin --profile web remove dsh-workflow-plus
```

不会主动删除脚本、运行记录或 worktree。运行与预算数据位于 `DSH_HOME/dsh-workflow/`，项目脚本／隔离目录仍使用 `.omd/workflows/`、`.omd/worktrees/`。

移除后重启同一实例。反馈提供完整版本、profile 类型和脱敏后的第一处错误。
