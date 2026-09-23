# DSH components included with Oh My DSH

Base: `deepseek-ai/deepseek-harness`, tag `dsh-v0.1.7-rc.1`, commit `46a7f68b0922371ce7144b668b90e377d8e799f4`, MIT license. `../dsh.json` records every included file's SHA-256. `changes.patch` contains the source changes against that exact base. Package READMEs retain the upstream baseline; the opt-in extensions are described below and in [the user guide](../../docs/runtime-state-background.md).

OMD includes the complete matching Tools, Jobs, Bash/PowerShell, conversation, and JSONL persistence component implementations. It adds soft yield with preserved hard deadlines, non-consuming previews, request-bound controls, event waits, delivery receipts, and the wait-aware composer. Source API definitions are included for rebuilding and inspection. The original DSH rows remain in the profile, disabled only while this bundle selects the matching providers; removing the bundle restores them.

`src/host-component.mjs` resolves dependencies relative to each original DSH component using its profile entry. This preserves the host's private scope Symbols, owner maps, and scheduler identity across a separately installed plugin. It also inherits the original Tools, Jobs and Shell row configuration. No installed package files are rewritten. OMD presets use the extended tools; ordinary presets retain their original behavior. The upstream-built conversation factory is embedded in OMD's client bundle; it needs no separate package dependency and restores original input preferences outside active event waits.

The native Chat factory and its Computer Use presentation additions are owned by OpenCU; its source, patch and manifest ship in `../opencu/vendor/`. OMD uses the same factory rather than a second grouping executor.

Whole-bundle enablement changes refresh the page when the Conversation provider changes. The original persisted text-draft store and session history survive; unsubmitted attachments must be added again. Ordinary feature settings do not replace the provider. OMD's Loader compatibility retires outgoing exclusive providers before activating originals, preserves rollback, and publishes the completed client graph together.

## Rebuild

Use a clean checkout at the pinned tag and install its locked dependencies before applying `changes.patch`. The browser artifact retains its upstream module id; OMD extracts its factory and mounts it through the integrated client. The snapshot package metadata uses a private name and is not a separately installed client provider. Then apply the patch and run the host build plus the conversation TypeScript build. From the OMD repository:

```sh
node scripts/sync-dsh.mjs /path/to/patched-dsh-checkout
pnpm build
```

The sync script builds the conversation package with DSH's own builder, copies the source packages and browser artifacts, exports the patch, and rewrites the checksum manifest. The JSONL primitives retain native write locking, generation publication and validation; OMD adds a journal for rebasing its associated context files. OMD's build creates host factories from these included sources; the factories receive the already installed host dependencies at activation. Keep the source, patch, generated artifacts and manifest together when updating.
