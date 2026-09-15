Run a JavaScript workflow that coordinates subagents when the user has authorized multi-agent orchestration.

Pass `meta` as a separate JSON object with `name` and `description`, plus optional `whenToUse` and `phases`. Pass only a plain JavaScript body in `script`: no TypeScript and no `export const meta`. Top-level `await` is supported; finish with a JSON-serializable `return` value. This configured runner executes in the foreground and returns when the whole workflow finishes.

- `agent(prompt, opts?)`: run a child to completion. Without `schema`, returns final text; with a supported object-root schema, returns the validated object. A child failure returns `null`. Other options are `label`, `phase`, `provider`, and `model`. Here `provider` and `model` are independent overrides; either may be supplied alone. Do not pass `effort`, `reasoning_effort`, `isolation`, or `agentType`.
- `pipeline(items, ...stages)`: process each item across stages without a cross-item barrier. Each stage receives `(prev, item, index)`. An ordinary stage exception drops that item to `null` and skips its remaining stages.
- `parallel(thunks)`: wait for all independent functions at a barrier. A throwing function returns `null`.
- `phase(title)` and `log(message)`: report progress. `args` holds the tool's input value.

Only the documented JSON Schema subset is supported: type, properties, required, additionalProperties, items, enum, const, and oneOf. Invalid hooks, schemas, or caps fail the script rather than becoming per-item null results. Concurrency and agent-count limits still apply.

This engine runs the orchestration program in a fresh Node PTC process under the calling session's file policy. Its documented API is the helper set above; it is not a security boundary. The program-visible environment is empty, and the file policy does not restrict network access. The engine has no overall elapsed deadline, but its initial synchronous slice, process limits, caller cancellation, and enclosing tool deadlines still apply.

Use the helpers to coordinate work performed by agents. Do not infer arbitrary Node API support from the underlying process. Do not claim cached resume, a workflow directory, a budget API, or the CC background notification protocol. Inspect failures and coverage before reporting a complete result.
