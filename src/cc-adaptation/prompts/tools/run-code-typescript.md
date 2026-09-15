Execute a TypeScript program against the tools declared in the current SDK.

Pass `code` as an async-function body and `description` as a short explanation. Top-level `await` and `return` work; use erasable TypeScript syntax, not enums or namespaces. Call tools as `await tools.name(args)` using lossless JSON arguments.

A failed call throws `ToolCallError`; handle it only when you have a valid recovery. Independent read-only calls may overlap, while dependent work must be awaited in order and mutations follow the host scheduler. Only logged or returned values become text output; successful image results are attached after the run.

An SDK declaration does not make its name a directly callable tool. Use only directly exposed schemas for direct calls.

For the current process, timeout, environment, and approval semantics, follow the runtime-generated `run_code` description. That description is not replaced by this reference text.
