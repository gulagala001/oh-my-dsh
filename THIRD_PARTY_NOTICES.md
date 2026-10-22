# 原作者与项目地址

本页集中列出原作者、原项目与第三方许可；各节保留固定版本、修改范围和许可证说明。完整的自有产品、可选集成、组件和锁定依赖见[项目、组件与致谢](docs/components.md)（[English](docs/components_EN.md)）。

上下文优化使用直接依赖：[@ast-grep/wasm](https://github.com/ast-grep/ast-grep) 0.51.0（MIT）、[web-tree-sitter](https://github.com/tree-sitter/tree-sitter) 0.26.0（MIT）、[@vscode/tree-sitter-wasm](https://github.com/microsoft/vscode-tree-sitter-wasm) 0.3.1（MIT，语法各自许可随包保留）、[@toon-format/toon](https://github.com/toon-format/toon) 4.4.0（MIT）、[@mozilla/readability](https://github.com/mozilla/readability) 0.6.0（Apache-2.0）和 [jsdom](https://github.com/jsdom/jsdom) 26.1.0（MIT）。依赖原件未修改；OMD 自有代码提供宿主适配、原文权限和结果视图。

| 功能或组件 | 原作者／来源组织 | 原项目 |
| --- | --- | --- |
| DSH 宿主与基础组件 | [DeepSeek](https://github.com/deepseek-ai) | [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) |
| `/btw` 旁聊 | [gulagala001](https://github.com/gulagala001) | [DSH BTW](https://github.com/gulagala001/dsh-btw) |
| 可选需求理解组件 | [啃轮胎的西狐（WestFox-AwA）](https://github.com/WestFox-AwA) | [dsh-prompt-optimizer](https://github.com/WestFox-AwA/dsh-prompt-optimizer) |
| 可选文件、文档与命令工具 · dsh-ops | [T-Auto](https://github.com/T-Auto) 与 dsh-ops 贡献者 | [dsh-ops](https://github.com/T-Auto/dsh-ops)；[兼容发行说明](docs/dsh-ops.md) |
| 提示词优化模板 | [linshenkx](https://github.com/linshenkx) | [prompt-optimizer](https://github.com/linshenkx/prompt-optimizer) |
| OpenDesign 技能桥接 | [omegapaopao](https://github.com/omegapaopao)；技能来源为 [nexu-io](https://github.com/nexu-io) 及各技能作者 | [dsh-open-design](https://github.com/omegapaopao/dsh-open-design)、[open-design](https://github.com/nexu-io/open-design)；[完整来源与许可](docs/open-design.md) |

# Models.dev API pricing data

`src/monitor-prices.json` contains the pricing-only projection of [models.dev](https://models.dev/api.json), retrieved on 2026-10-15 (230 providers, 8,414 priced model routes). `scripts/sync-monitor-prices.mjs` refreshes this bundled snapshot; the runtime retrieves the same public feed daily and keeps a separate local cache. Model names, per-million-token rates and context tiers are retained; matching, overrides and presentation are OMD additions. The snapshot records the source timestamp and SHA-256 of the full source response.

Source: https://github.com/sst/models.dev

MIT License

Copyright (c) 2025 models.dev

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

# Bundled DSH BTW

`vendor/btw` contains [gulagala001/dsh-btw](https://github.com/gulagala001/dsh-btw),
package `@gulagala001/dsh-btw`, under the MIT License. OMD loads the same server
and native popover client as the standalone product. The source commit, exact
host, package version and per-file hashes are recorded in [vendor/btw.json](vendor/btw.json).
Its [license](vendor/btw/LICENSE) accompanies the snapshot.

# Bundled Rewind

`vendor/rewind` contains the standalone `@gulagala001/dsh-undo-plugin` plugin. OMD loads
the same server and client entry points as the independent plugin. Package
identity, exact host and per-file SHA-256 hashes are recorded in
[vendor/rewind.json](vendor/rewind.json); its [license](vendor/rewind/LICENSE)
and [notices](vendor/rewind/THIRD_PARTY_NOTICES.md) accompany the snapshot.

# Optional recommendation: OMD Prompt Optimizer

“需求理解 · OMD UI 增强版” is an optional, separately installed derivative of
[dsh-prompt-optimizer](https://github.com/WestFox-AwA/dsh-prompt-optimizer) 0.7.4,
originally authored by **啃轮胎的西狐（WestFox-AwA）**. **gulagala001** maintains the
OMD adaptation. It is not an official upstream release. The separate plugin
preserves the upstream BSD-3-Clause license, attribution and source provenance;
its code is not bundled with Oh My DSH.

# dsh-ops compatibility distribution

The optional, separately installed `dsh-ops` compatibility distributions pin
[T-Auto's dsh-ops 0.4.1](https://github.com/T-Auto/dsh-ops/releases/tag/v0.4.1).
Copyright (c) 2026 T-Auto and the dsh-ops contributors. **gulagala001** maintains
the compatibility changes; these are not official upstream releases. Exact
package versions are `0.2.1-rc.1.ops.0.1.0` and `0.2.1-rc.2.ops.0.1.0`, for
their respective complete DSH host versions. The upstream archive is pinned to
SHA-256 `e8ae70fa1703004973f4a61d5afe6c163862dd1469e3e9f5d03c736f8da5a362`;
download links and per-release checksum files are in the
[installation guide](docs/dsh-ops_EN.md).

The compatibility distribution adjusts exact host/framework metadata, accepts
`run_code` together with the four host background controls for PTC detection,
and obtains scope helpers from the same Loader module used by the host tools.
Business tools continue through the SDK under host permissions and sandbox
policies. Native receipt checks use the pinned upstream version. The native
worker bytes and original provenance receipts are unchanged; packaging restores
only the executable bits for the two POSIX workers. Replacing official tools,
the optional browser panel and the TUI panel remain off by default.

The package preserves the upstream composite license **MIT AND Apache-2.0**,
its `LICENSE`, `NOTICE`, `licenses/` and `docs/PROVENANCE.md`. Its original MIT
grant covers dsh-ops-authored work. The retained FastCtx attribution and Apache
license notices remain included as required by the upstream distribution.
The optional Windows `@dsh-ops/bash-win32-x64@0.2.1` payload preserves the
Git for Windows/Git component licenses, including GPL-2.0, and original notices.
PowerShell remains host-managed and is not redistributed by this compatibility
package. No third-party work is relicensed.

# DSH

The Agent preset was originally adapted from DeepSeek Harness 0.1.5-alpha.1, commit `5dda764ed3aa172535a7967b06ff95d9cbfe536a`, and updated against 0.1.5-rc.1, commit `183f08e9c6dde7e36cd2318eaee70b0da08fb35e`.

The shared `todos` projection in `src/tasks.mjs` follows the state version and reducer behavior of `@deepseek-ai/dsh-tool-todo` 0.1.5-rc.1.

The whale contours in `src/client/brand.mjs` are adapted from the animated whale in DSH 0.1.5-rc.1 (`ui-conversation/HeroShell`). Generated copies appear in the web favicon, Chrome popup and README logo. The lighting and orbit effects are modifications for Oh My DSH.

Source: https://github.com/deepseek-ai/deepseek-harness

The component sources under [vendor/dsh](vendor/dsh/README.md) are pinned to the exact DeepSeek Harness version, official tag and commit recorded in [vendor/dsh.json](vendor/dsh.json), together with the included sources and artifacts. OMD retains the native Tools service and adds scoped tool presentation, optional background controls, workflow journaling, JSONL/context recovery, and a wait-aware Conversation composer. Derived factories are generated from matching sources.

The matching **public native Chat** implementation is retained separately under [vendor/dsh/ui-chat](vendor/dsh/ui-chat/README.md), with its complete upstream sources, upstream-built artifacts, DeepSeek MIT license, patch and [checksum manifest](vendor/dsh/ui-chat.json) pinned to the matching official host commit recorded in that manifest. It was recovered from the public DSH-component snapshot in the primary OMD source, not authored by or copied from OpenCU modules. The matching public Conversation component remains under [vendor/dsh/ui-conversation](vendor/dsh/ui-conversation/README.md). The rewritten [OpenCU bundle](vendor/opencu.json) no longer includes the old CU or its historical Chat snapshot. OMD mounts the matching public Chat independently of OpenCU. All upstream copyright and license notices remain in place.

MIT License

Copyright (c) 2026 DeepSeek

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

# Rewritten OpenCU

[OpenCU](vendor/opencu.json) is bundled from the rewritten plugin repository, replacing the old CU distribution. Its [notices](vendor/opencu/THIRD_PARTY_NOTICES.md) cover the original REA components, React runtime, browser and native dependencies. OMD and standalone OpenCU share the same core, tool registration and client presentation when co-installed. This distribution does not confer redistribution rights to proprietary REA assets or change any upstream license.

# Acorn

Acorn 8.18.0 parses workflow metadata without evaluating it and is bundled into the workflow host factories. Its copyright notice and MIT license are included in `vendor/licenses/acorn-LICENSE`.

Source: https://github.com/acornjs/acorn

# Playwright

Playwright 1.63.0 is used as a runtime dependency under the Apache License 2.0. Its license and notices are included in the installed Playwright package.

Source: https://github.com/microsoft/playwright
License: https://github.com/microsoft/playwright/blob/v1.63.0/LICENSE

# ws

ws 8.21.3 is used as a runtime dependency under the MIT License. Its license is included in the installed ws package.

Source: https://github.com/websockets/ws

# Google Material Expressive skin fonts and icons

The Google Material Expressive skin embeds subsets of Google Sans Flex, Google Sans Code, and Noto Sans SC under SIL Open Font License 1.1, and Material Symbols Rounded under Apache License 2.0. Sources, modification notes, character coverage, and the complete licenses accompany the font files in `src/client/skins/google-material-expressive/assets/`.

Sources: https://github.com/googlefonts/googlesans-flex, https://github.com/googlefonts/googlesans-code, https://github.com/google/fonts/tree/main/ofl/notosanssc, and https://github.com/google/material-design-icons

# Other bundled skin fonts

The Claude CLI skin embeds JetBrains Mono under SIL Open Font License 1.1. Its complete license is included in `docs/skin-font-licenses/` and alongside the source font files. Apple and other operating-system fonts are referenced through system font stacks and are not redistributed.

Source: https://github.com/JetBrains/JetBrainsMono

# sharp

sharp 0.35.5 is used for screenshot pixel normalization under the Apache License 2.0. Its license and the notices for its native dependencies are included in the installed packages.

Source: https://github.com/lovell/sharp

# CodeGraph

@colbymchenry/codegraph 1.6.0 and its matching platform runtime are runtime dependencies under the MIT License. Oh My DSH launches the unmodified upstream bundled runtime and discovers its MCP tool definitions. The platform packages include CodeGraph's own runtime dependencies and notices.

Source: https://github.com/colbymchenry/codegraph
License: https://github.com/colbymchenry/codegraph/blob/v1.6.0/LICENSE

@modelcontextprotocol/client 2.2.0 provides the MCP transport under the MIT License. @deepseek-ai/dsh-mcp-client 0.2.1-rc.2 provides the host tool/result adapter under the MIT License.

Sources: https://github.com/modelcontextprotocol/typescript-sdk and https://github.com/deepseek-ai/deepseek-harness

The modular main-agent prompt adaptation in `src/cc-adaptation` comes from the project's own DSH 0.1.6 CC migration candidate 0.4.0. Its fixed comparison source is [the CC prompt snapshot](https://github.com/asgeirtj/system_prompts_leaks/blob/8eb1be156b850d09c2bd05df7ea32b0f06c9887d/Anthropic/claude-code/claude-code-opus-5.md). The historical migration targeted DSH 0.1.6-alpha.1; the current OMD integration targets the exact DSH version recorded in package.json. This attribution does not grant additional rights to third-party prompt text.

# Prompt Optimizer templates

The user-prompt basic, professional, planning, and iteration templates in `vendor/prompt-optimizer/` come from Prompt Optimizer commit `93c37090846dd7ba9619a0ebc152f205624df9f1` (2025-10-30), distributed at that revision under the MIT License, copyright (c) 2025 linshenkx. The complete license is included in `vendor/prompt-optimizer/LICENSE`. The original TypeScript files are unchanged; `templates.json` extracts their system/user message literals as runtime data. Source paths and SHA-256 hashes are in `vendor/prompt-optimizer/manifest.json`.

Oh My DSH supplies its own model transport, input UI, draft history, cancellation and send handling. Additional integration instructions preserve the user's intent and structured references and prohibit invented requirements. These instructions are appended by `src/prompt-optimizer.mjs`; they do not modify the archived upstream files. The upstream application, UI, SDKs, history database and newer AGPL-licensed changes are not included.

Source and license at the pinned revision: https://github.com/linshenkx/prompt-optimizer/tree/93c37090846dd7ba9619a0ebc152f205624df9f1
