# REA 开发调查

[文档目录](README.md) · [参与改进](../CONTRIBUTING.md) · [插件兼容性](plugin-compatibility.md)

REA **6.1.0** 用于需要发行工件或运行证据的开发调查：核对 DSH／OMD／OMAA 及相关插件的实际包、Electron ASAR、源码与 bundle 差异，或追踪已有源码无法确认的具体运行行为。完整源码的常规架构、符号和调用关系调查先用 `rg` 与 [CodeGraph](usage.md#codegraph)。按问题选择工具，无需每次运行 REA、doctor 或 setup。

REA 是开发助手，不加入 OMD 的运行依赖，不成为每次修改或发行的额外强制门禁。使用 CLI 不需要注册 MCP；不自动修改用户配置或安装原生分析引擎。已有 MCP 可直接使用其实际工具与 schema；缺少工具时可继续用 CLI。原生分析需要对应引擎，具体运行采集还需要目标、动作和宿主条件，按本次调查范围准备。

## 保存调查证据

从仓库根目录执行以下示例，将绝对目标路径和字符串替换为本次调查对象。输出统一存入已忽略的 `work/rea-upgrade/`，用不同调查目录保留各次结果；不提交原始工件、用户数据或密钥。

```sh
mkdir -p work/rea-upgrade/investigation
npx --yes rea-agents@6.1.0 --version \
  > work/rea-upgrade/investigation/rea-version.txt \
  2> work/rea-upgrade/investigation/version.stderr.log
npx --yes rea-agents@6.1.0 analyze-javascript-application /absolute/path/to/app.asar --json \
  > work/rea-upgrade/investigation/application.json \
  2> work/rea-upgrade/investigation/analyze.stderr.log
```

目标也可以是解包后的 JavaScript 应用目录。保留返回的完整 Evidence、图、限制和 unknowns；记录每条命令及退出状态。另在该调查目录保存 `identity.md`，写明工件下载或构建来源、完整宿主／OMD／插件版本、源码 commit、目标绝对路径、工件 SHA-256 和分析时间。目录目标保留 Evidence 中的工件摘要及输入清单；单文件可用 Node 计算 SHA-256：

```sh
node --input-type=module -e '
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
const path = process.argv[1];
const hash = createHash("sha256");
for await (const chunk of createReadStream(path)) hash.update(chunk);
console.log(hash.digest("hex"), path);
' /absolute/path/to/app.asar > work/rea-upgrade/investigation/artifact.sha256
```

本流程固定 npm 包 `rea-agents@6.1.0`，其发布来源 `gitHead` 为 `ae9aaee16b9c738d761d3938a3b34fdf37e581b5`。工具升级时重新核对版本、来源和实际 schema，不直接套用上游 main 或新版 Skill 的命令。REA 上游的 [CLI 与 Evidence](https://github.com/morluto/rea/blob/ae9aaee16b9c738d761d3938a3b34fdf37e581b5/docs/cli.md)及 [JavaScript 工作流](https://github.com/morluto/rea/blob/ae9aaee16b9c738d761d3938a3b34fdf37e581b5/docs/javascript-application-workflows.md)解释对应契约。

## 追踪功能与比较版本

先分析一次，再针对具体问题复用结果。例如追踪一个字符串的关系：

```sh
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const root = "work/rea-upgrade/investigation/";
const application = JSON.parse(readFileSync(root + "application.json", "utf8"));
writeFileSync(root + "trace-input.json", JSON.stringify({
  application, seed: { kind: "string", value: "search-result" }, direction: "both"
}));'
npx --yes rea-agents@6.1.0 trace-application-feature work/rea-upgrade/investigation/trace-input.json --json \
  > work/rea-upgrade/investigation/trace.json \
  2> work/rea-upgrade/investigation/trace.stderr.log
```

比较两版时，分别分析对应工件并保存完整结果为 `left.json`、`right.json`，同时分别记录来源、版本和摘要，再构造比较输入：

```sh
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const root = "work/rea-upgrade/investigation/";
const read = name => JSON.parse(readFileSync(root + name, "utf8"));
writeFileSync(root + "compare-input.json", JSON.stringify({
  left: read("left.json"), right: read("right.json")
}));'
npx --yes rea-agents@6.1.0 compare-application-versions work/rea-upgrade/investigation/compare-input.json --json \
  > work/rea-upgrade/investigation/compare.json \
  2> work/rea-upgrade/investigation/compare.stderr.log
```

每个 CLI 是独立进程，跨命令必须传完整 Evidence，不能只传 Evidence ID。同一 MCP 连接仅在服务实际声明支持 retained references 时可复用其返回 ID；跨连接仍需导出或携带完整记录。源码与 bundle 对照使用 `import-reference-source` 和 `compare-source-to-bundle`，按固定版本 schema 传入历史源码图与应用 Evidence；路径相似或静态映射不能证明语义相同。

## 用结果推进修复与验收

报告结论时分别说明直接观察、静态推断与未知项，关联 Evidence ID 和保存的完整记录。关系可达不代表执行过，缺少关系不证明行为不存在，覆盖不完整时不能将缺失直接判为已删除。

静态分析与 trace／compare 不执行应用代码。需要运行行为时，针对准确工件与环境选择 REA 的 browser、Electron 或 process 采集；记录实际执行的目标、动作、结果和限制，不把另一版本或另一环境的观察外推为已验证。隔离数据及测试配置继续遵循[参与改进](../CONTRIBUTING.md)。

CLI 退出 `0` 只说明操作完成，结果仍可能包含部分覆盖、警告或未知项，不等于 OMD 产品验收 PASS。发现缺陷后仍须复现、修复并运行与风险相称的回归；宿主及插件生态兼容性继续检查原版对照、代表插件、加载顺序、启停、重启和卸载。会话与前端改动沿用既有模拟器与真实 Web 验证，最终明确报告实际通过、未验证和失败范围。

原生 provider 显示可用也不代表实际执行成功。若 macOS 调用在启动目标分析程序之前失败，保留 runner/helper 的原始诊断并核对本机工具链；本次 6.1.0 调查遇到 Swift helper 与 SDK 编译不匹配。直接使用系统 `file`、`otool` 等得到的静态信息可作为独立证据，但不能写成 REA 原生采集成功或目标运行通过。未取得执行证据时明确保留该边界。
