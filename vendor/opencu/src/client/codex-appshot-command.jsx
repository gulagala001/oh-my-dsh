import React, {useCallback, useEffect, useRef} from 'react';
import {CodexCuIcon} from './codex-cu-icons.jsx';
import {createCodexAppshotAction} from './codex-window-share.jsx';
import {formatCodexCuMessage} from './codex-cu-i18n.mjs';
import {useWindowShareAction} from './window-share.jsx';

// DSH's stock composer + launches commandUi's merged action menu. This list
// seat owns only our capture lifetime; it renders no extra composer control.
export function installCodexAppshotCommand(ctx, useAvailable) {
  return ctx.inject(['commandUi', 'sessions', 'conversation'], scope => {
    const entries = new Map();
    const conversation = scope.conversation;
    function AppshotIcon(props) {
      return <CodexCuIcon {...props} name="shared:W_"/>;
    }
    const currentEntry = sessionId => {
      const entry = entries.get(sessionId);
      return entry && scope.sessions.scope(sessionId) === entry.sessionScope ? entry : null;
    };
    function AppshotSeat({sessionId, inputActions}) {
      const available = useAvailable(sessionId);
      const entry = useRef(null);
      const notify = useCallback(error => {
        const current = currentEntry(sessionId);
        if (current?.controller.canUse) {
          conversation.input.for(current.sessionScope).notify('error', error.message);
        }
      }, [sessionId]);
      const controller = useWindowShareAction({sessionId, inputActions,
        conversation, disabled: !available,
        formatMessage: formatCodexCuMessage, onError: notify});
      if (entry.current?.sessionId === sessionId) entry.current.controller = controller;
      useEffect(() => {
        const sessionScope = scope.sessions.scope(sessionId);
        if (!sessionScope) return;
        const owned = {sessionId, sessionScope, controller};
        entry.current = owned;
        entries.set(sessionId, owned);
        return () => {
          if (entries.get(sessionId) === owned) entries.delete(sessionId);
          entry.current = null;
        };
      }, [sessionId]);
      return null;
    }
    scope.effect(() => scope.commandUi.register({
      name: 'opencu-appshot', label: () => createCodexAppshotAction({formatMessage: formatCodexCuMessage}).label, icon: AppshotIcon,
      available: ({sessionId}) => {
        const controller = currentEntry(sessionId)?.controller;
        return controller?.canUse === true && !controller.busy;
      },
      ui: {kind: 'action', run: ({sessionId}) => {
        const current = currentEntry(sessionId);
        if (current?.controller.canUse && !current.controller.busy) {
          void current.controller.captureCurrent().catch(error => {
            if (currentEntry(sessionId) === current) {
              conversation.input.for(current.sessionScope).notify('error', error.message);
            }
          });
        }
      }},
    }));
    scope.slots.inject('conversation.input.overlay', () => scope.slots.register({
      name: 'conversation.input.overlay', id: 'opencu-appshot-action', order: 25,
    }, AppshotSeat));
    scope.effect(() => () => {
      for (const entry of entries.values()) entry.controller.cancel();
      entries.clear();
    });
  });
}
