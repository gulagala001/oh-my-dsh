# Projects, components and acknowledgements

[中文](components.md) · [Home](../README_EN.md) · [Complete notices](../THIRD_PARTY_NOTICES.md)

This catalog covers independently maintained products, optional integrations, host components, source material and locked dependencies. Original authors and integration maintainers are credited separately where they differ. Version and host support come from the source manifests and compatibility guide.

## Independent products and bundled components

### OpenCU

[Project](https://github.com/gulagala001/opencu) · gulagala001 and contributors

Computer and browser observation, interaction, annotations and previews. Bundled plugin; also distributed independently.

- Pinned source / version: [2.4.6-dsh.0.2.2-rc.5](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/package.json)
- License / attribution: See component notices · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/THIRD_PARTY_NOTICES.md)

### DSH Workflow

[Project](https://github.com/gulagala001/dsh-workflow) · gulagala001 and contributors

Task planning, execution, budgets and recovery. Bundled workflow plugin.

- Pinned source / version: [0.1.15-dsh.0.2.2-rc.5](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/workflow/package.json)
- License / attribution: MIT · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/workflow/THIRD_PARTY_NOTICES.md)

### DSH Rewind

[Project](https://github.com/gulagala001/dsh-undo-plugin) · gulagala001 and contributors

Turn undo and conversation rewind. Bundled undo plugin.

- Pinned source / version: [0.1.19-dsh.0.2.2-rc.3](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/rewind/package.json)
- License / attribution: MIT · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/rewind/THIRD_PARTY_NOTICES.md)

### DSH Persona

