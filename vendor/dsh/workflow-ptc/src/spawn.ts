/** OMD workflow options around the native activation manager. */
import { randomUUID } from 'node:crypto'
import { mkdir, realpath, writeFile } from 'node:fs/promises'
import { join, relative, isAbsolute, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { SubagentActivation, SubagentProvider, SubagentStartRequest } from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import { WorkflowWorktree } from './worktree.ts'
import type { WorktreeArtifact } from './worktree.ts'
import { requestKey } from './journal.ts'
import type { WorkflowHub } from './hub.ts'

export const name = 'omd-workflow-spawn'
export const inject = ['subagents', 'sandboxPolicy', 'fs']
export const WORKFLOW_PROVIDER = 'omd-workflow'

export interface WorkflowSpawnOptions {
  isolation?: 'worktree'
  agentType?: string
  presetFingerprint?: string
  budgetOwner?: { sessionId: string; poolId: string }
  onWorktree?(artifact: WorktreeArtifact): void
}

export type WorkflowStartRequest = SubagentStartRequest
export interface WorkflowProvider extends SubagentProvider {
  /** Apply workflow options while native admission owns startup and descendants. */
  startWorkflow(request: WorkflowStartRequest, options: WorkflowSpawnOptions): Promise<SubagentActivation>
}

function inside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel)
}

/** Resolve a native preset without creating a child or changing a checkout. */
export async function workflowAgentType(ctx: Context, id?: string): Promise<{ id?: string; fingerprint?: string }> {
  if (id === undefined || id === 'general-purpose') return {}
  const presets = ctx.get('agentPresets')
  if (presets === undefined) throw new Error('Custom workflow agents require the native agent preset registry')
  const preset = await presets.resolve(id)
  if (preset.broken) throw new Error(`Workflow agent type ${id} is unavailable: ${preset.broken}`)
  return { id, fingerprint: requestKey(await presets.readDocument(id)) }
}

interface PendingChild {
  readonly parent: Agent
  readonly options: WorkflowSpawnOptions
  readonly policy: ReturnType<Context['sandboxPolicy']['resolve']>
  readonly signal: AbortSignal
  readonly native: SubagentProvider
  cwd?: string
  type?: { id?: string; fingerprint?: string }
  worktree?: WorkflowWorktree
  creationDispose?: () => void
}

