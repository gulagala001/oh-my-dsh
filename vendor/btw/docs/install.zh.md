# 安装 DSH BTW

[English](install.md) · [返回首页](../README.md)

需要 DSH **0.2.2-rc.2** 和 Node.js **24.9.0+**。

## 在 DSH 里安装

打开 **插件 → ＋ 添加插件**，粘贴：

```text
https://github.com/gulagala001/dsh-btw/releases/download/v0.1.9-dsh.0.2.2-rc.2/gulagala001-dsh-btw-0.1.9-dsh.0.2.2-rc.2.tgz
```

等手头的任务跑完，按提示启用或重启 DSH。校验文件：[SHA256SUMS](https://github.com/gulagala001/dsh-btw/releases/download/v0.1.9-dsh.0.2.2-rc.2/SHA256SUMS)。

## 用命令行安装

用同一个 DSH 自带的命令行，把 `web` 换成你的 profile（桌面版是 `desktop`）：

```bash
dsh plugin --profile web add "https://github.com/gulagala001/dsh-btw/releases/download/v0.1.9-dsh.0.2.2-rc.2/gulagala001-dsh-btw-0.1.9-dsh.0.2.2-rc.2.tgz"
```

## 复制给 AI

也可以把下面这段发给 DSH 里的 AI，让它帮你装：

```text
请把 DSH BTW 安装到我现在用的 DSH profile：
https://github.com/gulagala001/dsh-btw/releases/download/v0.1.9-dsh.0.2.2-rc.2/gulagala001-dsh-btw-0.1.9-dsh.0.2.2-rc.2.tgz
先确认 DSH 是 0.2.2-rc.2、Node.js 是 24.9.0 以上；保留原来的配置和数据，等当前任务结束再重启。
```

## 升级和回退

先备份 profile，再用新版安装包覆盖安装，DSH 本身不用动。升级失败时原有数据不受影响，把第一条报错发到 [Issues](https://github.com/gulagala001/dsh-btw/issues)。

想回到旧版，就装回之前的安装包。回退只换代码，新版写入的数据不会自动撤销。

## 卸载

在插件页移除，或运行：

```bash
dsh plugin --profile web remove @gulagala001/dsh-btw
```

然后重启 DSH。旁聊记录只存在窗口内存里，卸载后不留数据。
