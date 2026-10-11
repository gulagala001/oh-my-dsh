# OpenCU 程序集成

[简体中文](integration.md) · [English](integration_EN.md) · [首页](../README.md) · [使用指南](usage.md) · [开发指南](development.md)

OpenCU 提供可复用后端与界面，当前公开入口基于 DSH／Cordis，不限定为 OMD 附属。非 DSH 宿主需要适配模型、工具、会话、附件、UI 和生命周期。本指南以公开 **1.3.0** 导出为准，本地 1.6.1 不是下列安装命令的结果。

## 选择方式

| 目标 | 入口 |
| --- | --- |
| 给 DSH 加 Computer Use | [独立插件安装](../README.md#安装)，无需代码 |
| 插件／工作台复用 | `opencu/integration`与 `opencu/client-source` |
| 与 OMD 共存 | 匹配的完整集成，共享运行时与注册 |
| 非 DSH／MCP | 需要宿主适配，当前无通用 MCP 发行或独立 HTTP SDK |

## 获取依赖

按宿主选固定包，不用未核实的同名 npm 包。alpha.1：

```sh
pnpm add https://github.com/gulagala001/opencu/releases/download/v1.3.0/opencu-1.3.0.tgz
```

rc.2：

```sh
pnpm add https://github.com/gulagala001/opencu/releases/download/v1.3.0-dsh.0.2.0-rc.2/opencu-1.3.0.tgz
```

同为 1.3.0，但 SDK、Chat 快照和锁文件不同。保留完整包中的 `src`、`lib`、`native`、扩展、脚本和 `vendor`运行资源，不能只复制单文件。校验见[发行页](https://github.com/gulagala001/opencu/releases/tag/v1.3.0)。

## 后端入口

真实签名为 `acquireComputerUse(ctx, options = {})`，`ctx`由 DSH／Cordis 提供：

```js
import { Config } from 'opencu';
import { acquireComputerUse } from 'opencu/integration';

export { Config };
export const name = 'my-computer-use-integration';
export const inject = ['llm', 'agents', 'sessions', 'settings', 'sessionProjections', 'tools'];

export async function apply(ctx, config) {
  await acquireComputerUse(ctx, { config, namespace: 'opencu' });
}
```

`Config`是实际 schema，字段见[配置](usage.md#配置)。`namespace`是配置所有者，不是新协议名；独立版为 `opencu`，已有 OMD 兼容集成为 `trisoul-x`。

| 选项 | 含义 |
| --- | --- |
| `config` | 配置对象，支持宿主动态字段 |
| `getConfig` | 无参数函数，返回当前覆盖值 |
| `namespace` | 所有者配置区 |
| `dataDir` | 配置未设数据目录时的运行时目录覆盖，直接指向 Computer Use 目录 |

schema `config.dataDir`是基础目录，内部追加 `computer-use/`；`options.dataDir`是最终目录。共享使用者避免互相矛盾的路径配置。

该入口注册工具、HTTP／画面服务、图像坐标和会话钩子，复用 `llm`、`agents`、`sessions`、`settings`、`sessionProjections`、`tools`，结果和附件仍由 DSH 管理。常规集成通过工具工作，不依赖返回 `shared`对象的内部字段；它们不是独立 SDK 契约。

## 前端入口

`opencu/client`是 DSH 模块加载器的预构建产物，不能当作普通 Node ESM 导入。自有前端用公开源码：

```jsx
import { applyComputerUseClient } from 'opencu/client-source';

export const inject = ['slots', 'sidebarRightTabs', 'sidebarRight'];

export function apply(ctx) {
  return applyComputerUseClient(ctx);
}
```

源码有 JSX、CSS 和原生 Chat 工厂依赖，需要 DSH 兼容打包、React、CSS 处理与加载器，参见 `scripts/build.mjs`，不能直接粘贴到网页执行。

真实签名 `applyComputerUseClient(ctx, options = {})`返回 `{ ComputerEntry, ComputerPane }`。默认注册输入入口、右侧面板、引用选择和工具结果。工作台可用：

| 选项 | 作用 |
| --- | --- |
| `integrated` | 为 `true`时隐藏重复独立入口 |
| `openPanel` | 接收面板名的函数，电脑入口传 `'computer'` |
| `renderPane` | 接收宿主面板 props 的渲染函数 |

组件沿用宿主会话、输入、附件与面板 props，按真实调用链接线，不构造虚拟会话 ID。保留停止、接管、恢复和错误状态。

## 共享与释放

后端按 `ctx.root`共享运行时，前端按根客户端共享注册；两个物理副本也通过共享键避免重复。每次调用是一个所有者，随上下文释放退出，最后所有者释放时清理。

启停／卸载使用宿主生命周期，不主动关闭其他使用者的共享后端。显式 `opencu`配置在与 `trisoul-x`共享时优先；路径在启动时分配，修改后重启。内部 bundle、数据、扩展与协议标识为兼容保留，不限制独立集成。

公开 1.3.0 装配对应 Chat 快照并切换相关注册，不只是孤立浏览器按钮。与其他 UI 插件共存需核对槽位、配置元数据和启停，不能仅凭单独安装成功推定兼容。

![浏览器结果与 DSH 会话中的真实工具读取](images/showcase-integration.png)

*虚构采购单的真实截图，使用本地 OpenCU 1.6.1 新实现与 OMD `0.2.0-rc.2.omd.0.16.0`，展示浏览器与 DSH 会话接入。它不代替完整插件共存／生命周期验收。公开接口及布局以 1.3.0 源码为准，统一“浏览器”入口与公共扩展接管属于本轮改动。*

## 工具运行时 API

`cua`由 `computer_use`执行环境提供，不是可另行导入的包。运行时中的最小浏览器示例：

```js
var tab = await cua.createBrowserTab('browser', 'https://example.com');
```

首次选择返回状态，下一次使用保留绑定：

```js
await tab.getAXState();
await tab.getScreenshot();
await tab.markDeliverable();
```

公开内置 ID 为 `browser`，其他连接从 `cua.getState()`／`cua.listBrowsers()`获取。动作属于目标，如 `tab.setValue(elementId, text)`，没有 `cua.click()`。当前工具说明、审批和接管状态约束执行。

原生运行时内部有 MCP 传输，但没有任意 MCP 客户端可直接添加的 OpenCU 通用服务。新宿主应实现工具执行、权限、会话／附件、控制交接与生命周期，再声明实际集成能力。

## 集成验收

验证启动、目标选择、观察、实际动作、停止／接管／恢复、交付、启停、重启和卸载；多插件检查两种加载顺序、配置优先级及释放一个后另一个仍可操作。使用独立配置和合成数据，不将真实账号、未执行平台或系统授权算作通过。[开发入口](development.md)。
