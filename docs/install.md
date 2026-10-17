[rc.1 / rc.2 当前下载与安装](releases.md)

# 安装与版本配对

[English](install_EN.md) · [首页](../README.md) · [装好后第一次使用](getting-started.md)

## 先看这一条

**OMD 是 DSH 插件。当前发行支持 DSH `0.2.1-rc.1` 与 `0.2.1-rc.2`，各自使用完整宿主前缀的 OMD `0.17.3`，内置 OpenCU `2.0.0`。下载及版本配对见[当前发行](releases.md)。

新版 OpenCU 的完整内置浏览器、批注及原生监看还需要**配套 Host／Client／preload 适配**。普通 stock DSH 加装一个插件，不会自动获得这些宿主改动。仅文字、文件、主题等功能不要求先准备电脑控制。

| 你手里的环境 | 怎么选 |
| --- | --- |
| 当前发行 | 使用维护者交付的匹配插件与宿主适配；核对完整版本、来源及归档 SHA-256。 |
| DSH `0.2.0-rc.2` | 只能用为 rc.2 单独构建的插件与宿主，不使用 rc.1 包。 |
| DSH `0.2.1-alpha.3` | 只能用对应 alpha.3 构建，不改版本号强行安装。 |
| 公开旧版 0.10 | 按下方固定发行及该 tag 文档安装；不包含本页介绍的新版 OpenCU。 |

## 安装前

1. 从实际应用或服务核对 DSH 版本、`DSH_HOME` 和 profile。终端 PATH 里的另一份 `dsh` 不一定是正在运行的宿主。
2. 结束活动任务并完整退出要更新的实例，备份实际数据目录。保留凭据、会话、附件、其他插件和显式设置；不要用空 profile 冒充升级成功。
3. 准备自己的模型渠道。OMD 不附带账号；工具任务要求模型支持工具调用，截图理解要求图像输入。
4. 确认权限：OMD 安装配置默认完整文件／命令访问、关闭执行审批，显式 profile 覆盖优先。记忆共享范围不是文件权限。

## 桌面应用

在应用的 **插件** 页安装并启用核对过的本地 `.tgz`。需要 CLI 时，使用该桌面应用自带的 CLI，而非全局 npm／npx CLI；桌面保留 `desktop` profile。

macOS 默认安装路径示例（替换归档占位路径，沿用实际 `DSH_HOME`）：

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" --version
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add 'file:/absolute/path/to/matching-omd.tgz'
```

Windows 使用应用插件页或实际桌面 CLI，不照搬 Mac 路径。匹配的宿主适配按其交付说明安装；插件 CLI 不负责替换桌面 Host。

## DSH Web

使用原服务的匹配 CLI、原 profile、实际数据目录和端口。下面的 `dsh` 必须指向已核实的原宿主，`web` 换成原 profile：

```sh
dsh --version
dsh plugin --profile web add 'file:/absolute/path/to/matching-omd.tgz'
```

随后用原启动方式重启。Web 不会因为插件安装而变成有完整内置浏览器的桌面 Host。源码构建及各宿主入口见[开发文档](development.md)。

## 装好以后

完整重启对应实例；桌面仅关窗口或刷新页面不等于重启 Host。核对：

- 当前宿主与 OMD 完整版本匹配，插件已启用。
- 新建会话可以选择 **Oh My DSH**，原模型、旧会话及其他插件仍在。
- 做一次短对话和无副作用的文件读取；如未配置模型，先完成模型设置。
- 需要 CU 时打开 **设置 → 电脑与浏览器**，按需准备浏览器资源、系统权限或 Chrome／Edge 扩展配对。详见[电脑操作](computer-use.md)。

构建脚本被拦截时，按[精准批准步骤](upgrade.md#build-approval)处理同一已核验包，不用 `ignoreScripts`、放宽 peer、version exemption 或批准全部来绕过。

## 已公开的旧版本

以下是历史固定版本，不是当前发行的下载入口：

| DSH | OMD | 发行与对应文档 |
| --- | --- | --- |
| `0.2.1-alpha.1` | `0.2.1-alpha.1.omd.0.10.0` | [Release](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-alpha.1.omd.0.10.0) · [该版本文档](https://github.com/gulagala001/oh-my-dsh/blob/v0.2.1-alpha.1.omd.0.10.0/README.md) |
| `0.2.0-rc.2` | `0.2.0-rc.2.omd.0.10.0` | [Release](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.0-rc.2.omd.0.10.0) · [该版本文档](https://github.com/gulagala001/oh-my-dsh/blob/v0.2.0-rc.2.omd.0.10.0/README.md) |

不用 GitHub 的 `latest` 标记跨宿主选包。迁移、备份和回退细节保留在[升级指南](upgrade.md)。
