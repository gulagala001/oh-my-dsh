import { symbols } from '@deepseek-ai/cordis';

// One immutable setting sample governs schemas and execution until the next request.
export function installBackground(ctx, hub, isX) {
  const snapshots = new WeakMap(), registered = new WeakMap(), waiting = new WeakMap();
  hub.backgroundOptions = agent => snapshots.get(agent) ?? {};
  hub.prepareBackground = agent => {
    const options = isX(agent.session) && agent.session.header.origin !== 'subagent' && hub.config().backgroundTasksEnabled
      ? { softYieldMs: 10000, interruptibleWait: true, completionPreviewBytes: 2048, completionBatchBytes: 8192 } : {};
    snapshots.set(agent, options);
    const jobs = ctx.get('jobs');
    // Cordis returns a fresh traced proxy on every read of the same service.
    const instance = jobs?.[symbols.original] ?? jobs;
    const previous = registered.get(agent);
    if (previous?.instance === instance) return;
    previous?.dispose();
    registered.delete(agent);
    if (jobs?.setOwnerOptions) {
      const dispose = agent.ctx.effect(() => jobs.setOwnerOptions(agent, () => snapshots.get(agent) ?? {}));
      registered.set(agent, { instance, dispose });
    }
  };
  hub.backgroundWaiting = agent => Boolean(agent && waiting.get(agent)?.size);
  ctx.on('tools/execute', async (exec, next) => {
    if (exec.parent || !exec.agent || exec.name !== 'job_output' || exec.arguments?.wait !== true
        || !hub.backgroundOptions(exec.agent).interruptibleWait) return next();
    let calls = waiting.get(exec.agent);
    if (!calls) { calls = new Set(); waiting.set(exec.agent, calls); }
    calls.add(exec.callId);
    try { return await next(); } finally { calls.delete(exec.callId); }
  }, { global: true });
}
