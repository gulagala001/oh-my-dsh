// The water uses exactly the same cells as the 3D whale. Darkness is empty
// space in that grid; moving current crests gradually reveal its characters.
export function paintField(rect, now, glyph, ink, still, {stepX,stepY}) {
  if (!rect || rect.width < 100) return;
  const t = still ? 0 : now / 1000;
  for (let col = Math.floor(rect.left / stepX); col < Math.ceil(rect.right / stepX); col++) {
    const x=(col+.5)*stepX,u=(x-rect.left)/rect.width;
    const current=Math.sin(u*6.4-t*.35)*.13+Math.sin(u*13+t*.25)*.035;
    for (let row = Math.floor(rect.top / stepY); row < Math.ceil(rect.bottom / stepY); row++) {
      const y=(row+.5)*stepY,v=(y-rect.top)/rect.height;
      const distance=Math.min(Math.abs(v-.22-current),Math.abs(v-.57-current),Math.abs(v-.89-current));
      const crest = Math.exp(-((distance / .026) ** 2));
      if (crest < .06 && .5+.5*Math.sin(col*12.9898+row*78.233) < .98) continue;
      glyph('·', x, y, ink, .025 + crest * .16);
    }
  }
}
