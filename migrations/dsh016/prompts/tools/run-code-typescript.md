Execute a TypeScript program against the SDK bindings exposed for this call. Each run starts in a fresh Node process; bindings and variables do not survive into the next run.

Pass `code` as an async-function body and `description` as a short explanation. Top-level `await` and `return` work. Use erasable TypeScript syntax, not enums or namespaces. Call tools as `await tools.name(args)` with lossless JSON arguments. Handle `ToolCallError` only when there is a valid recovery. Independent read-only calls may overlap; await dependent work in order.

Use the current `run_code` schema for `timeoutMs`, the runtime's default and maximum, working directory, and any sandbox approval fields. Approval waits and nested calls count toward the run's deadline. A whole-program grant does not bypass a nested tool's policy. Do not replay a program blindly after denial or failure; inspect effects that may already have happened.

The program-visible environment is empty. Follow the runtime's actual process, output, memory, and file-policy limits; do not assume the older worker environment. Only printed and returned text is exposed as program output; image-bearing successful subtool results are attached after the run. SDK declarations do not make tools directly callable.
