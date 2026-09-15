Send `message` to a direct continuable child by `agent_id`. A resident continuable child may also address its direct parent.

A running child receives the message at its next step boundary; an idle or ready child starts a turn. The result confirms delivery, not the child's answer. If delivery fails, do not report that the child received it.

Use the durable id returned by the host, not teammate display names or a `to` field.
