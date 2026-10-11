# 开发与源码运行

[English](development_EN.md) · [目录](README.md) · [用户指南](usage.md) · [贡献约定](../CONTRIBUTING.md)

供源码试用／贡献者使用。普通用户用[固定发行](upgrade.md)，无需跑工程测试。

GitHub `main` 是 DSH alpha.2／OMD `0.2.1-alpha.2.omd.0.16.0` 未发布分支，已整合 OpenCU 1.6.1 的浏览器与运行时重构；克隆 main 获取开发源码，公开安装包仍以固定发行版为准。

## 源码运行

Node.js ≥22.19、Git、checkout 的 `package.json` 指定 pnpm；公开 `0.10.0` 用 11.23.0，开发版用自己的锁定版本。

```sh
git clone --branch v0.2.1-alpha.1.omd.0.10.0 https://github.com/gulagala001/oh-my-dsh.git
cd oh-my-dsh
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

默认仓库 `data/dsh/`、`trisoul-x` profile、3083，首次装本地插件。打开完整登录链接，在 DSH 配置模型，不附私人数据／凭据。

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

构建后链接已有 Web profile，用匹配 CLI：

```sh
dsh plugin --profile YOUR_PROFILE add link:/absolute/path/to/oh-my-dsh
```

重启生效，桌面用[自带 CLI](upgrade.md#desktop-cli)，普通 CLI 不写 desktop。路径建议无空格。

Mac `node scripts/launch-macos.mjs` 后台启动并开链接，关浏览器不停服务，日志留本地；前台 Ctrl+C 停止。

</details>

## 构建和职责

| 路径 | 内容 |
| --- | --- |
| `cordis.patch.yml`、`presets/` | 宿主与预设组合 |
| `src/index.mjs`、`src/dsh-agent.mjs` | 生命周期／工具 |
| `src/context/` | 摘要、资料、替换、回查 |
| `src/tasks.mjs`、`src/todolist.mjs` | 锚点、任务、证据 |
| `src/hub.mjs`、`src/hub-store.mjs` | 后台／监控 |
| `src/codegraph.mjs` | 索引／查询 |
| `src/client/` | 对话、工作台、设置、主题 |
| `vendor/opencu/` | 固定发行快照，通用实现在 OpenCU 项目 |
| `scripts/`、`test/` | 构建／启动／检查 |

build 从通用清单生成 OMD-PTC，改源配置，不手改生成文件。

## 验证与贡献

先读[贡献说明](../CONTRIBUTING.md)，检查与风险匹配。会话、工具、提醒、压缩、Dream、期限／恢复改动按[模拟器指南](../scripts/simulator/README.md)选真实宿主场景，前端加真实 Web。

```sh
pnpm exec playwright install --with-deps chromium
pnpm build
pnpm test
```

临时数据、受控模型、真实宿主，不需密钥。原生桌面依赖平台、组件、权限；跳过、耗尽、清理失败不算通过，本轮 Windows 未实机。

宿主升级匹配 SDK／快照／锁，保留工具／技能／配置／生命周期。共存查固定版本、两加载顺序、启停重启卸载，原生拒绝继续拒绝，不改 peer 代替适配。

## 图片与上下文预算

开发分支批量卸载旧图请求表示，留文件附件可重读，提供方路由与硬上限照实际。减少替换不保证缓存／省费。

空闲预处理默认关，启用等待 90 秒。正常／手动／已开始任务各有边界，失败或窗口耗尽不凭空续接、不静默丢原文。

## 发行与公开文件

完整 DSH 前缀加 `omd.主版本.功能版本.补丁版本`，包/tag/清单/文档一致；功能增加功能位补丁归零，修复增加补丁位。

发布查 Git 文件、历史、tag、安装包和许可。内部计划／代理记录／原始研究验收／真实会话／凭据／日志／运行产物留本地；维护源码、合成夹具、测试、用户文档按用途保留。历史说明不证明新包验收。

问题反馈实际版本和脱敏错误。[作者来源许可](../THIRD_PARTY_NOTICES.md)。
