// Runtime hints belong to the Session owner, not the global Hub disposer.
// The native agent awaits agent.ctx effects before closing its write handle.
// Register the join while the owner is live, before publishing any hints.
export class RuntimeRetirement {
  constructor(hub) { this.hub = hub; this.owners = new Map(); this.closed = false; }
  holdUntilRuntimeDisposed() {
    const release = Promise.withResolvers(); this.runtimeReleased = release.promise;
    return () => release.resolve();
  }
  hostActive() { return this.hub.ctx.root?.fiber.state === 2; } // Cordis FiberState.ACTIVE
  track(agent) {
    const known = this.owners.get(agent.session.id);
    if (known?.agent === agent) return;
    if (this.closed) throw Error('OMD 服务正在退出');
    if (known) throw Error('会话运行时仍由先前 Agent 持有');
    const owner = { agent, closing: false, promise: null };
    // This is an ownership latch, not a liveness check on sessions.get(). Even
    // if teardown already passed whenIdle(), scope.dispose() joins our work.
    agent.ctx.effect(() => async () => {
      owner.closing = true;
      try {
        if (owner.promise) return await owner.promise;
        if (this.hostActive()) return await this.retire(owner, this.hub.context.dispose(agent.session.id), true);
      } finally {
        if (this.owners.get(agent.session.id) === owner) this.owners.delete(agent.session.id);
      }
    }, 'OMD runtime hint retirement');
    this.owners.set(agent.session.id, owner);
  }
  retire(owner, drained, inScope = false) {
    if (owner.promise) return owner.promise;
    if (!this.hostActive()) return Promise.resolve(null);
    // Once the scope disposer has returned, a late maintenance call cannot
    // re-acquire its handle. Only that disposer may enter with closing=true.
    if (owner.closing && !inScope) return Promise.resolve(null);
    const settled = Promise.withResolvers(), ready = Promise.withResolvers();
    owner.promise = settled.promise; owner.ready = ready.promise;
    void owner.promise.catch(() => {});
    void owner.ready.catch(() => {});
    const run = async () => {
      ready.resolve();
      await drained;
      if (!this.hostActive()) return null;
      try { return await this.hub.context.stripRuntime(owner.agent.session, { admit: () => this.hostActive() }); }
      finally {
        this.hub.context.releasing.add(owner.agent.session.id);
        this.hub.context.releaseState(owner.agent.session.id);
      }
    };
    const start = async () => {
      for (;;) {
        if (!this.hostActive()) return null;
        // Scope disposal has already crossed native quiescence and is waiting
        // on this very promise. Do not wait on maintenance from that disposer.
        if (inScope || owner.closing) return run();
        let entered = false, work;
        try {
          work = owner.agent.runMaintenance(async () => {
            entered = true;
            try { const value = await run(); settled.resolve(value); return value; }
            catch (error) { settled.reject(error); throw error; }
            finally {
              // Cleanup may be durable before the plugin hooks have left. Keep
              // queued followups behind maintenance until they can run stock.
              await this.runtimeReleased;
            }
          });
        } catch (error) {
          if (entered || error.message !== `agent "${owner.agent.session.id}" already has active work`) throw error;
          // Keep the cleanup promise pending while the existing owner works.
          // A busy rejection is not a completed retirement and never cancels it.
          await owner.agent.whenIdle();
          continue;
        }
        return work;
      }
    };
    start().then(value => { ready.resolve(); settled.resolve(value); }, error => { ready.reject(error); settled.reject(error); });
    return owner.promise;
  }
  quiescent() { return Promise.all([...this.owners.values()].map(owner => owner.ready)); }
  beginShutdown(drained) {
    this.closed = true;
    if (!this.hostActive()) return [];
    return [...this.owners.values()].map(owner => this.retire(owner, drained));
  }
}
