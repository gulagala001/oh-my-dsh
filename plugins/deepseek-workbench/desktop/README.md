# DeepSeek Workbench 桌面宿主适配

[English](README_EN.md) · [兼容与能力说明](../docs/desktop-host.md)

适配 **DSH 0.2.1-rc.2**、Cordis **4.0.5**、Schemastery **3.18.5** 的官方源码。

标准 DSH 已能内嵌网页和读取页面。这份适配再加上：DeepSeek 专用、跨重启保留的登录 profile，核对来源和重定向的下载，官网资源策略，API Keys 平台页，以及告诉插件这些能力已就绪的声明。其他侧栏网页的行为不变。

## 从源码构建

1. 获取并解压 [DSH rc.2 固定源码](https://github.com/deepseek-ai/deepseek-harness/tree/687f282e8625c6b8d11ff58211a90524be2e4317)，使用自己拥有的独立副本。不要指定已安装应用或共享源码缓存。
2. 从本插件目录应用适配：

   ```bash
   node desktop/apply-host.mjs /absolute/owned/dsh-source
   ```

3. 在 DSH 源码目录按其冻结锁文件安装依赖。rc.2 对应 pnpm `11.28.5`、TypeScript `6.0.3`、Electron `44.7.0`。遵循该源码版本的构建说明，重建受影响的 Host、Client、Web、桌面主进程和 preload，再按上游平台工作流打包／签名。
4. 在新构建宿主的实际 profile 中安装插件的固定 Release 包，见[安装指南](../docs/install.md)。

脚本先核对版本和所有要改的位置，全部匹配才写入，否则直接停止。对已经适配过的源码再运行一次，只做核对。源码里已有其他浏览器扩展时，适配以追加方式写入；认不出的改动会让脚本拒绝执行。

## 最小开发检查

对于已应用适配的源码，提供安装了上述精确 TypeScript／Electron 及 Node 类型的工具链目录：

```bash
node desktop/check-host.mjs /absolute/patched-dsh-source /absolute/toolchain
```

这条命令检查浏览器接口的类型和所有改过的 TypeScript 语法，不安装依赖，也不会启动或改动已安装的 DSH。正式发布仍要完整构建和签名。

宿主策略见 [deepseek-browser-policy.ts](deepseek-browser-policy.ts)。来源许可见 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。