export function apply(ctx: Context): void {
  const pending = new Map<SessionId, PendingChild>()
  const activations = new Set<SubagentActivation>()
  const startups = new Set<Promise<SubagentActivation>>()
  const startupCleanupErrors: unknown[] = []
  const lifecycle = new AbortController()
  let providerDispose: (() => void) | undefined
  let nativeProvider: SubagentProvider | undefined
  const report = (record: PendingChild, artifact: WorktreeArtifact): void => record.options.onWorktree?.({ ...artifact })

  async function prepareWorktree(record: PendingChild, signal: AbortSignal): Promise<void> {
    const cwd = record.cwd
    if (cwd === undefined) throw new Error('Native workflow directory was not prepared')
    const policy = record.policy
    if (policy.mode === 'read-only') throw new Error('Worktree isolation requires a writable workspace')
    const target = await ctx.fs.resolve(cwd, { signal })
    if (ctx.fs.processPathFromHostPath(cwd) === undefined) throw new Error('Worktree isolation requires a local filesystem')
    const localCwd = await realpath(ctx.fs.processPath(target))
    const root = await ctx.fs.resolve(policy.workspaceRoot, { signal })
    const stateTarget = await ctx.fs.resolve(join(localCwd, '.omd', 'worktrees'), { signal })
    if (!ctx.fs.contains(target, stateTarget) || (policy.mode === 'workspace-write' && !ctx.fs.contains(root, stateTarget))) throw new Error('Worktree storage must stay inside the writable workspace')
    const state = ctx.fs.processPath(stateTarget)
    await mkdir(state, { recursive: true, mode: 0o700 })
    if (!inside(localCwd, await realpath(state))) throw new Error('Worktree storage changed outside the workspace')
    await writeFile(join(state, '.gitignore'), '*\n', { flag: 'wx', mode: 0o600 }).catch(error => { if (error.code !== 'EEXIST') throw error })
    const sandbox = ctx.get('sandbox')
    record.worktree = await WorkflowWorktree.create(localCwd, state, policy, signal,
      sandbox === undefined ? undefined : (argv, confiningPolicy, control) => sandbox.confine(argv, confiningPolicy, control))
    report(record, record.worktree.artifact)
  }

  async function configureChild(record: PendingChild, agent: Agent, creationSignal?: AbortSignal): Promise<void> {
    const signal = AbortSignal.any([record.signal, ...creationSignal === undefined ? [] : [creationSignal]])
    signal.throwIfAborted()
    if (ctx.subagents.getProvider('spawn') !== record.native) throw new Error('Native workflow provider changed during startup; retry the call')
    if (ctx.get('agents')?.get(record.parent.id) !== record.parent) throw new Error('Native workflow parent is no longer live')
    // Native materialization has reserved capacity before this observer runs.
    if (record.options.isolation === 'worktree') await prepareWorktree(record, signal)
    signal.throwIfAborted()
    if (record.type?.id !== undefined) {
      const current = await workflowAgentType(ctx, record.type.id)
      if (current.fingerprint !== record.type.fingerprint) throw new Error('Workflow agent preset changed during startup; retry the call')
      await ctx.get('agentPresets')!.select(agent, record.type.id)
      signal.throwIfAborted()
      const selected = await workflowAgentType(ctx, record.type.id)
      if (selected.fingerprint !== record.type.fingerprint) throw new Error('Workflow agent preset changed during startup; retry the call')
    }
    if (record.worktree !== undefined) {
      const directory = agent.ctx.get('workingDirectory')
      if (directory === undefined) throw new Error('Workflow worktrees require the native working-directory service')
      await directory.set(agent, record.worktree.artifact.cwd, signal)
    }
    signal.throwIfAborted()
    if (ctx.subagents.getProvider('spawn') !== record.native) throw new Error('Native workflow provider changed during startup; retry the call')
    const hub = ctx.get('trisoulX') as WorkflowHub | undefined
    hub?.workflowBudget?.attach(agent.session, record.options.budgetOwner)
    if (hub !== undefined) {
      const state = hub.store.state(agent.id)
      state.parentSession = record.parent.id
      if (record.worktree !== undefined) {
        const scope = hub.scope(record.parent.session)
        if (scope.mode !== 'session' && scope.project !== undefined) state.workflowProject = scope.project
      }
      hub.store.save(state)
    }
    agent.ctx.systemPrompt.context({ name: 'omd:workflow-return', order: agent.ctx.systemPrompt.getContextOrder('SUBAGENT_DELEGATION') + 1,
      text: 'Your final text is the return value of a workflow agent() call, not a human-facing message. Return the requested data directly. When a structured-output tool is provided, use it to return the required value.' })
  }

  function refreshProvider(): void {
    const native = ctx.subagents.getProvider('spawn')
    if (native === nativeProvider) return
    providerDispose?.(); providerDispose = undefined; nativeProvider = native
    if (native?.prepareContinuable === undefined) return
    const provider: WorkflowProvider = {
      ...native, name: WORKFLOW_PROVIDER,
      async prepareContinuable(request) {
        const record = pending.get(request.sessionId)
        if (record !== undefined) {
          if (record.parent !== request.parent) throw new Error('Workflow child parent changed during admission')
          if (record.native !== native) throw new Error('Native workflow provider changed during startup; retry the call')
          record.cwd = request.cwd
          const options = record.options
          if (options.isolation !== undefined && options.isolation !== 'worktree') throw new Error('Unsupported workflow isolation')
          record.type = await workflowAgentType(ctx, options.agentType)
          if (options.presetFingerprint !== undefined && options.presetFingerprint !== record.type.fingerprint) throw new Error('Workflow agent preset changed during startup; retry the call')
          request.signal.throwIfAborted()
        }
        const prepared = await native.prepareContinuable!(request)
        if (record !== undefined) {
          request.signal.throwIfAborted()
          if (ctx.subagents.getProvider('spawn') !== record.native) throw new Error('Native workflow provider changed during startup; retry the call')
          // Cordis snapshots creation listeners before dispatch. Select only
          // after the standing composition's listeners have installed their
          // Agent-owned definitions, while native creation still blocks input.
          record.creationDispose = ctx.on('agent/created', async ({ agent, signal }) => {
            if (agent.id !== request.sessionId || pending.get(agent.id) !== record) return
            await configureChild(record, agent, signal)
          }, { global: true })
        }
        return prepared
      },
      startWorkflow(request, options) {
        lifecycle.signal.throwIfAborted()
        const childId = SessionId(randomUUID())
        const signal = AbortSignal.any([request.signal, lifecycle.signal])
        const captured = Object.freeze({ ...options, ...options.budgetOwner === undefined ? {} : { budgetOwner: Object.freeze({ ...options.budgetOwner }) } })
        const record: PendingChild = { parent: request.parent, options: captured, signal, native, policy: ctx.sandboxPolicy.resolve({ session: request.parent.session }) }
        pending.set(childId, record)
        const operation = (async () => {
          try {
            const { signal: _signal, label, ...inputs } = request
            const nativeActivation = await ctx.subagents.startActivation({ provider: WORKFLOW_PROVIDER, childId,
              label: label ?? 'Workflow child', request: inputs, signal, delivery: 'caller' })
            let disposal: Promise<void> | undefined
            const activation: SubagentActivation = { childId: nativeActivation.childId, messageId: nativeActivation.messageId, result: nativeActivation.result,
              dispose() {
                disposal ??= (async () => {
                  // Native disposal joins owned descendants before a checkout is inspected.
                  const errors: unknown[] = []
                  try { await nativeActivation.dispose() } catch (error) { errors.push(error) }
                  try {
                    if (record.worktree !== undefined) report(record, await (errors.length
                      ? record.worktree.retain('Native child cleanup failed; checkout retained for inspection')
                      : record.worktree.settle()))
                  } catch (error) { errors.push(error) }
                  finally { activations.delete(activation) }
                  if (errors.length) throw new AggregateError(errors, 'Workflow child cleanup failed', { cause: errors[0] })
                })()
                return disposal
              } }
            activations.add(activation)
            return activation
          } catch (error) {
            try {
              if (record.worktree !== undefined) report(record, await record.worktree.retain('Native workflow startup failed; checkout retained for inspection'))
            } catch (cleanupError) {
              const failure = new AggregateError([error, cleanupError], 'Workflow startup and cleanup failed', { cause: error })
              startupCleanupErrors.push(failure)
              throw failure
            }
            throw error
          } finally { record.creationDispose?.(); delete record.creationDispose; pending.delete(childId) }
        })()
        startups.add(operation)
        void operation.finally(() => startups.delete(operation)).catch(() => undefined)
        return operation
      },
    }
    providerDispose = ctx.subagents.registerProvider(provider)
  }
  ctx.on('subagent/provider-added', provider => { if (provider.name === 'spawn') refreshProvider() })
  ctx.on('subagent/provider-removed', provider => { if (provider === 'spawn') refreshProvider() })
  ctx.effect(() => async () => {
    lifecycle.abort(new Error('OMD workflow provider disposed'))
    providerDispose?.(); providerDispose = undefined
    await Promise.allSettled([...startups])
    const settled = await Promise.allSettled([...activations].map(activation => activation.dispose()))
    const errors = [...startupCleanupErrors, ...settled.filter((row): row is PromiseRejectedResult => row.status === 'rejected').map(row => row.reason)]
    if (errors.length) throw new AggregateError(errors, 'Workflow child cleanup failed')
  })
  refreshProvider()
}
