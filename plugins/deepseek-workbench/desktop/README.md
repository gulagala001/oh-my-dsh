# DeepSeek Workbench 桌面宿主适配

[English](README_EN.md) · [兼容与能力说明](../docs/desktop-host.md)

适配 **DSH 0.2.1-rc.2**、Cordis **4.0.5**、Schemastery **3.18.5**。该源码适配可直接用于干净的官方 DSH rc.2 源码，不要求安装其他插件。

标准宿主已有隔离 webview 和页面读取接口。本适配增加 DeepSeek 专用的持久登录 profile、经过来源与重定向校验的下载、官网资源策略、API Keys 平台页和能力声明。普通侧栏网页继续使用原来的分区及下载策略。

## 从源码构建

1. 获取并解压 [DSH rc.2 固定源码](https://github.com/deepseek-ai/deepseek-harness/tree/687f282e8625c6b8d11ff58211a90524be2e4317)，使用自己拥有的独立副本。不要指定已安装应用或共享源码缓存。
2. 从本插件目录应用适配：

   ```bash
   node desktop/apply-host.mjs /absolute/owned/dsh-source
   ```

3. 在 DSH 源码目录按其冻结锁文件安装依赖。rc.2 对应 pnpm `11.28.5`、TypeScript `6.0.3`、Electron `44.7.0`。遵循该源码版本的构建说明，重建受影响的 Host、Client、Web、桌面主进程和 preload，再按上游平台工作流打包／签名。
4. 在新构建宿主的实际 profile 中安装插件的固定 Release 包，见[安装指南](../README.md#安装)。

脚本会先检查版本及全部替换锚点，再写入变更；不匹配时停止。已适配源码再次执行会核对政策并返回。若源码已有其他浏览器能力，适配采用追加方式，保留识别到的异步释放事务；无法识别时拒绝应用。

## 最小开发检查

对于已应用适配的源码，提供安装了上述精确 TypeScript／Electron 及 Node 类型的工具链目录：

```bash
node desktop/check-host.mjs /absolute/patched-dsh-source /absolute/toolchain
```

此命令检查浏览器边界真实类型，以及所有改动 TypeScript 的语法；不会替代完整桌面构建、签名或平台实机验证。它不安装依赖，不启动或修改已安装 DSH。

宿主策略见 [deepseek-browser-policy.ts](deepseek-browser-policy.ts)，JavaScript 版本供插件检查复用。来源许可见 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。
