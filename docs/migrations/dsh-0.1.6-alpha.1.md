# DSH 0.1.6-alpha.1 / CC prompt migration candidate

The complete migration implementation is checked into [migrations/dsh016](../../migrations/dsh016/README.zh.md). The launcher defaults to that directory; a chat attachment or separately downloaded bundle is no longer required.

Status: source migration candidate, not a deployed installation. This branch deliberately leaves the running profile and the main branch unchanged. Publishing these files is not a successful DSH upgrade or a model-behavior validation.

## Fixed baselines

- Plugin source target: `c79dd01fc34704b2ca66b511f1ab80b2b938c3db`.
- DSH: `dsh-v0.1.6-alpha.1`, commit `0a15e36e7f82b6ed45af6fa9759f29b40dcd965d` (prerelease).
- Prompt decisions: TriSoulX CC adaptation v0.3.2, migrated into `0.4.0-candidate`.
- CC reference: `asgeirtj/system_prompts_leaks`, commit `8eb1be156b850d09c2bd05df7ea32b0f06c9887d`, `Anthropic/claude-code/claude-code-opus-5.md`.

## Run from a checkout of this branch

Run the following from the repository root. The separate worktree keeps the tooling branch and existing local changes out of the migration target. Choose an unused worktree path; do not overwrite another checkout.

```sh
node --test migrations/dsh016/tests/*.test.mjs
git worktree add --detach ../oh-my-dsh-dsh016-target c79dd01fc34704b2ca66b511f1ab80b2b938c3db
node scripts/migrate-dsh016.mjs --project ../oh-my-dsh-dsh016-target
```

The last command is a dry run. Apply and test the source upgrade explicitly:

```sh
node scripts/migrate-dsh016.mjs --project ../oh-my-dsh-dsh016-target --apply --install
```

Real installation requires Node >=22.19, the project's pnpm version, network access and the project test prerequisites. The installer regenerates the dependency lockfile rather than fabricating one. Review that lockfile and the test results before committing the upgraded target.

Rollback refuses post-migration edits instead of overwriting them:

```sh
node scripts/migrate-dsh016.mjs --project ../oh-my-dsh-dsh016-target --rollback --apply
```

Rollback restores recorded source and lockfile bytes, not node_modules. Reinstall the restored lockfile before starting an old version. No command above automatically changes a user profile, global installation, DSH_HOME, credentials, service process or deployment address.

## Implementation and ownership

The adapter uses the public `system-prompt/assemble` extension point and targets the TriSoulX main agent only. Tool names, parameter/output schemas, executable implementations, restrictions and runtime facts remain with their owners. Tool-description drift is reported and kept native rather than blindly overwritten. Reserved `run_code` retains its runtime-owned process, timeout and permission contract; PTC SDKs are regenerated with current public renderers.

The source migrator changes `agent/session-start` to `agent/created`, replaces `dsh-workflow-worker-thread` with `dsh-workflow-ptc`, replaces the main plan-mode text and applies the previously agreed one-sentence state-header clarification. Existing explicit Ralph configuration is preserved. Seven background maintenance prompts, algorithms, stored memories and permission configuration are not rewritten.

`coverage.json` distinguishes wired, conditionally wired, native-retained and reference-only modules. Including a Markdown module in the repository does not mean it is loaded on every request. Historical synchronous readers remain available but deprecated in this DSH release and are not mass-rewritten here.

## Verification

The candidate's 27 offline tests were rerun successfully before publishing the complete source. These cover fixture assemblies, bounded source changes and temporary Git-directory rollback; SDK tests use injected fixture renderers. They are not a real DSH dependency installation, full application build, authenticated model round or target-host deployment. See [validation boundaries](../../migrations/dsh016/VALIDATION.zh.md).

## Upstream references

- https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.6-alpha.1
- https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.6-alpha.1/packages/core/system-prompt/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.6-alpha.1/packages/core/tools/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.6-alpha.1/packages/core/session/README.md
- https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.6-alpha.1/packages/workflow/workflow-ptc/README.md
