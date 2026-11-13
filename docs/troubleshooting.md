# 排障

[English](troubleshooting_EN.md) · [文档目录](README.md) · [首次使用](getting-started.md) · [升级](upgrade.md) · [报告问题](https://github.com/gulagala001/oh-my-dsh/issues/new?template=bug-report.yml)

先按症状找到对应的一行。记下第一次出错时的完整报错；反复重装或删数据只会让问题更难查。

## 先确认装对了地方

1. **版本**：**设置 → Oh My DSH → 关于** 里的"当前版本"才是正在运行的 OMD，"最新版本"只是线上记录。DSH 的版本另外看。当前 OMD 1.3.20 对应 DSH 0.2.2-rc.3。
2. **桌面版还是网页版**：桌面版装在 `desktop` profile，网页版装在启动命令用的 profile，两边的插件互不相通。
3. **数据目录**：网页版默认是用户目录下的 `.dsh`；用源码 `pnpm start` 启动时是仓库下的 `data/dsh/`，profile 为 `oh-my-dsh`，端口 3083。
4. **完整重启后试一次**：等任务跑完，桌面版完整退出再打开，网页版重启服务。新建会话选 Oh My DSH 发一条消息；升级的用户再打开一个旧会话看看。

<a id="package-source"></a>

### 核对安装来源

仓库是 `gulagala001/oh-my-dsh`，包名是 `oh-my-dsh`。请用[安装指南](install.md#gui)里的固定安装包。安装日志里的包名、仓库或 DSH 版本对不上时，先停下核对，别对着错的目标反复更新。

<a id="按症状处理"></a>
<a id="by-symptom"></a>

## 按症状处理

| 现象 | 怎么办 |
| --- | --- |
| 找不到 `pnpm`，或 Node 版本不够 | 网页版和源码需要 Node.js 24.9.0+ 和 pnpm。桌面版用自带的运行时，在应用里装插件即可，不要拿系统 Node 去替换 |
| 安装时提示不兼容 DSH | 记下 DSH 的实际版本，按[安装指南](install.md)换成对应的安装包。不要改成 `latest` 或绕过版本检查 |
| 提示构建脚本未批准 | 看[安装脚本被拦截](upgrade.md#build-approval) |
| 离线检查提示缺 `node_modules` 或清单损坏 | 普通源码包不带离线依赖。按下面的[离线安装](#offline)在同系统同架构的电脑上重新准备 |
| 装好了但看不到 OMD | 确认装进了当前 profile、已启用，并完整重启。新建会话选 Oh My DSH，旧会话保持原预设 |
| 更新了但"当前版本"没变 | 磁盘上的版本和正在运行的不一样。桌面版完整退出重开，网页版重启服务，只刷新页面不够 |
| 桌面版提示服务已更新、界面版本不一致 | 等任务跑完，点"重启应用与 Host"或完整退出重开 |
| 找不到原来的会话或模型配置 | 先核对 `DSH_HOME` 和 profile，见[从网页版换到桌面版](upgrade.md#web-to-desktop)。不要在空环境里重新配一遍来掩盖目录不对 |
| 旧会话显示"历史加载失败" | 见[旧会话加载失败](upgrade.md#legacy-history-failure)。不要删记录或手改事件序号 |
| 报错含 `plugin:oh-my-dsh/tool-optimization` 和 `not marked ignorable` | 升级到当前版本，完整重启后重新打开会话。OMD 会先把原日志备份到 `oh-my-dsh/session-record-repair/<会话 ID>/` 再修复；正在被写入或无法识别的日志保持原样并说明原因 |
| 全局背景提示被其他窗口改过 | 点 **读取最新版本** 对比后再保存，读取不会覆盖你的草稿 |
| 第三方功能安装报错或卡住 | 记下具体报错，刷新后看实际状态，不要连续重复安装 |
| Fast 不显示或保存失败 | 确认装了 Subscription Login、所选模型支持 Fast |
| Dream 某个范围失败，其他范围有结果 | 已完成的部分会保留。修好原因后点重试，会接着做没完成的范围。不要清空数据库重来。见 [Dream](dream-memory.md) |
| 聊天没出现在共享的 Dream 项目里 | 没加工作区的聊天，自动建的文件夹不算项目，本来就不共享。加入真实工作区后才共享 |
| 全局 Dream 没整理某个文件夹 | 检查全局整理选的文件夹，空选表示全部。排除一个文件夹不会删掉已有记忆 |
| 监控里出现 `≥`、`—` 或趋势是空的 | `≥` 表示已知的最低值，`—` 表示服务商没报。见[监控统计](monitoring.md) |
| 相对路径落到了别的目录 | 工具、CodeGraph 和 Workflow 都跟随当前执行目录，先核对这个目录 |
| DeepSeek 入口在但网页打不开或导入不了 | 标准桌面版不支持内嵌网页，按提示用外部浏览器打开。见 [DeepSeek Workbench](deepseek-workbench.md) |
| 电脑操作的某个组件报错 | 在 **设置 → Oh My DSH → 基础组件** 看这个组件的报错，按提示准备。一个组件失败不影响其他功能。见[电脑与浏览器](computer-use.md) |

## 启动失败、白屏或一直 `waiting for service`

"等待服务"通常是后果，不是原因。往前找第一条 `failed to import` 或启动报错，记下错误类型、`cause`、包路径和堆栈。

- **桌面版**：错误弹窗里有 `Diagnostic report` 路径，保留这份日志。弹窗如果提供"禁用第三方插件后重启"，可以用它确认是不是插件引起的，但它不修复依赖，别反复点。
- **网页版**：保留启动终端里的第一条错误。能打开插件页的话，先停用出问题的插件，再重启试原生会话。
- **源码版**：确认源码、SDK 和构建产物属于同一个 DSH 版本。用单独的 profile、数据目录和端口测试，不要动日常环境。

停用插件后恢复正常，只能说明和这个插件有关，还要靠完整报错定位。不要删掉整个 `.dsh`，也不要把别的电脑的 `node_modules` 拷过来。需要重建时先[完整备份](upgrade.md#2-停止并完整备份)。

<a id="native-dependencies"></a>

### 缺 `sharp` 等原生依赖，或 Windows 报 `EPERM`

增强功能加载失败时，OMD 仍会保留基础聊天，并在界面上显示第一条错误。撤回、电脑操作和 Workflow 各自独立加载，CodeGraph 和截图用的 `sharp` 到用时才加载。

1. 完整退出 DSH，备份 profile、数据和配置。Windows 上文件被占用时会报 `EPERM`，这时停止安装，保留第一条错误。
2. 用原来的插件页，重新安装和 DSH 版本匹配的 OMD 固定安装包。不要从别的版本或平台拼依赖。
3. 用和出问题的 DSH 相同系统、架构和 Node 版本，在实际安装目录运行（源码目录可以用 `pnpm runtime:check`）：

   ```sh
   node /path/to/profile/node_modules/oh-my-dsh/scripts/check-runtime.mjs
   ```

   它会逐个加载插件和延迟依赖，并用 `sharp` 生成一张 PNG，任何一项失败都会返回非零退出码和原始报错。桌面版要用应用自带的 Node 运行。
4. 通过后按原方式重启，试一下新旧会话和刚才失败的功能。还是不行就带上第一条报错、完整版本、系统和架构、profile 和依赖路径来反馈。

<a id="offline"></a>

## 离线安装

Release 里的 `.tgz` 只是插件本身，不带依赖。离线包不能跨系统或架构使用，比如 Windows x64 要在另一台 Windows x64 电脑上准备。不要直接压缩 `pnpm install` 后的目录，里面的链接在别的电脑上会失效。

在和目标电脑同系统、同架构的联网电脑上，准备 OMD 源码、Node.js 24.9.0+ 和 pnpm 11.28.5，在源码根目录运行。输出目录必须在源码目录外，而且还不存在：

```powershell
node scripts/prepare-host-sdk.mjs
pnpm install --frozen-lockfile
if ($LASTEXITCODE -ne 0) { throw '安装依赖失败' }
node scripts/prepare-offline.mjs 'C:\omd-offline'
if ($LASTEXITCODE -ne 0) { throw '离线准备失败' }
```

macOS／Linux 用 `node scripts/prepare-offline.mjs /绝对路径/omd-offline`。脚本只拿发行文件，重新装一份不含符号链接的依赖，构建后检查 OMD 入口、`sharp` 和 CodeGraph；不会带走你的配置、密钥和会话。检查不通过就不会产出目录。

1. 把整个输出目录（含 `node_modules`）压缩，拷到离线电脑，解压到固定位置，比如 `D:\omd-offline`。不要拆散文件，也不要覆盖 DSH 自己的 `node_modules`。
2. Windows 离线电脑在解压目录运行 `.\check-offline.cmd`，它用随包的运行时，不用另装 Node。其他系统用 `node scripts/check-offline.mjs`。
3. 桌面版在 **插件 → 安装 → 本地** 填 `link:D:\omd-offline`（换成实际路径）。**链接整个目录，不要装 `.tgz` 或 `file:` 包**。这个目录要一直留着，挪了位置就重新装。
4. 确认 DSH 版本和离线目录里 `offline-manifest.json` 的 `hostVersion` 一致，完整重启后试新会话和工具调用。网页版用原来的 `DSH_HOME` 和 profile，通过命令行添加 `link:/解压目录绝对路径`，必要时加 `--offline`。

模型服务仍然要能连上；浏览器、Python、.NET 和电脑操作等组件要另外准备。

## 反馈问题

用 [Bug 模板](https://github.com/gulagala001/oh-my-dsh/issues/new?template=bug-report.yml)，写清楚：

- 系统和架构，桌面版、网页版还是源码，DSH 和 OMD 版本。
- 安装来源和 profile 名；数据目录是否自定义（不用写出私人路径）。
- 最短的复现步骤、你期望的结果和实际结果，从哪个版本开始、是不是每次都出现。
- 第一条完整报错和相关日志，必要时附截图，以及你已经试过的办法。

提交前遮住 API Key、登录 token 和私人对话。不要上传整个数据目录或 `.credentials.yaml`。不知道的写"未知"。
