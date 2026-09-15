Create and maintain the task list for work with several distinct steps or requirements. Skip it for a trivial action or ordinary conversation. During plan mode, follow the plan-mode instructions instead.

- `excerpt`: quote the opening and closing words of a block from the user's message and create its `tasks` in the same call. Each task needs a title and an `anchor` whose `from` and `to` lie inside that excerpt.
- `add` and `edit`: add anchored tasks or update an existing task by its `id`. Editing a task clears its checkmark and verification links.
- `remove`: remove an irrelevant, superseded, or genuinely impossible task and explain why. Do not remove work merely because it is difficult.
- `check`: set `done` through `updates` only when the task is fully accomplished. Do not check off a partial implementation, failing tests, or an unresolved error. Uncheck a task when new evidence shows it is not done.
- `view`: inspect the complete list and excerpts. `transcript`: inspect verbatim user messages; use their message number as `msg` only when an excerpt is ambiguous across messages.

The authoritative task fields are the current schema's `id`, `title`, `anchor`, and `done`; do not submit owner, dependency, or status fields.
