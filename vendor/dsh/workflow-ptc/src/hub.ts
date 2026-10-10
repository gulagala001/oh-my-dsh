/** Optional OMD integration boundary; native workflow execution does not require this service. */
import type { Session } from '@deepseek-ai/dsh-session'

interface WorkflowSessionState {
  parentSession?: string
  workflowProject?: string
  [key: string]: unknown
}

export interface WorkflowHub {
  workflowBudget?: {
    attach(session: Session, owner?: { sessionId: string; poolId: string }): void
    capture(session: Session): {
      snapshot(): { total: number | null; spent: number; unmetered?: number }
      owner?: { sessionId: string; poolId: string }
    }
  }
  store: { dir: string; state(id: string): WorkflowSessionState; save(state: WorkflowSessionState): void }
  scope(session: Session): { mode: string; project?: string }
}
