import React, { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { mountGlyphRenderer } from '../../../../plugins/glyph-theme/src/theme/renderer.mjs';

const enabled = state => state.active !== false && state.skins.find(s => s.id === state.selected)?.layout === 'glyph-motion';

export function applyGlyphIntegration(ctx, getRuntime, { priority = 0 } = {}) {
  function Renderer() {
    const runtime = getRuntime();
    const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
    const active = enabled(state), ref = useRef();
    useLayoutEffect(() => {
      if (active && ref.current) return mountGlyphRenderer(ref.current, { reduced: state.reduceEffects });
    }, [active, state.reduceEffects]);
    return active ? createPortal(<canvas ref={ref} className="omd-glyph-canvas" aria-hidden="true"/>, document.body) : null;
  }
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'omd-glyph-renderer', order: 20, priority,
  }, Renderer));
}
