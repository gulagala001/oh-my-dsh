import React, { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import { createPermissionPicker } from '../../lib/host/permission-native.factory.mjs';
import { decorateSlotComponent } from './slot-decoration.mjs';
import { useMainConversation } from './main-conversation.mjs';

const PermissionSelect = createPermissionPicker(require), ScopeContext = createContext(null);
const roots = globalThis[Symbol.for('dsh-persona-plugin.permission-menu.v1')] ??= new WeakMap();
const NativeMenu = ({ sessionId, started, locked, ...props }) => <Menu {...props}/>;
// One native picker owns focus and permission confirmation. Contributors only
// add their own menu groups and can independently mount, unmount or reload.
export function acquirePermissionMenu(ctx, id, Component) {
  const root = ctx.root;
  let entry = roots.get(root);
  if (!entry) {
    entry = { owners: new Map(), listeners: new Set(), revision: 0 };
    roots.set(root, entry);
    const subscribe = listener => { entry.listeners.add(listener); return () => entry.listeners.delete(listener); };
    function SharedMenu(props) {
      const scope = useContext(ScopeContext), version = useSyncExternalStore(subscribe, () => entry.revision);
      const Combined = useMemo(() => {
        const components = new Map();
        for (const owner of entry.owners.values()) if (!components.has(owner.id)) components.set(owner.id, owner.Component);
        return [...components.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, component]) => component).reverse().reduce((Next, Contribution) => function Group(props) {
          return <Contribution {...props} MenuComponent={Next}/>;
        }, NativeMenu);
      }, [version]);
      return <Combined {...props} {...scope}/>;
    }
    entry.fiber = root.inject(['slots'], scope => scope.slots.inject('conversation.input.permission', () => decorateSlotComponent(scope.slots, 'conversation.input.permission',
      (_key, row) => row.component.name === 'PermissionSelect' && row.locale === 'permission.access' && typeof row.inject === 'function', original => {
        const Original = original.component;
        return function PersonaPermissions(props) {
          const main = useMainConversation(props);
          const started = props.useSessions(sessions => sessions.byId[props.sessionId]?.blank === false);
          return main ? <ScopeContext.Provider value={{ sessionId: props.sessionId, started, locked: props.locked }}>
            <PermissionSelect key={props.sessionId} {...props} MenuComponent={SharedMenu}/>
          </ScopeContext.Provider> : <Original {...props}/>;
        };
      })));
  }
  const token = {}, publish = () => { entry.revision++; for (const listener of entry.listeners) listener(); };
  entry.owners.set(token, { id, Component }); publish();
  ctx.effect(() => () => {
    entry.owners.delete(token); publish();
    if (entry.owners.size) return;
    roots.delete(root); entry.listeners.clear(); return entry.fiber.dispose();
  });
}