[Project](https://github.com/gulagala001/dsh-persona-plugin) · gulagala001 and contributors

Personality import, management and global or per-chat selection. Bundled personality plugin.

- Pinned source / version: [0.2.7-dsh.0.2.2-rc.5](https://github.com/gulagala001/oh-my-dsh/blob/main/plugins/persona/package.json)
- License / attribution: MIT · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/plugins/persona/THIRD_PARTY_NOTICES.md)

### DSH Extensions

[Project](https://github.com/gulagala001/dsh-extensions) · gulagala001 and contributors

Manage skills, MCP, instructions, commands and hooks. Bundled extension management plugin.

- Pinned source / version: [0.1.10-dsh.0.2.2-rc.3](https://github.com/gulagala001/oh-my-dsh/blob/main/plugins/dsh-extensions/package.json)
- License / attribution: MIT · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md)

### DeepSeek Workbench

[Project](https://github.com/gulagala001/dsh-deepseek-workbench) · gulagala001 and contributors

DeepSeek web workspace and conversation import. Bundled workspace plugin.

- Pinned source / version: [0.1.14-dsh.0.2.2-rc.3](https://github.com/gulagala001/oh-my-dsh/blob/main/plugins/deepseek-workbench/package.json)
- License / attribution: MIT · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/plugins/deepseek-workbench/THIRD_PARTY_NOTICES.md)

### DSH BTW

[Project](https://github.com/gulagala001/dsh-btw) · gulagala001 and contributors

Side chats, local history, follow-ups and independent cancellation. Bundled side-chat plugin.

- Pinned source / version: [0.1.13-dsh.0.2.2-rc.3](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/btw/package.json)
- License / attribution: MIT · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/btw/LICENSE)

### DSH Theme

[Project](https://github.com/gulagala001/dsh-theme-plugin) · gulagala001 and contributors

Themes, colors, backgrounds, fonts and appearance management. Independent product sharing appearance source with OMD.

- Pinned source / version: [SHA256:ae2ba11f181429d3b09a98f876d564feca03570e6e6f064d32b5aea3838c9e23](https://github.com/gulagala001/oh-my-dsh/blob/main/src/client/skins/runtime.mjs)
- License / attribution: MIT · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#google-material-expressive-skin-fonts-and-icons)

### Glyph

[Project](https://github.com/gulagala001/dsh-theme-plugin) · gulagala001 and contributors

Animated character interface and whale visuals. Theme component distributed with DSH Theme.

- Pinned source / version: [1.0.0-dsh.0.2.1-rc.2](https://github.com/gulagala001/oh-my-dsh/blob/main/plugins/glyph-theme/package.json)
- License / attribution: MIT · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md)

### DSH Response ID Reuse

[Project](https://github.com/gulagala001/dsh-response-id-reuse) · gulagala001 and contributors

Automatic Responses ID continuation and full-request fallback. Bundled backend plugin with shared runtime ownership.

- Pinned source / version: [0.1.12-dsh.0.2.2-rc.3](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/response-id-reuse/package.json)
- License / attribution: MIT · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/response-id-reuse/LICENSE)

## Optional integrations and recommendations

### Billion Context

[Project](https://github.com/ranxianglei/billion-context) · ranxianglei

Long-context compression, original-content recovery and cache diagnostics. Optional recommendation; see compatibility guide for current support.

- Pinned source / version: [0.1.202](https://github.com/gulagala001/oh-my-dsh/blob/main/src/recommended-plugin-catalog.mjs)
- License / attribution: See upstream license and notices · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/plugin-compatibility.md)

### dsh-ops

[Project](https://github.com/T-Auto/dsh-ops) · Original author: T-Auto · adapted by gulagala001

Bounded file, document and shell tools with on-demand discovery. Optional recommendation; see compatibility guide for current support.

- Pinned source / version: [0.2.2-rc.5.ops.0.1.0 / 0.2.2-rc.4.ops.0.1.0 / 0.2.2-rc.3.ops.0.1.0 / 0.2.2-rc.2.ops.0.1.0 / 0.2.2-rc.1.ops.0.1.0 / 0.2.1-rc.5.ops.0.1.0 / 0.2.1-rc.3.ops.0.1.0 / 0.2.1-rc.2.ops.0.1.0 / 0.2.1-rc.1.ops.0.1.0](https://github.com/gulagala001/oh-my-dsh/blob/main/src/recommended-plugin-catalog.mjs)
- License / attribution: See upstream license and notices · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/plugin-compatibility.md)

### DSH Intelligent UI

[Project](https://github.com/gulagala001/dsh-intelligent-ui) · gulagala001

Interactive charts, forms, calculators, simulations and games in answers. Optional recommendation; see compatibility guide for current support.

- Pinned source / version: [0.2.2-rc.3.iui.1.0.19 / 0.2.2-rc.2.iui.1.0.17 / 0.2.2-rc.1.iui.1.0.15 / 0.2.1-rc.5.iui.1.0.14 / 0.2.1-rc.3.iui.1.0.13 / 0.2.1-rc.2.iui.1.0.12 / 0.2.1-rc.1.iui.1.0.12](https://github.com/gulagala001/oh-my-dsh/blob/main/src/recommended-plugin-catalog.mjs)
- License / attribution: See upstream license and notices · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/plugin-compatibility.md)

### Oh My Agents Above All

[Project](https://github.com/gulagala001/oh-my-agents-above-all) · gulagala001

Choose a Codex, Grok Build, Cursor, Pi Coding Agent or ZCode preset in Settings → OMAA to use with DSH sessions and tools. Optional recommendation; see compatibility guide for current support.

- Pinned source / version: [0.2.2-rc.5.omaa.0.17.16 / 0.2.2-rc.3.omaa.0.17.16 / 0.2.2-rc.2.omaa.0.17.12 / 0.2.2-rc.1.omaa.0.17.10 / 0.2.1-rc.5.omaa.0.17.7 / 0.2.1-rc.3.omaa.0.17.6 / 0.2.1-rc.2.omaa.0.17.0 / 0.2.1-rc.1.omaa.0.16.5](https://github.com/gulagala001/oh-my-dsh/blob/main/src/recommended-plugin-catalog.mjs)
- License / attribution: See upstream license and notices · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/plugin-compatibility.md)

### Subscription Login

[Project](https://github.com/V1ki/dsh-plugin-subscriptions) · V1ki

Connect supported subscription providers and discover models. Optional recommendation; see compatibility guide for current support.

- Pinned source / version: [0.9.12](https://github.com/gulagala001/oh-my-dsh/blob/main/src/recommended-plugin-catalog.mjs)
- License / attribution: See upstream license and notices · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/plugin-compatibility.md)

### OpenDesign

[Project](https://github.com/omegapaopao/dsh-open-design) · omegapaopao · skill sources: nexu-io/open-design and the skill authors

Design skills, templates and design systems. Optional recommendation; see compatibility guide for current support.

- Pinned source / version: [0.1.0-omd.1.0.0](https://github.com/gulagala001/oh-my-dsh/blob/main/src/recommended-plugin-catalog.mjs)
- License / attribution: See upstream license and notices · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/plugin-compatibility.md)

### Prompt Optimizer

[Project](https://github.com/WestFox-AwA/dsh-prompt-optimizer) · Original author: 啃轮胎的西狐 (WestFox-AwA) · adapted by gulagala001

Review and clarify requests before sending. Optional recommendation; see compatibility guide for current support.

- Pinned source / version: [0.2.2-rc.5.intent.0.3.4 / 0.2.2-rc.4.intent.0.3.4 / 0.2.2-rc.3.intent.0.3.4 / 0.2.2-rc.2.intent.0.3.4 / 0.2.2-rc.1.intent.0.3.4 / 0.2.1-rc.5.intent.0.3.4 / 0.2.1-rc.3.intent.0.3.3](https://github.com/gulagala001/oh-my-dsh/blob/main/src/recommended-plugin-catalog.mjs)
- License / attribution: See upstream license and notices · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/plugin-compatibility.md)

### DSH Market

[Project](https://github.com/dsh-market/dsh-market) · dsh-market

Browse and manage community plugins and themes. Optional recommendation; see compatibility guide for current support.

- Pinned source / version: [1.70.3](https://github.com/gulagala001/oh-my-dsh/blob/main/src/recommended-plugin-catalog.mjs)
- License / attribution: See upstream license and notices · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/plugin-compatibility.md)

### Infinite Gen 4

[Project](https://github.com/Minglink/dsh-infinite-gen-4) · Minglink

Prompt research and response-state presentation. Optional recommendation; see compatibility guide for current support.

- Pinned source / version: [0.4.0](https://github.com/gulagala001/oh-my-dsh/blob/main/src/recommended-plugin-catalog.mjs)
- License / attribution: See upstream license and notices · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/plugin-compatibility.md)

### Status Rotator

[Project](https://github.com/01Virex/dsh-status-rotator) · 01Virex

Rotating activity text in the interface. Optional recommendation; see compatibility guide for current support.

- Pinned source / version: [0.38.0](https://github.com/gulagala001/oh-my-dsh/blob/main/src/recommended-plugin-catalog.mjs)
- License / attribution: See upstream license and notices · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/plugin-compatibility.md)

### DSH × Blender

[Project](https://github.com/sixtysevenlf/dsh-blender-plugin) · sixtysevenlf

Connect DSH tools to Blender. Optional recommendation; see compatibility guide for current support.

- Pinned source / version: [2.6.1](https://github.com/gulagala001/oh-my-dsh/blob/main/src/recommended-plugin-catalog.mjs)
- License / attribution: See upstream license and notices · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/plugin-compatibility.md)

### Balance Whale Widget

[Project](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget) · MeteorNOX

Usage and balance widget with interactive characters. Optional recommendation; see compatibility guide for current support.

- Pinned source / version: [0.4.2](https://github.com/gulagala001/oh-my-dsh/blob/main/src/recommended-plugin-catalog.mjs)
- License / attribution: See upstream license and notices · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/docs/plugin-compatibility.md)

## Host, data and source assets

### DeepSeek Harness / Cordis

[Project](https://github.com/deepseek-ai/deepseek-harness) · DeepSeek and contributors

Host, sessions, tools and UI components. Host, source or asset; scope documented in provenance.

- Pinned source / version: [0.2.2-rc.5](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/dsh.json)
- License / attribution: MIT · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#dsh)

### Codex frontend / REA

[Project](https://openai.com/codex/) · OpenAI; source extraction via REA

Original frontend assets used by OpenCU and provenance. Host, source or asset; scope documented in provenance.

- Pinned source / version: [SHA256:077d987e97b4647ca2590372d33c8c1cbeb15cecbf18563919a6f7ab121fc4fc](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/lib/rea-assets/manifest.json)
- License / attribution: Original upstream rights apply · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/opencu/THIRD_PARTY_NOTICES.md)

### models.dev

[Project](https://github.com/sst/models.dev) · models.dev contributors

Model pricing data. Host, source or asset; scope documented in provenance.

- Pinned source / version: [SHA256:2209cdcfb76ae98ee76c4f3a36d314940d0d2d125d053544fdea88ea24a41cf4](https://github.com/gulagala001/oh-my-dsh/blob/main/src/monitor-prices.json)
- License / attribution: MIT · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#modelsdev-api-pricing-data)

### Prompt Optimizer

[Project](https://github.com/linshenkx/prompt-optimizer) · linshenkx and contributors

Prompt optimization templates. Host, source or asset; scope documented in provenance.

- Pinned source / version: [SHA256:7d9f0a65779aecd73282732ee6dc6d748ead29ca4da88b0ea6898e4bcef15120](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/prompt-optimizer/manifest.json)
- License / attribution: MIT at pinned revision · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#prompt-optimizer-templates)

### Google Sans Flex

[Project](https://github.com/googlefonts/googlesans-flex) · Google and contributors

Google Material typeface. Host, source or asset; scope documented in provenance.

- Pinned source / version: [SHA256:60df2acfe528583efd4f3757b5a023fada111b19292a0d853cbc9cd6e755f35c](https://github.com/gulagala001/oh-my-dsh/blob/main/src/client/skins/google-material-expressive/assets/fonts.json)
- License / attribution: OFL-1.1 · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#google-material-expressive-skin-fonts-and-icons)

### Google Sans Code

[Project](https://github.com/googlefonts/googlesans-code) · Google and contributors

Google Material monospace typeface. Host, source or asset; scope documented in provenance.

- Pinned source / version: [SHA256:60df2acfe528583efd4f3757b5a023fada111b19292a0d853cbc9cd6e755f35c](https://github.com/gulagala001/oh-my-dsh/blob/main/src/client/skins/google-material-expressive/assets/fonts.json)
- License / attribution: OFL-1.1 · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#google-material-expressive-skin-fonts-and-icons)

### Noto Sans SC

[Project](https://github.com/google/fonts) · Google and contributors

Chinese font subsets. Host, source or asset; scope documented in provenance.

- Pinned source / version: [SHA256:60df2acfe528583efd4f3757b5a023fada111b19292a0d853cbc9cd6e755f35c](https://github.com/gulagala001/oh-my-dsh/blob/main/src/client/skins/google-material-expressive/assets/fonts.json)
- License / attribution: OFL-1.1 · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#google-material-expressive-skin-fonts-and-icons)

### Material Symbols

[Project](https://github.com/google/material-design-icons) · Google and contributors

Google Material icons. Host, source or asset; scope documented in provenance.

- Pinned source / version: [SHA256:60df2acfe528583efd4f3757b5a023fada111b19292a0d853cbc9cd6e755f35c](https://github.com/gulagala001/oh-my-dsh/blob/main/src/client/skins/google-material-expressive/assets/fonts.json)
- License / attribution: Apache-2.0 · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#google-material-expressive-skin-fonts-and-icons)

### JetBrains Mono

[Project](https://github.com/JetBrains/JetBrainsMono) · JetBrains and contributors

Claude CLI theme typeface. Host, source or asset; scope documented in provenance.

- Pinned source / version: [SHA256:a76abf002c49097d146e86740a3105a5d00450b1592e820a1109a8c5680cd697](https://github.com/gulagala001/oh-my-dsh/blob/main/src/client/skins/claude-cli-terminal/assets/OFL.txt)
- License / attribution: OFL-1.1 · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#other-bundled-skin-fonts)

### Claude Code prompt reference

[Project](https://github.com/asgeirtj/system_prompts_leaks) · Anthropic; snapshot maintained by asgeirtj

Pinned comparison source for agent prompt adaptation. Host, source or asset; scope documented in provenance.

- Pinned source / version: [SHA256:eeb4fd3517bf2b72b801c7afa3551eb97af08b998d89df078cea38293ceeb595](https://github.com/gulagala001/oh-my-dsh/blob/main/src/cc-adaptation/prompts/main/01-identity.md)
- License / attribution: Original upstream rights apply · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#codegraph)

### Codex prompt source

[Project](https://github.com/openai/codex) · OpenAI and contributors

Pinned system prompt text and text construction. Necessary host adaptations; originals and licenses included.

- Pinned source / version: [0.164.0](https://github.com/gulagala001/oh-my-dsh/blob/main/src/prompt-styles/upstream/codex/source.json)
- License / attribution: Apache-2.0 · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#system-prompt-style-sources)

### Cursor public prompt sample

[Project](https://github.com/asgeirtj/system_prompts_leaks) · asgeirtj collection; text attributed to Cursor

Pinned system prompt text and text construction. Necessary host adaptations; originals and licenses included.

- Pinned source / version: [public sample 2026-06-04](https://github.com/gulagala001/oh-my-dsh/blob/main/src/prompt-styles/upstream/cursor/source.json)
- License / attribution: Collection license; third-party material unverified · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#system-prompt-style-sources)

### Pi prompt source

[Project](https://github.com/earendil-works/pi) · Mario Zechner and contributors

Pinned system prompt text and text construction. Necessary host adaptations; originals and licenses included.

- Pinned source / version: [1.4.0](https://github.com/gulagala001/oh-my-dsh/blob/main/src/prompt-styles/upstream/pi/source.json)
- License / attribution: MIT · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#system-prompt-style-sources)

### Grok Build prompt source

[Project](https://github.com/xai-org/grok-build) · xAI and contributors

Pinned system prompt text and text construction. Necessary host adaptations; originals and licenses included.

- Pinned source / version: [2bdd1d6a](https://github.com/gulagala001/oh-my-dsh/blob/main/src/prompt-styles/upstream/grok/source.json)
- License / attribution: Apache-2.0 · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#system-prompt-style-sources)

### ZCode prompt source

[Project](https://github.com/zai-org/ZCode) · Z.ai and contributors

Pinned system prompt text and text construction. Necessary host adaptations; originals and licenses included.

- Pinned source / version: [3.16.2 (source)](https://github.com/gulagala001/oh-my-dsh/blob/main/src/prompt-styles/upstream/zcode/source.json)
- License / attribution: Apache-2.0 · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#system-prompt-style-sources)

### Open Claude UI

[Project](https://github.com/Caho1/open-claude-ui) · Caho1 and contributors

Design tokens and component styling for the Claude Desktop theme. Pinned CDS visual adaptation on native DSH components.

- Pinned source / version: [1.0.0](https://github.com/gulagala001/oh-my-dsh/blob/main/src/client/skins/claude-desktop/source.json)
- License / attribution: MIT · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/THIRD_PARTY_NOTICES.md#open-claude-ui)

### Unharnessed

[Project](https://github.com/unharnessed-agent/Unharnessed) · Unharnessed contributors and DSH Unharnessed contributors

Experimental persistent Python preset, background commands and checkpoints. Bundled experimental preset, disabled by default.

- Pinned source / version: [0.3.1-dsh.0.2.2-rc.3](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/unharnessed/package.json)
- License / attribution: MIT; dill: BSD-3-Clause · [Details](https://github.com/gulagala001/oh-my-dsh/blob/main/vendor/unharnessed/THIRD_PARTY_NOTICES.md)

## Locked dependency inventory

[Browse all 2356 package versions and lockfiles](components.md#完整锁定依赖清单) or [download the JSON inventory](dependencies.json).

## History and maintenance

The JasonQQ BTW implementation was used through OMD 0.99.0 and replaced by DSH BTW in 0.99.1. Historical release sources retain their applicable attribution. Current entries are generated from `src/project-catalog.json`, the recommendation catalog, component manifests and dependency lockfiles. Run `npm run credits:write` after changing these inputs; `npm run credits:check` rejects stale documentation or runtime catalog data.
