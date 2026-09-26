import { createHash } from 'node:crypto';

/** An explicit trailing +500k / +1m target in a human message. */
export function workflowTokenTarget(messages) {
  let target;
  for (const message of messages) {
    if (message.source?.kind !== 'user') continue;
    const text = message.content?.filter(block => block.type === 'text').map(block => block.text).join('\n') ?? '';
    const match = /(?:^|\s)\+(\d+(?:\.\d+)?)([km]?)\s*$/i.exec(text);
    if (!match) continue;
    const value = Number(match[1]) * ({ '': 1, k: 1000, m: 1000000 }[match[2].toLowerCase()]);
    if (Number.isSafeInteger(value) && value > 0) target = value;
  }
  return target;
}

const empty = () => ({ total: null, spent: 0, unmetered: 0 });

/** Output-token pools stay attached to the initiating turn, including late children. */
export class WorkflowBudget {
  constructor(store) { this.store = store; }

  admit(session, { turn, step, messages, enabled = true }) {
    if (session.header.parentSession || session.header.origin === 'subagent') return;
    if (!enabled) {
      const state = this.store.peek(session.id);
      if (state?.workflowBudget?.active) { state.workflowBudget.active = null; this.store.save(state); }
      return;
    }
    const human = messages.filter(message => message.source?.kind === 'user');
    if (!human.length) return;
    const state = this.store.state(session.id);
    const data = state.workflowBudget ??= { active: null, pools: {} };
    const target = workflowTokenTarget(human);
    const active = data.pools[data.active];
    if (!active || (step === 1 && active.firstMessageId !== human[0].id)) {
      const id = createHash('sha256').update(String(human[0].id)).digest('hex');
      data.active = id;
      data.pools[id] ??= { ...empty(), turn, firstMessageId: human[0].id, watermarks: {} };
    }
    if (target !== undefined) data.pools[data.active].total = target;
    this.store.save(state);
  }

  owner(session) {
    const state = this.store.peek(session.id);
    if (state?.workflowBudgetOwner) return { ...state.workflowBudgetOwner };
    const id = state?.workflowBudget?.active;
    return id ? { sessionId: session.id, poolId: id } : undefined;
  }

  attach(session, owner) {
    const parent = session.header.parentSession;
    if (!parent) return;
    if (this.store.peek(session.id)?.workflowBudgetOwner && owner === undefined) return;
    if (owner === undefined) {
      const parentState = this.store.peek(parent);
      owner = parentState?.workflowBudgetOwner ?? (parentState?.workflowBudget?.active ? { sessionId: parent, poolId: parentState.workflowBudget.active } : undefined);
    }
    if (!owner || !this.store.peek(owner.sessionId)?.workflowBudget?.pools[owner.poolId]) return;
    const state = this.store.state(session.id);
    state.workflowBudgetOwner = { ...owner };
    state.parentSession = parent;
    this.store.save(state);
  }

  read(owner) {
    const pool = owner && this.store.peek(owner.sessionId)?.workflowBudget?.pools[owner.poolId];
    return pool ? { total: pool.total, spent: pool.spent, unmetered: pool.unmetered } : empty();
  }

  capture(session) {
    const owner = this.owner(session);
    return { owner, snapshot: () => this.read(owner) };
  }

  snapshot(session) { return this.read(this.owner(session)); }

  observe(session, event) {
    if (!['assistant/message', 'assistant/attempt'].includes(event.type)) return;
    if (event.type === 'assistant/message' && event.data.message?.source?.kind !== 'model') return;
    const owner = this.owner(session);
    if (!owner) return;
    const state = this.store.state(owner.sessionId), pool = state.workflowBudget?.pools[owner.poolId];
    if (!pool || (Object.hasOwn(pool.watermarks, session.id) && pool.watermarks[session.id] >= event.seq)) return;
    const usage = event.data.usage ?? event.data.stream?.findLast(chunk => chunk.type === 'usage')?.usage;
    const count = usage?.outputTokens;
    // Some adapters fill absent usage with zero. Nonempty generated output
    // cannot establish a zero-token measurement for an enforced target.
    const hasOutput = event.data.message?.content?.some(block => block.type === 'tool-call' || Boolean(block.text))
      || event.data.stream?.some(chunk => ['text-delta', 'reasoning-delta', 'tool-call-delta'].includes(chunk.type) && (chunk.text || chunk.argumentsDelta || chunk.name));
    if (Number.isSafeInteger(count) && count >= 0 && !(count === 0 && hasOutput) && Number.isSafeInteger(pool.spent + count)) pool.spent += count;
    else pool.unmetered++;
    Object.defineProperty(pool.watermarks, session.id, { value: event.seq, writable: true, configurable: true, enumerable: true });
    this.store.save(state);
  }
}
