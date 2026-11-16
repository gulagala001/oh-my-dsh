# DSH Unharnessed

[English](README_EN.md)

在 DeepSeek Harness 中，用一个持久 Python 工具完成编程、后台命令、MCP 调用和图片与文件交付。变量可以跨对话压缩保留，并在相同会话重启后恢复。

## 安装与选择

在 **插件 → 添加插件** 中粘贴安装包地址：

```text
https://github.com/gulagala001/dsh-unharnessed/releases/download/v0.2.2-dsh.0.2.2-rc.3/dsh-unharnessed-0.2.2-dsh.0.2.2-rc.3.tgz
```

然后在新聊天的 Agent 预设中选择 **Unharnessed**。已有聊天可能沿用启动时的插件修订，更新后新建聊天或正常重启 DSH。

| 使用范围 | 要求 |
| --- | --- |
| 宿主 | DSH Desktop 0.2.2-rc.3 |
| 运行环境 | Node.js 24.9.0+，已有 Python 3.11+ 和 POSIX shell |
| Python | 默认优先使用 DSH Desktop 自带解释器；内核和 dill 随插件提供 |

先试：让它“用 Python 算出 1 到 100 的平方和，并把结果保存在变量里”。

## Python 与后台命令

```python
from pathlib import Path
source = Path('README.md').read_text()
len(source), source[:300]
```

```python
build = bash('npm run build', timeout=600)
# 立即返回；结束当前轮次后，完成通知会唤醒会话。
```

```python
result = await build
result.exit_code, result.output[-2000:]
```

支持顶层 await、尾表达式、跨单元格变量和函数、异步任务、中断恢复、后台输出和通知撤回。`bash()` 的超时以秒计；`timeout=None` 表示该命令不限时。

## 跨重启快照

默认在单元格结束后和正常销毁内核时保存检查点。同一个会话重启、恢复或内核意外退出后，新的 Python 进程会尝试恢复最近一次成功保存的变量、函数和 lambda。恢复结果在下一次 `ipython` 返回中列出。

- 单个值上限 16 MiB，总上限 256 MiB；超限或无法序列化的值记录在未恢复清单中。
- 活动进程、BashHandle、异步任务、文件流、socket 和生成器不恢复，需要明确重新启动。
- 恢复绑定会话 ID、工作目录、沙箱策略和 Python 主/次版本。fork、新会话、权限或工作目录改变会从空内核开始，不读取其他会话的状态。
- 显式 `/unharnessed-reset` 停止进程并清除该会话检查点，旧变量不会再次恢复。
- 原生 `/compact` 保留内核并报告仍然存在的名字；成功保存检查点后，才清除超出单值上限的变量。
- 检查点通过协议分块传给宿主，宿主原子提交并校验 SHA-256。只读会话也能保存框架状态，无需扩大 Python 的文件写权限。损坏文件在反序列化前被拒绝。
- 默认目录是当前 DSH profile（无 profile 时为 DSH home）下的 `unharnessed-state`，按会话哈希隔离并使用私有文件权限和进程所有权锁；不会写入工程仓库。

检查点恢复的是已保存的 Python 状态，不重放历史代码。突然终止时，最后一次成功检查点之后的后台变动可能丢失；错误信息会明确说明恢复状态。

## DSH MCP

直接复用 DSH 已配置、已连接的 MCP 工具，不复制凭据、不创建第二套 MCP 配置，也不把 MCP schemas 加回模型原生工具列表。

```python
await mcp.list_connections()
await mcp.search_tools('search', limit=10)
await mcp.list_tools('实际服务器名')
await mcp.describe_tool('实际服务器名', '目录返回的完整工具名')
result = await mcp.call_tool('实际服务器名', '目录返回的完整工具名', {'query': 'example'})
```

可使用目录返回的完整公开名称，或者服务器实际的原始工具名；长名称及特殊字符使用与 DSH 相同的哈希规则。结果作为 Python 值返回，可先筛选再打印。调用经过 DSH 的执行管线，保留参数检查、其他插件的工具限制、guards、审批、取消、超时和结果处理。MCP 返回的原生图片/文件引用进入会话附件。

