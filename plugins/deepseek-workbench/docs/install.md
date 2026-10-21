# DeepSeek Workbench — 安装与维护

[English](install_EN.md) · [返回首页](../README.md#readme-install)

**DSH 0.2.1-rc.2 · Node.js ≥22.19 · 0.1.0**

内嵌网页聊天需要 DSH 桌面版；跨重启登录、官网下载与扩展平台页面需要匹配的桌面适配。Web 版提供外部网页入口。官网聊天账号与 API 平台授权分别管理。

## 安装到当前实例

在实际使用的实例打开 **插件 → ＋ 添加插件**，粘贴固定发行地址：

```text
https://github.com/gulagala001/dsh-deepseek-workbench/releases/download/v0.1.0-dsh.0.2.1-rc.2/dsh-deepseek-workbench-0.1.0-dsh.0.2.1-rc.2.tgz
```

等当前任务结束后按宿主提示启用或重启，沿用原 profile、DSH_HOME、模型配置和会话。

下载后可核对同一发行版的 [SHA256SUMS](https://github.com/gulagala001/dsh-deepseek-workbench/releases/download/v0.1.0-dsh.0.2.1-rc.2/SHA256SUMS).

### 首次成功检查

点击左侧栏的 **DeepSeek 网页聊天**，完成官网聊天登录，打开一条普通官网会话。

可查看官网历史；点击“在 DSH 中继续”后生成原生会话，由你决定是否发送下一条消息。

<details>
<summary>命令行安装</summary>

使用同一 DSH 实例对应的 CLI，将 `web` 换成实际 profile。

```bash
dsh plugin --profile web add "https://github.com/gulagala001/dsh-deepseek-workbench/releases/download/v0.1.0-dsh.0.2.1-rc.2/dsh-deepseek-workbench-0.1.0-dsh.0.2.1-rc.2.tgz"
```

</details>

## 升级、回退与卸载

先备份现有 profile 与相关数据，再安装匹配宿主的固定版本；不为安装插件自动替换或降级 DSH。更新失败保留原数据和第一处错误。回退时选择此前匹配包并核对对应数据说明；只恢复代码不等于撤销数据变更。

在当前实例插件页移除，或使用：

```bash
dsh plugin --profile web remove dsh-deepseek-workbench
```

卸载前关闭临时侧栏并确认官网清理成功。已迁移 DSH 会话、普通官网历史分别由原服务保留；官网登录数据由桌面宿主管理。

移除后重启同一实例。反馈提供完整版本、profile 类型和脱敏后的第一处错误。
