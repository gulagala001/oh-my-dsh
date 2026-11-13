# 安装 DSH Extensions

[English](install_EN.md) · [返回首页](../README.md)

需要 DSH **0.2.2-rc.3** 和 Node.js **24.9.0+**。

## 在 DSH 里安装

打开 **插件 → ＋ 添加插件**，粘贴：

```text
https://github.com/gulagala001/dsh-extensions/releases/download/v0.1.7-dsh.0.2.2-rc.3/dsh-extensions-0.1.7-dsh.0.2.2-rc.3.tgz
```

等手头的任务跑完，按提示启用或重启 DSH。校验文件：[SHA256SUMS](https://github.com/gulagala001/dsh-extensions/releases/download/v0.1.7-dsh.0.2.2-rc.3/SHA256SUMS)。

## 用命令行安装

用同一个 DSH 自带的命令行，把 `web` 换成你的 profile（桌面版是 `desktop`）：

```bash
dsh plugin --profile web add "https://github.com/gulagala001/dsh-extensions/releases/download/v0.1.7-dsh.0.2.2-rc.3/dsh-extensions-0.1.7-dsh.0.2.2-rc.3.tgz"
```

## 升级和回退

先备份 profile，再用新版安装包覆盖安装，DSH 本身不用动。升级失败时原有数据不受影响，把第一条报错发到 [Issues](https://github.com/gulagala001/dsh-extensions/issues)。

想回到旧版，就装回之前的安装包。回退只换代码，新版写入的数据不会自动撤销。

## 卸载

在插件页移除，或运行：

```bash
dsh plugin --profile web remove dsh-extensions
```

然后重启 DSH。下面这些是你的数据，卸载时都会留着：

- Skill 文件夹和其中的开关设置，DSH 自己会读，卸载后照样生效。
- AGENTS.md、CLAUDE.md 等指令文件，DSH 自己会读。
- `~/.dsh/mcp.json`、`~/.dsh/commands/`、`<项目>/.dsh/commands/`、`~/.dsh/hooks.json`：卸载后不再加载，重新安装后恢复。
- `~/.dsh/dsh-extensions/` 里的 MCP 工具描述缓存，可以直接删除。
