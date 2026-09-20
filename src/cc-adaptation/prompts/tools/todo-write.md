Create and maintain the task list for work with several distinct steps or requirements. Skip it for a trivial action or ordinary conversation. During plan mode, follow the plan-mode instructions instead.

- `excerpt`: create an excerpt and its tasks in one call. Supply top-level `from` and `to` quoting the opening and closing words of the user's block. Each task requires `title` and `anchor: {from, to}` quoting a sub-range inside that excerpt. Both pairs are required; for a short quote, `from` and `to` may contain the same text.
- `add` and `edit`: add anchored tasks or update an existing task by its `id`. Editing a task clears its checkmark and verification links.
- `remove`: remove an irrelevant, superseded, or genuinely impossible task and explain why. Do not remove work merely because it is difficult.
- `check`: set `done` through `updates` only when the task is fully accomplished. Do not check off a partial implementation, failing tests, or an unresolved error. Uncheck a task when new evidence shows it is not done.
- `pause_turn`: pause Todo and verification continuation reminders for this turn when the user asks you to stop, or when no permitted useful step remains without new input or an external change. Give a concrete `reason` and what is needed to continue, then explain the incomplete work and end your response. Tasks, evidence, and reminder settings stay unchanged; new user input or the next turn restores the checks. This does not stop background jobs or pause an active goal. Do not use it merely because the work is difficult.
- `view`: inspect the complete list and excerpts. `transcript`: inspect verbatim user messages; use their message number as `msg` only when an excerpt is ambiguous across messages.

The authoritative task fields are the current schema's `id`, `title`, `anchor`, and `done`; do not submit owner, dependency, or status fields.
