# OMD 0.99.1 · DSH 0.2.1-rc.1 / 0.2.1-rc.2

[中文](#zh-0991) | [English](#en-0991)

<a id="zh-0991"></a>

## 中文

### 问题修复

- 修复 OMD 仍接旧版 BTW 的集成遗漏，统一使用自有 DSH BTW 的服务端与原生弹窗，删除旧插件、适配层和旧界面入口。
- 修复匹配的独立与内置 BTW 共装时可能重复注册服务和界面的问题；停用一方不会中断另一方，最后一个入口退出才清理请求与界面。

### 体验优化

- `/btw` 在主输入框上方打开旁聊弹窗，支持历史、追问和独立停止。关闭弹窗保持回答，停止按钮只取消旁聊；最近 20 次旁聊保存在当前窗口内存，刷新后清空，不写入主对话或 Dream。

### 其他变更

- 核对内置插件与独立源码、Theme／Glyph 共享文件，修正架构、使用、开发、安装入口及来源声明中的旧版本和过时状态。
- 内置 DSH BTW 0.1.2；OpenCU 保持 2.0.7。保留现有用户数据；固定构建继续分别匹配 DSH rc.1／rc.2。

<a id="en-0991"></a>

## English

### Bug Fixes

- Replaces the obsolete BTW integration with the maintained DSH BTW server and native popover. Removes the previous plugin, adapter and UI entry.
- Matching standalone and embedded BTW entries share service and UI registrations. Disabling one owner preserves the other; the final owner releases requests and UI resources.

### Improvements

- `/btw` opens a side-chat popover above the main composer, with history, follow-ups and independent cancellation. Closing keeps the answer running; Stop cancels only side chat. The latest 20 exchanges remain in window memory and clear on reload without entering the main conversation or Dream.

### Other Changes

- Checks embedded plugin sources and shared Theme/Glyph files, and corrects outdated versions and release status in architecture, usage, development, installation links and source notices.
- Bundles DSH BTW 0.1.2 and retains OpenCU 2.0.7. Existing user data is preserved; separate packages target exact DSH rc.1 and rc.2 hosts.

## 安装 / Installation

在 **插件 → 添加插件** 使用与当前 DSH 完整版本一致的固定包；保留原 profile、配置与数据，待任务结束后重启。已共装独立 BTW 的 rc.2 用户同时升级到 BTW 0.1.2。旁聊取消使用弹窗的停止按钮。

In **Plugins → Add plugin**, use the fixed package matching the complete DSH version. Preserve the profile, settings and data, and restart after active tasks finish. On rc.2, update a co-installed standalone BTW to 0.1.2. Cancel side chat with its Stop button.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.2 | [OMD 0.99.1](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.99.1/oh-my-dsh-0.2.1-rc.2.omd.0.99.1.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.99.1/SHA256SUMS) |
| 0.2.1-rc.1 | [OMD 0.99.1](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.99.1/oh-my-dsh-0.2.1-rc.1.omd.0.99.1.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.99.1/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install_EN.md)
