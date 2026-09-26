/**
 * The model-facing `workflow` tool: run a JavaScript orchestration script that fans out
 * subagents, and return the script's final value. It owns the model-facing schema and run lifecycle; script
 * parsing, execution, caps, and cancellation live behind `ctx.workflowEngine`
 * (`@deepseek-ai/dsh-workflow`), so a hardened engine swaps in without touching what the model
 * sees. Foreground execution awaits `run.result` and always disposes the run; non-completed reasons
 * become tool errors. `run_in_background: true` instead registers the run as an owned `ctx.jobs` job
 * and returns its id immediately — the job's output ring streams live progress, and the run's value
 * arrives with the job's completion notice. Presentation is an args-only generic card
 * titled from `meta.name`. Explicit-ask usage guidance is registered as the tool's own prompt
 * section rather than deployment persona prose.
 * @module @deepseek-ai/dsh-tool-workflow
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolCallView, ToolResultView } from '@deepseek-ai/dsh-tools'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { JobId, JobOutcome } from '@deepseek-ai/dsh-jobs'
import type { Session, SessionEventMap } from '@deepseek-ai/dsh-session'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type {
  WorkflowResult, WorkflowRun, WorkflowRunId, WorkflowStopReason,
} from '@deepseek-ai/dsh-workflow'
import { createWorkflowRecordMirror } from './record.ts'
import type { PtcWorkflowRun } from '../../workflow-ptc/src/host.ts'
import type PtcWorkflowEngine from '../../workflow-ptc/src/index.ts'
import type { WorkflowRecordMirror } from './record.ts'
import type {
  ToolWorkflowAgentEndData, ToolWorkflowAgentStartData,
  ToolWorkflowRunEndData, ToolWorkflowRunStartData,
} from './types.ts'

declare module '@deepseek-ai/dsh-jobs' {
  interface JobKindMap {
    workflow: 'workflow'
  }
}

export const name = 'tool-workflow'
export const inject = ['tools', 'workflowEngine', 'systemPrompt']

/** Config: the model-facing tool name plus result rendering caps. */
export interface Config {
  /** The model-facing tool name to register (default `workflow`). */
  toolName?: string
  /** Rendered-result ceiling, in characters: a longer JSON value is truncated with a notice (default 50000). */
  maxResultChars?: number
  /**
   * Expose `run_in_background` (default true); disabled calls are also
   * rejected. A background run needs a live `ctx.jobs` registry with a
   * controller serving the caller (`dsh-jobs-local` plus `dsh-tool-jobs` in
   * the shipped composition); without one the call fails with the missing
   * piece named.
   */
  enableRunInBackground?: boolean
}

export const Config: z<Config> = z.object({
  toolName: z.string().default('workflow'),
  maxResultChars: z.natural().min(1).default(50_000),
  enableRunInBackground: z.boolean().default(true),
})

type ResolvedConfig = Required<Config>

interface WorkflowRecorder {
  start(session: Session, run: WorkflowRun): void
  finish(runId: WorkflowRunId, stopReason: WorkflowStopReason): void
  abandon(runId: WorkflowRunId): void
}

interface ToolWorkflowRecordEventMap {
  'tool-workflow/run-start': ToolWorkflowRunStartData
  'tool-workflow/agent-start': ToolWorkflowAgentStartData
  'tool-workflow/agent-end': ToolWorkflowAgentEndData
  'tool-workflow/run-end': ToolWorkflowRunEndData
}

/** Render a contained recording failure without trusting the thrown value. */
function renderRecordingError(error: unknown): string {
  try {
    return String(error)
  } catch {
    return '[unrenderable thrown value]'
  }
}

/**
 * Project active top-level workflow runs into their parent Sessions without
 * letting recording failure affect tool execution.
 */
