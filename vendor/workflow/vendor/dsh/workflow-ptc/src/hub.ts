/** Optional host integration; the independent runtime implements the same boundary. */
import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
interface WorkflowSessionState { parentSession?: string; workflowProject?: string; [key: string]: unknown }
export interface WorkflowHub {
  workflowBudget?: {
    attach(session: Session, owner?: { sessionId: string; poolId: string }): void
    capture(session: Session): { snapshot(): { total: number | null; spent: number; unmetered?: number }; owner?: { sessionId: string; poolId: string } }
  }
  store: { dir: string; state(id: string): WorkflowSessionState; save(state: WorkflowSessionState): void }
  scope(session: Session): { mode: string; project?: string }
}
export function workflowSupport(ctx: Context, session: Session, owner?: { sessionId: string; poolId: string }): WorkflowHub | undefined {
  const runtime = ctx.get('dshWorkflow') as { support(session: Session, owner?: { sessionId: string; poolId: string }): WorkflowHub } | undefined
  return runtime?.support(session, owner) ?? ctx.get('omd') as WorkflowHub | undefined
}
