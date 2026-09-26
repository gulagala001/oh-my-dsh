/**
 * Workflow VM hooks, child callbacks, ordinary concurrency limits and result serialization.
 * PTC owns process confinement and cancellation. Fatal hook and provider failures propagate
 * through combinators; ordinary child failures and stage errors become per-item nulls.
 * @module @deepseek-ai/dsh-workflow-ptc/runtime
 */

import * as vm from 'node:vm'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { assertObjectJsonSchema, JsonSchemaError } from '@deepseek-ai/dsh-tools'
import type { ObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import { isFatalWorkflowError, WorkflowError } from '@deepseek-ai/dsh-workflow'
import type {
  WorkflowAgentEndInfo,
  WorkflowAgentInfo,
  WorkflowMeta,
  WorkflowResult,
} from '@deepseek-ai/dsh-workflow'
import { materializeFromRealm, MaterializeError, renderThrown } from './realm.ts'
import type { ChildHandle, ChildPort, WorkerLimits } from './types.ts'

/** The observers the execution reports progress through (the session posts them to the host). */
export interface ExecutionObserver {
  phase(title: string): void
  log(message: string): void
  agentStart(info: WorkflowAgentInfo): void
  agentEnd(info: WorkflowAgentEndInfo): void
}

/** The `agent()` options the script may pass; everything else rejects loud. */
const SUPPORTED_AGENT_OPTIONS = new Set(['label', 'phase', 'schema', 'provider', 'model', 'effort', 'isolation', 'agentType'])

interface ExecutionState {
  started: number
  activeSlots: number
  slotWaiters: (() => void)[]
  budget: { total: number | null; spent: number }
}

/** Flatten a child's final output blocks to text (the non-schema `agent()` result). */
function outputText(blocks: ContentBlock[]): string {
  return blocks
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map(block => block.text)
    .join('')
}

/** A short display label derived from the prompt when the script passes none. */
function defaultLabel(prompt: string): string {
  const newline = prompt.indexOf('\n')
  const line = newline === -1 ? prompt : prompt.slice(0, newline)
  return line.length <= 48 ? line : `${line.slice(0, 47)}…`
}

/**
 * One script execution inside the confined Node process. The host owns
 * cancellation and cleanup of any dropped child work.
 */
export class WorkflowExecution {
  /** 1-based count of `agent()` calls started (the `agentsStarted` result field). */
  private currentPhase: string | undefined
  private readonly context: vm.Context
  private readonly compiled: vm.Script

  constructor(
    meta: WorkflowMeta,
    body: string,
    args: unknown,
    private readonly limits: WorkerLimits,
    private readonly observer: ExecutionObserver,
    private readonly children: ChildPort,
    private readonly shared: ExecutionState = { started: 0, activeSlots: 0, slotWaiters: [], budget: { total: null, spent: 0 } },
    private readonly depth = 0,
  ) {
    // The host parses this same wrapper before publishing a run.
    try {
      this.compiled = new vm.Script(`(async () => {\n${body}\n})()`, {
        filename: `workflow:${meta.name}`,
        lineOffset: -1,
      })
    } catch (error: unknown) {
      throw new WorkflowError(`workflow script does not parse: ${String(error)}`, 'SCRIPT_PARSE', { cause: error })
    }

    this.context = vm.createContext({}, { name: `workflow:${meta.name}` })
    const sharedBudget = this.shared.budget

    const globals: Record<string, unknown> = {
      agent: (prompt: unknown, opts?: unknown) => this.contain(this.agent(prompt, opts)),
      parallel: (thunks: unknown) => this.contain(this.parallel(thunks)),
      pipeline: (items: unknown, ...stages: unknown[]) => this.contain(this.pipeline(items, stages)),
      phase: (title: unknown) => { this.phase(title) },
      log: (message: unknown) => { this.log(message) },
      workflow: (reference: unknown, input?: unknown) => this.contain(this.workflow(reference, input)),
      budget: Object.freeze({
        get total() { return sharedBudget.total },
        spent: () => this.shared.budget.spent,
        remaining: () => this.shared.budget.total === null ? Infinity : Math.max(0, this.shared.budget.total - this.shared.budget.spent),
      }),
      // PTC has already copied these inputs through its JSON channel.
      args,
    }
    for (const [key, value] of Object.entries(globals)) {
      // Data properties on the contextified global; frozen shape not required —
      // a script overwriting its own hooks only sabotages itself.
      ;(this.context as Record<string, unknown>)[key] = typeof value === 'function' ? Object.freeze(value) : value
    }
    // Install inside the guest realm: explicit dates remain usable without exposing
    // a host constructor whose prototype could bypass this deterministic contract.
    new vm.Script(`{
      const NativeDate = Date;
      const fail = () => { throw new Error('Workflow scripts must be deterministic; pass time or randomness through args'); };
      const GuardedDate = new Proxy(NativeDate, {
        apply: fail,
        construct(target, input, receiver) { if (!input.length) return fail(); return Reflect.construct(target, input, receiver); }
      });
      Object.defineProperty(NativeDate, 'now', { value: fail, writable: false, configurable: false });
      Object.defineProperty(NativeDate.prototype, 'constructor', { value: GuardedDate, writable: false, configurable: false });
      Object.defineProperty(Math, 'random', { value: fail, writable: false, configurable: false });
      globalThis.Date = GuardedDate;
    }`).runInContext(this.context, { timeout: limits.syncTimeoutMs })
  }

  /**
   * Run the script and materialize its JSON return value.
   * @returns A completed or error result; script failures never reject.
   */
  async drive(): Promise<WorkflowResult> {
    try {
      const scriptPromise = this.compiled.runInContext(this.context, { timeout: this.limits.syncTimeoutMs }) as Promise<unknown>
      const raw: unknown = await this.contain(Promise.resolve(scriptPromise))
      const value = raw === undefined ? null : this.materializeResult(raw)
      return { value, stopReason: 'completed', agentsStarted: this.shared.started }
    } catch (error: unknown) {
      return { value: null, stopReason: 'error', error: renderThrown(error), agentsStarted: this.shared.started }
    }
  }

  /**
   * Attach a no-op rejection consumer WITHOUT changing what the caller
   * receives: if the script drops the promise, a host rejection cannot become
   * an unhandled rejection that kills the process; if
   * the script does await it, it still observes the rejection.
   */
  private contain<T>(promise: Promise<T>): Promise<T> {
    promise.catch(() => { /* consumed: see method contract — a dropped hook promise must not surface an unhandled rejection */ })
    return promise
  }

  /** Materialize the script's return value; violations become RESULT_UNSERIALIZABLE. */
  private materializeResult(raw: unknown): unknown {
    try {
      return materializeFromRealm(raw, 'workflow result')
    } catch (error: unknown) {
      /* v8 ignore next -- defensive rethrow arm: materializeFromRealm only throws MaterializeError */
      if (!(error instanceof MaterializeError)) throw error
      throw new WorkflowError(
        `the workflow's return value is not plain JSON data — ${error.message}. Return only JSON-serializable objects/arrays/scalars.`,
        'RESULT_UNSERIALIZABLE',
        { cause: error },
      )
    }
  }

  /** Acquire one concurrency slot in FIFO order. */
  private acquireSlot(): Promise<void> {
    if (this.shared.activeSlots < this.limits.maxConcurrentAgents) {
      this.shared.activeSlots += 1
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      this.shared.slotWaiters.push(() => {
        this.shared.activeSlots += 1
        resolve()
      })
    })
  }

  private releaseSlot(): void {
    this.shared.activeSlots -= 1
    const next = this.shared.slotWaiters.shift()
    if (next) next()
  }

  /** The `agent(prompt, opts)` hook. */
  private async agent(rawPrompt: unknown, rawOpts: unknown): Promise<unknown> {
    if (typeof rawPrompt !== 'string' || rawPrompt.length === 0) {
      throw new WorkflowError('agent() requires a non-empty prompt string', 'INVALID_ARGUMENT')
    }
    const opts = this.readAgentOptions(rawOpts)
    if (this.shared.started >= this.limits.maxTotalAgents) {
      throw new WorkflowError(
        `this run reached its total agent cap (${this.limits.maxTotalAgents}) — a runaway-loop backstop; raise the applicable maxTotalAgents limit if the scale is intentional`,
        'AGENT_CAP',
      )
    }
    this.shared.started += 1
    const seq = this.shared.started
    const label = opts.label ?? defaultLabel(rawPrompt)
    const phase = opts.phase ?? this.currentPhase

    await this.acquireSlot()
    try {
      let run: ChildHandle
      try {
        run = await this.children.startAgent({
          seq,
          prompt: rawPrompt,
          ...opts.schema !== undefined ? { schema: opts.schema } : {},
          ...opts.provider !== undefined ? { provider: opts.provider } : {},
          ...opts.model !== undefined ? { model: opts.model } : {},
          ...opts.effort !== undefined ? { effort: opts.effort } : {},
          ...opts.isolation !== undefined ? { isolation: opts.isolation } : {},
          ...opts.agentType !== undefined ? { agentType: opts.agentType } : {},
        })
      } catch (error: unknown) {
        throw new WorkflowError(`agent() could not start a child: ${renderThrown(error)}`, 'AGENT_START', { cause: error })
      }
      const info: WorkflowAgentInfo = { seq, label, ...phase !== undefined ? { phase } : {}, childId: brandString<SessionId>(run.id) }
      this.observer.agentStart(info)
      try {
        let result
        try {
          result = await run.result
          if (result.budgetSpent !== undefined) this.shared.budget.spent = Math.max(this.shared.budget.spent, result.budgetSpent)
          if (result.budgetTotal !== undefined) this.shared.budget.total = result.budgetTotal
        } catch (error: unknown) {
          // A rejected child result is an INFRASTRUCTURE fault relayed by the
          // host — distinct from a child that failed and resolved. Pair the
          // lifecycle before propagating, and propagate FATAL: an ordinary
          // throw would dissolve to a per-item null inside the combinators,
          // and a broken provider must not read as a failed child.
          this.observer.agentEnd({ ...info, outcome: 'failed' })
          throw new WorkflowError(`child agent run failed: ${renderThrown(error)}`, 'AGENT_RESULT', { cause: error })
        }
        if (result.stopReason === 'completed') {
          if (opts.schema !== undefined) {
            // The provider honored outputSchema (capability-gated at start), so
            // a completed run without a structured value is a child failure.
            if (result.structured === undefined) {
              this.observer.agentEnd({ ...info, outcome: 'failed' })
              return null
            }
            this.observer.agentEnd({ ...info, outcome: 'completed' })
            return result.structured
          }
          this.observer.agentEnd({ ...info, outcome: 'completed' })
          return outputText(result.output)
        }
        this.observer.agentEnd({ ...info, outcome: 'failed' })
        return null
      } finally {
        await run.dispose()
      }
    } finally {
      this.releaseSlot()
    }
  }

  /** Materialize + validate the `agent()` options bag from the realm. */
  private readAgentOptions(rawOpts: unknown): {
    label?: string
    phase?: string
    provider?: string
    model?: string
    effort?: string
    isolation?: 'worktree'
    agentType?: string
    schema?: ObjectJsonSchema
  } {
    if (rawOpts === undefined) return {}
    let opts: unknown
    try {
      opts = materializeFromRealm(rawOpts, 'agent() options')
    } catch (error: unknown) {
      /* v8 ignore next -- defensive rethrow arm: materializeFromRealm only throws MaterializeError */
      if (!(error instanceof MaterializeError)) throw error
      throw new WorkflowError(`agent() options must be plain JSON data — ${error.message}`, 'INVALID_ARGUMENT', { cause: error })
    }
    if (typeof opts !== 'object' || opts === null || Array.isArray(opts)) {
      throw new WorkflowError('agent() options must be an object', 'INVALID_ARGUMENT')
    }
    const record = opts as Record<string, unknown>
    for (const key of Object.keys(record)) {
      if (SUPPORTED_AGENT_OPTIONS.has(key)) continue
      throw new WorkflowError(`agent() option "${key}" is not recognized (supported: ${[...SUPPORTED_AGENT_OPTIONS].join(', ')})`, 'UNSUPPORTED_OPTION')
    }
    for (const key of ['label', 'phase', 'provider', 'model', 'effort', 'agentType'] as const) {
      if (record[key] !== undefined && typeof record[key] !== 'string') {
        throw new WorkflowError(`agent() option "${key}" must be a string`, 'INVALID_ARGUMENT')
      }
    }
    for (const key of ['provider', 'model', 'effort', 'agentType'] as const) {
      if (record[key] !== undefined && (!(record[key] as string).trim() || record[key] !== (record[key] as string).trim())) throw new WorkflowError(`agent() option "${key}" must be non-empty and normalized`, 'INVALID_ARGUMENT')
    }
    if (record.isolation !== undefined && record.isolation !== 'worktree') throw new WorkflowError('agent() isolation must be "worktree"', 'INVALID_ARGUMENT')
    let schema: ObjectJsonSchema | undefined
    if (record.schema !== undefined) {
      try {
        assertObjectJsonSchema(record.schema)
        schema = record.schema
      } catch (error: unknown) {
        /* v8 ignore next -- defensive rethrow arm: assertObjectJsonSchema only throws JsonSchemaError */
        if (!(error instanceof JsonSchemaError)) throw error
        throw new WorkflowError(`agent() schema is outside the supported subset — ${error.message}`, 'UNSUPPORTED_SCHEMA', { cause: error })
      }
    }
    return {
      ...record.label !== undefined ? { label: record.label as string } : {},
      ...record.phase !== undefined ? { phase: record.phase as string } : {},
      ...record.provider !== undefined ? { provider: record.provider as string } : {},
      ...record.model !== undefined ? { model: record.model as string } : {},
      ...record.effort !== undefined ? { effort: record.effort as string } : {},
      ...record.isolation !== undefined ? { isolation: 'worktree' as const } : {},
      ...record.agentType !== undefined ? { agentType: record.agentType as string } : {},
      ...schema !== undefined ? { schema } : {},
    }
  }

  private async workflow(rawReference: unknown, rawArgs: unknown): Promise<unknown> {
    if (this.depth !== 0) throw new WorkflowError('workflow() nesting is limited to one level', 'INVALID_ARGUMENT')
    const ref = materializeFromRealm(rawReference, 'workflow reference')
    if (!(typeof ref === 'string' && ref.length > 0) && !(ref && typeof ref === 'object' && !Array.isArray(ref) && Object.keys(ref).length === 1 && typeof (ref as any).scriptPath === 'string' && (ref as any).scriptPath.length > 0)) throw new WorkflowError('workflow() requires a saved name or {scriptPath}', 'INVALID_ARGUMENT')
    if (!this.children.loadWorkflow) throw new WorkflowError('Saved workflows are unavailable', 'INVALID_ARGUMENT')
    const input = rawArgs === undefined ? undefined : materializeFromRealm(rawArgs, 'workflow args')
    const source = await this.children.loadWorkflow(ref as string | { scriptPath: string })
    const prefix = `▸ ${source.meta.name}`
    const observer: ExecutionObserver = { ...this.observer,
      phase: title => this.observer.phase(`${prefix}: ${title}`),
      agentStart: info => this.observer.agentStart({ ...info, phase: info.phase ? `${prefix}: ${info.phase}` : prefix }),
      agentEnd: info => this.observer.agentEnd({ ...info, phase: info.phase ? `${prefix}: ${info.phase}` : prefix }),
    }
    const result = await new WorkflowExecution(source.meta, source.body, input, this.limits, observer, this.children, this.shared, 1).drive()
    if (result.stopReason !== 'completed') throw new WorkflowError(result.error ?? 'Nested workflow failed', 'AGENT_RESULT')
    return result.value
  }

  /** The `parallel(thunks)` hook: each thunk caught → `null`; fatal errors propagate. */
  private async parallel(rawThunks: unknown): Promise<unknown[]> {
    if (!Array.isArray(rawThunks)) {
      throw new WorkflowError('parallel() requires an array of zero-argument functions', 'INVALID_ARGUMENT')
    }
    this.assertItemCap(rawThunks.length, 'parallel()')
    const thunks = rawThunks.map((thunk, index) => {
      if (typeof thunk !== 'function') {
        throw new WorkflowError(`parallel() item ${index} is not a function`, 'INVALID_ARGUMENT')
      }
      return thunk as () => unknown
    })
    return Promise.all(thunks.map(async (thunk) => {
      try {
        return await thunk()
      } catch (error: unknown) {
        // Hook failures are WorkflowErrors built OUTSIDE the script's realm;
        // fatality is recognized by `instanceof` against this realm's class —
        // a script-built object can never pass it, so fatality cannot be
        // forged (nor accidentally dissolved).
        if (isFatalWorkflowError(error)) throw error
        return null
      }
    }))
  }

  /** The `pipeline(items, ...stages)` hook: per-item stage chains, NO cross-stage barrier. */
  private async pipeline(rawItems: unknown, rawStages: unknown[]): Promise<unknown[]> {
    if (!Array.isArray(rawItems)) {
      throw new WorkflowError('pipeline() requires an items array', 'INVALID_ARGUMENT')
    }
    this.assertItemCap(rawItems.length, 'pipeline()')
    if (rawStages.length === 0) {
      throw new WorkflowError('pipeline() requires at least one stage function', 'INVALID_ARGUMENT')
    }
    const stages = rawStages.map((stage, index) => {
      if (typeof stage !== 'function') {
        throw new WorkflowError(`pipeline() stage ${index} is not a function`, 'INVALID_ARGUMENT')
      }
      return stage as (previous: unknown, item: unknown, index: number) => unknown
    })
    return Promise.all(rawItems.map(async (item: unknown, index) => {
      let value: unknown = item
      try {
        for (const stage of stages) {
          value = await stage(value, item, index)
        }
        return value
      } catch (error: unknown) {
        // An ordinary stage throw drops the ITEM to null and skips its
        // remaining stages; a fatal WorkflowError (see parallel()) kills the
        // whole script.
        if (isFatalWorkflowError(error)) throw error
        return null
      }
    }))
  }

  private assertItemCap(length: number, hook: string): void {
    if (length > this.limits.maxItemsPerCall) {
      throw new WorkflowError(
        `${hook} received ${length} items — over the per-call cap (${this.limits.maxItemsPerCall}); split the work or raise maxItemsPerCall in the engine config`,
        'ITEM_CAP',
      )
    }
  }

  /** The `phase(title)` hook: sets the current label for subsequent `agent()` calls and notifies observers. */
  private phase(title: unknown): void {
    if (typeof title !== 'string' || title.length === 0) {
      throw new WorkflowError('phase() requires a non-empty title string', 'INVALID_ARGUMENT')
    }
    this.currentPhase = title
    this.observer.phase(title)
  }

  /** The `log(message)` hook: narration to observers. */
  private log(message: unknown): void {
    if (typeof message !== 'string') {
      throw new WorkflowError('log() requires a message string', 'INVALID_ARGUMENT')
    }
    this.observer.log(message)
  }
}
