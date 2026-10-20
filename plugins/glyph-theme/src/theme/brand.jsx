import React from 'react';
import { whalePath } from './whale-path.mjs';

// The navigation mark is only 28 px wide. Subpixel character sampling erases
// its outline, so keep this small identity mark as a crisp vector. The hero
// still uses the animated character renderer.
export function GlyphBrand({ small = false }) {
  if (!small) return <span className="omd-glyph-brand" data-glyph-size="hero" aria-hidden="true"/>;
  return <span className="omd-glyph-nav-brand" data-glyph-external="" aria-hidden="true">
    <svg viewBox="0 0 23.5 17.1" width="28" height="24" fill="currentColor"><path d={whalePath}/></svg>
  </span>;
}
