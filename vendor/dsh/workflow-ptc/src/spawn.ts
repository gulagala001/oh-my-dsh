/** Workflow options over the native one-shot subagent driver and preset registry. */
import type { Context } from '@deepseek-ai/cordis'
import { mkdir, realpath, writeFile } from 'node:fs/promises'
import { join, relative, isAbsolute, sep } from 'node:path'
import { startInProcessRun } from '../../../subagent/subagent-in-process-driver/src/index.ts'
import { captureDelegatedPolicyOverrides } from '@deepseek-ai/dsh-subagent'
import type { ResolvedSubagentStartRequest, SubagentRun } from '@deepseek-ai/dsh-subagent'
import { WorkflowWorktree } from './worktree.ts'
import type { WorktreeArtifact } from './worktree.ts'
import { requestKey } from './journal.ts'

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

type Request = ResolvedSubagentStartRequest & { workflow?: WorkflowSpawnOptions }

function inside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel)
}

/** Resolve a native preset before creating a child or mutating a checkout. */
export async function workflowAgentType(ctx: Context, id?: string): Promise<{ id?: string; fingerprint?: string }> {
  if (id === undefined || id === 'general-purpose') return {}
  const presets = ctx.get('agentPresets')
  if (!presets) throw new Error('Custom workflow agents require the native agent preset registry')
  const preset = await presets.resolve(id)
  if (preset.broken) throw new Error(`Workflow agent type ${id} is unavailable: ${preset.broken}`)
  return { id, fingerprint: requestKey(await presets.readDocument(id)) }
}

async function start(ctx: Context, request: Request): Promise<SubagentRun> {
  const options = request.workflow ?? {}
  if (options.isolation !== undefined && options.isolation !== 'worktree') throw new Error('Unsupported workflow isolation')
  const inherited = captureDelegatedPolicyOverrides(request.parent)
  const policy = ctx.sandboxPolicy.resolve({ session: request.parent.session })
  const type = await workflowAgentType(ctx, options.agentType)
  if (options.presetFingerprint !== undefined && options.presetFingerprint !== type.fingerprint) throw new Error('Workflow agent preset changed during startup; retry the call')
  request.signal.throwIfAborted()
  let worktree: WorkflowWorktree | undefined
  const report = (artifact: WorktreeArtifact): void => { options.onWorktree?.({ ...artifact }) }
  try {
    if (options.isolation === 'worktree') {
      if (policy.mode === 'read-only') throw new Error('Worktree isolation requires a writable workspace')
      const fs = ctx.fs
      const cwd = request.parent.session.header.cwd ?? policy.workspaceRoot
      const target = await fs.resolve(cwd, { signal: request.signal })
      if (fs.processPathFromHostPath(cwd) === undefined) throw new Error('Worktree isolation requires a local filesystem')
      const localCwd = await realpath(fs.processPath(target))
      const root = await fs.resolve(policy.workspaceRoot, { signal: request.signal })
      const stateTarget = await fs.resolve(join(localCwd, '.omd', 'worktrees'), { signal: request.signal })
      if (!fs.contains(target, stateTarget) || (policy.mode === 'workspace-write' && !fs.contains(root, stateTarget))) throw new Error('Worktree storage must stay inside the writable workspace')
      const state = fs.processPath(stateTarget)
      await mkdir(state, { recursive: true, mode: 0o700 })
      if (!inside(localCwd, await realpath(state))) throw new Error('Worktree storage changed outside the workspace')
      await writeFile(join(state, '.gitignore'), '*\n', { flag: 'wx', mode: 0o600 }).catch(error => { if (error.code !== 'EEXIST') throw error })
      const sandbox = ctx.get('sandbox')
      worktree = await WorkflowWorktree.create(localCwd, state, policy, request.signal,
        sandbox ? (argv, policy, signal) => sandbox.confine(argv, policy, signal) : undefined)
      report(worktree.artifact)
    }
    const hub = (ctx as any).get('trisoulX')
    const budget = hub?.workflowBudget
    const run = await startInProcessRun(request, { cwd: worktree?.artifact.cwd, agentPreset: type.id, delegatedPolicy: inherited,
      setupChild: child => {
        budget?.attach(child.session, options.budgetOwner)
        if (hub) {
          const state = hub.store.state(child.session.id)
          state.parentSession = request.parent.session.id
          if (worktree) {
            const scope = hub.scope(request.parent.session)
            if (scope.mode !== 'session') state.workflowProject = scope.project
          }
          hub.store.save(state)
        }
        child.ctx.systemPrompt.context({ name: 'omd:workflow-return', order: child.ctx.systemPrompt.getContextOrder('SUBAGENT_DELEGATION') + 1,
          text: 'Your final text is the return value of a workflow agent() call, not a human-facing message. Return the requested data directly. When a structured-output tool is provided, use it to return the required value.' })
      },
    })
    let disposal: Promise<void> | undefined
    return { id: run.id, localAgent: run.localAgent, result: run.result,
      dispose() {
        disposal ??= (async () => {
          // Never inspect or remove the checkout while the native child can still write.
          await run.dispose()
          if (worktree) report(await worktree.settle())
        })()
        return disposal
      },
    }
  } catch (error) {
    // A rejected native start has completed its unpublished rollback.
    if (worktree) report(await worktree.settle())
    throw error
  }
}

export function apply(ctx: Context): void {
  ctx.subagents.registerProvider({
    name: WORKFLOW_PROVIDER,
    capabilities: { agentOptions: true, outputSchema: true, depthLimit: true, toolFilter: true, persona: true },
    inheritsParentContext: false,
    start: request => start(ctx, request),
  })
}
