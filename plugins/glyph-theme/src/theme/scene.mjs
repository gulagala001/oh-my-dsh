import {sampleClickWaves,sampleUltraWaves} from './waves.mjs';

// One screen-space character grid for the whale, water and interaction waves.
// The pointer refracts this existing scene; it never paints a separate particle layer.
export function createCharacterScene() {
  let cols = 0, rows = 0, values = new Float32Array(), rect, stepX = 6, stepY = 8;
  function begin(bounds, width, height) {
    rect = bounds;
    stepX = Math.max(6, Math.ceil(Math.sqrt(width * height / 40000) * .86));
    stepY = Math.round(stepX * 4 / 3);
    const nextCols = Math.ceil(width / stepX), nextRows = Math.ceil(height / stepY);
    if (nextCols !== cols || nextRows !== rows) {
      cols = nextCols; rows = nextRows; values = new Float32Array(cols * rows);
    } else values.fill(0);
    return {stepX,stepY};
  }
  function write(char, x, y, color, light) {
    const gx = Math.floor(x / stepX), gy = Math.floor(y / stepY);
    if (gx < 0 || gx >= cols || gy < 0 || gy >= rows) return;
    const index = gy * cols + gx;
    values[index] = Math.max(values[index], Math.min(1, light));
  }
  function paint(now, trails, still, glyph, ink, waves = {clicks:[],ultra:[]}) {
    if (!rect) return;
    const active = still ? [] : trails.filter(p => now - p.time < 900);
    const clicks=still?[]:waves.clicks,ultraWaves=still?[]:waves.ultra;
    const hex=ink.match(/^#([a-f\d]{3}|[a-f\d]{6})$/i)?.[1];
    const expanded=hex?.length===3?[...hex].map(c=>c+c).join(''):hex;
    const rgb=expanded?[0,2,4].map(i=>parseInt(expanded.slice(i,i+2),16)):(ink.match(/[\d.]+/g)||['255','255','255']).slice(0,3).map(Number);
    const chars = '·:;=+×#';
    for (let row = Math.max(0, Math.floor(rect.top / stepY)); row < Math.min(rows, Math.ceil(rect.bottom / stepY)); row++) {
      for (let col = Math.max(0, Math.floor(rect.left / stepX)); col < Math.min(cols, Math.ceil(rect.right / stepX)); col++) {
        const x = (col + .5) * stepX, y = (row + .5) * stepY;
        let dx = 0, dy = 0, energy = 0;
        for (const point of active) {
          const age = (now - point.time) / 900;
          const vx = x - point.x, vy = y - point.y, distance = Math.hypot(vx, vy) || 1;
          if (distance > 145) continue;
          const edge = Math.max(0, 1 - distance / 145);
          const ripple = Math.sin(distance * .065 - age * 8) * edge * (1 - age);
          const vortex = Math.max(0, 1 - distance / 85) ** 2 * (1 - age);
          dx += (vx / distance * ripple - vy / distance * vortex) * 3;
          dy += (vy / distance * ripple + vx / distance * vortex) * 3;
          energy = Math.max(energy, vortex, Math.abs(ripple) * .5);
        }
        const water=clicks.length?sampleClickWaves(clicks,x,y):{height:0,dx:0,dy:0};
        dx+=water.dx;dy+=water.dy;
        const ultra=ultraWaves.length?sampleUltraWaves(ultraWaves,x,y):{strength:0,height:0,dx:0,dy:0,light:0};
        // Keep the pointer local; the wider Ultra swell deforms the entire
        // shared surface, including the whale, before one glyph is drawn per cell.
        dx=Math.tanh(dx/12)*12+ultra.dx;
        dy=Math.tanh(dy/12)*12+ultra.dy;
        const sampleX = Math.round(col + Math.tanh(dx / 42) * 42 / stepX);
        const sampleY = Math.round(row + Math.tanh(dy / 48) * 48 / stepY);
        const base = sampleX >= 0 && sampleX < cols && sampleY >= 0 && sampleY < rows ? values[sampleY * cols + sampleX] : 0;
        const surface=Math.max(0,ultra.light);
        const light = Math.max(0,Math.min(1,Math.max(base*(1+energy*.3+water.height*.25+ultra.light*1.25)+energy*.04
          +Math.max(0,water.height)*.18+surface*.18,surface*.3+Math.max(0,ultra.height)*.52+ultra.strength*.04)));
        if (light < .025) continue;
        const tint=Math.min(.96,ultra.strength*1.2);
        const color=tint>.001?`rgb(${rgb.map((c,i)=>Math.round(c+(ultra.color[i]-c)*tint)).join(',')})`:ink;
        glyph(chars[Math.min(chars.length - 1, Math.floor(light * chars.length))], x, y, color, light, stepY + .6);
      }
    }
  }
  return {begin,write,paint};
}
