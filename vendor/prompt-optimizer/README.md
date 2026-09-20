# Prompt Optimizer template snapshot

Fixed source: https://github.com/linshenkx/prompt-optimizer/tree/93c37090846dd7ba9619a0ebc152f205624df9f1

License at this revision: MIT (see LICENSE). This is the pre-license-change snapshot from 2025-10-30, not the current upstream AGPL distribution.

Only four built-in Chinese user/iteration templates are included. The original TypeScript files are preserved byte for byte; manifest.json records the source paths and SHA-256 digests. templates.json contains the two literal `role`/`content` entries from each source file, with `professional` exposed as `structured`. There are no executable upstream imports in the runtime path. The integrity test checks both source bytes and the extraction.

Model transport and additional integration instructions live in ../../src/prompt-optimizer.mjs. Frontend editing and send orchestration live in ../../src/client/prompt-optimizer-state.mjs. Upstream changes must be reviewed against their own license before replacing this snapshot; normal builds do not access the network or update it.
