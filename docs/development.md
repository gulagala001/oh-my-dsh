# 开发与源码运行

[English](development_EN.md) · [目录](README.md) · [用户指南](usage.md) · [贡献说明](../CONTRIBUTING.md)

供源码试用和贡献者使用。普通用户用[安装指南](install.md)，无需跑工程测试。
本 checkout 保留固定 `0.10.0` 底座与后续成果，默认为 **OMD `0.2.1-rc.2.omd.0.18.2` / DSH `0.2.1-rc.2` 发行源码**；0.2.0-rc.2／alpha.3／0.2.1-rc.1 的独立构建入口、旧工件与数据保留。[包元数据](https://github.com/gulagala001/oh-my-dsh/blob/main/package.json)保留 `private`，使用 GitHub Release 分发而非 npm。匹配的公共 Chat、Conversation 与宿主组件来源见 [DSH manifest](../vendor/dsh.json)；[新版 OpenCU 2.0.2](../vendor/opencu.json)已整体内置，只装 OMD 即包含核心、工具与真实 REA 前端。0.2.1-rc.2 使用 Cordis `4.0.5`、Schemastery `3.18.5` 与冻结依赖锁，不放宽门禁。

OMD 发行包不重复携带 OpenCU 的独立注册包 `vendor/opencu/lib/client.js`：集成客户端已在 OMD 主包内，`client.factory.mjs` 仍保留用于离线重建；工作区快照和独立 OpenCU 发行不受影响。

## 源码运行

需要 Node.js ≥22.19、Git，以及 checkout 的 `package.json` 指定的 pnpm。
下面只演示已公开的固定 `0.10.0` 源码运行，不是当前 `0.18.2` 版本的安装命令。

```sh
git clone --branch v0.2.1-alpha.1.omd.0.10.0 https://github.com/gulagala001/oh-my-dsh.git
cd oh-my-dsh
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

**本地兼容构建：** `scripts/host-targets.mjs` 集中定义已审阅宿主的官方提交与框架；`scripts/align-host.mjs <完整宿主版本> <官方源码目录>` 对齐清单、枚举来源和框架 overrides。`scripts/sync-dsh.mjs` 接收独立匹配源码及其真实浏览产物，`scripts/sync-opencu.mjs` 接收对应新版 tgz。每份构建单独生成并核对冻结锁、peer 与工件，不改版本号混装。独立聊天的草稿初始化集中在 `src/client/projectless-state.mjs`：新版调用原生初始化接口，rc.2 使用同一目标 Session 的输入 facade，保留已有草稿、附件所有权及提交锁。本地安装包使用 `OMD_PNPM_ENTRY="$PNPM" node scripts/pack-local.mjs <输出目录>`，保留内置 macOS helper 的执行位与原签名字节。最小定点检查使用隔离数据/profile；日常部署与重启另需明确授权。

默认数据目录为仓库内的 `data/dsh/`，profile 为 `trisoul-x`，端口为 3083；首次启动安装本地插件。
打开终端输出的完整登录链接，在 DSH 中配置模型。仓库不提供私人数据或凭据。

<details>
<summary>端口、数据和本地链接</summary>

macOS／Linux：

```sh
PORT=3090 pnpm start
DSH_HOME=/absolute/path/to/dsh-data pnpm start
```

PowerShell：

```powershell
$env:PORT = '3090'
$env:DSH_HOME = 'C:\dsh-data'
pnpm start
```

构建后，用匹配宿主版本的 CLI 链接已有 Web profile：

```sh
dsh plugin --profile YOUR_PROFILE add link:/absolute/path/to/oh-my-dsh
```

重启生效；桌面用[自带 CLI](upgrade.md#desktop)，普通 CLI 不写 desktop profile。源码路径建议无空格。
macOS 的 `node scripts/launch-macos.mjs` 使用默认数据目录和端口，后台启动并打开登录链接，日志在 `data/dsh-stage.log`。
关闭浏览器不会停止后台服务；前台 `pnpm start` 用 Ctrl+C 停止。

</details>

## 构建和职责

| 路径 | 内容 |
| --- | --- |
| `cordis.patch.yml`、`presets/` | 宿主与预设组合 |
| `src/index.mjs`、`src/dsh-agent.mjs` | 生命周期／工具 |
| `src/context/` | 摘要、资料、替换、回查 |
| `src/tasks.mjs`、`src/todolist.mjs` | 锚点、任务、证据 |
| `src/hub.mjs`、`src/hub-store.mjs`、`src/monitor-ledger.mjs` | 后台／持久监控账本 |
| `src/dream/` | 隔离归属、来源、短记忆与续跑 |
| `src/codegraph.mjs` | 索引／查询；取消及初始化失败保留可读错误与原始 cause |
| `src/client/` | 对话、工作台、设置、主题 |
| `vendor/dsh/` | 匹配当前构建目标的公共 Chat、Conversation 与宿主组件 |
| `vendor/opencu/` | 新版 OpenCU 完整发行快照；对应目标 tgz 整体同步，不手改 |
| `scripts/`、`test/` | 构建／启动／检查 |

`pnpm build` 构建前端，并从 `presets/trisoul-x/agent.cordis.yml` 生成普通与 OMD-PTC 预设；修改源配置，不手改生成文件。

宿主构建通过 [`host-const-enums.mjs`](../scripts/host-const-enums.mjs)，使用根 `devDependencies` 显式锁定、经来源清单核验的 TypeScript `6.0.3`，按 AST 与真实符号绑定内联官方 `const enum` 成员并消除运行时枚举引用。DSH／Cordis 复用宿主 SDK 单例，不打包第二份；官方来源提交、SHA-256 与完整枚举声明／成员按[枚举 manifest](../scripts/host-const-enums.json)校验。默认构建不依赖桌面 SDK 路径中的未声明编译器 fallback。

CodeGraph 的 `codegraph.json` 排除规则只作用于当前项目根，不会自动继承到独立子仓库。工作区与各子仓库分别排除隔离宿主、构建产物和 REA 提取包，查询保留手写适配层；调查提取包原件用定点文件读取。索引异常膨胀时先确认无活动写入者，再清理可重建的 `.codegraph` 数据库，执行 `codegraph_index` 并以实际查询确认；不得删除用户数据或源文件。

## 按需测试

专注实现和交付，尽量少做测试。按需做最小构建／启动检查，仅为具体问题或用户明确要求做定点验证（含 CU）。依据用户实际使用反馈改进体验。贡献与发行要点见[贡献说明](../CONTRIBUTING.md)。
- `pnpm test`（或 `pnpm test:smoke`）：仅保留 6 个文件的少量明确回归，不反复安装宿主、不启动完整桌面。
- 单项回归：`node --test test/<name>.test.mjs`，仅指定实际保留的文件。
- `pnpm test:all`：兼容入口，运行同一组最小检查，不再另设重型全量套件；结果只说明这些检查的有限范围。
- 需要运行检查时，使用隔离数据/profile，保持当前工作 DSH 原状。

图片、上下文预算和空闲预处理见[上下文整理与原文回查](context-workflow.md)；来源与许可见[第三方声明](../THIRD_PARTY_NOTICES.md)。
