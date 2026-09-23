# DSH

The Agent preset was originally adapted from DeepSeek Harness 0.1.5-alpha.1, commit `5dda764ed3aa172535a7967b06ff95d9cbfe536a`, and updated against 0.1.5-rc.1, commit `183f08e9c6dde7e36cd2318eaee70b0da08fb35e`.

The shared `todos` projection in `src/tasks.mjs` follows the state version and reducer behavior of `@deepseek-ai/dsh-tool-todo` 0.1.5-rc.1.

The whale contours in `src/client/brand.mjs` are adapted from the animated whale in DSH 0.1.5-rc.1 (`ui-conversation/HeroShell`). Generated copies appear in the web favicon, Chrome popup and README logo. The lighting and orbit effects are modifications for Oh My DSH.

Source: https://github.com/deepseek-ai/deepseek-harness

The component sources under `vendor/dsh` and generated host/browser artifacts are based on DSH 0.1.7-alpha.2, commit `00102833dfaee1da9f48a3a8eae9d34005a75218`. OMD adds optional background job controls and a wait-aware composer. The source changes, license and checksum manifest are included with the distribution; see `vendor/dsh/README.md`.

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

# Cua Driver

The macOS window-directed event fields, Chromium mouse activation sequence, accessibility enablement attributes, and synthetic focus/key-window record mappings in `native/computer-use/Input.m` reference Cua Driver 0.26.1, source commit `b4e3caecd709311d613dde29ddac03e29468bb38`. Its runtime is not bundled or used as the default backend.

Source: https://github.com/trycua/cua

MIT License

Copyright (c) 2025 Cua AI, Inc.

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

sharp 0.35.4 is used for screenshot pixel normalization under the Apache License 2.0. Its license and the notices for its native dependencies are included in the installed packages.

Source: https://github.com/lovell/sharp

# CodeGraph

@colbymchenry/codegraph 1.6.0 and its matching platform runtime are runtime dependencies under the MIT License. Oh My DSH launches the unmodified upstream bundled runtime and discovers its MCP tool definitions. The platform packages include CodeGraph's own runtime dependencies and notices.

Source: https://github.com/colbymchenry/codegraph
License: https://github.com/colbymchenry/codegraph/blob/v1.6.0/LICENSE

@modelcontextprotocol/client 2.0.0 provides the MCP transport under the MIT License. @deepseek-ai/dsh-mcp-client 0.1.7-alpha.2 provides the host tool/result adapter under the MIT License.

Sources: https://github.com/modelcontextprotocol/typescript-sdk and https://github.com/deepseek-ai/deepseek-harness

The modular main-agent prompt adaptation in `src/cc-adaptation` comes from the user-supplied TriSoulX DSH 0.1.6 CC migration candidate 0.4.0. Its fixed comparison source is [the CC prompt snapshot](https://github.com/asgeirtj/system_prompts_leaks/blob/8eb1be156b850d09c2bd05df7ea32b0f06c9887d/Anthropic/claude-code/claude-code-opus-5.md). DSH integration targets 0.1.6-alpha.1; this attribution does not grant additional rights to third-party prompt text.

# Prompt Optimizer templates

The user-prompt basic, professional, planning, and iteration templates in `vendor/prompt-optimizer/` come from Prompt Optimizer commit `93c37090846dd7ba9619a0ebc152f205624df9f1` (2025-10-30), distributed at that revision under the MIT License, copyright (c) 2025 linshenkx. The complete license is included in `vendor/prompt-optimizer/LICENSE`. The original TypeScript files are unchanged; `templates.json` extracts their system/user message literals as runtime data. Source paths and SHA-256 hashes are in `vendor/prompt-optimizer/manifest.json`.

Oh My DSH supplies its own model transport, input UI, draft history, cancellation and send handling. Additional integration instructions preserve the user's intent and structured references and prohibit invented requirements. These instructions are appended by `src/prompt-optimizer.mjs`; they do not modify the archived upstream files. The upstream application, UI, SDKs, history database and newer AGPL-licensed changes are not included.

Source and license at the pinned revision: https://github.com/linshenkx/prompt-optimizer/tree/93c37090846dd7ba9619a0ebc152f205624df9f1
