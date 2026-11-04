import { AsyncLocalStorage } from 'node:async_hooks';
import { isDeepStrictEqual } from 'node:util';
import { symbols } from '@deepseek-ai/cordis';
import { readNativeSession } from './session-read.mjs';

// Native ordinary forks are independent Sessions. OMD keeps only the lineage
// needed to resolve its own sidecar archives and choices; never alter headers.
export function forkParentOf(header, store) {
  return header?.parentSession ?? (header?.isSeeded && header.origin !== 'subagent'
    ? store?.peek?.(header.id)?.forkParent : undefined);
}

export function installForkProvenance(ctx, store) {
  ctx.inject(['sessionController', 'sessionQuery'], scope => install(scope, store));
}

function install(ctx, store) {
  const controller = ctx.sessionController?.[symbols.original] ?? ctx.sessionController;
  const original = controller?.fork;
  if (typeof original !== 'function') throw Error('Native SessionController.fork is unavailable');
  const descriptor = Object.getOwnPropertyDescriptor(controller, 'fork');
  const calls = new AsyncLocalStorage();
  let closed = false;
  ctx.on('session/created', session => {
    const pending = calls.getStore(), count = session.inheritedEventCount;
    if (closed || !pending || pending.recorded || !session.header.isSeeded || session.header.origin === 'subagent'
      || session.id === pending.source.meta.id || !Number.isSafeInteger(count) || count <= 0
      || count > pending.source.events.length || session.header.cwd !== pending.source.meta.cwd
      || !isDeepStrictEqual(session.snapshotEvents().slice(0, count), pending.source.events.slice(0, count))) return;
    pending.recorded = true;
    const state = store.state(session.id);
    state.forkParent = pending.source.meta.id;
    state.parentSession = state.forkParent;
    store.save(state);
  }, { global: true, prepend: true });
  const fork = async function (...args) {
    if (closed || typeof args[0]?.sessionId !== 'string') return original.apply(this, args);
    let source;
    try { source = await readNativeSession(ctx, args[0].sessionId); }
    catch { return original.apply(this, args); } // Preserve the native error contract.
    return calls.run({ source, recorded: false }, () => original.apply(this, args));
  };
  Object.defineProperty(controller, 'fork', { configurable: true, writable: true, value: fork });
  ctx.effect(() => () => {
    closed = true;
    if (Object.getOwnPropertyDescriptor(controller, 'fork')?.value !== fork) return;
    if (descriptor) Object.defineProperty(controller, 'fork', descriptor);
    else delete controller.fork;
  });
}
