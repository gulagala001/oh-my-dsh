/**
 * Workflow orchestration through the shared sandboxed Node PTC executor.
 * The VM supplies script helpers; the process applies the calling Session's file policy.
 * @module @deepseek-ai/dsh-workflow-ptc
 */

import { randomUUID } from 'node:crypto'
import { availableParallelism, homedir } from 'node:os'
import { join } from 'node:path'
import * as vm from 'node:vm'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-ptc-runtime'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import z from '@deepseek-ai/schemastery'
import { WorkflowEngine, WorkflowError, WorkflowRunId } from '@deepseek-ai/dsh-workflow'
import type { WorkflowRun, WorkflowRunInfo, WorkflowStartRequest } from '@deepseek-ai/dsh-workflow'
import { PtcWorkflowRun } from './host.ts'
import { validateMeta } from './meta.ts'
import type { WorkerInit, WorkerLimits } from './types.ts'
import { parseWorkflowSource } from './source.ts'
import { workflowAgentType } from './spawn.ts'

export { validateMeta } from './meta.ts'
export { WorkflowJournal, readJournal, requestKey } from './journal.ts'
export { WorkflowExecution } from './runtime.ts'
export { runWorkflowGuest } from './guest.ts'
export { PtcWorkflowRun } from './host.ts'
export { parseWorkflowSource, serializeWorkflowSource } from './source.ts'
export { WorkflowWorktree } from './worktree.ts'
export { materializeFromRealm, MaterializeError } from './realm.ts'
export type {
  ChildHandle,
  ChildPort,
  ChildResult,
  ChildStartRequest,
  WorkerInit,
  WorkerLimits,
} from './types.ts'

/** Plugin config (all optional — `static Config` supplies the defaults). */
export interface Config {
  stateDirectory?: string
  /** The `ctx.subagents` provider children run on (default `spawn`). */
  provider?: string
  /** Concurrent `agent()` ceiling; `0` (the default) auto-resolves to `min(16, max(1, cores - 2))`. */
  maxConcurrentAgents?: number
  /** Total `agent()` calls one run may start — the runaway-loop backstop (default 1000). */
  maxTotalAgents?: number
  /** Items accepted by a single `parallel()`/`pipeline()` call (default 4096). */
  maxItemsPerCall?: number
  /** VM timeout for the script's initial synchronous slice (default 5000 ms). */
  syncTimeoutMs?: number
}

type ResolvedConfig = Required<Config>

/** A body that still carries the Claude Code-style meta header (meta rides the seam as data here). */
const META_STATEMENT = /^\s*export\s+const\s+meta\b/

/**
 * Reject invalid JavaScript synchronously before publishing a workflow run.
 * The guest compiles the same async wrapper in its own process.
 */
function assertBodyParses(body: string, name: string): void {
  if (META_STATEMENT.test(body)) {
    throw new WorkflowError('workflow meta rides the `meta` request field, not the script: remove the `export const meta = {...}` statement from the body', 'SCRIPT_PARSE')
  }
  try {
    // Parse only — the script object is discarded, nothing executes.
    void new vm.Script(`(async () => {\n${body}\n})()`, { filename: `workflow:${name}`, lineOffset: -1 })
  } catch (error: unknown) {
    throw new WorkflowError(`workflow script does not parse: ${String(error)}`, 'SCRIPT_PARSE', { cause: error })
  }
}

/** Resolve one run's provider route before publishing work. */
function resolveSubagentProvider(ctx: Context, configured: string, override: string | undefined): string {
  const provider = override ?? configured
  if (provider.length === 0 || provider !== provider.trim()) {
    throw new WorkflowError(
      'workflow subagentProvider must be a non-empty normalized string',
      'INVALID_ARGUMENT',
    )
  }
  if (ctx.subagents.getProvider(provider) === undefined) {
    throw new WorkflowError(`no subagent provider registered for "${provider}"`, 'AGENT_START')
  }
  return provider
}

/** Resolve one run's total-child cap against the engine deployment ceiling. */
function resolveMaxTotalAgents(requested: number | undefined, ceiling: number): number {
  if (requested === undefined) return ceiling
  if (!Number.isSafeInteger(requested) || requested < 1) {
    throw new WorkflowError('workflow maxTotalAgents must be a positive safe integer', 'INVALID_ARGUMENT')
  }
  if (requested > ceiling) {
    throw new WorkflowError(
      `workflow maxTotalAgents ${requested} exceeds the engine ceiling ${ceiling}`,
      'INVALID_ARGUMENT',
    )
  }
  return requested
}

/**
 * The PTC-backed workflow engine. `start()` validates the script up front
 * (meta + a host-side body parse) and returns a {@link WorkflowRun} whose
 * `result` never rejects; the `workflow/*` events fire around the run per
 * the seam contract.
 */
class PtcWorkflowEngine extends WorkflowEngine {
  static inject = ['subagents', 'ptcRuntime', 'sandboxPolicy']

  static Config: z<Config> = z.object({
    stateDirectory: z.string(),
    provider: z.string().default('spawn'),
    maxConcurrentAgents: z.natural().default(0),
    maxTotalAgents: z.natural().min(1).default(1000),
    maxItemsPerCall: z.natural().min(1).default(4096),
    syncTimeoutMs: z.natural().min(1).default(5000),
  })

  private readonly config: ResolvedConfig

