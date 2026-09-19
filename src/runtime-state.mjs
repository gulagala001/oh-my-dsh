import { createHash } from 'node:crypto';
import { activeRecords, liveSpan } from './context/core.mjs';

// A sampled observation, never a task budget or an estimate of completion.
export function collectRuntimeStatus(agent, hub, { now = Date.now(), messages = [] } = {}) {
  const session = agent.session, events = session.snapshotEvents();
  const start = events.findLast(e => e.type === 'turn/start');
  const ended = start && events.some(e => e.seq > start.seq && e.type === 'turn/end');
  const request = events.findLast(e => e.type === 'request/context');
  const header = session.requestHeader?.()?.config;
  const records = activeRecords(hub.context.state(session)).filter(r => liveSpan(session, r));
  const jobs = agent.ctx?.get?.('jobs') ?? hub.ctx.get?.('jobs');
  const meter = hub.ctx.tokenMeter.measure(session);
  const input = messages.findLast(m => m.source?.kind === 'user')?.id
    ?? events.findLast(e => e.type === 'user/message' && e.surfaceOp === 'append' && e.data?.source?.kind === 'user')?.data.id ?? null;
  return {
    sampledAt: new Date(now).toISOString(), asOfSeq: events.at(-1)?.seq ?? -1,
    turnWallElapsedMs: start && !ended ? Math.max(0, now - start.time) : null,
    context: {
      retainedTokensEstimate: Number.isFinite(meter.totalTokens) && (request || meter.totalTokens > 0) ? meter.totalTokens : null,
      estimateBasis: 'retained-session-before-next-request',
      lastRequest: request && header ? { provider: request.data.provider, model: request.data.model, window: request.data.contextWindow ?? null, seq: request.seq } : null,
      automaticReplace: hub.config().contextEnabled !== false && hub.config().automaticReplace !== false,
      records: Object.fromEntries(['raw', 'detail', 'brief'].map(mode => [mode, records.filter(r => r.mode === mode).length])),
    },
    jobsAvailable: Boolean(jobs),
    jobs: jobs ? jobs.list(agent).map(j => ({ id: j.id, runId: j.runId ?? null, kind: j.kind, label: j.label,
      status: j.status, startedAt: j.startedAt, ...(j.finishedAt != null ? { finishedAt: j.finishedAt } : {}),
      ...(j.detail ? { detail: j.detail } : {}), resultDelivery: j.resultDelivery ?? 'unknown' })) : [],
    changeKey: { input },
  };
}

export function runtimeStateKey(status) {
  // Only real user input triggers a runtime refresh. Jobs, automatic turns and
  // context bookkeeping are sampled when Todo delivery or compaction needs them.
  return createHash('sha256').update(JSON.stringify({ input: status.changeKey?.input ?? null })).digest('hex');
}

export function renderRuntimeState(status) {
  const c = status.context, last = c.lastRequest;
  const lines = [`[runtime state · as of ${status.sampledAt} · event ${status.asOfSeq}]`,
    'Latest snapshot supersedes earlier runtime snapshots; it is not a task budget.',
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
  if (!hub.config().stateHintsEnabled) return null;
  const status = collectRuntimeStatus(agent, hub, options);
  return { key: runtimeStateKey(status), sampledAt: status.sampledAt, text: renderRuntimeState(status) };
}

export function registerRuntimeStatus(ctx, hub) {
  ctx.tools.register({ name: 'runtime_status', description: 'Read a fresh snapshot of this turn, retained context estimates, and registered background jobs. This does not wait, consume job output, or establish task success.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: { schema: { type: 'object', additionalProperties: true }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute(_args, { agent }) { const { changeKey, ...value } = collectRuntimeStatus(agent, hub); return value; },
  });
}