function createWorkflowRecorder(ctx: Context): WorkflowRecorder {
  const active = new Map<WorkflowRunId, Session>()
  const append = <Type extends keyof ToolWorkflowRecordEventMap>(
    session: Session,
    type: Type,
    data: SessionEventMap[Type],
  ): boolean => {
    // These four package-owned events are all log-only. Narrowing the generic
    // append face here discharges Session.append's conditional options tuple.
    const appendRecord = session.append.bind(session) as <Event extends keyof ToolWorkflowRecordEventMap>(
      event: Event,
      value: SessionEventMap[Event],
    ) => void
    try {
      appendRecord(type, data)
      return true
    } catch (error: unknown) {
      ctx.logger.warn(`tool-workflow: disabled durable record after ${type} append failed: ${renderRecordingError(error)}`)
      return false
    }
  }

  ctx.on('workflow/agent-start', (info, agent) => {
    const session = active.get(info.id)
    if (session === undefined) return
    const data: ToolWorkflowAgentStartData = {
      runId: info.id,
      seq: agent.seq,
      label: agent.label,
      ...agent.phase === undefined ? {} : { phase: agent.phase },
      childId: agent.childId,
    }
    if (!append(session, 'tool-workflow/agent-start', data)) active.delete(info.id)
  })
  ctx.on('workflow/agent-end', (info, agent) => {
    const session = active.get(info.id)
    if (session === undefined) return
    const data: ToolWorkflowAgentEndData = {
      runId: info.id,
      seq: agent.seq,
      outcome: agent.outcome,
    }
    if (!append(session, 'tool-workflow/agent-end', data)) active.delete(info.id)
  })

  return {
    start(session, run) {
      if (append(session, 'tool-workflow/run-start', { runId: run.id, name: run.meta.name })) {
        active.set(run.id, session)
      }
    },
    finish(runId, stopReason) {
      const session = active.get(runId)
      if (session !== undefined) append(session, 'tool-workflow/run-end', { runId, stopReason })
      active.delete(runId)
    },
    abandon: (runId) => { active.delete(runId) },
  }
}

/**
 * The script-authoring contract, embedded in the tool description: the hooks,
 * their exact semantics, and the supported schema subset. Parameter-level
 * rules live in the parameter descriptions.
 */
export const DESCRIPTION = `Run a JavaScript workflow that coordinates subagents when the user has authorized multi-agent orchestration. An active Ultracode reminder supplies standing authorization for substantive tasks; when Ultracode is off, the ordinary opt-in rule applies.

Pass an inline plain JavaScript script beginning with \`export const meta = {...}\`. The metadata must be a pure literal with \`name\` and \`description\`, plus optional \`whenToUse\` and \`phases\`; no calls, variables, spreads, or interpolation. A separate \`meta\` object with a script body is also accepted. Top-level \`await\` is supported; finish with a JSON-serializable \`return\` value. Pass \`args\` as actual JSON values, including arrays, rather than JSON-encoded strings.

Each invocation saves its script and returns \`runId\`, \`scriptPath\`, and \`transcriptDir\`. Edit that script and invoke with \`scriptPath\`, or use \`name\` to load \`.omd/workflows/<name>.js\` in the workspace. Supply exactly one of \`script\`, \`scriptPath\`, or \`name\`. Foreground calls return when the workflow finishes. With \`run_in_background: true\`, the tool returns a native job id; collect the result with \`job_output\` and cancel with \`job_kill\`.

- \`agent(prompt, opts?)\`: run a child to completion. Without \`schema\`, returns final text; with a supported object-root schema, returns the validated object. A child failure returns \`null\`. Other options are \`label\`, \`phase\`, \`provider\`, \`model\`, \`effort\`, \`isolation\`, and \`agentType\`. Here \`provider\` and \`model\` are independent overrides; either may be supplied alone. Omit model and effort overrides to inherit the parent route; a changed model resolves its own default effort unless one is supplied. Effort values must be supported by the selected model. \`agentType\` selects a registered native agent preset id; \`general-purpose\` inherits the parent's preset. \`isolation: 'worktree'\` creates a separate Git checkout at HEAD. Use it when concurrent agents would otherwise conflict while editing files. Parent uncommitted changes are not copied. Unchanged checkouts are removed after the child stops; changes, new files, and commits are retained and their paths reported in \`worktrees\`. Confined modes keep their filesystem restrictions.
- \`pipeline(items, ...stages)\`: process each item across stages without a cross-item barrier. Each stage receives \`(prev, item, index)\`. An ordinary stage exception drops that item to \`null\` and skips its remaining stages.
- \`parallel(thunks)\`: wait for all independent functions at a barrier. A throwing function returns \`null\`.
- \`phase(title)\` and \`log(message)\`: report progress. \`args\` holds the tool's input value.
- \`workflow(nameOrRef, args?)\`: run a saved workflow by name or \`{scriptPath}\` as a sub-step. The child shares concurrency, total-agent limits, cancellation, and the token pool. Nesting is limited to one level.
- \`budget.total\`, \`budget.spent()\`, and \`budget.remaining()\`: the initiating turn's shared output-token target and reported usage across the main loop and delegated work. A human message ending with \`+500k\` sets a 500,000-output-token target; without a target, \`total\` is null and \`remaining()\` is Infinity. Once the target is reached, no further live agents start. Already-running calls may finish above the target. If a model call does not report usable usage, a set target blocks further dispatch instead of treating that call as free. Background workflows retain their initiating pool when a new human turn begins.

Only the documented JSON Schema subset is supported: type, properties, required, additionalProperties, items, enum, const, and oneOf. Invalid hooks, schemas, or caps fail the script rather than becoming per-item null results. Concurrency and agent-count limits still apply.

This engine runs the orchestration program in a fresh Node PTC process under the calling session's file policy. Its documented API is the helper set above; it is not a security boundary. The program-visible environment is empty, and the file policy does not restrict network access. The engine has no overall elapsed deadline, but its initial synchronous slice, process limits, caller cancellation, and enclosing tool deadlines still apply.

Use the helpers to coordinate work performed by agents. Do not infer arbitrary Node API support from the underlying process. Scripts must be deterministic: \`Date.now()\`, \`Math.random()\`, and argumentless \`new Date()\` are unavailable; pass time or randomness through \`args\`.

To resume after cancellation, failure, or script edits, pass \`resumeFromRunId\` with the saved script path. Only the longest unchanged completed prefix of agent calls, in their start order, returns cached results; the first changed, new, failed, or unfinished call and everything after it run live. A run cannot be resumed while it or another resume still owns its children. Read \`journal.jsonl\` under \`transcriptDir\` to inspect actual results, including empty strings and nulls. Inspect failures and coverage before reporting a complete result.`

