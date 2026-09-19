// One immutable setting sample governs schemas and execution until the next request.
export function installBackground(ctx, hub, isX) {
  const snapshots = new WeakMap(), registered = new WeakSet(), waiting = new WeakMap();
  hub.backgroundOptions = agent => snapshots.get(agent) ?? {};
  hub.prepareBackground = agent => {
    const options = isX(agent.session) && agent.session.header.origin !== 'subagent' && hub.config().backgroundTasksEnabled
      ? { softYieldMs: 10000, interruptibleWait: true, completionPreviewBytes: 2048, completionBatchBytes: 8192 } : {};
    snapshots.set(agent, options);
    const jobs = ctx.get('jobs');
    if (!registered.has(agent) && jobs?.setOwnerOptions) {
      registered.add(agent);
      agent.ctx.effect(() => jobs.setOwnerOptions(agent, () => snapshots.get(agent) ?? {}));
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
