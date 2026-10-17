# 当前发行与安装 / Releases and installation

| DSH 完整版本 / Host | 插件版本 / Plugin | 固定入口 / Download |
| --- | --- | --- |
| `0.2.1-rc.1` | `0.2.1-rc.1.omd.0.17.4` | [下载 / Download](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.1.omd.0.17.4/trisoul_x-0.2.1-rc.1.omd.0.17.4.tgz) · [Release](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.1.omd.0.17.4) |
| `0.2.1-rc.2` | `0.2.1-rc.2.omd.0.17.4` | [下载 / Download](https://github.com/gulagala001/oh-my-dsh/releases/download/v0.2.1-rc.2.omd.0.17.4/trisoul_x-0.2.1-rc.2.omd.0.17.4.tgz) · [Release](https://github.com/gulagala001/oh-my-dsh/releases/tag/v0.2.1-rc.2.omd.0.17.4) |

使用与实际 DSH 完整版本一致的包，先备份原数据目录，使用原 profile 安装。Use the exact host-matched package and preserve your existing data/profile.

```sh
dsh --version
dsh plugin --profile desktop add file:/absolute/path/to/matching-package.tgz
```

桌面应用使用应用插件页或随应用附带的 CLI；Web 沿用原服务 CLI 与 profile。安装完成后自行完整重启相应实例。模型渠道和系统权限由用户配置。

OpenCU 完整内置浏览器、监看及批注需要对应的 Host、Client、preload 源码适配与构建；插件包不会自动替换宿主。两套发行的 `host-adapters.zip` 提供适配源码及步骤，不包含完整桌面安装器。Desktop browser/monitoring requires the matching source-built host adapters; no signed desktop installer is included.

构建步骤 / Build: [docs/development.md](../docs/development.md)。SHA256SUMS 随每个固定 Release 提供。旧版入口仅供历史版本使用。
