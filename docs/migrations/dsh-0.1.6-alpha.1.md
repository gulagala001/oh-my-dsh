# DSH 0.1.6-alpha.1 / CC prompt migration candidate

Status: candidate tooling only. This branch does not change the running installation. No target host, profile or authenticated terminal was available during preparation. Do not label it deployed or runtime-verified.

## Fixed baselines

- Plugin: `c79dd01fc34704b2ca66b511f1ab80b2b938c3db`.
- DSH: `dsh-v0.1.6-alpha.1`, commit `0a15e36e7f82b6ed45af6fa9759f29b40dcd965d` (prerelease).
- Prompt decisions: TriSoulX CC adaptation v0.3.2.
- CC reference: `asgeirtj/system_prompts_leaks`, commit `8eb1be156b850d09c2bd05df7ea32b0f06c9887d`, `Anthropic/claude-code/claude-code-opus-5.md`.

## Migration implementation in the accompanying candidate bundle

1. Pin DSH dependencies to `0.1.6-alpha.1`; retain unrelated dependencies and all existing model/permission configuration.
2. Replace the removed `agent/session-start` listener with `agent/created`.
3. Replace `dsh-workflow-worker-thread` with `dsh-workflow-ptc`; do not combine that engine with Python PTC. The existing explicit Ralph configuration is preserved rather than silently disabled or newly enabled.
4. Use the public `system-prompt/assemble` extension point. Only TriSoulX main-agent sections and model-facing descriptions are transformed. Tool names, input/output schemas, execution functions, restrictions and current runtime contexts stay with their owners.
5. Re-render PTC SDK text with the current public SDK renderers and live output contracts. Preserve the runtime-generated `run_code` description, including new timeout, permission and process instructions.
6. Apply the v0.3.2 state-header clarification without changing the state scribe, memory algorithms or stored data. Preserve Computer Use documentation slicing anchors.

Unknown or changed tool contracts retain their native wording and are reported for review. This is not evidence of complete model-facing coverage. Historical synchronous readers remain available but deprecated in this release; they are not mass-rewritten here.

## Usage

Extract the accompanying `TriSoulX_CC_DSH016_candidate` bundle. Work on a separate clean checkout of the fixed plugin base; the migration refuses source drift and uncommitted work. The source target is the original plugin checkout, not this tooling branch.

```sh
node scripts/migrate-dsh016.mjs --bundle /path/to/TriSoulX_CC_DSH016_candidate --project /path/to/base-checkout
```

The default is a dry run. Add `--apply` to apply source changes and retain checksummed backups; add `--install` to install dependencies, rebuild and run the project's tests. The project requires Node >=22.19. Do not activate a production profile until those checks and a real request capture have passed. Rollback must refuse files edited after the migration rather than overwrite them.

The candidate does not install globally, overwrite credentials, change DSH_HOME, alter profile permissions, terminate a running service or infer a deployment address.

## Validation boundaries

Local tests used fixture assemblies and source-edit fixtures. They check main-agent scoping, unchanged schemas, reserved PTC contract preservation, SDK regeneration, CU anchors and bounded source edits. New DSH dependency installation and a real model round were not executable in the preparation container because outbound package access was unavailable. Target-host deployment is blocked on access, not completed.

## Upstream references

- https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.6-alpha.1
- https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.6-alpha.1/packages/core/system-prompt/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.6-alpha.1/packages/core/tools/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.6-alpha.1/packages/core/session/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.6-alpha.1/packages/workflow/workflow-ptc/README.md
