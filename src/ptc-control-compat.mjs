import { isDeepStrictEqual } from 'node:util';

const controls = new Set(['job_output', 'job_list', 'job_kill', 'runtime_status']);
const adapters = new WeakMap();

function unsupported(detail) {
  return Object.assign(new Error(`The DSH tools component cannot safely present direct PTC controls: ${detail}`),
    { code: 'PTC_CONTROL_COMPAT_UNSUPPORTED' });
}

// This SDK has no public selective PTC presentation policy. Probe the actual
// execution boundary before adapting its one collapse predicate; registrations,
// lookup, scheduling, policy and nested dispatch stay with the host. Retire this
// adapter when a matching public selective-presentation API is available.
function verifyBoundary(runtime) {
  if (!['collapses', 'modeFor', 'get', 'schemas', 'createExecution', 'executionMode', 'resolveExecution']
    .every(name => typeof runtime[name] === 'function')) throw unsupported('the scoped execution boundary is missing');
  const descriptor = Object.getOwnPropertyDescriptor(runtime, 'collapses');
  if (descriptor && (!descriptor.configurable || !('value' in descriptor))) throw unsupported('the collapse predicate is not replaceable');
  try {
    const original = runtime.collapses;
    for (const mode of ['ptc', 'native']) for (const name of ['run_code', ...controls, 'omd-business-probe']) for (const nested of [false, true]) {
      if (original.call({ modeFor: () => mode }, name, {}, nested) !== (!nested && mode === 'ptc' && name !== 'run_code'))
        throw Error('the collapse predicate has different semantics');
    }
    const probe = Object.create(runtime), agent = {}, definition = { name: 'job_output', isConcurrencySafe: () => true };
    let calls = 0, collapsed = true, expectedNested = false;
    Object.assign(probe, {
      get: (name, scope) => {
        if (name !== definition.name || scope !== agent) throw Error('execution lookup lost its agent scope');
        return definition;
      },
      collapses: (name, scope, nested) => {
        if (name !== definition.name || scope !== agent || nested !== expectedNested) throw Error('the collapse boundary lost its agent or nested identity');
        calls++; return collapsed;
      },
      concludingExecutions: new WeakSet(), deferredContexts: new WeakMap(),
      contentFinalizers: new WeakMap(), contentProjectors: new WeakMap(), cancellationStates: new WeakMap(),
    });
    for (const deny of [true, false]) for (const nested of [false, true]) {
      collapsed = deny; expectedNested = nested; calls = 0;
      const input = { name: definition.name, agent, arguments: {}, callId: 'omd-ptc-capability-probe',
        signal: new AbortController().signal, ...(nested ? { parent: Symbol('probe-parent') } : {}) };
      if (runtime.resolveExecution.call(probe, input.name, agent, nested) !== (deny ? undefined : definition) || calls !== 1)
        throw Error('execution resolution does not honor the collapse predicate');
      if (runtime.executionMode.call(probe, input)?.kind !== (deny ? 'exclusive' : 'parallel') || calls !== 2)
        throw Error('the scheduler does not consult the collapse predicate');
      const prepared = runtime.createExecution.call(probe, input);
      if (calls !== 3 || (deny
        ? prepared.kind !== 'final-result' || prepared.result?.error?.info?.code !== 'UNKNOWN_TOOL'
        : prepared.kind !== 'ready' || prepared.exec?.agent !== agent || prepared.exec?.parent !== input.parent))
        throw Error('execution preparation does not consult the collapse predicate');
    }
  } catch (error) { throw unsupported(error.message); }
  return descriptor;
}

export function installPtcControlCompatibility(ctx, runtime, admitted) {
  return ctx.effect(() => {
    let adapter = adapters.get(runtime);
    if (adapter && runtime.collapses !== adapter.wrapper) {
      if (!adapter.owners.size) {
        adapters.delete(runtime); adapter = undefined;
      } else {
        for (const name of ['run_code', ...controls]) {
          const calls = adapter.calls;
          try { runtime.collapses(name, undefined, false); }
          catch (error) { throw unsupported(`the current collapse wrapper cannot be probed: ${error.message}`); }
          if (adapter.calls === calls) throw unsupported('another collapse wrapper detached an active PTC adapter');
        }
      }
    }
    if (!adapter) {
      const descriptor = verifyBoundary(runtime), original = runtime.collapses, owners = new Set();
      const wrapper = function(name, scope, nested) {
        adapter.calls++;
        const collapsed = original.call(this, name, scope, nested);
        if (!collapsed || nested || !controls.has(name)) return collapsed;
        if ([...owners].some(owner => owner.admitted(scope, name)) && this.get(name, scope) !== undefined) return false;
        return collapsed;
      };
      const ownedDescriptor = { value: wrapper, configurable: true, writable: true, enumerable: descriptor?.enumerable ?? false };
      Object.defineProperty(runtime, 'collapses', ownedDescriptor);
      adapter = { owners, original, wrapper, descriptor, ownedDescriptor, calls: 0 }; adapters.set(runtime, adapter);
    }
    const owner = { admitted };
    adapter.owners.add(owner);
    return () => {
      adapter.owners.delete(owner);
      if (adapter.owners.size) return;
      // A later wrapper may still call ours. Leave its property intact; the
      // empty owner set makes our captured wrapper completely transparent.
      if (!isDeepStrictEqual(Object.getOwnPropertyDescriptor(runtime, 'collapses'), adapter.ownedDescriptor)) return;
      if (adapter.descriptor) Object.defineProperty(runtime, 'collapses', adapter.descriptor);
      else delete runtime.collapses;
      adapters.delete(runtime);
    };
  });
}

export const isPtcControl = name => controls.has(name);