type WorkflowCallArgs = {
  script: string
  meta: {
    name: string
    description: string
    whenToUse?: string
    phases?: { title: string; detail?: string; provider?: string; model?: string }[]
  }
  args?: JsonValue
  name?: string
  scriptPath?: string
  resumeFromRunId?: string
  run_in_background?: boolean
}

type WorkflowInput = Omit<WorkflowCallArgs, 'script' | 'meta'> & Partial<Pick<WorkflowCallArgs, 'script' | 'meta'>>

function details(run: WorkflowRun) {
  const extended = run as PtcWorkflowRun
  return { name: run.meta.name, runId: run.id, scriptPath: extended.scriptPath!, transcriptDir: extended.transcriptDir!, worktrees: extended.worktrees }
}

function locationText(run: WorkflowRun): string {
  const value = details(run)
  return `Run ID: ${value.runId}\nScript: ${value.scriptPath}\nJournal: ${value.transcriptDir}/journal.jsonl`
    + (value.worktrees.length ? `\nWorktrees: ${JSON.stringify(value.worktrees)}` : '')
}

/** The pending-state card: a generic card titled by the workflow's meta name. */
function presentWorkflowCall(args: WorkflowInput): ToolCallView {
  return {
    card: 'generic',
    title: `workflow: ${args.meta?.name ?? args.name ?? args.scriptPath ?? 'script'}`,
    rawInput: args.script ?? args.scriptPath ?? args.name ?? '',
  }
}

/** The completed-state card: keep the pending title; render the result content as-is. */
function presentWorkflowResult(args: WorkflowInput, result: { content: ContentBlock[]; isError: boolean }): ToolResultView {
  void args
  void result
  return { card: 'generic' }
}

/** A non-`completed` stop reason means the script did not finish cleanly. */
function stopReasonError(result: WorkflowResult): string | undefined {
  switch (result.stopReason) {
    case 'completed':
      return undefined
    case 'cancelled':
      return `workflow run was cancelled${result.error !== undefined ? ` (${result.error})` : ''}`
    case 'error':
      return `workflow run failed: ${result.error ?? 'unknown error'}`
    /* v8 ignore start -- defensive: WorkflowStopReason is a closed union, exhaustive by construction; a future variant fails here loudly */
    default:
      return `workflow run ended abnormally (${String(result.stopReason satisfies never)})`
    /* v8 ignore stop */
  }
}

