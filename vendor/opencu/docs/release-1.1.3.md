# OpenCU 1.1.3

适配 **DSH 0.1.7-rc.2**，与 Oh My DSH 1.7.3 集成。旧 rc.1 宿主继续使用 OpenCU 1.1.2。

- 同步新版 Chat 组件的动态工具更新、账号额度提示及桌面本地图片处理。
- 保留操作分组、实时动作、思考预览、展开状态、停止与恢复，以及现有浏览器和原生桌面后端。
- 本版没有修改 Computer Use 工具提示词、原生协议或权限默认值。

Web 使用原 profile 安装：

```sh
npx --yes @deepseek-ai/dsh@0.1.7-rc.2 plugin --profile web add github:gulagala001/opencu#v1.1.3
npx --yes @deepseek-ai/dsh@0.1.7-rc.2 --profile web
```

OMD 已内置同一发行快照，无需再安装 OpenCU。桌面集成验证以 OMD 1.7.3 的发布说明为准；此说明不将 Web 或 macOS 的通过结果外推为其他平台的原生桌面验收。
