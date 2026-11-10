# OpenDesign 设计技能

[文档目录](README.md) · [插件兼容](plugin-compatibility.md)

OMD 推荐的是 [omegapaopao/dsh-open-design](https://github.com/omegapaopao/dsh-open-design) 的 DSH 技能版（固定提交 `a9d4f4c`），不是 OpenDesign 主应用。它带来 52 个设计技能、模板和设计系统，入口技能是 `open-design`。

## 安装

在 **设置 → 推荐插件** 搜 OpenDesign，点安装，按提示重启。默认不装。安装包放在 [OMD 的 Release](https://github.com/gulagala001/oh-my-dsh/releases/tag/opendesign-v0.1.0-omd.1.0.0) 里，安装前会核对 SHA-256，不会跟着 OMD 主插件的版本变。目前在 macOS 上测过。

安装第三方代码前按你的审批流程来，最好先在单独的 `DSH_HOME` 或 profile 里试。手动安装本地 tgz 的方法见包里的 README，启用、停用和卸载都在 DSH 插件页。

## 使用

模型通过 DSH 原生的 `skill` 工具读取 `open-design` 和选中的模板，不会改你的人格设置或审批策略。

- 关闭插件时，它注册的技能一起撤掉。
- 同名技能按 DSH 的规则排序：同层的项目或用户技能优先于插件自带的，近层的智能体预设技能会盖过全局同名技能。你已有的同名技能文件不会被删或改。
- 上游 README 说"使用时无网络"，但 web-clone、brand-extract 等技能会联网或开浏览器，按各技能的说明和你的权限执行。
- 不需要运行主应用的 `od agent setup`，也不需要模型账号。自带的检查器只做静态规则检查，页面效果可以在浏览器里预览。

## 打包

如果想自己从源码打包：

```sh
curl -L --fail "https://codeload.github.com/omegapaopao/dsh-open-design/tar.gz/a9d4f4c075d12f7825ee9e5a43f096af6b321055" -o /tmp/dsh-open-design-source.tar.gz
python3 scripts/package-open-design.py /tmp/dsh-open-design-source.tar.gz /tmp/open-design-output
```

脚本会核对源码包的 SHA-256（`790c3428ce1d0083768d178fad1138b8f99e4db8bae776dd4fa1be4d4950cadd`），输出 `dsh-open-design-0.1.0-omd.1.0.0.tgz`、完整的 package 目录和 manifest.json。每次要用新的输出目录；同样的 Python／zlib 环境下，产物逐字节一致。脚本不运行上游的构建或安装脚本，也不改源码。

## 来源与许可

保留上游的 LICENSE、NOTICE、README（改名为 UPSTREAM_README.md）、PROVENANCE.md 和全部 15 份技能组件许可。模板和 51 个上游技能原样保留；入口技能只把检查器路径改成相对技能目录的 `../../tools/od-check.mjs`，检查器原样放在 `tools/`。包名仍是 `dsh-open-design`。这是独立的适配版，不是上游官方发行。
