Find files whose paths match a glob pattern.

Use this for file discovery, then read the relevant file or use `grep` for content. Results contain files only, never directory entries. Hidden and ignored files are included; VCS metadata directories are excluded.

Pass `path` to narrow the search. A pattern without `/` matches basenames at any depth: `*` and `*.ts` search the whole tree, not just its top level. Include a separator to anchor the depth.

Results are ordered by modification time and may be capped. The current preset keeps the ordered head when over the cap; other configurations may sample. Follow the actual result's truncation or sampling notice and full-output location. Read the saved complete list when provided; otherwise narrow the pattern or path and retry. A capped or sampled listing is not a complete inventory.
