# Workflow authoring reference

A workflow structures work across many agents — to be comprehensive (decompose and cover in parallel), to take on scale one context can't hold (migrations, broad sweeps). The script is where you encode that structure: what fans out, what implements, what synthesizes.

Inspect enough context to identify useful delegated work, then run it while continuing independent work. You do not need to complete the investigation before beginning orchestration.

Examples of work a workflow can coordinate, not required stages:
- **Understand** — parallel readers over relevant subsystems → structured map
- **Design** — N independent approaches → compare and synthesize
- **Implement** — concrete requirements → delegate implementation → integrate results
- **Research** — multi-modal sweep → deep-read → synthesize
- **Migrate** — discover sites → transform each (worktree isolation) → integrate

Compose calls around real dependencies. Independent work can proceed concurrently; read results before starting work that depends on them. There is no prescribed phase sequence or number of workflows.

**Ultra Workflow.** The shared Ultra quality and initiative requirements apply. Selecting Workflow supplies standing authorization to author and run a workflow for substantive tasks by default. Delegate concrete requirements through its agents, grouping tightly coupled requirements where needed. Subagents carry out the assigned work through completion, including implementation and refinement. Use the quality patterns below when they help the actual task; choose agent counts and orchestration from the work and its real dependencies. When Ultra is off, follow the ordinary authorization rule in the Workflow tool description.

Pass the script inline via `script` — do not write it to a file first. Every invocation automatically persists its script to a file under the session's workflow directory and returns the path in the tool result. To iterate on a workflow, edit that file with write/edit and re-invoke Workflow with `{scriptPath: "<path>"}` instead of resending the full script.

An inline script begins with `export const meta = {...}`:
  export const meta = {
    name: 'implement-modules',
    description: 'Implement the requested modules',   // one-line description, shown in the result
    phases: [                                            // one entry per phase() call
      { title: 'Read', detail: 'read the module interfaces' },
      { title: 'Build', detail: 'one agent per independent module' },
    ],
  }
  // script body starts here — use agent()/parallel()/pipeline()/phase()/log()
  phase('Read')
  const interfaces = await agent('Read the interfaces of the requested modules.')
  ...

The `meta` object must be a PURE LITERAL — no variables, function calls, spreads, or template interpolation. Required fields: `name`, `description`. Optional: `whenToUse` (invocation guidance), `phases`. Use the SAME phase titles in meta.phases as in phase() calls — titles are matched exactly; a phase() call with no matching meta entry just gets its own progress group. Add `model` to a phase entry when that phase uses a specific model override.

