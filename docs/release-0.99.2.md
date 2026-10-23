# OMD 0.99.2 · DSH 0.2.1-rc.1 / 0.2.1-rc.2

[中文](#zh-0992) | [English](#en-0992)

<a id="zh-0992"></a>

## 中文

### 问题修复

- 修复 Glyph 与 Claude CLI 主题在原生首页品牌插槽为空时缺失鲸鱼或欢迎标识的问题，保留原生与自定义 Logo，并修正切换、共装和卸载恢复。
- 修复长会话预处理因请求前缀增长反复清空快照或取消等待任务而卡住的问题；主动整理与 Auto Compact 保留有效进度。
- 修复 context_view、批量文件视图与 code_search 将显示路径误作真实文件路径的问题，沿用原生读取目标、权限及文件版本。
- 修复私有测试浏览器触发钥匙串访问、首次页面就绪竞态和停止／故障清理问题，保留网页测试、截图及 WebGL。
- 修复网页会话迁移回执丢失后重复创建会话、已读取附件丢失和附件失败后仍有后台写入的问题，使用有界并发并完整收尾。
- 修复回退恢复期间文件发生新改动仍被覆盖、特殊文件名比较及会话事件序号检查问题。
- 修复扩展停用或请求取消后命令仍运行、并发配置编辑丢失及 MCP 配置归属问题。

### 体验优化

- 预处理流水线显示实际预算原因与累计进度；来源设置页和中英文组件文档同步当前实现。

<a id="en-0992"></a>

## English

### Bug Fixes

- Restores Glyph whales and Claude CLI welcome marks in native fallback brand slots. Preserves native and custom logos, including theme switching, co-installation and unload recovery.
- Keeps valid preprocessing progress when long-conversation request prefixes grow, instead of repeatedly clearing snapshots or cancelling waiting work. Manual preparation and Auto Compact share the same recovery behavior.
- Uses the native reader's actual file target, permissions and version for context_view, batch file views and code_search instead of interpreting display paths as filesystem paths.
- Isolates private test-browser credentials and fixes first-page readiness and stop/failure cleanup while retaining website testing, screenshots and WebGL.
- Prevents duplicate conversations after lost web-migration receipts, preserves loaded attachments and completes outstanding writes before reporting failures, with bounded attachment concurrency.
- Prevents rewind from overwriting files changed during recovery and fixes special filename comparisons and conversation event sequence checks.
- Fixes command cleanup after extension shutdown or request cancellation, concurrent configuration updates and MCP configuration ownership.

### Improvements

- Shows actual preprocessing budget reasons and cumulative progress, and updates source information and bilingual component documentation.

## 安装 / Installation

在 **插件 → 添加插件** 使用与当前 DSH 完整版本一致的固定包，保留原 profile、配置和数据，待任务结束后重启。共装 Theme 的 rc.2 用户同时升级 Theme 至 0.2.2。

In **Plugins → Add plugin**, use the fixed package matching the complete DSH version. Preserve the profile, settings and data, and restart after active tasks finish. On rc.2, also update a co-installed Theme plugin to 0.2.2.

| DSH | 固定安装包 / Fixed package | SHA256SUMS |
| --- | --- | --- |
| 0.2.1-rc.2 | [OMD 0.99.2](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.99.2/oh-my-dsh-0.2.1-rc.2.omd.0.99.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.99.2/SHA256SUMS) |
| 0.2.1-rc.1 | [OMD 0.99.2](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.99.2/oh-my-dsh-0.2.1-rc.1.omd.0.99.2.tgz) | [SHA256SUMS](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.99.2/SHA256SUMS) |

[安装指南](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md) · [Installation guide](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install_EN.md)
