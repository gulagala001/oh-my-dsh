# Oh My DSH 1.3.6 · DSH 0.2.2-rc.1

[中文](#zh-0-2-2-rc-1-omd-1-3-6) · [English](#en-0-2-2-rc-1-omd-1-3-6)

<a id="zh-0-2-2-rc-1-omd-1-3-6"></a>

## 中文

### 问题修复

- 修复大型非 Git 工作区因 Rewind 备份阻塞而连续触发工具超时的问题。备份超出预算时记录缺口，任务查询和停止可以独立运行。
- 修复停止生成后仍等待工作区快照或命令超时的问题。PowerShell 和 Bash 请求终止后最多额外等待 1 秒，仍在停止的进程由原生任务注册表跟踪。

<a id="en-0-2-2-rc-1-omd-1-3-6"></a>

## English

### Bug fixes

- Fix cascading tool timeouts from Rewind backups in large non-Git workspaces. Slow backups record a gap while job inspection and cancellation remain available.
- Fix Stop waiting on workspace snapshots or a second command timeout. PowerShell and Bash wait up to one extra second after requesting termination, and the native job registry tracks processes still stopping.

## 安装 / Installation

| DSH | 固定安装包 / Fixed package | 校验 / Checksums |
| --- | --- | --- |
| 0.2.2-rc.1 | [Oh My DSH 1.3.6](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.1.omd.1.3.6/oh-my-dsh-0.2.2-rc.1.omd.1.3.6.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.1.omd.1.3.6/SHA256SUMS) |

在 **插件 → 添加插件** 使用匹配的固定包。等当前任务结束后，按宿主提示重载。

Use the matching fixed package in **Plugins → Add plugin**. Finish active tasks, then reload when prompted.

[安装指南 / Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md)
