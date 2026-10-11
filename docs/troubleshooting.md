# 安装与使用排障

[English](troubleshooting_EN.md) · [目录](README.md) · [首次使用](getting-started.md) · [安装与升级](upgrade.md)

保留第一次完整错误，分别核对安装版本、运行版本和数据目录。

## 先确认是否装到了正在使用的环境

1. 查实际 DSH 与版本面板 **当前版本**，“最新版本”不是结果。
2. 桌面独立 `desktop`，Web 用启动 profile，安装状态不共享。
3. 核对 `DSH_HOME`，Web 默认用户 `.dsh`，源码默认仓库 `data/dsh/`、`trisoul-x`、3083。
4. 桌面完整重开，Web 重启原服务，新会话选 OMD；升级再查原模型／会话／主题。

<a id="package-source"></a>

### 安装来源怎么核对

仓库 `gulagala001/oh-my-dsh`，包 `trisoul_x`，预设 `trisoul-x`。[公开配对](upgrade.md#目标版本与完成标准)。展示名不等于来源，不误装同名 npm 包。

GitHub alpha.2 OMD `0.16.0` 未发行，已整合 OpenCU 1.6.1 的浏览器与运行时重构，不以 `latest` 猜包或编造 alpha.2 下载链接。

## 按症状处理

| 症状 | 操作 | 恢复结果 |
| --- | --- | --- |
| pnpm 缺失／Node 太旧 | Web／源码准备对应环境，桌面用内置宿主。 | 实际入口环境正确。 |
| 不兼容 DSH | 核对完整宿主与[配套包](upgrade.md#目标版本与完成标准)，不放宽 peer。 | 原生接受并可重启。 |
| 需要批安装脚本 | 宿主插件页看包与入口，按规则处理后检查。 | 对应组件可用。 |
| 没有 OMD 入口 | 查 profile、启用、重启、预设。 | 新 OMD 会话有工作台。 |
| 当前版本仍旧 | 桌面重启应用与 Host／完整退出，Web 重启后端。 | 当前版本实际变更。 |
| 模型／旧会话不见 | 查目录/profile，按[迁移](upgrade.md#web-to-desktop)。 | 原数据重新可见。 |
| 历史加载失败 | 保留日志、错误、ID，按[恢复](upgrade.md#legacy-history-failure)。 | 原文附件可读，失败项记录。 |
| 全局背景保存冲突 | 读最新版、比较合并再保存。 | 草稿保留，保存成功。 |
| 推荐插件失败 | 查是否已装，区分网络、校验、脚本、版本。 | 状态明确，按需重启。 |
| 浏览器／桌面组件错 | 基础组件／运行环境查该项并修复。 | 目标实际可看可操作。 |
| Mac 看得到但不能输入 | 查辅助功能；无图查屏幕录制，重开运行时。 | 图像与输入分别可用。 |
| 新标签要登录 | 优先重绑原标签，查浏览器配置和站点会话。 | 原标签继续或重新登录。 |
| 下载完却无文件 | 下载记录保存文件，扩展查原下载位置。 | 可打开且内容已核对。 |

最新本地完整包有预编译浏览器／原生组件，缺组件应换匹配完整包；旧公开 `0.10.0` 的编译仍需 SDK。Windows 本轮未实机，不以自动检查替代。

## 无法启动、白屏或大量 `waiting for service`

找首个 `failed to import`／启动异常，保留类型、`cause`、包路径、堆栈。

桌面看 Diagnostic report，可用有备份的第三方停用入口定位。Web 看原终端，能进管理器时停涉事插件再重启。源码查 checkout、依赖、构建和旧 `link:`。

恢复后继续定位组合，宿主加载插件前失败时 OMD 界面也无法修。先[备份](upgrade.md#2-停止并完整备份)，不删 `.dsh` 或覆盖其他机器依赖。

<details>
<summary>`ERR_PNPM_MISSING_TARBALL_INTEGRITY`</summary>

缺远程压缩包完整性信息。推荐管理器先固定校验包再原生安装；旧入口失败时从插件自己的固定 Release 下载匹配包，核对同页校验值，当前 profile 本地安装。不关闭校验，其他依赖问题单独查来源和锁。

</details>

<a id="offline"></a>

## 离线搬运与本地安装

发行 `.tgz` 不含全部依赖／运行时。离线目录需同系统同架构联网机准备并完整搬运；不能跨平台，也不直接打包有绝对链接的普通依赖目录。

<details>
<summary>准备可搬运目录</summary>

目标版本源码与其指定 pnpm，输出为源码外新目录：

```sh
pnpm install --frozen-lockfile
node scripts/prepare-offline.mjs /absolute/path/to/omd-offline
```

PowerShell：

```powershell
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
node scripts/prepare-offline.mjs 'C:\omd-offline'
if ($LASTEXITCODE -ne 0) { throw 'Offline preparation failed' }
```

脚本准备发行文件、可搬运依赖、构建和入口检查，不复制会话／凭据，失败不产完成目录。

1. 完整压缩含隐藏内容和 `node_modules`，解压到目标固定位置。
2. Windows `.\check-offline.cmd`，其他平台 Node ≥22.19 跑 `node scripts/check-offline.mjs`。
3. 桌面应用本地插件加 `link:绝对目录`，Web 匹配 CLI 加同目录。保留整目录，不用 tgz 代替离线环境。
4. 对照 `offline-manifest.json` 宿主，完整重启，检查新会话／工具。

模型服务仍需可达，按需组件另准备。入口检查不等于目标机全部能力已验收。

</details>

## 反馈问题时提供什么

[Bug 模板](https://github.com/gulagala001/oh-my-dsh/issues/new?template=bug-report.yml)：

- 系统／架构，桌面／Web／源码，实际 DSH 与 OMD 当前版本。
- 来源、profile、是否自定义目录，无需公开私人完整路径。
- 最短复现、预期／实际、频率、起始版本。
- 首个完整脱敏错误、截图、尝试方法和结果。

遮盖 Key、Token、私人正文，不上传整目录或凭据。未知写“未知”。
