# DeepSeek Workbench

DSH 桌面插件：在“新会话”下面打开主内容区的 DeepSeek 原生风格聊天，在设置账号页打开 API 开放平台，把网页历史一键导入 DSH 原生会话继续处理。OMD 当前源码默认内置此组件；现有公开安装包尚未包含它。

在网页聊天中打开要迁移的会话，点击“在 DSH 中继续”。插件读取当前历史、Markdown、代码和可获取的附件，创建原生历史会话并打开，使用 DSH 当前默认模型和模式。迁移不会自动发送消息，也不会修改官网原会话。无法识别的内容、未加载历史或无法获取的附件会显示迁移说明。成功取得的附件写入 DSH 原生附件存储，其他附件保留名称和链接。

聊天消息、输入框与功能按钮由插件按 DSH 风格呈现，官方网页作为后台传输和登录验证页面。API 开放平台优先使用 DSH 自带的账号视图，直接复用 DSH 已登录的 DeepSeek 账号，插件不接收账号凭据。网页聊天与 DSH 平台授权的现有接口不同，暂不能把 DSH 授权换成聊天网页登录；网页聊天仍需单独登录一次，之后由桌面 Chromium 保留并复用。持久登录和下载需要桌面宿主提供相应的浏览器能力；[`desktop/README.md`](desktop/README.md) 说明随包附带的宿主适配补丁。普通宿主可显示网页，但会提示不能跨重启保留登录及下载。Web 环境提供外部浏览器入口，无法在其中直接执行迁移。

当前源码默认精确匹配 DSH `0.2.1-rc.1`／Cordis `4.0.5`。新版 `desktop/apply-host.mjs` 在独立源码副本中叠加到当前 OpenCU 适配之上，保留异步释放事务、普通 guest 策略和原持久分区；适配 rc.2／alpha.3／rc.1，rc.1 使用 Electron `44.7.0` 类型检查。历史 alpha.2 固定补丁保留，不跨版本复用其工件。尚未公开发行。

## 本地构建和安装

以下命令仅供全部实现后的集中验证阶段使用。当前 alpha.2 源码在 OMD 仓库根运行 `node scripts/pack-deepseek-workbench.mjs --host-version 0.2.1-alpha.2 --cordis-version 4.0.5-alpha.1`，helper 先核对真实安装 SDK 与源码 peer 版本，再生成独立客户端并打包到全新 staging 目录；输出 JSON 给出准确归档路径。它不会通过修改 peer metadata 把 alpha.2 冒充 rc.2 构建。也可运行 `node scripts/build-deepseek-workbench.mjs` 生成客户端后，在本目录运行 `npm pack --ignore-scripts`。用 DSH 的原生插件管理入口安装生成的本地 `.tgz`，或在已授权的 Web profile 使用匹配宿主 CLI 的 `plugin --profile <profile> add file:/absolute/path/dsh-deepseek-workbench-0.1.0.tgz`。官方桌面的 `desktop` profile 由桌面自带的 CLI 或插件界面管理。

OMD 已内置时无需另装；同时安装独立包时复用同一个后端服务与界面入口。后端按 Cordis Host 与服务隔离域持有唯一服务 fiber，两份插件各持有 owner lease；先加载者卸载不再拆掉另一份的导入 API 或正在处理的 importer，最后一份卸载才撤回服务。前端 leader 卸载释放自己持有的 guest 并转交入口。卸载组件不删除已创建的原生会话、附件、导入记录和官方浏览器数据，原生会话仍由 DSH 管理。迁移记录位于实际 `DSH_HOME/deepseek-workbench/imports`，用于网络重试与重启后的去重。当前恢复组合的共装回归仍待集中执行。集中测试既包含真实宿主中的两份源码模块 lifecycle，也包含两个新归档的真实插件管理安装、停用、重启与卸载；整包用例需要 `OMD_UI_ARCHIVE` 和 `DSW_UI_ARCHIVE` 同时提供，缺少时会明确跳过，不能替代为共装成功证据。

网页聊天通过官网输入框发送、读取当前消息并呈现到主内容区；每次只触发一次官网发送，等待新消息或回复开始确认，不因输入框短暂未清空而误报。未确认或官网拒绝时保留本地输入，并提供“检查官网页面”；输入框沿用 Composer 主题标记，支持多行自动增高与超长内容滚动。插件没有把网页模型注册成 DSH Agent 的推理驱动。迁移后的续聊使用 DSH 自己配置的模型与凭据。网页登录与验证码由用户在官网完成；发送、上传与文件选择需要匹配的桌面桥接。

## 许可与上游

插件新增实现使用 MIT 许可。随包桌面补丁基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 MIT 许可源码；上游版权属于 DeepSeek AI。补丁应用后的宿主仍须保留原有许可证与版权声明。DeepSeek 的名称及标识属于其相应权利人。
