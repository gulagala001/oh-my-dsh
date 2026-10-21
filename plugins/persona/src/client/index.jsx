import React from 'react';
import { acquirePermissionMenu } from './permission-menu.jsx';
import { SessionMenu } from './session-menu.jsx';
import { PersonaSettings, createSettingsClient } from './settings.jsx';
import css from './style.css';
export { PersonaSettings } from './settings.jsx';
export const inject = ['slots'];
const roots = globalThis[Symbol.for('dsh-persona-plugin.client.v1')] ??= new WeakMap();
export function acquirePersonaClient(ctx, { embedded = false } = {}) {
  const root = ctx.root;
  let entry = roots.get(root);
  if (!entry) {
    const client = createSettingsClient(), style = document.createElement('style');
    style.dataset.plugin = 'dsh-persona-plugin'; style.textContent = css; document.head.append(style);
    entry = { client, style, owners: new Map(), releasePage: null };
    roots.set(root, entry);
    entry.fiber = root.inject(['slots'], scope => {
      acquirePermissionMenu(scope, 'persona', SessionMenu);
      entry.scope = scope;
      entry.refreshPage = () => {
        const visible = ![...entry.owners.values()].some(owner => owner.embedded);
        if (!visible) { entry.releasePage?.(); entry.releasePage = null; }
        else if (!entry.releasePage) entry.releasePage = scope.slots.register({ name: 'settings.section', id: 'dsh-persona-plugin', order: 45, label: () => 'Persona' },
          () => <section className="dsp-set-page"><div className="dsp-settings"><h2>Persona</h2><div className="dsp-set-card"><PersonaSettings client={client}/></div></div></section>);
      };
      scope.slots.inject('settings.section', () => { entry.refreshPage(); return () => { entry.releasePage?.(); entry.releasePage = null; }; });
    });
  }
  const token = {}; entry.owners.set(token, { embedded }); entry.refreshPage?.();
  ctx.effect(() => () => {
    entry.owners.delete(token);
    if (entry.owners.size) { entry.refreshPage?.(); return; }
    roots.delete(root); entry.client.dispose(); entry.style.remove(); entry.releasePage?.(); return entry.fiber.dispose();
  });
  return entry.client;
}
export function apply(ctx) { acquirePersonaClient(ctx); }
