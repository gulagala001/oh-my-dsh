# Oh My DSH 1.3.11 · DSH 0.2.2-rc.1

[中文](#zh-1311) · [English](#en-1311)

<a id="zh-1311"></a>

## 中文

### 问题修复

- 内置 DSH Undo 0.1.11，修复上下文压缩或提示替换后撤回确认不可用的问题。
- 撤回按当前上下文位置完整选择区间，避免遗漏被替换后的节点或残留消息；撤销及中断恢复同步修复，保留早期对话、原生日志和文件保护。

<a id="en-1311"></a>

## English

### Bug Fixes

- Bundle DSH Undo 0.1.11 to fix unavailable rewind confirmation after context compaction or prompt replacement.
- Select complete rewind ranges by current context position, avoiding omitted replacement nodes or leftover messages. Undo and interrupted-operation recovery use the same fix while retaining earlier conversation, the native log and file safeguards.

## 安装 / Installation

适用于 **DSH 0.2.2-rc.1**、Node.js **24.9.0+**。等当前任务结束后，按宿主提示重载。

Requires **DSH 0.2.2-rc.1** and Node.js **24.9.0+**. Finish active tasks, then reload when prompted.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.2-rc.1 | [Oh My DSH 1.3.11](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.1.omd.1.3.11/oh-my-dsh-0.2.2-rc.1.omd.1.3.11.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.1.omd.1.3.11/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md)
