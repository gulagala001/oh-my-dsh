Run a JavaScript workflow when the user has requested a workflow or large multi-agent orchestration. For one or two independent tasks, use ordinary subagent calls.

Use the current `workflow` schema. Pass `meta` separately from the plain JavaScript `script` body; do not put `export const meta` inside the script. Top-level `await` works. Return a lossless-JSON result. The configured `workflow-ptc` engine uses the Node PTC provider and the calling Session's working directory and file policy. It is not compatible with a Python PTC composition.

- `agent(prompt, opts?)` runs a child to completion. Without `schema`, it returns final text; with a supported object-root schema, it returns the validated object. An ordinary child failure returns `null`. Preserve failed items in coverage reporting. Use only options documented by the current tool.
- `pipeline(items, ...stages)` processes each item independently across stages. Each stage receives `(prev, item, index)`. An ordinary exception drops that item to `null` and skips its remaining stages.
- `parallel(thunks)` awaits independent functions at a barrier. Ordinary function failures return `null`.
- `phase(title)` and `log(message)` report progress. `args` holds the supplied input.

Hook misuse, unsupported schemas, exceeded caps, required confinement failures, and process or output limits fail the workflow. They are not successful empty results. The engine has no overall elapsed deadline, but cancellation and enclosing tool deadlines still apply. Cancellation includes the managed process and child cleanup.

Do not assume CC's cached resume, budget API, workflow-directory lookup, or notification protocol. The program-visible environment is empty. The helper VM is not a security boundary; operating-system policy governs file access, and file policy does not by itself restrict network access.
