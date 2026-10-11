# OpenCU 开发指南

[简体中文](development.md) · [English](development_EN.md) · [首页](../README.md) · [程序集成](integration.md) · [目录](README.md)

通用实现、扩展、原生服务和测试在此维护。独立插件与完整集成复用同一实现；公开 **1.3.0** 和未发布本地 **1.6.1** 分开，不以新图替代公开源码。

## 获取公开源码

需要 Node.js ≥22.19、pnpm 11.23.0、Git。alpha.1：

```sh
git clone --branch v1.3.0 https://github.com/gulagala001/opencu.git
cd opencu
pnpm install --frozen-lockfile
pnpm build
pnpm exec playwright install chromium
pnpm start
```

rc.2改 clone tag为 `v1.3.0-dsh.0.2.0-rc.2`。公开主分支基于 1.3.0，不包含本地 Electron浏览器／站点／导入实现。[固定发行与校验](https://github.com/gulagala001/opencu/releases/tag/v1.3.0)。

`pnpm start`默认用 `data/dsh/`独立配置、3084端口，可设 `DSH_HOME`／`PORT`。打开日志中的登录链接并配置测试模型，开发与日常不共用私有目录。

## 代码入口

| 位置 | 职责 |
| --- | --- |
| `src/index.mjs`、`src/config.mjs` | 插件与 schema |
| `src/integration.mjs` | 共享、配置所有者与释放 |
| `src/computer-use/` | 工具、浏览器、原生、文件和观察 |
| `src/client/` | DSH界面与组件 |
| `browser-extension/` | Chrome连接 |
| `native/computer-use/` | macOS／Windows源码 |
| `scripts/` | 构建、启动、检查 |
| `vendor/dsh-chat/` | 对应 Chat快照与定向修改 |
| `test/` | 协议、后端、真实浏览器／界面回归 |

[公有导出](integration.md)给出真实用法。`lib/client.js`是加载器产物，非 Node ESM SDK。保留运行资源、宿主服务与生命周期。

## 原生构建

1.3.0 首次桌面安装需构建。macOS 14+需 Apple Command Line Tools及权限；Windows 10 2004+需 PowerShell 7、.NET 10 SDK和 NuGet网络。入口：

```sh
node scripts/build-computer-use-native.mjs
```

```powershell
node scripts/build-computer-use-windows-native.mjs
```

macOS本机签名／权限见[native README](../native/computer-use/README.md)，开发签名不代表 Developer ID、公证或更新器完成。Windows保留构建身份与架构；个人签名材料、钥匙串和临时工件不提交。

本地 1.6.1 新实现用官方预编译 Electron 44.7.0，完整包设计带平台原生预构建。本轮改动不在 OpenCU 的公开 1.3.0 中；OMD 主线已整合对应快照，仍须核对具体包内容和宿主。不要在 1.3.0 照用新增脚本或承诺用户无需编译。

## 测试与验收

常规回归：

```sh
pnpm test
```

定向真实界面：

```sh
node --test test/computer-use-ui.test.mjs
node --test test/browser-dialog-ui.test.mjs
```

`test/computer-use-native-ui.test.mjs`覆盖原生界面。桌面专项需平台／权限／交互条件。macOS已授权服务可指定 socket：

```sh
TRISOUL_CU_NATIVE_SOCKET=/path/to/runtime.sock node --test test/computer-use-native.test.mjs
```

Windows完整入口 `node scripts/test-windows.mjs`，原生专项：

```powershell
$env:TRISOUL_CU_WINDOWS_NATIVE_TEST = '1'
node --test --test-concurrency=1 test/computer-use-windows-native-protocol.test.mjs test/computer-use-windows-native.test.mjs
```

使用独立浏览器、合成页面和自有窗口，不请求个人钥匙串／真实账号。实际桌面避免并行输入；报告须检查执行、跳过、预算和清理，缺条件或清理失败不算通过。本轮新实现未 Windows实机验收，历史 CI仅对应当时版本。

按风险检查停止、接管、恢复、超时、重置、重复动作、关闭和重启；多插件验证两种加载顺序、共享与单独卸载。前端验证实际布局、点击、明暗及窄屏；回执之外检查页面、应用或文件真实结果。

## 兼容与贡献

公开两构建按完整 DSH版本配对 SDK、Chat与锁文件，不只放宽 peer声明。升级验证安装、工具、模式、前端、恢复、启停、重启、卸载和代表插件共存。

OpenCU复用原生工具循环，不新建模型编排层。共享避免重复注册，Chat快照与其他 UI仍需兼容检查。内部 bundle、数据、扩展和协议标识保留旧安装契约。

贡献说明问题、版本、行为、变更与验证；文档区分发布状态、用真实截图。合成复现，不提交真实会话、个人浏览器、Cookie、凭据、日志或运行产物。公开保留产品代码、维护测试／合成夹具、用户／开发文档；发行核对 Git文件、历史、tag和包清单。[第三方许可](../THIRD_PARTY_NOTICES.md) · [Issues](https://github.com/gulagala001/opencu/issues)。
