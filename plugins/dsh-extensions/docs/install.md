# DSH Extensions — 安装与维护

[English](install_EN.md) · [返回首页](../README.md#readme-install)

**DSH 0.2.1-rc.2 · Node.js ≥22.19 · 0.1.0**

## 安装到当前实例


在实际使用的实例打开 **插件 → ＋ 添加插件**，粘贴固定发行地址：

```text
https://github.com/gulagala001/dsh-extensions/releases/download/v0.1.0-dsh.0.2.1-rc.2/dsh-extensions-0.1.0-dsh.0.2.1-rc.2.tgz
```

等当前任务结束后按宿主提示启用或重启，沿用原 profile、DSH_HOME、模型配置和会话。

下载后可核对同一发行版的 [SHA256SUMS](https://github.com/gulagala001/dsh-extensions/releases/download/v0.1.0-dsh.0.2.1-rc.2/SHA256SUMS)。

### 首次成功检查

打开 **插件** 页，顶部出现 Skill、MCP、指令、命令、Hooks 五个标签页；Skill 页列出当前可用的 Skill。

<details>
<summary>命令行安装</summary>

使用同一 DSH 实例对应的 CLI，将 `web` 换成实际 profile。

```bash
dsh plugin --profile web add "https://github.com/gulagala001/dsh-extensions/releases/download/v0.1.0-dsh.0.2.1-rc.2/dsh-extensions-0.1.0-dsh.0.2.1-rc.2.tgz"
```

</details>

## 升级、回退与卸载

安装匹配宿主的固定版本即可升级；不为安装插件自动替换或降级 DSH。回退时选择此前匹配的固定包。

在当前实例插件页移除，或使用：

```bash
dsh plugin --profile web remove dsh-extensions
```

移除后重启同一实例。以下文件属于你的数据，卸载时保留：

- Skill 文件夹与其中的开关设置（DSH 原生读取，卸载后仍生效）；
- AGENTS.md／CLAUDE.md 等指令文件（DSH 原生读取）；
- `~/.dsh/mcp.json`、`~/.dsh/commands/`、`<项目>/.dsh/commands/`、`~/.dsh/hooks.json`（卸载后不再加载，重新安装后恢复）；
- `~/.dsh/dsh-extensions/` 中的 MCP 工具描述缓存，可直接删除。

反馈时请提供完整版本、profile 类型和脱敏后的第一处错误。

<a id="build-from-source"></a>

## 从源码构建

安装 Node.js 22.19+ 与 pnpm 11.28.5 后，在仓库目录执行：

```sh
pnpm install --frozen-lockfile
pnpm build
npm pack
```

在 **插件 → 添加插件** 中输入生成的 `dsh-extensions-0.1.0-dsh.0.2.1-rc.2.tgz` 的本地绝对路径。