没有可用连接时目录为空；连接配置、OAuth 和凭据管理仍在 DSH 原有界面处理。本版桥接 MCP 工具，不新增 MCP prompt 模板或独立服务器管理入口。

## 图片、文件与富媒体

```python
await attach_image('plot.png', 'screenshot.jpg')
await attach_file('report.pdf', 'clip.mp4', 'recording.wav')
await display({'text/html': '<h1>Report</h1>'}, name='report')
await display({'image/png': Path('plot.png').read_bytes()})
```

图片使用 DSH 原生图片附件，支持 PNG、JPEG、WebP、GIF，并经过宿主的格式、尺寸和批量限制。文件按原始字节持久保存；音频、视频、PDF、HTML 等通过原生文件附件交付。`display()` 接受 MIME 字典；二进制值使用 bytes 或规范 base64，文本 MIME 使用文本。上游 `rlm.emit()` 的图片、文本和常见文件 MIME 也接入相同桥梁。

附件从 Python 当前目录读取，受内核当前沙箱约束；宿主不代替 Python 读取任意路径。默认一次附件请求总量最多 10 MiB。附件在进入会话前持久存储，并通过会话日志记录引用。

音频和视频作为文件交付，预览取决于 DSH。HTML 作为文件交付，不在插件中执行任意 HTML。

## 目标与自主检查

```text
/goal 修复解析器，运行测试并检查边界输入
/goal pause
/goal resume
/goal clear
```

```python
await goal.get()
await goal.complete()
await goal.block('具体阻塞原因')
```

目标沿用 DSH 的持久化与续轮；Python 不能自行新建或恢复用户目标。至少经过三个目标轮次才允许声明阻塞。

```text
/unharnessed-autonomous {"objective":"让解析器接受尾随逗号","gates":["npm test","npm run lint"],"maxRounds":12}
```

每轮结束且后台命令全部退出后，宿主执行显式配置的 shell 门禁。全部通过才完成；失败反馈进入下一轮；到达轮数上限则阻塞。Python 的 `goal.complete()` 不能跳过自主门禁。可用 `/goal pause`、`/goal clear` 或 DSH 停止按钮控制运行。

续跑预算使用 DSH 原生轮数，仍未额外实现上游按 token 计量的预算。门禁以 DSH 工作目录和宿主环境执行，不继承 Python 临时修改的 cwd/env。

## 技能与配置

```python
await skills.list()
await skills.get('实际技能名')
```

配置在 `cordis.patch.yml` 的 `preset-unharnessed → config.plugins → unharnessed → config`。时间配置均以毫秒计。

| 配置 | 默认值 | 作用 |
|---|---:|---|
| `pythonCommand` | `auto` | 已有 Python；可指定绝对路径 |
| `bashCommand` | `bash` | 已有 POSIX shell |
| `maxOutputChars` | 16000 | 单元格文本返回上限 |
| `cellTimeoutMs` | 600000 | 单元格执行上限 |
| `startupTimeoutMs` | 15000 | 内核启动期限 |
| `interruptGraceMs` | 3000 | 中断后的强制停止等待 |
| `gateTimeoutMs` | 60000 | 每条检查命令期限 |
| `snapshots` | true | 保存和恢复检查点 |
| `stateDirectory` | 空 | 自动使用 profile 状态目录 |
| `snapshotMaxBytes` | 268435456 | 检查点总上限 |
| `snapshotVariableBytes` | 16777216 | 单值序列化上限 |
| `snapshotTimeoutMs` | 15000 | 保存检查点期限 |
| `maxAttachmentBytes` | 10485760 | 一次附件请求总上限 |

## 开发与许可

开发和检查命令见 [CONTRIBUTING.md](CONTRIBUTING.md)，版本变化见 [CHANGELOG.md](CHANGELOG.md)。本插件采用 [MIT](LICENSE)，Python 内核与 dill 的来源和许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
