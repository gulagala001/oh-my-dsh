import { symbols } from '@deepseek-ai/cordis';
const original = value => value?.[symbols.original] ?? value;
const installed = Symbol.for('omd.file-upload-resolver-v017');
// Cordis exposes these states as a TypeScript const enum.
const PENDING = 0, LOADING = 1, ACTIVE = 2, FAILED = 3, DISPOSED = 4, UNLOADING = 5;
// These pinned DSH hosts register this exact native callback. Legacy entries
// carry no owner metadata: never repair an unknown or third-party callback.
// Keep this signature aligned with the actual SessionController SDK contract.
const legacyNativeResolver = 'async(sessionId)=>{constresult=awaitthis.agents.resolveAgent(sessionId);if("error"inresult)throwresult.error;returnresult.agent;}';
const isLegacyNativeResolver = resolve => typeof resolve === 'function'
  && Function.prototype.toString.call(resolve).replace(/\s/g, '') === legacyNativeResolver;

// DSH 0.1.7's disposer compares a callback through Cordis's traced getter:
// the wrapper differs from the stored callback, so removal leaves it registered.
// Use the raw receiver for this identity-only method; keep the host implementation.
export function installFileUploadCompatibility(ctx) {
  const root = ctx.root;
  if (root[installed]) return;
  root[installed] = true;
  root.inject(['fileUploads'], async scope => {
    const uploads = original(scope.fileUploads), register = uploads.registerAgentResolver;
    const initial = uploads.agentResolver;
    const nativeInitial = isLegacyNativeResolver(initial);
    const controllers = [...ctx.loader.entries()]
      .filter(entry => entry.options.name === '@deepseek-ai/dsh-api-session-controller')
      .map(entry => entry.fiber).filter(Boolean);
    // During bundle re-enable, the old generation can still be unloading.
    // Prefer a current generation so its valid resolver is never cleared for an old one.
    const controller = [ACTIVE, LOADING, PENDING, FAILED, UNLOADING, DISPOSED]
      .map(state => controllers.find(fiber => fiber.state === state)).find(Boolean);
    const controllerState = controller?.state;
    // An inactive generation cannot resolve new requests. Its traced disposer
    // may leave the callback behind; clear it before dependencies activate again.
    const clearedInitial = nativeInitial && [PENDING, UNLOADING, DISPOSED].includes(controllerState);
    if (clearedInitial) uploads.agentResolver = undefined;
    // The initial controller may have registered before OMD finished loading.
    if (nativeInitial && controller && ![UNLOADING, DISPOSED].includes(controller.state)) controller.effect(() => () => {
      if (uploads.agentResolver === initial) uploads.agentResolver = undefined;
    }, 'OMD file-upload resolver cleanup');
    const bound = resolve => register.call(uploads, resolve);
    const descriptor = Object.getOwnPropertyDescriptor(uploads, 'registerAgentResolver');
    Object.defineProperty(uploads, 'registerAgentResolver', { value: bound, configurable: true, writable: true });
    scope.effect(() => () => {
      if (uploads.registerAgentResolver !== bound) return;
      if (descriptor) Object.defineProperty(uploads, 'registerAgentResolver', descriptor);
      else delete uploads.registerAgentResolver;
    });
    // During the first live installation, replacement services can invalidate
    // SessionController before this compatibility plugin becomes active. Recover
    // only its known stale-registration failure, never an unrelated startup error.
    // A constructor failure is reported only after its asynchronous teardown.
    // Re-enable can reach us during UNLOADING, before that failure becomes visible.
    if (nativeInitial && [FAILED, UNLOADING].includes(controllerState)) {
      let failure;
      try { await controller.await(); } catch (error) { failure = error; }
      if (failure?.message === 'file-upload: Agent resolver is already registered'
        && scope.fiber?.uid !== null && [LOADING, ACTIVE].includes(scope.fiber?.state)
        && controller.state === FAILED && uploads.registerAgentResolver === bound
        && (uploads.agentResolver === initial || clearedInitial && uploads.agentResolver === undefined)) {
        uploads.agentResolver = undefined;
        await controller.restart();
      }
    }
  });
  root.effect(() => () => { delete root[installed]; });
}
