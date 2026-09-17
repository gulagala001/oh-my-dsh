# DSH 0.1.6-alpha.2 上游补丁

这些补丁用于官方源码仓库，不会在安装 OMD 时自动修改全局 DSH 或用户项目。

## 打包输出路径

`dsh-alpha2-release-output.patch` 针对官方标签 `dsh-v0.1.6-alpha.2`（`ddefc45fbc7f8e46dd73185e68295696d1297887`）。官方 `scripts/release/pack.ts` 会清空输出目录；显式空 `--out` 或指向源码根目录的路径可能把仓库作为输出目录清空。补丁在删除前拒绝空值、源码根目录、其祖先与对应符号链接别名，正常打包输出行为不变。

在干净的官方源码 checkout 中检查并应用：

```sh
git apply --check /path/to/dsh-alpha2-release-output.patch
git apply /path/to/dsh-alpha2-release-output.patch
node --test scripts/release/output-directory.test.mjs
```

测试只在临时目录检查路径和哨兵文件，不执行对真实项目的删除。

## 工具调度兼容

OMD 的 `src/tool-scheduler-compat.mjs` 处理同版本 `dsh-tools` 被重复加载后调度器 Symbol 不一致的情况：复用现有调度器，不重跑工具、不修改工具参数，不吞掉执行错误。正常的单模块安装不会被改写；歧义状态会明确报错。

OMD 的启动脚本继续使用已构建的 DSH CLI，不采用源码与构建产物混用的启动方式。这不代表已经修复官方源码启动器的所有模块解析问题。

## 关于误删传闻

讨论 #6260 描述的是 DSH 0.1.5-rc.1 的 Linux 挂载清理事故。本次核对的 alpha.2 源码及安装依赖中未找到该报告所指的两个挂载脚本，未将它视为当前所有平台都存在的已确认故障，也没有在真实工作目录复现删除。

上述打包脚本缺陷与正常会话的工具调用是不同路径。OMD 没有因此删减命令执行能力或更改既有审批、权限与记忆设计；具备写入权限的 Agent 仍可能执行破坏性命令，升级不能替代项目备份。

参考：官方讨论 #6967（源码启动的工具调度身份冲突）、#6260（旧版 Linux 挂载清理报告），以及 alpha.2 的 `scripts/release/pack.ts`。
