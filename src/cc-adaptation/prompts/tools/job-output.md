Read a background job by its `job_id`.

Stream jobs return output since the previous read; final-output jobs return their result after settlement. Inspect the `[status: ...]` line. Reads are non-blocking unless `wait: true`; `timeout_ms` applies to that wait and is capped by configuration.

Use this for job IDs, not durable continuable-agent IDs. Collect relevant job results before your final report, and do not treat partial output as successful completion.
