import { createHash } from 'node:crypto';
import { activeRecords, liveSpan } from './context/core.mjs';
import { renderBudget } from './task-budget.mjs';

// Sampled facts and, when enabled, the user's session budget.
export function collectRuntimeStatus(agent, hub, { now = Date.now(), messages = [], turn: currentTurn, step: currentStep } = {}) {
  const session = agent.session, events = session.snapshotEvents();
  const start = events.findLast(e => e.type === 'turn/start');
  // pre-step runs before step/start is appended. Prefer its host coordinates;
  // runtime_status reads the latest step in this turn directly from the log.
  const turn = currentTurn ?? start?.data.turn ?? null;
  const step = currentStep ?? events.findLast(e => e.type === 'step/start' && e.data.turn === turn)?.data.step ?? null;
  const ended = start && events.some(e => e.seq > start.seq && e.type === 'turn/end');
  const request = events.findLast(e => e.type === 'request/context');
  const header = session.requestHeader?.()?.config;
  const records = activeRecords(hub.context.state(session)).filter(r => liveSpan(session, r));
  const jobs = agent.ctx?.get?.('jobs') ?? hub.ctx.get?.('jobs');
  const meter = hub.ctx.tokenMeter.measure(session);
  const input = messages.findLast(m => m.source?.kind === 'user')?.id
    ?? events.findLast(e => e.type === 'user/message' && e.surfaceOp === 'append' && e.data?.source?.kind === 'user')?.data.id ?? null;
  return {
    sampledAt: new Date(now).toISOString(), turn, step, asOfSeq: events.at(-1)?.seq ?? -1,
    ...(hub.config().budgetHintsEnabled ? { budget: hub.budgets.snapshot(session, now) } : {}),
    turnWallElapsedMs: start && !ended ? Math.max(0, now - start.time) : null,
    context: {
      retainedTokensEstimate: Number.isFinite(meter.totalTokens) && (request || meter.totalTokens > 0) ? meter.totalTokens : null,
      estimateBasis: 'retained-session-before-next-request',
      lastRequest: request && header ? { provider: request.data.provider, model: request.data.model, window: request.data.contextWindow ?? null, seq: request.seq } : null,
      automaticReplace: hub.config().contextEnabled !== false && hub.config().automaticReplace !== false,
      records: Object.fromEntries(['raw', 'detail', 'brief'].map(mode => [mode, records.filter(r => r.mode === mode).length])),
    },
    jobsAvailable: Boolean(jobs),
    jobs: jobs ? jobs.list(agent.id).map(j => ({ id: j.id, runId: j.runId ?? null, kind: j.kind, label: j.label,
      status: j.status, startedAt: j.startedAt, ...(j.finishedAt != null ? { finishedAt: j.finishedAt } : {}),
      ...(j.detail ? { detail: j.detail } : {}), resultDelivery: j.resultDelivery ?? 'unknown' })) : [],
    changeKey: { input },
  };
}

export function runtimeStateKey(status) {
  // Consumption never refreshes the full state/Todo block. Real input and
  // explicit budget edits retain the ordinary node-based delivery rules.
  const b = status.budget;
  return createHash('sha256').update(JSON.stringify({ input: status.changeKey?.input ?? null,
    ...(b ? { budget: { visible: b.visible, limits: b.limits, revision: b.revision ?? 0 } } : {}),
  })).digest('hex');
}

export function renderRuntimeState(status) {
  const c = status.context, last = c.lastRequest;
  const lines = [`[runtime state · as of ${status.sampledAt} · turn ${status.turn ?? 'not started'} · step ${status.step ?? 'not started'}]`,
    'Latest snapshot supersedes earlier runtime snapshots.',
    ...(status.budget ? [renderBudget(status.budget)].filter(Boolean) : []),
    'Turn and step are host execution positions at sampling time, not live counters.',
    ...(status.turnWallElapsedMs == null ? [] : [`Turn wall time: ${Math.floor(status.turnWallElapsedMs / 1000)}s (includes tools and waiting).`]),
    `Retained context estimate: ${c.retainedTokensEstimate == null ? 'not yet measured' : `${c.retainedTokensEstimate} tokens`}; excludes pending input and new prompt assembly.`,
    ...(last ? [`Last confirmed request: ${last.provider}/${last.model}; window ${last.window ?? 'unknown'} (not remaining capacity).`] : []),
    `Context records: raw ${c.records.raw}, detail ${c.records.detail}, brief ${c.records.brief}; automatic replacement ${c.automaticReplace ? 'on' : 'off'}.`,
    `Jobs: ${status.jobsAvailable ? status.jobs.length : 'service unavailable'}. Delivery describes supplied content, not verification or success.`];
  // Bound the complete state block in UTF-8; the task list is never truncated.
  const footer = 'Query runtime_status for fresh facts and the full job list.';
  for (const job of status.jobs.slice(0, 8)) {
    const row = JSON.stringify({ id: job.id, status: job.status, delivery: job.resultDelivery });
    if (Buffer.byteLength([...lines, row, footer].join('\n')) > 2048) break;
    lines.push(row);
  }
  while (Buffer.byteLength([...lines, footer].join('\n')) > 2048) lines.pop();
  return [...lines, footer].join('\n');
}

export function runtimeContext(agent, hub, options) {
  const config = hub.config();
  if (!config.stateHintsEnabled && !config.budgetHintsEnabled) return null;
  const status = collectRuntimeStatus(agent, hub, options);
  const text = config.stateHintsEnabled ? renderRuntimeState(status) : renderBudget(status.budget);
  const budgetText = renderBudget(status.budget), interval = config.budgetInjectionEvery ?? 1;
  const limited = status.budget?.visible && Object.values(status.budget.limits).some(value => value != null);
  return text ? { key: `${Boolean(config.stateHintsEnabled)}:${runtimeStateKey(status)}`, sampledAt: status.sampledAt, text,
    ...(budgetText ? { budget: { text: budgetText, rounds: status.budget.rounds,
      every: config.budgetEveryStep === true && limited && Number.isSafeInteger(interval) && interval > 0 ? interval : 0 } } : {}),
  } : null;
}

export function registerRuntimeStatus(ctx, hub) {
  ctx.tools.register({ name: 'runtime_status', description: 'Read a fresh snapshot of this turn, retained context estimates, registered background jobs, and the session budget when enabled. This does not wait, consume job output, or establish task success.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute(_args, { agent }) { const { changeKey, ...value } = collectRuntimeStatus(agent, hub); return value; },
  });
}
