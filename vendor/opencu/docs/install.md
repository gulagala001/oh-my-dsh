# OpenCU 安装与升级

[English](install_EN.md) · [返回首页](../README.md)

**已经安装 OMD？不用再装 OpenCU。** OMD 已内置；请使用 [OMD 安装与升级指南](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md)。

独立安装 OpenCU，可以选择下面任意一种方式。**还没有 DSH 时，先按 [DSH 官方说明](https://github.com/deepseek-ai/deepseek-harness) 安装 DSH**，再按实际完整版本选择插件包。OpenCU 本身不是 DSH 安装器。

## 方式一：整段复制给 AI

把下面整段发送给能够操作你电脑的 AI：

```text
请帮我在现有 DSH 中安装或升级独立 OpenCU。

先阅读项目安装指南和更新日志（含各版本固定包地址）：
https://github.com/gulagala001/opencu/blob/main/docs/install.md
https://github.com/gulagala001/opencu/blob/main/CHANGELOG.md

自动核对我要使用的桌面或 Web 实例、DSH 完整版本、实际 profile、DSH_HOME 和已有插件。若已安装 OMD，不要重复安装 OpenCU，转按 OMD 官方安装指南处理：
https://github.com/gulagala001/oh-my-dsh/blob/main/docs/install.md

若没有 DSH，先说明需要安装 DSH，并按其官方安装说明处理；再根据实际安装版本选包。只安装发行清单中已经发布、与实际 DSH 完整版本精确匹配的固定 .tgz。0.2.1-rc.1、0.2.1-rc.3 和 0.2.0-rc.* 不可混用；没有匹配包就停止并说明，不用 main 源码、latest 或改包名代替正式发行。

若有正在运行的任务，先告知我，不强行中断。先备份相关配置和数据。沿用原 profile、DSH_HOME 和 OpenCU 数据目录，保留会话、模型配置、浏览器配对及第三方插件，不重建或清空配置。不擅自修改 Host/Client/preload、跨版本安装或降级 DSH；需要宿主适配才能使用的功能，请说明限制。

允许完成匹配插件的安装或升级，并重启受影响的 DSH 实例；不要重启其他实例。完成后做简短确认：插件已加载、电脑与浏览器设置能打开、原数据和第三方插件仍在。报告 DSH/OpenCU 版本、使用的固定包、重启的实例及仍需我授予的系统权限，不跑大规模测试。
```

## 方式二：在 DSH 插件界面安装

1. 打开要使用的 DSH 桌面应用或 Web 界面，在“关于”中查看**完整版本**。
2. 打开 **插件 → 右上角「+ 添加插件」**。
3. 将下方对应版本的完整 URL，粘贴到可输入“包名 / GitHub 仓库地址 / 本地路径”的输入框，点击 **安装**。桌面与 Web 使用相同的版本对应包；在各自要使用的实例中安装。
4. 等待安装成功，桌面完整退出再打开；Web 重启对应 DSH 服务后重新打开页面。仅刷新网页不等于重启服务。打开 **设置 → 电脑与浏览器**，按提示准备浏览器资源、系统权限和所需的 Chrome／Edge 扩展配对。

**DSH `0.2.1-rc.3`，复制这一整行：**

```text
https://github.com/gulagala001/opencu/releases/download/v2.2.3-dsh.0.2.1-rc.3/opencu-2.2.3-dsh.0.2.1-rc.3.tgz
```

**DSH `0.2.1-rc.1`，复制这一整行：**

```text
https://github.com/gulagala001/opencu/releases/download/v2.1.0-dsh.0.2.1-rc.1/opencu-2.1.0-dsh.0.2.1-rc.1.tgz
```

`0.2.1-rc.3` 与 `0.2.0-rc.2` 不是同一版本。其他宿主版本没有列在这里时，不要混用这些包。

## 功能与升级边界

- 两个固定 Release 提供插件和 `host-adapters.zip` 源码材料，**没有完整桌面安装器**。完整内置浏览器、原生监看及相关界面需要匹配的 Host、Client、preload 源码适配和构建；只装插件不会自动补齐宿主。需要源码适配时，由构建者参考[开发文档](../DEVELOPMENT.md#构建和本地插件包)。
- Web 的能力取决于服务所在机器、后端和授权，不会直接获得访问网页的那台电脑的控制权。
- 升级先备份，沿用原 profile、`DSH_HOME` 和数据目录，保留第三方插件；安装匹配包后重启受影响实例。不要为升级新建或重置配置。
- 下载的完成、失败和取消结果保留，旧进度不会覆盖结果。重启后尚未被桌面确认仍在运行的下载暂不可操作，收到实时状态后恢复；不会自动重新下载。已完成文件丢失时保留历史并显示文件不可用，其他下载继续同步；清理历史不删除文件。暂停／继续的精确事件顺序需要同时更新对应宿主适配。
- **主干源码更新不等于固定 Release 已更新。** 上述 URL 不会自动包含后来合入的修复；公开包和校验文件以[更新日志](../CHANGELOG.md)列出的 Release 附件为准。

<details>
<summary>CLI 补充（供 AI 或习惯命令行的用户参考）</summary>

使用目标 DSH 自带或启动原 Web 服务的同一套 CLI，保持原 `DSH_HOME`。先运行 `dsh --version` 确认完整版本。以下为标准 `desktop`／`web` profile；自定义 profile 使用原名称。不要用另一个全局 CLI 或 `--from-default-profile` 重建配置。

DSH `0.2.1-rc.3` 桌面：

```sh
dsh plugin --profile desktop add 'https://github.com/gulagala001/opencu/releases/download/v2.2.3-dsh.0.2.1-rc.3/opencu-2.2.3-dsh.0.2.1-rc.3.tgz'
```

DSH `0.2.1-rc.3` Web：

```sh
dsh plugin --profile web add 'https://github.com/gulagala001/opencu/releases/download/v2.2.3-dsh.0.2.1-rc.3/opencu-2.2.3-dsh.0.2.1-rc.3.tgz'
```

DSH `0.2.1-rc.1` 桌面：

```sh
dsh plugin --profile desktop add 'https://github.com/gulagala001/opencu/releases/download/v2.1.0-dsh.0.2.1-rc.1/opencu-2.1.0-dsh.0.2.1-rc.1.tgz'
```

DSH `0.2.1-rc.1` Web：

```sh
dsh plugin --profile web add 'https://github.com/gulagala001/opencu/releases/download/v2.1.0-dsh.0.2.1-rc.1/opencu-2.1.0-dsh.0.2.1-rc.1.tgz'
```

安装完成后按上文重启相应实例，保留原启动方式和环境。CLI 运行需要 Node.js ≥22.19；桌面应用使用其附带运行时。

</details>
