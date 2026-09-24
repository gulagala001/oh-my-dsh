import { symbols } from '@deepseek-ai/cordis';
const original = value => value?.[symbols.original] ?? value;
const installed = Symbol.for('omd.file-upload-resolver-v017');
// Cordis exposes these states as a TypeScript const enum.
const PENDING = 0, FAILED = 3;

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
    const controller = [...ctx.loader.entries()].find(entry => entry.options.name === '@deepseek-ai/dsh-api-session-controller')?.fiber;
    // A pending controller has already released its old generation, but the
    // traced disposer can leave its resolver behind. Let dependencies activate
    // it normally; do not wait until its next constructor fails registration.
    if (initial && controller?.state === PENDING) uploads.agentResolver = undefined;
    // The initial controller may have registered before OMD finished loading.
    if (initial && controller) controller.effect(() => () => {
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
    if (initial && controller?.state === FAILED) {
      let failure;
      try { await controller.await(); } catch (error) { failure = error; }
      if (failure?.message === 'file-upload: Agent resolver is already registered'
        && uploads.agentResolver === initial) {
        uploads.agentResolver = undefined;
        await controller.restart();
      }
    }
  });
  root.effect(() => () => { delete root[installed]; });
}
