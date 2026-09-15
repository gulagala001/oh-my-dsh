Request cancellation of a descendant agent's current turn using `agent_id`.

This is a cancellation request, not confirmation that the agent has stopped. Queued messages stay parked, agents it started keep running, and the child remains available for later follow-ups. Interrupting an already finished turn is an accepted no-op.