/**
 * Map a settled background run onto the job outcome vocabulary. A completed
 * run carries the rendered return value as the job's result; a
 * cancelled run leaves the detail to the registry's kill-reason merge (the
 * cancel reason it forwarded is the same string); an errored run fails with
 * the script's failure message.
 */
function jobOutcomeOf(result: WorkflowResult, run: WorkflowRun, maxChars: number): JobOutcome {
  switch (result.stopReason) {
    case 'completed':
      return {
        status: 'completed',
        detail: `${result.agentsStarted} agent${result.agentsStarted === 1 ? '' : 's'}`,
        result: renderResult(run.meta.name, result.agentsStarted, result.value as JsonValue, maxChars) + '\n' + locationText(run),
      }
    case 'cancelled':
      return { status: 'killed', detail: locationText(run) }
    case 'error':
      return { status: 'failed', detail: (result.error ?? 'unknown error') + '\n' + locationText(run) }
    /* v8 ignore start -- defensive: WorkflowStopReason is a closed union, exhaustive by construction; a future variant fails here loudly */
    default:
      return { status: 'failed', detail: `workflow run ended abnormally (${String(result.stopReason satisfies never)})` }
    /* v8 ignore stop */
  }
}

/** Render the run's outcome text: the meta name, agent count, and the JSON value (capped). */
function renderResult(name: string, agentsStarted: number, value: JsonValue, maxChars: number): string {
  // The engine returns JSON data (null for a valueless script), so stringify never yields undefined.
  const rendered = JSON.stringify(value, null, 2)
  const clipped = rendered.length > maxChars
    ? `${rendered.slice(0, maxChars)}\n… [truncated: ${rendered.length - maxChars} more characters]`
    : rendered
  return `workflow "${name}" completed (${agentsStarted} agent${agentsStarted === 1 ? '' : 's'}).\nReturn value:\n${clipped}`
}

/**
 * Register a background run as an owned job. The engine run is started
 * inside the job starter with no tool-step signal — the run belongs to the
 * job, so a registry kill or owner teardown is what cancels it — and its
 * settlement is the job's settlement: dispose, stop the mirrors, then map the
 * stop reason onto the job outcome (a completed run's rendered return value
 * rides `result` to the model's first read after settlement).
 * @param ctx - plugin context (engine, optional jobs registry, logger).
 * @param args - the validated tool call.
 * @param parent - the calling agent; owns the job.
 * @param recordsRun - whether this top-level call records durable run events.
 * @param deps - the tool's recorder/mirror taps and the render cap.
 * @returns the background result for the tool's output schema.
 */
async function startBackgroundRun(
  ctx: Context,
  args: WorkflowCallArgs,
  parent: Agent,
  recordsRun: boolean,
  deps: { recorder: WorkflowRecorder; mirror: WorkflowRecordMirror; maxResultChars: number },
): Promise<{ kind: 'background'; jobId: JobId } & ReturnType<typeof details>> {
  const jobs = ctx.get('jobs')
  if (jobs === undefined) {
    throw new Error('background jobs unavailable: load @deepseek-ai/dsh-jobs and @deepseek-ai/dsh-tool-jobs')
  }
  let run!: WorkflowRun
  const jobId = jobs.start({
    kind: 'workflow',
    label: args.meta.name,
    owner: parent.id,
    run: (job) => {
      // A synchronous engine rejection (META_INVALID/SCRIPT_PARSE) propagates
      // out of the starter, so the registry registers nothing and the model
      // sees the violation list as an ordinary tool error.
      run = ctx.workflowEngine.start({
        script: args.script,
        meta: args.meta,
        ...args.args !== undefined ? { args: args.args } : {},
        ...args.resumeFromRunId !== undefined ? { resumeFromRunId: args.resumeFromRunId } : {},
        parent,
      })
      deps.mirror.start(run.id, job)
      if (recordsRun) deps.recorder.start(parent.session, run)
      const done = run.result.then(async (result): Promise<JobOutcome> => {
        try {
          // Keep member listeners alive through disposal: an engine may
          // synthesize cancelled member endings while reaching quiescence.
          await run.dispose()
        } catch (error: unknown) {
          // done must not reject; a failed disposal still has a settled result to report.
          ctx.logger.warn(`background workflow run ${run.id} dispose failed: ${String(error)}`)
        }
        deps.mirror.stop(run.id)
        if (recordsRun) {
          deps.recorder.finish(run.id, result.stopReason)
          deps.recorder.abandon(run.id)
        }
        return jobOutcomeOf(result, run, deps.maxResultChars)
      })
      return {
        cancel: (reason?: string) => { run.cancel(reason ?? 'background workflow job killed') },
        done,
      }
    },
  })
  try { await (run as PtcWorkflowRun).ready }
  catch (error) { throw new Error(`${String(error)}\n${locationText(run)}`, { cause: error }) }
  return { kind: 'background' as const, jobId, ...details(run) }
}

