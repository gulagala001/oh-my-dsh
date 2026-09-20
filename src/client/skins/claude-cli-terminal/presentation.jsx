import React, { useSyncExternalStore } from 'react';
import { decorateSlot } from '#opencu/src/client/slot-decoration.mjs';

// Decorate the host's actual brand seats. No replacement navigation or shadow
// settings state: switching skins immediately restores the original occupants.
export function applyTerminalPresentation(ctx, getRuntime) {
  for (const name of ['conversation.hero.brand.mark', 'sidebar.brand.mark']) {
    ctx.slots.inject(name, () => decorateSlot(ctx.slots, name, () => true, original => {
      const Original = original.component;
      function TerminalMark(props) {
        const runtime = getRuntime();
        const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
        const active = state.skins.find(s => s.id === state.selected)?.layout === 'claude-cli-terminal';
        if (!active) return <Original {...props}/>;
        return name === 'sidebar.brand.mark'
          ? <span className="omd-cli-mark" aria-hidden="true">✳</span>
          : <span className="omd-cli-welcome"><span className="omd-cli-glyph" aria-hidden="true">{' ▗▄▄▄▖\n▐ ▪ ▪ ▌\n ▀▚▄▞▀'}</span><span><strong>Oh My DSH</strong><small>TERMINAL WORKSPACE</small></span></span>;
      }
      return { options: { name, ...original.options, priority: (original.options.priority ?? 0) - 1 }, component: TerminalMark };
    }));
  }
}
