import React, { useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { decorateSlotComponent } from './slot-decoration.mjs';
import { rewindMessages, rewindPortalTargets, sameRewindTargets } from './rewind-compat.mjs';

export function RewindPortals({ sessionId, useChat, source, Action, openRestoredSession }) {
  const chat = useChat(snapshot => snapshot);
  const window = useSyncExternalStore(source.subscribe.bind(source), source.getSnapshot.bind(source));
  const messages = useMemo(() => rewindMessages(window.entries), [window]);
  const [targets, setTargets] = useState([]);
  useLayoutEffect(() => {
    let active = true, queued = false;
    const refresh = () => {
      if (!active) return;
      const next = rewindPortalTargets(chat, messages, sessionId, document);
      setTargets(current => sameRewindTargets(current, next) ? current : next);
    };
    const observer = new MutationObserver(() => {
      if (!active || queued) return;
      queued = true;
      queueMicrotask(() => { queued = false; refresh(); });
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true,
      attributeFilter: ['data-chat-anchor-key', 'data-chat-flow-kind', 'data-conversation-session'] });
    refresh();
    return () => { active = false; observer.disconnect(); };
  }, [chat, messages, sessionId]);
  return targets.map(target => createPortal(
    <Action matched={target.matched} sessionId={sessionId} openRestoredSession={openRestoredSession}/>,
    target.container, `${sessionId}:${target.matched.messageSeq}`));
}

export function applyRewindCompatibility(ctx) {
  const name = 'conversation.session.header.actions';
  ctx.slots.inject(name, () => {
    const slots = { ctx: ctx.slots.ctx,
      entries: key => ctx.slots.entries(key).filter(entry => entry.options.id === 'turn-rewind-portals'),
      entriesOfSlot: key => ctx.slots.entriesOfSlot(key).filter(entry => entry.options.id === 'turn-rewind-portals'),
      subscribe: (key, listener) => ctx.slots.subscribe(key, listener),
      register: (options, component) => ctx.slots.register(options, component),
    };
    return decorateSlotComponent(slots, name, () => true, original => {
      // Adapt the installed plugin only; its action owns the original dialog,
      // preview, confirmation and restore APIs. Never install another engine.
      const Action = ctx.modules.loadCache.get('@anionex/dsh-turn-rewind')?.exports?.RewindMessageAction;
      const Original = original.component;
      function Rewind(props) {
        if (!Action || !props.useChat) return <Original {...props}/>;
        const source = ctx.sessions.binding(props.sessionId).eventSource;
        return <RewindPortals {...props} source={source} Action={Action}/>;
      }
      return Rewind;
    });
  });
}
