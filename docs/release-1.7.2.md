# Oh My DSH 1.7.2

适配 **DSH 0.1.7-rc.1**，内置 **OpenCU 1.1.2**。

- 融合简洁、标准、详细、完全展开四档工作步骤，以及工具准备、执行和结果的连续展示。
- 旧简洁／详细映射为标准，旧完全展开映射为详细；只迁移已有配置一次，保留升级后的主动选择。
- 保留上下文管线、任务与验证、BT、预算、PTC、电脑操作、操作计数、失败／停止提示和展开阅读状态。
- 正文图片支持大图查看，图片文件链接支持悬停预览；保留截图缩放、拖动与下载。
- 修正四套主题收起侧栏的导航图标对齐；推荐插件显示具体的宿主版本不兼容原因。
- 接入宿主的 LibreOffice Kit、PDF／表格预览及其他原生改进。

## 安装与升级

等待当前任务结束，停止旧服务并完整备份实际 `DSH_HOME`。沿用原数据目录、profile 和端口：

```sh
npx --yes @deepseek-ai/dsh@0.1.7-rc.1 plugin --profile web add github:gulagala001/oh-my-dsh#v1.7.2
npx --yes @deepseek-ai/dsh@0.1.7-rc.1 --profile web
```

自定义 profile 替换 `web`。旧 DSH 0.1.7-alpha.2 请保留 OMD 1.7.1；RC 会检查插件声明的宿主版本。会话仍为 V4，从 alpha.2 升级无需重新迁移日志。

[手动安装](usage.md#安装到现有-dsh推荐) · [AI 安装与升级](upgrade.md)

<a id="验证范围"></a>
