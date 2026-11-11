import { Service } from '@deepseek-ai/cordis';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { WorkflowStore } from './store.mjs';
import { WorkflowBudget } from './budget.mjs';

export class WorkflowRuntime extends Service {
  static inject = ['agents', 'sessions'];
  constructor(ctx) {
    super(ctx, 'dshWorkflow');
    this.store = new WorkflowStore(join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'dsh-workflow'));
    this.workflowBudget = new WorkflowBudget(this.store);
    this.embeddedRuns = new Map();
    // These pools belong only to this runtime. Embedded OMD pools are selected
    // at dispatch and continue to be observed by their existing owner.
    ctx.on('agent/pre-step', async ({ agent, turn, step }, next) => {
      const decision = await next();
      if (decision.kind === 'enter') this.workflowBudget.admit(agent.session, { turn, step, messages: decision.messages });
      return decision;
    }, { global: true });
    ctx.on('agent/created', ({ agent }) => this.workflowBudget.attach(agent.session), { global: true });
    ctx.on('session/event', (session, event) => {
      this.workflowBudget.observe(session, event);
      // Captured background pools outlive an embedding plugin's lease.
      // Sequence watermarks make observing alongside OMD idempotent.
      for (const support of new Set(this.embeddedRuns.values())) support.workflowBudget.observe(session, event);
    }, { global: true });
  }
  support(session, owner) {
    if (owner?.runId) return this.embeddedRuns.get(owner.runId) ?? this;
    const omd = this.ctx.get('omd');
    return omd?.workflowBudget?.owner(session) ? omd : this;
  }
  retain(runId, support) {
    if (support === this) return;
    this.embeddedRuns.set(runId, support);
    return () => this.embeddedRuns.delete(runId);
  }
  scope() { return { mode: 'session' }; }
}
