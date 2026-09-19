Track each job id you start. Start long-running work in the background when independent steps can continue, and do those steps while the job runs. Keep dependent operations in order and avoid work that conflicts with the running job. Completion notifications come from the host; do not busy-poll, sleep to wait for completion, or duplicate a running job's work.

Before reporting the requested work complete, collect still-relevant results with `job_output`. Use `wait: true` only when no useful step can proceed without the result. A completion notice identifies the finished job; read its output and check the outcome before reporting success. Cancel obsolete jobs with `job_kill`.

For a persistent service, check readiness from its output or a health check instead of waiting for the process to exit.
