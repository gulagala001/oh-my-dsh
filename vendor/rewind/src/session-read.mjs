// Materialize one native immutable observation without activating an Agent.
export async function readNativeSession(ctx, id, signal) {
  signal?.throwIfAborted();
  const observation = await ctx.sessionQuery.observeSession(id, { signal, projectionMode: 'none' });
  try {
    signal?.throwIfAborted();
    if (observation.header.id !== id || !Array.isArray(observation.events)) throw Error('Native Session observation identity or events are invalid');
    return { meta: observation.header, events: observation.events, inheritedEventCount: observation.inheritedEventCount };
  } finally { observation[Symbol.dispose](); }
}
