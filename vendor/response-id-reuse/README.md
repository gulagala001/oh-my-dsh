# DSH Response ID Reuse

[English](README_EN.md) · [更新日志](CHANGELOG.md)

[![GitHub downloads](https://img.shields.io/github/downloads/gulagala001/dsh-response-id-reuse/total?label=GitHub%20release%20downloads)](https://github.com/gulagala001/dsh-response-id-reuse/releases)

通用 Responses ID 续传插件。自动复用服务端保存的上下文，减少历史消息和图片的重复传输。

- 安装加载后自动开启，纯后端运行。
- 根据正常请求回执启用续传，无需配置渠道名单或发送探测消息。
- 主请求、后台请求和并发分支分别保持各自可用的续传历史。
- 临时未存储时，后续正常请求可自动重新建立续传。
- ID 失效时在当次完整请求中重建续传；历史变化时准确匹配可复用的前缀。
- 禁用或卸载后恢复原生行为。

## 安装

**DSH 0.2.1-rc.3** · Node 22.19+

在 **插件 → 添加插件** 中粘贴：

```text
https://github.com/gulagala001/dsh-response-id-reuse/releases/download/v0.1.2-dsh.0.2.1-rc.3/gulagala001-dsh-response-id-reuse-0.1.2-dsh.0.2.1-rc.3.tgz
```

[SHA256SUMS](https://github.com/gulagala001/dsh-response-id-reuse/releases/download/v0.1.2-dsh.0.2.1-rc.3/SHA256SUMS)

## 卸载

在 DSH 插件管理器中禁用或卸载即可。

[开发与贡献](CONTRIBUTING.md) · [文档维护](docs/documentation.md) · [MIT](LICENSE)
