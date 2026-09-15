Execute a Python program against the tools declared in the current SDK.

Pass `code` as an async-function body and a short `description`. Top-level `await` and `return` work. Use Python syntax, not TypeScript.

Of the generated SDK names, only `tools` and `ToolCallError` are runtime bindings. The other declarations, including `TypedDict` classes, describe types only. Build arguments as ordinary `dict` and `list` JSON values: `await tools.name({"field": 1})`, not `FooArgs(field=1)`, which raises `NameError`.

- Call `await tools.name(args)`; use `await tools["my-tool"](args)` for names that cannot be accessed as attributes, reserved names, or underscore-leading names. Arguments must be lossless JSON. Successful calls return the tool's typed canonical JSON value.
- A failed call raises `ToolCallError`. Its `toolName` identifies the failed tool; handle it with `try/except` when recovery is possible rather than treating the exception as a successful result.
- Independent read-only calls may overlap under `asyncio.gather`. The host runs mutating calls alone in submission order. Sequence dependent work with `await`.
- Only printed and returned values become program output; return values must be lossless JSON. Extract what is needed instead of dumping intermediate results. Images from successful tool calls are attached after the run.

SDK-only bindings must be called inside this program, not as direct tool calls.
