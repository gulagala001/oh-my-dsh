List continuable subagents by durable id and label.

Use this to find a child you already started, not to poll for completion. `running` means currently working; `idle` means loaded between turns; `ready` means resumable from storage, not completed.

The default scope lists direct children. `descendants` includes deeper descendants with parent and depth information. Only direct children can receive `send_message`; deeper descendants can be interrupted where permitted. The list is a snapshot, and a later control call may still fail.
