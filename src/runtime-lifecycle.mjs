// Cordis disposes sibling effects concurrently. Keep the complete runtime in
// one child and retire its owned work before releasing any hooks or resources.
export async function mountRuntimeLifecycle(ctx, setup) {
  let runtime, releaseOwners;
  ctx.effect(function* () {
    runtime = ctx.plugin({ name: 'omd-owned-runtime', apply: setup });
    yield () => releaseOwners?.();
    yield runtime.dispose;
    yield async () => {
      // Cordis reports disposer failures and continues teardown. Report the
      // original failure here too, then let the child release its resources.
      try {
        await runtime;
        const hub = runtime.ctx.get('omd');
        releaseOwners = hub?.runtimeRetirement.holdUntilRuntimeDisposed();
        await hub?.close();
      } catch (error) { ctx.logger.error(error); }
    };
  }, 'OMD foreground retirement before runtime disposal');
  await runtime;
}
