## Background execution

For a direct shell call, omitting `run_in_background` waits up to `yieldMs` (10 seconds by default), then returns the same running command's job id. Its original timeout still applies. Set `run_in_background: false` to await the final result, or `true` to start immediately in the background with incremental output. Automatic handoff returns captured output after completion; it does not provide a live log stream.

A direct `job_output` with `wait: true` can return when the job finishes, new user input arrives, another job finishes, or an explicit timeout expires. Inspect `wakeReason` and the target job's actual status. A wake does not cancel the job or prove that it finished. Without `timeout_ms`, this direct wait has no polling deadline. Use it only when no useful independent work remains. Shell calls and waits inside `run_code` retain their ordinary awaited results and finite timeout rules.
