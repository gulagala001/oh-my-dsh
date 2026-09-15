Delegate focused, independent work to a subagent when it helps complete the user's requested task. Follow any user instructions about delegation.

- `subagent` starts with its own context. Give a self-contained `prompt` with the task, relevant facts, constraints, and expected result.
- `subagent_fork` inherits completed turns, not the current in-flight turn. Include the new instructions and facts it would otherwise miss.
- The configured continuable mode runs in the background by default and returns a durable agent id. Set `run_in_background: false` when your next step depends on the result. Do independent work instead of duplicating the delegated task or inventing its result.
- When the runtime reports completion, inspect the outcome and relay the relevant result. Use `send_message` with the returned agent id for a follow-up rather than starting an unnecessary fresh child.
- Do not supply `subagent_type`, `isolation`, or Claude Code model aliases. Use only model-selection fields that this tool actually exposes.

When child model selection is exposed, `provider`, `model`, and `reasoning_effort` are optional. To override the route, inspect `list_subagent_models` and supply `provider` and `model` together. Use a reasoning effort accepted by that route. Changing the effective route without naming an effort uses the selected model's default effort. Changing the route may prevent provider-side reuse of the inherited conversation prefix.
