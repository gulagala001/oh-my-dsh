# OpenDesign 技能桥接

OMD 推荐的是 [omegapaopao/dsh-open-design](https://github.com/omegapaopao/dsh-open-design)
的 DSH 技能桥接版，固定提交
`a9d4f4c075d12f7825ee9e5a43f096af6b321055`，不是 OpenDesign 独立主应用。

适配包已在用户既有 OMD 仓库公开，推荐卡片复用原生安装管理器，按固定桥接tag与SHA下载发行资产，不把整仓codeload当作可安装子包，也不请求npm latest。
52 个技能由官方 filesystem provider 注册，模型通过原生 `skill` 工具读取
`open-design` router 及选中的模板；不会直接改写系统人格和审批策略。

## 可复现打包

只读下载固定源码归档后执行自有打包脚本，不执行上游 od-build 或安装脚本：

```sh
curl -L --fail "https://codeload.github.com/omegapaopao/dsh-open-design/tar.gz/a9d4f4c075d12f7825ee9e5a43f096af6b321055" -o /tmp/dsh-open-design-source.tar.gz
python3 scripts/package-open-design.py /tmp/dsh-open-design-source.tar.gz /tmp/open-design-output
```

脚本校验源码归档 SHA-256
`790c3428ce1d0083768d178fad1138b8f99e4db8bae776dd4fa1be4d4950cadd`，输出
`dsh-open-design-0.1.0-omd.1.0.0.tgz`、完整 package 目录和 manifest.json。
再次构建需使用新的输出目录；同一 Python/zlib 环境下，归一化归档时间、权限、
顺序后字节一致。脚本不修改原源码，不增加运行依赖或安装生命周期脚本。

适配保留上游根 LICENSE、NOTICE、README（UPSTREAM_README.md）、PROVENANCE.md
与全部 15 份技能组件许可证。所有模板资源和 51 个上游技能保持原样；原创
router 仅将检查器引用改为按技能 base directory 解析 `../../tools/od-check.mjs`。
检查器也原样打入 tools/，不依赖项目 cwd。包名继续使用 dsh-open-design，
确保原 Cordis 安装身份解析有效。版本为独立适配版，不冒充上游正式发行。

## 使用与边界

安装前按宿主第三方代码审批流程取得授权，优先使用独立 DSH_HOME/profile。
手动安装本地 tgz 的命令见包内 README。启停和卸载使用宿主原生插件管理。
本插件额外注册 open-design provider，关闭时撤回自身技能；同名技能遵循
宿主层级和 rank：同层项目/用户技能优先于 bundled，近层 agent preset 技能
会覆盖全局同名技能。不会把同名已有技能文件删除或改写。

上游 README 的“使用时无网络”不适用于所有技能；web-clone、brand-extract
等包含网络或浏览器脚本，执行时仍须遵循实际技能说明、宿主权限和用户授权。
不运行主应用的 od agent setup，不新增外部应用执行框架，不要求模型账号。
检查器通过只能说明对应文本检查通过，不替代浏览器或真实模型效果验收。

## 已发布安装入口

一键安装入口：设置 → 推荐插件 → 搜索 OpenDesign → 安装。默认不安装。
发行包由用户已有 `gulagala001/oh-my-dsh` 仓库托管：
https://github.com/gulagala001/oh-my-dsh/releases/tag/opendesign-v0.1.0-omd.1.0.0

推荐入口固定这个桥接tag和包版本，下载前按上述SHA校验，不把OMD主插件latest版本误当成桥接升级。安装后按宿主提示重启。许可与固定上游不变；不向无权限的上游发布，也不把适配资产称作上游官方发行。
