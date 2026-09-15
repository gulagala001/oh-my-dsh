# TriSoulX / CC / DSH 0.1.6 迁移源码

本目录包含完整迁移实现、87 个 Markdown 提示词模块、34 项工具绑定、状态头精确替换规则与测试。入口位于仓库的 `scripts/migrate-dsh016.mjs`，默认读取本目录；不再依赖聊天 ZIP。

当前仍为 **0.4.0-candidate**。代码完整推送不等于实际安装、所有提示词已经加载，或运行环境已部署。

## 文件

- `cc-prompt-adapter.mjs`：主 Agent 组装拦截与当前 PTC SDK 重建。
- `migrate.mjs`：版本检查、源文件迁移、可选依赖安装及校验回滚。
- `bindings.json`：真实工具名、候选文本文件、基线描述和保留原生策略。
- `migration.json`：固定的源版本、DSH 版本和未部署状态。
- `state-wrapper-replacement.json`：仅主 Agent 状态回注头的单句补丁。
- `prompts/`：主核心、工具、CU、运行模板、回注与可选能力说明；不是全部常驻。
- `coverage.json`：每个条目的实际接入状态。参考稿、原生保留项不能算已接线。
- `tests/`：纯组装、源码修改、回滚与数据保护的离线测试。
- `source-manifest.json`：已交付迁移实现和提示词的 Git blob 校验值。
- `verify-source.mjs`：对上述源码清单进行完整性检查。

生成的旧版长篇 HTML 对照、冗余历史 JSON 和浏览器预览属于此前交付的审阅资料，不是此迁移程序的执行依赖；本目录提交可直接运行的完整源码，不要求从那些报告提取任何代码。

## 用法

从本分支仓库根目录运行：

```sh
node migrations/dsh016/verify-source.mjs
node --test migrations/dsh016/tests/*.test.mjs
git worktree add --detach ../oh-my-dsh-dsh016-target c79dd01fc34704b2ca66b511f1ab80b2b938c3db
node scripts/migrate-dsh016.mjs --project ../oh-my-dsh-dsh016-target
```

默认只预览，不修改目标。确认后：

```sh
node scripts/migrate-dsh016.mjs --project ../oh-my-dsh-dsh016-target --apply --install
```

`--install` 需要 Node >=22.19 和项目指定的 pnpm；它安装新版依赖、重新生成锁文件并运行构建和项目测试。此步骤尚未在用户宿主执行。目标必须是固定基线的干净 checkout；本工具分支不是迁移目标。此约束防止把未知上游变更或用户未提交工作覆盖掉。

回滚：

```sh
node scripts/migrate-dsh016.mjs --project ../oh-my-dsh-dsh016-target --rollback --apply
```

回滚前逐一验证当前文件及备份校验值；发现迁移后的新改动就拒绝。仅恢复本次拥有的源码及记录过的锁文件，不恢复 node_modules，不重启服务。

## 不变边界

CC 基线仍固定在 `8eb1be156b850d09c2bd05df7ea32b0f06c9887d` 的 `Anthropic/claude-code/claude-code-opus-5.md`。DSH 目标固定为预发布 `0.1.6-alpha.1`；插件源基线固定为 `c79dd01fc34704b2ca66b511f1ab80b2b938c3db`。

后台内部系统提示词、记忆与状态数据、工具接口、权限及已配置模型不因提示词迁移被改写。DSH 新增但尚未验证的接口保留原生描述。`run_code` 的新期限、权限和进程规则由实际运行时生成；不以旧稿替换。CU 底层文档仍按原分段锚点使用，不强行替换为其他浏览器/桌面后端。

实际安装后仍需导出一轮真实请求，核对系统段、工具描述、PTC SDK、动态回注和原生保留项，才能判断接入覆盖率。
