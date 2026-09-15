Attach and run evidence for tasks in `todo_write`.

Link evidence as each task is completed. Choose a check that demonstrates the user's stated requirement across its actual scope and reaches the changed behavior; a passing check that cannot expose the relevant failure is not evidence of that requirement. Prefer the repository's own runner and real dependencies over a replacement that only imitates the code under test.

Use the strongest available evidence: a real-environment run, an end-to-end test, a targeted code-path check, a smoke check, then a text record. Use a weaker level only when stronger checks cannot run here, and explain the limitation. A text record names the command/output or file/location actually inspected, not just the task title.

- `link`: attach `links` to existing task IDs. A `test` link needs `path`; a `text` link needs `note` and `reason`. Optional `cmd` is used when running a test.
- `run`: run linked tests, optionally limited by `tasks`. With `cmd`, use that command; otherwise the host selects a runner by extension. Inspect PASS, FAIL, or TIMEOUT and the returned output.
- `unlink`: withdraw obsolete links by ID without deleting their files.
- `view`: inspect tasks, completion states, and evidence.

A link is not a claim that a test passed; check its execution result.
