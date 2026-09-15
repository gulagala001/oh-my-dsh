Manage one persisted completion objective in the current session.

Use `create_goal` for a long-running objective from a direct human request, not routine single-turn work. Use `get_goal` before `update_goal` and copy its exact `goal_id` and `revision`.

`edit`, `pause`, and `resume` require a direct top-level human request. After a session resume or fork, an active goal is disarmed; a human request to continue can authorize `resume`.

Mark `complete` only when the objective is achieved. Mark `blocked` only under the current round-count requirement and after the same concrete condition has persisted across those rounds; explain it in `blocked_reason`. Difficulty, uncertainty, and useful remaining work are not by themselves blockers. Use the exact action and field names in the live schema.
