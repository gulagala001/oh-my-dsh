# OpenCU 1.1.2

适配 **DSH 0.1.7-rc.1 Web**，与 Oh My DSH 1.7.2 集成。

- 融合四档工作步骤、流式工具准备状态、本地图片大图和链接悬停预览。
- 保留操作计数、失败／停止提示、相邻思考合并、完整原文和用户展开的阅读状态。
- 旧简洁／详细设置一次性映射为标准，旧完全展开映射为详细，保持原来的实际显示效果。
- 浏览器、桌面控制、截图缩放、实时预览及停止／接管／恢复继续共用原有实现。

先停止 DSH 并备份实际数据目录，再使用原 profile 安装：

```sh
npx --yes @deepseek-ai/dsh@0.1.7-rc.1 plugin --profile web add github:gulagala001/opencu#v1.1.2
npx --yes @deepseek-ai/dsh@0.1.7-rc.1 --profile web
```

旧 DSH 0.1.7-alpha.2 请保留 OpenCU 1.1.1。内部标识和数据目录保持不变；与 OMD 共存时仍只挂载一套聊天界面和电脑运行时。

本地验证覆盖上游聊天／会话组件、设置迁移与中断恢复，以及 OMD 集成中的准备状态、思考、图片和插件启停。跨平台和 Windows 原生项目以本版提交的 CI 实际结果为准，不将 macOS 结果外推为 Windows 验收。
