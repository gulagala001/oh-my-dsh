# OpenCU 1.1.1

适配 **DSH 0.1.7-alpha.2 Web**。

- 融合原生过程滚动跟随与历史定位改进，保留 Computer Use 分类、完成汇总及展开阅读状态。
- 同步新版宿主依赖和原生聊天快照，保留浏览器、桌面控制、预览、批注与接管能力。
- 与 Oh My DSH 1.7.1 共用同一实现；OMD 已内置本版，无需重复安装。

等待任务结束，停止旧服务并备份实际 DSH_HOME，升级宿主至 0.1.7-alpha.2 后安装：

```sh
npx --yes @deepseek-ai/dsh@0.1.7-alpha.2 plugin --profile web add github:gulagala001/opencu#v1.1.1
npx --yes @deepseek-ai/dsh@0.1.7-alpha.2 --profile web
```

沿用原数据目录、profile、端口和启动参数。源码、安装包及 SHA-256 校验文件见本版本附件。
