# Oh My DSH 1.3.10 · DSH 0.2.2-rc.1

[中文](#zh-1310) · [English](#en-1310)

<a id="zh-1310"></a>

## 中文

### 问题修复

- 内置 DSH Undo 0.1.10，修复撤回后残留“已完成分析／运行状态已注入”的问题；撤回包含当前输入的前置状态，旧撤回记录同步清理显示范围，并保留较早输入及完整撤销恢复。
- 修复退出时在原生会话写入句柄关闭后仍移除运行时提示的问题。整宿主退出不再发起新的清理事务；热停用在会话所有者保护下完成清理，再释放插件资源。
- 热停用等待已进入的模型请求、请求前处理及自动压缩自然完成，不强行取消当前任务；停用后原生请求不再携带旧的运行时提示。
- 修复提示已从内存移除时跳过残留事务恢复的问题；沿用原操作 ID 核对原生日志，保留原始消息和任务，未确认持久化时保留事务。

<a id="en-1310"></a>

## English

### Bug Fixes

- Bundle DSH Undo 0.1.10 to remove “analysis complete / runtime state injected” residue after rewind. Include each input’s prologue, correct the display range of existing rewinds, and preserve earlier inputs and full undo restoration.
- Fix runtime-hint removal after the native session write handle has closed. Whole-host shutdown starts no new cleanup transaction; hot unload retires hints under the session owner before releasing plugin resources.
- Wait for admitted model requests, request preparation and Auto Compact to finish naturally during hot unload, without cancelling active work. Subsequent native requests no longer carry the retired runtime hints.
- Recover retained transactions even when their runtime hints have already disappeared from memory. Reconcile original operation IDs against the native log, preserve original messages and tasks, and retain the transaction when persistence is unconfirmed.

## 安装 / Installation

适用于 **DSH 0.2.2-rc.1**、Node.js **24.9.0+**。等当前任务结束后，按宿主提示重载。

Requires **DSH 0.2.2-rc.1** and Node.js **24.9.0+**. Finish active tasks, then reload when prompted.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.2-rc.1 | [Oh My DSH 1.3.10](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.1.omd.1.3.10/oh-my-dsh-0.2.2-rc.1.omd.1.3.10.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.2-rc.1.omd.1.3.10/SHA256SUMS) |

[安装指南 / Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md)
