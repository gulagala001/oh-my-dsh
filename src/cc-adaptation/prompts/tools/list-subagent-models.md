Inspect the model routes available for subagents without changing the current agent.

Call without arguments to list providers, with `provider` to list advertised models, or with both `provider` and `model` to inspect that exact model and its reasoning efforts. Use the returned identifiers with a delegation tool's `provider`, `model`, and `reasoning_effort` fields when those fields are exposed.

Catalog membership is advisory: an adapter may accept an unlisted model id. Do not invent model identifiers or assume a route is supported merely because it was requested; the adapter and session policy decide. Follow the calling tool's selection rules, since direct subagents and workflow `agent()` do not have identical override fields.
