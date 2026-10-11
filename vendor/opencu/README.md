# OpenCU

**让 AI 在真实浏览器和桌面应用中完成操作，你随时查看、停止、接管和继续。**

[简体中文](README.md) · [English](README_EN.md) · [安装](#安装) · [使用指南](docs/usage.md) · [程序集成](docs/integration.md)

![OpenCU 真实浏览器工作区：对话与网页并排](docs/images/showcase-browser.png)

*真实界面截图：虚构的“青禾工坊办公文具补货”演示，商品缩略图为 AI 生成素材。截图展示尚未发布的本地 1.6.1 新实现；安装入口提供已发布的 1.3.0，入口、布局和运行方式不同。[查看版本差异](#版本与平台)。*

OpenCU 是可独立安装的 Computer Use 项目，提供浏览器、桌面控制、实时预览、页面批注与文件交付。现有发行使用 DSH 的模型、会话和工具循环；集成者可通过公开模块复用同一实现。[Oh My DSH](https://github.com/gulagala001/oh-my-dsh) 是完整集成 OpenCU 的一个使用场景，独立安装不需要 OMD。

## 安装

先结束任务、停止 DSH，再按**完整宿主版本**选择固定发行。需要 Node.js ≥22.19、pnpm 11.23.0 和 Git；Windows 使用 PowerShell 7。沿用原 profile、`DSH_HOME`、模型和会话配置。

| DSH 宿主 | 固定发行 | 插件安装包 |
| --- | --- | --- |
| `0.2.1-alpha.1` | [v1.3.0](https://github.com/gulagala001/opencu/releases/tag/v1.3.0) | [opencu-1.3.0.tgz](https://github.com/gulagala001/opencu/releases/download/v1.3.0/opencu-1.3.0.tgz) |
| `0.2.0-rc.2` | [v1.3.0-dsh.0.2.0-rc.2](https://github.com/gulagala001/opencu/releases/tag/v1.3.0-dsh.0.2.0-rc.2) | [opencu-1.3.0.tgz](https://github.com/gulagala001/opencu/releases/download/v1.3.0-dsh.0.2.0-rc.2/opencu-1.3.0.tgz) |

两个包内版本均为 `1.3.0`，但 SDK、Chat 快照和锁文件分别匹配宿主，不能互换。发行页提供源码与 `SHA256SUMS.txt`。不通过 `releases/latest` 选包，也不要只凭相同文件名选包。

DSH `0.2.1-alpha.1`：

```sh
npx --yes @deepseek-ai/dsh@0.2.1-alpha.1 plugin --profile web add github:gulagala001/opencu#v1.3.0
npx --yes @deepseek-ai/dsh@0.2.1-alpha.1 --profile web
```

DSH `0.2.0-rc.2`：

```sh
npx --yes @deepseek-ai/dsh@0.2.0-rc.2 plugin --profile web add github:gulagala001/opencu#v1.3.0-dsh.0.2.0-rc.2
npx --yes @deepseek-ai/dsh@0.2.0-rc.2 --profile web
```

打开启动时打印的登录链接，在输入区点击 **电脑 → 运行环境与权限**。1.3.0 使用本机 Chrome／Chromium；原生桌面控制首次安装需本机编译，macOS 需要 Apple Command Line Tools，Windows 需要 .NET 10 SDK。更多步骤见[使用指南](docs/usage.md#开始使用)和 [Windows 指南](docs/windows.md)。桌面版使用应用自己的插件管理或配套 CLI，并选择其实际 profile。

## 开始工作

在对话里选择 `@Browser`、已连接的 `@Chrome` 标签或桌面应用，说明目标和完成条件：

> 帮青禾工坊整理森野文具的办公补货单，核对蓝色笔记本、绿色档案夹和铅笔尺子套装。交付日期与备注由我接管填写，保存后再读取结果，最后保留页面。

图解演示使用受控模型和真实工具，人工保存后读取到交付日期 `2026-10-18`、联系人“林夏”、备注“请在下午送达，纸箱分批标记。”与含税合计 `¥3480`。本次用控制接口完成停止／恢复状态交接；[场景图解](docs/showcase.md)说明实际操作和 OMD 集成配置。

助手选中目标后会返回初始画面与控件信息。你可以在对话内预览或右侧电脑面板观察；需要处理登录、验证码或修改内容时点击 **停止并接管**，完成后点击 **恢复助手控制**。看图操作需要支持图片输入的模型，OpenCU 不自动更换模型。

| 任务 | 操作 | 可检查的结果 |
| --- | --- | --- |
| 网页表单和后台工作 | 读取控件、输入、点击、滚动、上传及下载 | 页面状态、截图、操作结果与文件 |
| 保留已有登录状态 | 连接 Chrome 并选择原标签 | 原标签及实际登录状态 |
| 页面修改与设计反馈 | 区域／元素批注、临时样式预览、响应式尺寸 | 图片与说明附件 |
| 桌面应用工作 | 发现窗口、读取控件、键盘和鼠标输入 | 真实应用状态与实时预览 |
| 网页资料交付 | MHTML 快照和已加载素材保存 | 持久附件与失败清单 |

[场景图解](docs/showcase.md)说明每个场景的问题、操作与结果；[完整使用指南](docs/usage.md)涵盖停止、恢复、下载、配置和故障处理。

## 能力概览

- **浏览器工作区**：标签、地址栏、查找、下载、设备尺寸及实时画面；独立配置与日常浏览器分开。
- **原生应用**：macOS 和 Windows 窗口发现、可访问性读取、截图、点击、拖拽、输入与粘贴。
- **控制交接**：助手光标、停止、手动接管和恢复；只看画面不等于取得控制权。
- **反馈与交付**：窗口分享、页面批注、临时 CSS 预览、页面和素材导出，接入 DSH 会话附件。
- **页面诊断**：读取实际观察到的网络请求；满足条件时调用网页公开的 WebMCP 工具。

OpenCU 操作的是 **DSH 后端和本地控制程序所在机器**。通过远程 Web 页面访问 DSH，不会让插件直接控制访问者的另一台电脑。

## 版本与平台

| 版本 | 状态与宿主 | 浏览器与安装差异 |
| --- | --- | --- |
| 1.3.0 | 已公开；配对 DSH `0.2.1-alpha.1`／`0.2.0-rc.2` | 本机 Chrome／Chromium及独立配置；桌面组件首次需源码编译 |
| 本地 1.6.1 新实现 | 本轮改动尚未发布，不在 OpenCU 当前公开主分支；本次演示使用 DSH `0.2.0-rc.2` 本地构建 | 统一“浏览器”入口、官方预编译 Electron `44.7.0`、插件自带浏览器、站点权限、持久历史／下载、档案及 CSV 密码导入、登录窗口；完整发行包设计使用预构建桌面组件 |

新工作区截图不代表 1.3.0 已提供这些功能。本次文档更新不发布 1.6.1，不提供尚不存在的下载链接。[1.3.0 发行说明](docs/release-1.3.0.md)是公开版本的依据。

OMD 主线已整合 OpenCU 1.6.1 的浏览器与运行时改动；本页展示对应本地构建的实际操作。相同版本字符串不代表快照含有相同实现，也不代表本次发布了新安装包。

| 平台 | 公开 1.3.0 的运行条件 | 范围与边界 |
| --- | --- | --- |
| macOS | 桌面需 macOS 14+、Apple Command Line Tools、辅助功能和屏幕录制权限 | 原生应用与浏览器；后台输入和应用兼容性以实际机器为准 |
| Windows | PowerShell 7；首次桌面／Chrome 连接需 .NET 10 SDK；桌面需 Windows 10 2004+ | 单屏 125%、150%、200% 有旧版本验证；本轮 1.6.1 未做 Windows 实机验收，多屏混合缩放不在当前范围 |
| Linux | 可用 Chrome／Chromium | 浏览器；没有 Linux 原生桌面控制 |

平台实现、历史验证与本轮实测是不同信息，不能互相替代。WebMCP 要求连接支持该协议的 Chromium 153+；本地 Electron 44.7.0 不因此自动具备该能力。受保护 Cookie 和密码不保证完整迁移，见[凭据与登录](docs/usage.md#本地-161-浏览器展示)。

## 集成到程序

公开后端入口 `opencu/integration`提供 `acquireComputerUse(ctx, options)`；前端源码入口 `opencu/client-source`提供 `applyComputerUseClient(ctx, options)`。它们面向 DSH／Cordis 的服务与生命周期，允许独立插件或工作台共用运行时、工具与界面。

```js
import { acquireComputerUse } from 'opencu/integration';

export const name = 'my-computer-use-integration';
export const inject = ['llm', 'agents', 'sessions', 'settings', 'sessionProjections', 'tools'];

export async function apply(ctx, config) {
  await acquireComputerUse(ctx, { config, namespace: 'opencu' });
}
```

`ctx`由 DSH 提供。当前没有供任意 MCP 客户端直接添加的通用 MCP 服务发行；内部原生传输协议不等于外部集成产品。依赖、前端打包、配置所有权与释放见[程序集成指南](docs/integration.md)。

### 与 Oh My DSH 共存

独立 OpenCU 和匹配版本的 OMD 集成版共用一套运行时、工具和预览。单独卸载一个使用者，另一个保留能力。显式 OpenCU 配置优先于 OMD 继承值，不需要重复授权或复制数据。

为兼容已有安装，默认数据目录仍是 `DSH_HOME/trisoul-x/computer-use/`，部分扩展、应用、协议和 Chrome 标签组保留旧名称。它们是兼容标识，不限制 OpenCU 的独立使用或程序集成。

## 配置、更新与卸载

配置位于 DSH 的 `opencu`设置区，支持开关、浏览器程序、Chrome 数据根目录、原生程序／socket 和数据目录。路径修改后重启 DSH；[配置说明](docs/usage.md#配置)包含完整字段。

更新先结束任务并停止服务，再重复匹配宿主的固定 tag 安装命令，启动相同 profile。卸载示例：

```sh
npx --yes @deepseek-ai/dsh@0.2.1-alpha.1 plugin --profile web remove opencu
```

rc.2 使用 `0.2.0-rc.2` CLI。卸载保留会话和本地数据；Chrome 连接与桌面运行时可在 **运行环境与权限**分别移除。另一集成仍在使用时保留共享组件。[完整说明](docs/usage.md#更新与卸载)。

## 文档与开发

| 文档 | 内容 |
| --- | --- |
| [使用指南](docs/usage.md) | 日常流程、预览、接管、配置、登录与 FAQ |
| [场景图解](docs/showcase.md) | 实际工作区、交接和集成场景 |
| [程序集成](docs/integration.md) | 真实导出、DSH 服务与共享生命周期 |
| [Windows](docs/windows.md) | 安装、Chrome、原生桌面与 WSL |
| [开发指南](docs/development.md) | 固定版本源码、构建、测试和贡献 |
| [文档目录](docs/README.md) | 中英文入口与发行记录 |

问题反馈到 [GitHub Issues](https://github.com/gulagala001/opencu/issues)，提供完整 OpenCU／DSH 版本、平台、入口和错误。第三方组件许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
