import React, { useCallback, useSyncExternalStore } from 'react';
import { decorateSlotComponent } from './slot-decoration.mjs';

const empty = { subscribe: () => () => {}, getSnapshot: () => undefined };

// The list summary can lag a loaded session during selection/reconnection.
// Keep the native components, dictionaries and selection RPC; feed their
// existing selectors the live projection when that session is bound.
export function useLivePreset(ctx, sessionId) {
  useSyncExternalStore(callback => ctx.sessions.list.subscribe(callback), () => ctx.sessions.list.getSnapshot().byId[sessionId]);
  const face = ctx.sessions.binding(sessionId)?.session.projections.faceOf('agentPreset') ?? empty;
  return useSyncExternalStore(callback => face.subscribe(callback), () => face.getSnapshot());
}

export function applyPresetProjection(ctx) {
  ctx.effect(() => decorateSlotComponent(ctx.slots, 'conversation.session.header.actions',
    (_key, entry) => entry.options.id === 'agent-preset', entry => {
      const Original = entry.component;
      return function PresetLabel(props) {
        const preset = useLivePreset(ctx, props.sessionId);
        const useSessions = useCallback(selector => props.useSessions(state => {
          if (preset === undefined) return selector(state);
          const session = state.byId[props.sessionId];
          return selector({ ...state, byId: { ...state.byId, [props.sessionId]: {
            ...session, projectionValues: { ...session?.projectionValues, agentPreset: preset },
          } } });
        }), [props.useSessions, props.sessionId, preset]);
        return <Original {...props} useSessions={useSessions}/>;
      };
    }));
  ctx.effect(() => decorateSlotComponent(ctx.slots, 'conversation.hero.agentPreset', () => true, entry => {
    const Original = entry.component;
    return function PresetSeat(props) {
      const preset = useLivePreset(ctx, props.sessionId);
      const useAgentPresetSeat = useCallback(selector => props.useAgentPresetSeat(state => selector(
        props.sessionId === undefined || preset === undefined || state.busy ? state : { ...state, current: preset ?? '' }
      )), [props.useAgentPresetSeat, props.sessionId, preset]);
      return <Original {...props} useAgentPresetSeat={useAgentPresetSeat}/>;
    };
  }));
}
