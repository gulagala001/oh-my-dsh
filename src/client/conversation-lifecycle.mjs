import { createElement, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { decorateSlotComponent } from './slot-decoration.mjs';

const runtimeKey = Symbol.for('omd.conversation-lifecycle.v1');
// Cordis 4.0.5 emits status synchronously; effect cleanup starts in later
// microtasks. LOADING (1) and ACTIVE (2) are the only usable owner states.
const usableOwner = owner => owner.uid !== null && (owner.state === 1 || owner.state === 2);

// The Sidebar resource and its SessionProvider belong to ui-subagent. Keep
// only its Conversation consumer suspended while the source roster changes.
// Root ownership lets this presentation guard survive an OMD HMR gap.
export function installConversationLifecycle(ctx) {
  const root = ctx.root;
  if (root[runtimeKey]) return root[runtimeKey];
  const slots = root.get('slots');
  const listeners = new Set();
  let active = Boolean(root.get('conversation')), provider;
  const store = {
    getSnapshot: () => active,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
  };
  const publish = value => {
    if (active === value) return;
    // uiSession.provide() rebuilds retained bindings synchronously. Commit the
    // consumer unmount before that rebuild can withdraw its selector hooks.
    flushSync(() => { active = value; for (const listener of [...listeners]) listener(); });
  };
  const runtime = {
    begin(owner) {
      const token = { owner, ready: false };
      provider = token;
      publish(false);
      return {
        ready() { if (provider === token && usableOwner(owner)) { token.ready = true; publish(true); } },
        dispose() {
          if (provider !== token) return;
          publish(false);
          provider = undefined;
        },
      };
    },
  };
  Object.defineProperty(root, runtimeKey, { value: runtime });
  const suspendOwner = owner => {
    if (provider?.owner !== owner || usableOwner(owner)) return;
    provider.ready = false;
    publish(false);
  };
  root.on('internal/plugin', suspendOwner);
  root.on('internal/status', suspendOwner);
  root.effect(() => {
    const guard = (entry, requireHooks) => {
      const Original = entry.component;
      return function ConversationReady(props) {
        const ready = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
        return ready && (!requireHooks || (typeof props.useConversation === 'function'
          && typeof props.useInput === 'function' && props.inputActions !== undefined))
          ? createElement(Original, props) : null;
      };
    };
    const offMain = decorateSlotComponent(slots, 'main', key => key === 'conversation', entry => guard(entry, false));
    const offSidebar = decorateSlotComponent(slots, 'sidebar.chat.conversation', () => true, entry => guard(entry, true));
    return () => { offSidebar(); offMain(); };
  }, 'OMD: shared Conversation presentation lifecycle');
  // A later native provider may replace OMD entirely. It still owns its
  // controller and roster; the guard follows the public service lifecycle.
  root.inject(['conversation'], scope => {
    publish(provider === undefined || provider.ready);
    scope.effect(() => () => publish(false));
  });
  return runtime;
}
