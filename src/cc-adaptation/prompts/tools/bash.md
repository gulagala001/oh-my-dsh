Executes a bash command and returns its stdout/stderr.

- Each call starts a fresh shell. Working directory, variables, and functions do not persist; pass `workdir` for the command's directory.
- Prefer the dedicated file and search tools for reading, writing, and searching files.
- Before any delete or move, verify that the resolved absolute target path is the intended one; never act on an unchecked computed path. Guard path variables with `${VAR:?}` so unset or empty variables cannot silently change the target.
- Use `timeoutMs` in milliseconds, within the configured limits. Non-zero exits are reported as `[exit code: N]`. Long output may be truncated; use the returned full-output path when needed.
- When `run_in_background` is available, set it to `true` for long-running work while you handle independent steps. Track the returned job id and collect its result with `job_output`; do not repeat the command to check on it.
- A sandbox denial is an access boundary, not a command bug. When the session allows approval prompts, request the narrowest sufficient `sandbox_permissions` for the same denied command with a one-sentence `justification`. Do not escalate speculatively. If prompts are disabled or the request is rejected, do not work around the denial.
