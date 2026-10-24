# DSH Rewind — 安装与维护

源码构建以 `package.json` 的完整宿主版本为准，当前默认 `0.2.1-rc.3`；SDK、组件与依赖锁必须来自同一版本。

[English](install_EN.md) · [返回首页](../README.md#readme-install)

**DSH 0.2.1-rc.3 · Node.js ≥22.19 · 0.1.0**

文件恢复仅覆盖实际保留的检查点。旧消息可能只能回退对话；恢复前核对外部改动。正在生成时双击 Esc 仍执行宿主停止操作。

## 安装到当前实例

在实际使用的实例打开 **插件 → ＋ 添加插件**，粘贴固定发行地址：

```text
https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.4-dsh.0.2.1-rc.3/gulagala001-dsh-undo-plugin-0.1.4-dsh.0.2.1-rc.3.tgz
```

等当前任务结束后按宿主提示启用或重启，沿用原 profile、DSH_HOME、模型配置和会话。

下载后可核对同一发行版的 [SHA256SUMS](https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.4-dsh.0.2.1-rc.3/SHA256SUMS).

### 首次成功检查

在一个用于尝试的空闲会话里输入 `/rewind`，或连续按两次 **Esc**。

输入框上方出现可回退消息列表；选择一项后先显示影响范围与确认框，不会立即恢复文件。

<details>
<summary>命令行安装</summary>

使用同一 DSH 实例对应的 CLI，将 `web` 换成实际 profile。

```bash
dsh plugin --profile web add "https://github.com/gulagala001/dsh-undo-plugin/releases/download/v0.1.4-dsh.0.2.1-rc.3/gulagala001-dsh-undo-plugin-0.1.4-dsh.0.2.1-rc.3.tgz"
```

</details>

## 升级、回退与卸载

先备份现有 profile 与相关数据，再安装匹配宿主的固定版本；不为安装插件自动替换或降级 DSH。更新失败保留原数据和第一处错误。回退时选择此前匹配包并核对对应数据说明；只恢复代码不等于撤销数据变更。

在当前实例插件页移除，或使用：

```bash
dsh plugin --profile web remove @gulagala001/dsh-undo-plugin
```

卸载保留 `DSH_HOME/rewind-plus/v1` 中的备份。若仍需撤销此前回退，请先完成恢复；恢复期间不手动删除备份目录。

移除后重启同一实例。反馈提供完整版本、profile 类型和脱敏后的第一处错误。
