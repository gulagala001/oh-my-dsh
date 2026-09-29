# DSH rc.2 development installation

The public npm package `@deepseek-ai/dsh-web-app@0.2.0-rc.2` requires `@deepseek-ai/dsh-client-ui-settings-account@0.2.0-rc.2`, which returned HTTP 404 on 2026-09-29. This directory provides that exact package built from the official `dsh-v0.2.0-rc.2` source, not an rc.1 fallback and not an official npm-published artifact.

`source.json` records the source commit, build commands and archive SHA-256. The account package source is unchanged. The build uses the same CSS filename normalization as the pinned Chat and Conversation snapshots. The package retains its MIT license and upstream attribution.

The root pnpm override repairs development and offline-host installation only. OpenCU does not mount another account provider or modify the official Desktop account component. Oh My DSH reuses this archive through its complete OpenCU snapshot.

When the upstream registry supplies the exact version, remove this override and archive together, regenerate both lockfiles, and recheck clean host installation.