Script body hooks:
- agent(prompt: string, opts?: {label?: string, phase?: string, schema?: object, provider?: string, model?: string, effort?: string, isolation?: 'worktree', agentType?: string}): Promise<any> — spawn a subagent. Without schema, returns its final text as a string. With schema (a JSON Schema), the subagent is forced to call the structured-output tool and agent() returns the validated object — no parsing needed. Returns null if the user skips the agent mid-run or the subagent dies on a terminal API error after retries (filter with .filter(Boolean)). opts.label overrides the display label. opts.phase explicitly assigns this agent to a progress group (use this inside pipeline()/parallel() stages to avoid races on the global phase() state — same phase string → same group box). opts.model overrides the model for this agent call. Default to omitting it — the agent inherits the main-loop model (the resolved session model), which is almost always correct. Only set it when you're highly confident a different tier fits the task; when unsure, omit. opts.effort overrides the reasoning effort for this agent call (an effort id declared by the selected model) — omit to inherit the session effort; use 'low' for cheap mechanical stages and higher tiers only for the hardest implementation stages. opts.isolation: 'worktree' runs the agent in a fresh git worktree — it requires setup and disk space per agent, use ONLY when agents mutate files in parallel and would otherwise conflict; the worktree is auto-removed if unchanged. opts.agentType selects a registered native agent preset id; 'general-purpose' inherits the parent preset. It composes with schema: structured-output instructions are added to that child's composition. A changed model uses its own default effort unless effort is supplied explicitly.
- pipeline(items, stage1, stage2, ...): Promise<any[]> — run each item through all stages independently, NO barrier between stages. Item A can be in stage 3 while item B is still in stage 1. This is the DEFAULT for multi-stage work. Wall-clock = slowest single-item chain, not sum-of-slowest-per-stage. Every stage callback receives (prevResult, originalItem, index) — use originalItem/index in later stages to label work without threading context through stage 1's return value. A stage that throws drops that item to `null` and skips its remaining stages.
- parallel(thunks: Array<() => Promise<any>>): Promise<any[]> — run tasks concurrently. This is a BARRIER: awaits all thunks before returning. A thunk that throws (or whose agent errors) resolves to `null` in the result array — ordinary branch failures do not reject the call; invalid helper arguments, schemas, and execution limits remain fatal, so `.filter(Boolean)` before using the results. Use ONLY when you genuinely need all results together.
- log(message: string): void — emit a progress message to the user (shown as a narrator line above the progress tree)
- phase(title: string): void — start a new phase; subsequent agent() calls are grouped under this title in the progress display
- args: any — the value passed as Workflow's `args` input, verbatim (undefined if not provided). Pass arrays/objects as actual JSON values in the tool call, NOT as a JSON-encoded string — `args: ["a.ts", "b.ts"]`, not `args: "[\"a.ts\", ...]"` (a stringified list reaches the script as one string, so `args.filter`/`args.map` throw). Use this to parameterize named workflows — e.g. pass a research question, target path, or config object directly instead of via a side-channel file.
- budget: {total: number|null, spent(): number, remaining(): number} — the turn's token target from the user's "+500k"-style directive. `budget.total` is null if no target was set. `budget.spent()` returns output tokens spent this turn across the main loop and all workflows — the pool is shared, not per-workflow. `budget.remaining()` returns `max(0, total - spent())`, or `Infinity` if no target. Once `spent()` reaches `total`, further live agent dispatches throw; already-running calls may finish above the target. Cached completed calls remain readable. A set target also blocks new dispatch when a model call did not report usable output usage. A background workflow keeps its initiating pool across later human turns. Treat the explicit budget as a resource constraint. Determine agent counts from the actual work and remaining needs, not a fixed fleet size or a token-spending target.
- workflow(nameOrRef: string | {scriptPath: string}, args?: any): Promise<any> — run another workflow inline as a sub-step and return whatever it returns. Pass a name to invoke a saved workflow (same registry as {name: "..."}), or {scriptPath} to run a script file you wrote earlier. The child shares this run's concurrency cap, agent counter, abort signal, and token budget — its agents appear under a "▸ name" group in workflow progress and its tokens count toward budget.spent(). The args param becomes the child's `args` global. Nesting is one level only: workflow() inside a child throws. Throws on unknown name / unreadable scriptPath / child syntax error; catch to handle gracefully.

Subagents are told their final text IS the return value (not a human-facing message), so they return raw data. For structured output, use the schema option — validation happens at the tool-call layer so the model retries on mismatch.
The supported schema keywords are type, properties, required, additionalProperties, items, enum, const, and oneOf. An enum or const also needs type or oneOf; for example, {type: 'string', enum: ['pass', 'fail']}. Schemas need {type: 'object', properties: {...}} at root and required ⊆ properties; unsatisfiable ones throw at agent().

Workflow agents inherit the connected tools their selected preset exposes. Tool availability and authentication depend on that preset and the current environment.

Subagents receive the project instruction files resolved for their workspace and selected preset. Name the specific rule a stage needs, if any. An isolated checkout starts from HEAD; uncommitted parent files are not copied. Do not assume an uncommitted instruction file is present there.

Scripts are plain JavaScript, NOT TypeScript — type annotations (`: string[]`), interfaces, and generics fail to parse. The script body runs in an async context — use await directly. Standard JS built-ins (JSON, Math, Array, etc.) are available — EXCEPT `Date.now()`/`Math.random()`/argless `new Date()`, which throw (they would break resume); pass timestamps in via `args`, stamp results after the workflow returns, and for randomness vary the agent prompt/label by index. The documented script API is the helper set above; do not rely on arbitrary Node.js or filesystem APIs. The calling session file policy is enforced by the native PTC runtime; the VM helpers are not a security boundary.

DEFAULT TO pipeline(). Only reach for a barrier (parallel between stages) when you genuinely need ALL prior-stage results together.

A barrier is correct ONLY when stage N needs cross-item context from all of stage N-1:
- Dedup/merge across the full result set before expensive downstream work
- Early-exit if the total count is zero ("0 remaining modules → skip implementation entirely")
- Stage N's prompt references "the other implementations" for comparison

