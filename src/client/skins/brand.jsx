import React, { useSyncExternalStore } from 'react';
import { GlyphBrand } from '../../../plugins/glyph-theme/src/theme/brand.jsx';
import { TerminalMark } from './claude-cli-terminal/presentation.jsx';

const presentations = { 'glyph-motion': GlyphBrand, 'claude-cli-terminal': TerminalMark };
const presentation = state => state.active !== false && state.advanced.brand.logo === 'theme'
  && presentations[state.skins.find(skin => skin.id === state.selected)?.layout];

// Brand slots may have no registered entry: the native hero renders its fish
// as an outlet fallback. Register only while this theme owns the brand so both
// empty slots and existing providers work, and native fallbacks return on exit.
export function applySkinBrands(ctx, getRuntime, { priority = 0 } = {}) {
  for (const name of ['conversation.hero.brand.mark', 'sidebar.brand.mark']) {
    ctx.slots.inject(name, () => {
      const runtime = getRuntime();
      function Component(props) {
        const Mark = presentation(useSyncExternalStore(runtime.subscribe, runtime.getSnapshot));
        return Mark ? <Mark {...props} small={name.startsWith('sidebar')} runtime={runtime}/> : null;
      }
      let release;
      const sync = () => {
        const active = presentation(runtime.getSnapshot());
        // One seat per owner also makes transitions independent of listener
        // order: the new theme never collides with the departing theme's seat.
        if (active && !release) release = ctx.slots.register({ name, id: 'omd-skin-brand', priority: priority - 30 }, Component);
        else if (!active && release) { const off = release; release = undefined; off(); }
      };
      const off = runtime.subscribe(sync); sync();
      return () => { off(); release?.(); };
    });
  }
}
