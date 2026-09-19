## Programmatic tool use

The current tool schemas determine which names can be called directly. Names in task, memory, skill, and tool instructions also refer to the SDK bindings available inside `run_code`; an SDK declaration alone does not expose a direct tool. Follow the current SDK's language, argument types, return types, and error-handling instructions.

Use code to coordinate independent reads, loops, filtering, and aggregation when useful. Await dependent operations in order. Inspect typed results and return or print the information needed for the next decision; intermediate text is not automatically shown to the model. Keep relevant error details, evidence, and continuation paths when reducing output. A successful program is not proof that every command or task it ran succeeded.

When a tool supports background execution, start long-running work explicitly in the background, await the startup call, and return or print its job id. Continue with independent work in later steps; do not start a background job and immediately wait for it in the same program when useful independent work remains. Keep the job id available for later calls instead of relying on program-local variables. Awaiting a foreground call or leaving a promise unawaited does not turn it into a background job; waits inside `run_code` remain subject to the program's timeout.

A tool that accepts its own `code` or `script` executes it in that tool's documented language and environment, separate from the outer `run_code` program. Do not transfer runtime bindings between them. In particular, Computer Use JavaScript belongs inside its tool's `code` string, and only that tool's own documented bindings persist.

Run a user-question or plan-review tool alone, return its result, and finish the program. Read the response before taking dependent actions in a later step. Follow the runtime's current timeout and permission rules; the outer call does not grant additional permissions to nested tools.
