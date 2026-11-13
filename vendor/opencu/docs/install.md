# 安装 OpenCU

[English](install_EN.md) · [返回首页](../README.md)

需要 DSH **0.2.2-rc.3** 和 Node.js **24.9.0+**。

## 在 DSH 里安装

打开 **插件 → ＋ 添加插件**，粘贴：

```text
https://github.com/gulagala001/opencu/releases/download/v2.2.14-dsh.0.2.2-rc.3/opencu-2.2.14-dsh.0.2.2-rc.3.tgz
```

等手头的任务跑完，按提示启用或重启 DSH。校验文件：[SHA256SUMS](https://github.com/gulagala001/opencu/releases/download/v2.2.14-dsh.0.2.2-rc.3/SHA256SUMS)。

## 用命令行安装

用同一个 DSH 自带的命令行，把 `web` 换成你的 profile（桌面版是 `desktop`）：

```bash
dsh plugin --profile web add "https://github.com/gulagala001/opencu/releases/download/v2.2.14-dsh.0.2.2-rc.3/opencu-2.2.14-dsh.0.2.2-rc.3.tgz"
```

已经装了 OMD 的话不用再装，OMD 里已经带了 OpenCU。其他 DSH 版本请到 [Releases](https://github.com/gulagala001/opencu/releases) 找对应的包，版本不一致的包不要混装。

## 装好之后

打开 **设置 → 电脑与浏览器**，按提示准备浏览器文件、授予系统权限，或连接 Chrome、Edge 扩展。

- **Chrome 或 Edge 扩展**：在设置页点显示扩展文件夹，到浏览器的扩展页打开开发者模式，选"加载已解压的扩展程序"并选中这个文件夹。AI 第一次用这个浏览器时会弹出"允许连接此浏览器？"，点 **允许并记住**，之后自动连上。
- **macOS**：在 **系统设置 → 隐私与安全性** 里给 DSH 打开辅助功能和屏幕录制权限。
- **DSH 内置浏览器**：需要在 DSH 桌面版源码上打配套适配后自己构建，Release 附带 `host-adapters.zip`，步骤见[开发文档](../DEVELOPMENT.md#构建和本地插件包)。只装插件不会改动 DSH 本身。

## 复制给 AI

也可以把下面这段发给 DSH 里的 AI，让它帮你装：

```text
请把 OpenCU 安装到我现在用的 DSH profile：
https://github.com/gulagala001/opencu/releases/download/v2.2.14-dsh.0.2.2-rc.3/opencu-2.2.14-dsh.0.2.2-rc.3.tgz
先确认 DSH 是 0.2.2-rc.3、Node.js 是 24.9.0 以上；如果已经装了 OMD，就不要再装 OpenCU。
保留原来的配置、会话、浏览器配对和其他插件，不要升级 DSH；需要重启时先确认没有任务在跑。
装好后确认 设置 → 电脑与浏览器 能打开，并告诉我还需要授予哪些系统权限。
```

## 升级和回退

先备份 profile 和 `DSH_HOME/opencu`，再用新版安装包覆盖安装，DSH 本身不用动。升级失败时原有数据不受影响，把第一条报错发到 [Issues](https://github.com/gulagala001/opencu/issues)。

想回到旧版，就装回之前的安装包。回退只换代码，新版写入的数据不会自动撤销。

## 卸载

在插件页移除，或运行：

```bash
dsh plugin --profile web remove opencu
```

然后重启 DSH。浏览器配对、下载记录和批注都在 `DSH_HOME/opencu` 里，会留着，不需要可以手动删除。Chrome 或 Edge 里的扩展要在浏览器的扩展页单独移除。