export function apply(ctx: Context, config: Config): void {
  // schemastery (the exported Config schema) has already filled the defaulted
  // fields; the assertion records that resolution, not a hidden fallback.
  const { toolName, maxResultChars, enableRunInBackground } = config as ResolvedConfig
  const recorder = createWorkflowRecorder(ctx)
  const mirror = createWorkflowRecordMirror(ctx)
  // Usage policy ships with the tool (the master convention: tool guidance
  // lives in tool plugins as prompt sections, not in the deployment persona).
  ctx.systemPrompt.section({
    name: `tool:${toolName}`,
    order: ctx.systemPrompt.getSectionOrder('TOOL_WORKFLOW'),
    text: `Use the ${toolName} tool ONLY when the user explicitly asks for a workflow or for large multi-agent orchestration: you write a JavaScript script (the tool description documents the exact format) that fans work out across many subagents with phases and structured results. For one or two delegations, prefer plain subagent calls.`,
  })
  ctx.tools.register(defineTool({
    name: toolName,
    description: enableRunInBackground ? DESCRIPTION : DESCRIPTION.replace(/ With `run_in_background: true`,[^\n]*?`job_kill`\./, ''),
    parameters: {
      script: {
        type: 'string',
        description: 'An inline plain JavaScript workflow beginning with `export const meta = {...}`; top-level await is allowed. Alternatively pass a body with the separate meta field. '
          + 'End with `return <value>`; the JSON-serializable value is this tool\'s result.',
      },
      meta: {
        type: 'object',
        additionalProperties: true,
        description: 'Optional workflow identity for a script body without an inline meta declaration.',
        properties: {
          name: { type: 'string', required: true, description: 'Short kebab-case workflow name.' },
          description: { type: 'string', required: true, description: 'One-line description of what the workflow does.' },
          whenToUse: { type: 'string', description: 'Optional guidance on when this workflow applies.' },
          phases: {
            type: 'array',
            description: 'Optional phase declarations matched by phase() calls.',
            items: {
              type: 'object',
              additionalProperties: true,
              properties: {
                title: { type: 'string', required: true, description: 'The phase title phase() calls match by exact string.' },
                detail: { type: 'string', description: 'Optional one-line description of the phase.' },
                provider: { type: 'string', description: 'Optional provider override this phase is expected to use.' },
                model: { type: 'string', description: 'Optional model override this phase is expected to use.' },
              },
            },
          },
        },
      },
      args: {
        type: 'json',
        description: 'Optional JSON input exposed verbatim as args. Pass arrays and objects as JSON values, not JSON-encoded strings.',
      },
      name: { type: 'string', description: 'Saved workflow name from .omd/workflows/<name>.js. Supply exactly one of name, script, or scriptPath.' },
      scriptPath: { type: 'string', description: 'Path to a saved workflow script, including inline meta. Use the returned path to edit and rerun a workflow.' },
      resumeFromRunId: { type: 'string', description: 'Resume a previous run in this session: reuse its longest unchanged completed prefix, then run the remaining calls live.' },
      ...enableRunInBackground ? {
        run_in_background: {
          type: 'boolean' as const,
          description: 'Run as a background job: return a job id immediately instead of waiting; the return value arrives with the completion notice.',
        },
      } : {},
    },
    output: {
      schema: {
        oneOf: [
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: { type: 'string', required: true, const: 'background' },
              jobId: { type: 'string', required: true },
              runId: { type: 'string', required: true },
              name: { type: 'string', required: true },
              scriptPath: { type: 'string', required: true },
              transcriptDir: { type: 'string', required: true },
              worktrees: { type: 'json', required: true },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            properties: {
              kind: { type: 'string', required: true, const: 'foreground' },
              runId: { type: 'string', required: true },
              name: { type: 'string', required: true },
              scriptPath: { type: 'string', required: true },
              transcriptDir: { type: 'string', required: true },
              worktrees: { type: 'json', required: true },
              agentsStarted: { type: 'integer', required: true },
              result: { type: 'json', required: true },
            },
          },
        ],
      },
      render: (args, value) => [{
        type: 'text',
        text: (value.kind === 'background'
          ? `workflow "${value.name}" started in the background as job ${value.jobId}. Its return value arrives with the completion notice; check on it with job_output, stop it with job_kill.`
          : renderResult(value.name, value.agentsStarted, value.result, maxResultChars))
          + `\nRun ID: ${value.runId}\nScript: ${value.scriptPath}\nJournal: ${value.transcriptDir}/journal.jsonl`
          + (Array.isArray(value.worktrees) && value.worktrees.length ? `\nWorktrees: ${JSON.stringify(value.worktrees)}` : ''),
      }],
    },
    async execute(input, exec) {
      const parent = exec.agent
      if (!parent) {
        // The loop sets `exec.agent` for every model-driven call; its absence
        // means a non-agent caller invoked the tool directly, which has no
        // parent to attribute the children to. Fail loud rather than guess.
        throw new Error('workflow tool requires a calling agent (exec.agent was undefined)')
      }
      const prepared = await (ctx.workflowEngine as PtcWorkflowEngine).prepare(input, parent, exec.signal)
      exec.signal.throwIfAborted()
      const args = { ...input, ...prepared }
      if (args.run_in_background === true) {
        if (!enableRunInBackground) {
          throw new Error('run_in_background is disabled for this tool')
        }
        // Preparation may read a saved file; the abort check above precedes
        // synchronous job registration and transfer to the job's ownership.
        return startBackgroundRun(ctx, args, parent, exec.parent === undefined, {
          recorder,
          mirror,
          maxResultChars,
        })
      }

      // Meta/body validation failures (META_INVALID/SCRIPT_PARSE) throw
      // synchronously here and become isError results via the registry — the
      // model sees the violation list and can correct the call.
      const run = ctx.workflowEngine.start({
        script: args.script,
        meta: args.meta,
        ...args.args !== undefined ? { args: args.args } : {},
        ...args.resumeFromRunId !== undefined ? { resumeFromRunId: args.resumeFromRunId } : {},
        parent,
        signal: exec.signal,
      })
      const recordsRun = exec.parent === undefined
      // The engine publishes member events after start() returns and this run record is active.
      if (recordsRun) recorder.start(parent.session, run)

      // Bridge the tool's abort signal to the run: if the parent step is aborted while the
      // script is in flight, cancel the whole run. The signal also enters the engine directly, but
      // this local bridge preserves the tool contract even if an implementation ignores it.
      const onAbort = (): void => { run.cancel('parent step aborted') }
      exec.signal.addEventListener('abort', onAbort, { once: true })

      let result: WorkflowResult | undefined
      try {
        result = await run.result
        const error = stopReasonError(result)
        if (error !== undefined) {
          // Map a non-clean finish to an isError result (the registry turns a
          // throw into an isError). Report the reason, not partial output.
          throw new Error(error + '\n' + locationText(run))
        }
        return {
          kind: 'foreground' as const,
          ...details(run),
          agentsStarted: result.agentsStarted,
          result: result.value as JsonValue,
        }
      } finally {
        exec.signal.removeEventListener('abort', onAbort)
        try {
          // Keep member listeners alive through disposal: an engine may
          // synthesize cancelled member endings while reaching quiescence.
          await run.dispose()
          if (recordsRun) {
            /* v8 ignore next -- WorkflowRun.result never rejects by contract, so result is assigned before finally. */
            if (result === undefined) throw new Error('workflow run settled without a result')
            recorder.finish(run.id, result.stopReason)
          }
        } finally {
          if (recordsRun) recorder.abandon(run.id)
        }
      }
    },
    presentCall: args => presentWorkflowCall(args),
    presentResult: (args, result) => presentWorkflowResult(args, result),
  }))
}