  constructor(ctx: Context, config: Config) {
    super(ctx)
    if (ctx.ptcRuntime.language !== 'typescript') throw new Error('workflow-ptc requires the Node TypeScript PTC runtime')
    // schemastery (static Config) has already filled the defaulted fields;
    // the assertion records that resolution, not a hidden fallback.
    this.config = config as ResolvedConfig
  }

  /** Resolve saved scripts through the calling world's native filesystem. */
  async prepare(input: { script?: string; meta?: unknown; name?: string; scriptPath?: string }, parent: import('@deepseek-ai/dsh-agent').Agent, signal?: AbortSignal): Promise<{ script: string; meta: import('@deepseek-ai/dsh-workflow').WorkflowMeta }> {
    if (['script', 'name', 'scriptPath'].filter(key => (input as any)[key] !== undefined).length !== 1) throw new Error('Supply exactly one of script, name, or scriptPath')
    if (input.script !== undefined) {
      const parsed = parseWorkflowSource(input.script, input.meta)
      return { script: parsed.body, meta: parsed.meta }
    }
    const source = await this.loadSource(input.name ?? { scriptPath: input.scriptPath! }, parent, signal)
    if (input.meta !== undefined) throw new Error('Saved workflow metadata belongs in its script file')
    return { script: source.body, meta: source.meta }
  }

  private async loadSource(reference: string | { scriptPath: string }, parent: import('@deepseek-ai/dsh-agent').Agent, signal?: AbortSignal): Promise<{ meta: import('@deepseek-ai/dsh-workflow').WorkflowMeta; body: string }> {
    const fs = (this.ctx as any).get('fs')
    if (!fs) throw new Error('Saved workflows require the native filesystem service')
    let path: string
    if (typeof reference === 'string') {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(reference)) throw new Error('Invalid saved workflow name')
      path = join('.omd', 'workflows', reference + '.js')
    } else path = reference.scriptPath
    const target = await fs.resolve(path, { cwd: parent.session.header.cwd, signal })
    return parseWorkflowSource(await fs.readText(target, signal))
  }

  /**
   * Validate and execute a workflow script in a sandboxed Node process. Throws
   * {@link WorkflowError} synchronously (`META_INVALID` for a malformed meta
   * block, `SCRIPT_PARSE` for a body that does not compile) for a request
   * that cannot begin; once a run is returned, every failure resolves through
   * `result.stopReason` instead.
   * @param request - the script body, its meta data and `args`, the parent
   *   agent, and an optional cancel signal.
   * @returns the live run (its `result` resolves when the script settles).
   */
  start(request: WorkflowStartRequest): WorkflowRun {
    const source = parseWorkflowSource(request.script, request.meta)
    const meta = source.meta
    assertBodyParses(source.body, meta.name)
    const subagentProvider = resolveSubagentProvider(this.ctx, this.config.provider, request.subagentProvider)
    const maxTotalAgents = resolveMaxTotalAgents(request.maxTotalAgents, this.config.maxTotalAgents)
    const id = WorkflowRunId(randomUUID())
    const info: WorkflowRunInfo = { id, meta }
    const limits: WorkerLimits = {
      maxConcurrentAgents: this.config.maxConcurrentAgents === 0
        ? Math.min(16, Math.max(1, availableParallelism() - 2))
        : this.config.maxConcurrentAgents,
      maxTotalAgents,
      maxItemsPerCall: this.config.maxItemsPerCall,
      syncTimeoutMs: this.config.syncTimeoutMs,
    }
    const init: WorkerInit = {
      meta,
      body: source.body,
      ...request.args !== undefined ? { args: structuredClone(request.args) } : {},
      limits,
    }
    // Captured service handles keep a holder-owned run usable after engine unload.
    const runCtx = this.ctx
    const subagents = runCtx.subagents
    const budget = (runCtx as any).get('trisoulX')?.workflowBudget?.capture(request.parent.session)
    const run = new PtcWorkflowRun(
      runCtx,
      subagents,
      runCtx.ptcRuntime,
      id,
      meta,
      request.parent,
      init,
      subagentProvider,
      runCtx.sandboxPolicy.resolve({ session: request.parent.session }),
      {
        phase: (title) => { this.emitWorkflowEvent('workflow/phase', info, title) },
        log: (message) => { this.emitWorkflowEvent('workflow/log', info, message) },
        agentStart: (agent) => { this.emitWorkflowEvent('workflow/agent-start', info, agent) },
        agentEnd: (agent) => { this.emitWorkflowEvent('workflow/agent-end', info, agent) },
      },
      request.signal,
      {
        root: this.config.stateDirectory ?? join((this.ctx as any).get('trisoulX')?.store.dir ?? join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'trisoul-x'), 'workflows'),
        resumeFromRunId: (request as any).resumeFromRunId,
        budget: budget?.snapshot ?? (() => ({ total: null, spent: 0 })),
        budgetOwner: budget?.owner,
        loadWorkflow: (reference, signal) => this.loadSource(reference, request.parent, signal),
        childType: type => workflowAgentType(this.ctx, type),
      },
    )

    this.emitWorkflowEvent('workflow/start', info)
    // `workflow/end` fires as the (never-rejecting) result settles, with the
    // outcome DATA only — the value stays with the run's holder.
    void run.result.then((settled) => {
      this.emitWorkflowEvent('workflow/end', info, {
        stopReason: settled.stopReason,
        ...settled.error !== undefined ? { error: settled.error } : {},
        agentsStarted: settled.agentsStarted,
      })
    })

    return run
  }
}

export default PtcWorkflowEngine
