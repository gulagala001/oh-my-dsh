import React from 'react';
import css from './style.css';
import { NS, zh, en } from './locale.mjs';
import { Env } from './ui.jsx';
import { SkillsPage } from './skills.jsx';
import { McpPage } from './mcp.jsx';
import { InstructionsPage } from './instructions.jsx';
import { CommandsPage } from './commands.jsx';
import { HooksPage } from './hooks.jsx';

export const inject = ['slots', 'locale'];
const identity = Symbol.for('dsh.extensions.client');
const TABS = [['skills', SkillsPage], ['mcp', McpPage], ['instructions', InstructionsPage], ['commands', CommandsPage], ['hooks', HooksPage]];

/** Five tabs beside Installed and Discover on the Plugins page. */
function mount(ctx) {
  const disposers = [ctx.locale.register(NS, { zh, en })];
  const t = ctx.locale.bind(NS);
  const env = { t, subscribe: listener => ctx.locale.subscribe(listener), revision: () => ctx.locale.getSnapshot().revision };
  const style = document.createElement('style');
  style.dataset.plugin = 'dsh-extensions'; style.textContent = css; document.head.append(style);
  disposers.push(() => style.remove());
  TABS.forEach(([key, Page], index) => {
    const Tab = () => <Env.Provider value={env}><Page/></Env.Provider>;
    disposers.push(ctx.slots.inject('plugins.tab', () => ctx.slots.register({ name: 'plugins.tab', id: `dsh-extensions.${key}`, order: 100 + index, label: () => t(`tab.${key}`), locale: NS }, Tab)));
  });
  return () => { for (const dispose of disposers.reverse()) try { dispose?.(); } catch {} };
}

/** A standalone copy and a bundled copy may both load; only one contributes the tabs. */
export function apply(ctx) {
  if (typeof document === 'undefined') return;
  const shared = window[identity] ??= { owners: new Map(), leader: null };
  if (shared.owners.has(ctx)) return;
  ctx.effect(() => {
    const owner = { ctx, dispose: null };
    shared.owners.set(ctx, owner);
    const activate = () => {
      if (shared.leader) return;
      const next = shared.owners.values().next().value;
      if (next) { shared.leader = next; next.dispose = mount(next.ctx); }
    };
    activate();
    return () => {
      if (shared.owners.get(ctx) !== owner) return;
      shared.owners.delete(ctx);
      if (shared.leader === owner) { owner.dispose?.(); shared.leader = null; activate(); }
      if (!shared.owners.size && window[identity] === shared) delete window[identity];
    };
  });
}
