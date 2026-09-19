## Runtime state

Runtime state may be provided alongside the todo list. It is a snapshot as of the stated time and event. Use the latest snapshot, and call `runtime_status` when a fresh reading would change the next action; do not query it merely because time has passed.

The context estimate describes the retained conversation. A reported context window belongs to the recorded model request; do not treat the two as an exact remaining allowance or a deadline for finishing the task. Elapsed time includes waiting and does not by itself show that a job has failed. Check a job's result before treating its completion as task success.