A barrier is NOT justified by:
- "I need to flatten/map/filter first" — do it inside a pipeline stage: pipeline(items, stageA, r => transform([r]).flat(), stageB)
- "The stages are conceptually separate" — that's what pipeline() models. Separate stages ≠ synchronized stages.
- "It's cleaner code" — barrier latency is real. If 5 finders run and the slowest takes 3× the fastest, a barrier wastes 2/3 of the fast finders' idle time.

Smell test: if you wrote
  const a = await parallel(...)
  const b = transform(a)        // flatten, map, filter — no cross-item dependency
  const c = await parallel(b.map(...))
that middle transform doesn't need the barrier. Rewrite as a pipeline with the transform inside a stage. When in doubt: pipeline.

Concurrent agent() calls are capped at min(16, available CPUs - 2) per workflow — excess calls queue and run as slots free up. You can still pass 100 items to parallel()/pipeline() and they all complete; only ~10 run at any moment. Total agent count across a workflow's lifetime is capped at 1000 — a runaway-loop backstop set far above any real workflow. A single parallel()/pipeline() call accepts at most 4096 items; passing more is an explicit error, not a silent truncation.

When a barrier IS correct — merge requirements before assigning overlapping implementation work:
  const all = await parallel(args.map(requirement => () => agent(requirement, {schema: MODULES_SCHEMA})))
  const modules = dedupeByPath(all.filter(Boolean).flatMap(r => r.modules))
  const implemented = await parallel(modules.map(m => () => agent(implementationPrompt(m))))

Loop-through-requirements pattern — carry the requested work through completion:
  const parts = []
  while (parts.length < args.length) {
    const result = await agent(args[parts.length])
    if (result === null) { log("A requirement did not complete; inspect its result before continuing."); break }
    parts.push(result)
    log(`${parts.length}/${args.length} requirements processed`)
  }
  return parts

Example of refinement under an explicit budget: stop when the requested result is complete, rather than spending the remaining budget. Guard on budget.total: without a target, remaining() is Infinity. The reserve shown here is illustrative; choose resource limits for the actual work.
  const improvements = []
  while (budget.total && budget.remaining() > 50_000) {
    const result = await agent("Complete or refine the requested deliverable, addressing concrete gaps in the current implementation.", {schema: IMPROVEMENT_SCHEMA})
    if (result === null) { log("The implementation step failed; inspect its result before continuing."); break }
    improvements.push(result)
    log(`${improvements.length} improvements, ${Math.round(budget.remaining()/1000)}k remaining`)
    if (result.complete) break
  }

Quality patterns — common shapes; pick by task and compose freely:
- Candidate comparison: generate N independent attempts from different angles (e.g. MVP-first, risk-first, user-first), compare the results, synthesize from the winner while grafting the best ideas from runners-up. Beats one-attempt-iterated when the solution space is wide.
- Iterative refinement: carry concrete requirements through implementation, integrate the results, and refine the work to address remaining gaps in the user's request.
- Multi-modal sweep: parallel agents each searching a different way (by-container, by-content, by-entity, by-time). Each is blind to what the others surface; useful when one search angle won't find everything.
- No silent caps: if a workflow bounds coverage (top-N, no-retry, sampling), `log()` what was dropped — silent truncation reads as "covered everything" when it didn't.

Scale to what the user asked for. When unsure, lean toward thoroughness for research requests and toward brevity for quick checks.

These patterns aren't exhaustive — compose novel harnesses when the task calls for it (tournament brackets, self-repair loops, staged escalation, whatever fits).

Use this tool for multi-step orchestration where control flow should be deterministic (loops, conditionals, fan-out) rather than model-driven.

## Resume

The tool result includes a runId. To resume after a pause, kill, or script edit, relaunch with workflow({scriptPath, resumeFromRunId}) — the longest unchanged prefix of agent() calls returns cached results instantly; the first edited/new call and everything after it runs live. Unchanged calls with completed cached results reuse those results; changed routes, failed or unfinished calls, and missing retained worktrees run live. Active runs cannot be resumed concurrently. Before diagnosing why a completed workflow returned an empty or unexpected result, Read <transcriptDir>/journal.jsonl — it records each agent's actual return value; do not assume cached results are non-empty. Date.now()/Math.random()/new Date() are unavailable in scripts (they would break this) — stamp results after the workflow returns, or pass timestamps via args. Fallback when no journal is available: Read the native child-session records and hand-author a continuation script.
