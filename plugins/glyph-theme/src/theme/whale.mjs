import { whalePath } from './whale-path.mjs';
import {whaleShots,shotBlend} from './director.mjs';

// Inflate the actual logo contour into a rounded closed 3D surface. The two
// skins and their rim have depth and normals; rotation never squashes a sprite.
export function createWhalePainter() {
  const path = new Path2D(whalePath);
  const probe = document.createElement('canvas').getContext('2d');
  const meshes = new Map();
  let epoch;
  function mesh(cols) {
    if (meshes.has(cols)) return meshes.get(cols);
    const step = 23.5 / cols, rows = Math.ceil(17.1 / step), distance = new Float32Array(cols * rows);
    const at = (x, y) => x < 0 || x >= cols || y < 0 || y >= rows ? 0 : distance[y * cols + x];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++)
      distance[y * cols + x] = probe.isPointInPath(path, (x + .5) * step, (y + .5) * step) ? 1e4 : 0;
    for (const direction of [1, -1]) {
      for (let y = direction > 0 ? 0 : rows - 1; y >= 0 && y < rows; y += direction) {
        for (let x = direction > 0 ? 0 : cols - 1; x >= 0 && x < cols; x += direction) {
          const i = y * cols + x;
          if (distance[i]) distance[i] = Math.min(distance[i], at(x - direction, y) + step,
            at(x, y - direction) + step, at(x - direction, y - direction) + step * Math.SQRT2,
            at(x + direction, y - direction) + step * Math.SQRT2);
        }
      }
    }
    const depth = (x, y) => Math.sqrt(at(x, y) * 3.2), points = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const d = at(x, y); if (!d) continue;
      const z = depth(x, y), dx = (depth(x + 1, y) - depth(x - 1, y)) / (2 * step);
      const dy = (depth(x, y + 1) - depth(x, y - 1)) / (2 * step), len = Math.hypot(dx, dy, 1);
      const px = (x + .5) * step - 11.75, py = (y + .5) * step - 8.55;
      for (const side of [1, -1]) points.push({ x:px, y:py, z:z * side, nx:-dx / len, ny:-dy / len, nz:side / len });
      if (d <= step * 1.1) {
        const norm = Math.hypot(dx, dy) || 1;
        for (const f of [-.6, 0, .6]) points.push({ x:px, y:py, z:z * f, nx:-dx / norm, ny:-dy / norm, nz:0 });
      }
    }
    meshes.set(cols, points);
    return points;
  }
  return function paintWhale({ r, small, scene = r, ambient = false, raster }, time, glyph, ink, muted, pointer) {
    epoch ??= time;
    const t = time === 0 ? 0 : Math.max(0, time - epoch);
    const shot=small?{primary:[Math.sin(t*.6)*.3,.08,1,0,0]}
      :ambient?{primary:[Math.sin(t*.2)*.35,.1,1.05,0,0]}:whaleShots(t);
    function renderView([yaw,pitch,zoom,focusX,focusY]) {
    const sy = Math.sin(yaw), cy = Math.cos(yaw), sx = Math.sin(pitch), cx = Math.cos(pitch);
    const rotate = (x, y, z) => {
      const rx = x * cy + z * sy, rz = -x * sy + z * cy;
      return [rx, y * cx - rz * sx, y * sx + rz * cx];
    };
    const focus = rotate(focusX, focusY, 0);
    const macro = Math.max(0, Math.min(1, (zoom - 1) / 2));
    const centerX = r.left + r.width / 2;
    const centerY = r.top + r.height / 2 - (small ? 0 : 24 * (1 - macro))
      + macro * (scene.top + scene.height * .38 - r.top - r.height / 2);
    const scale = (small ? Math.min(r.width * .9 / 23.5, r.height * .82 / 17.1)
      : Math.min(scene.width * .72 / 23.5, r.height * 1.4 / 17.1)) * zoom;
    const cellX = small ? 1.25 : raster?.stepX || 6, cellY = small ? 1.45 : raster?.stepY || 8, pixels = new Map();
    for (const p of mesh(small ? 24 : 148)) {
      // A travelling bend reaches the tail after the body. The lower fin has
      // its own stroke; breathing and buoyancy stay small and continuous.
      const tail = Math.max(0, (p.x - 1) / 10.75);
      const bend = Math.sin(t * 2.1 - tail * 2.7) * tail ** 1.7 * .34;
      const sb = Math.sin(bend), cb = Math.cos(bend);
      let x = 1 + (p.x - 1) * cb + p.z * sb, z = -(p.x - 1) * sb + p.z * cb;
      let nx = p.nx * cb + p.nz * sb, nz = -p.nx * sb + p.nz * cb;
      const fin = Math.max(0, Math.min(1, (p.y - 2) / 5)) * Math.exp(-(((p.x - 1) / 5) ** 2));
      const stroke = Math.sin(t * 1.7 - .6) * fin * .23, ss = Math.sin(stroke), cs = Math.cos(stroke);
      const y = p.y * cs - z * ss + Math.sin(t * 1.2 - p.x * .15) * .12;
      z = p.y * ss + z * cs; const ny = p.ny * cs - nz * ss; nz = p.ny * ss + nz * cs;
      const position = rotate(x, y, z), normal = rotate(nx, ny, nz);
      if (normal[2] < -.08) continue;
      const perspective = 58 / (58 - position[2]);
      const px = centerX + (position[0] - focus[0]) * scale * perspective;
      const py = centerY + (position[1] - focus[1]) * scale * perspective;
      if (px < scene.left - 4 || px > scene.right + 4 || py < scene.top - 4 || py > scene.bottom + 4) continue;
      const diffuse = Math.max(0, normal[0] * -.42 + normal[1] * -.5 + normal[2] * .76);
      const rim = (1 - Math.abs(normal[2])) ** 3;
      const sheen = Math.max(0, normal[0] * -.24 + normal[1] * -.3 + normal[2] * .92) ** 22;
      const light = Math.min(1, .12 + diffuse ** 1.2 * .78 + rim * .45 + sheen * .65);
      // Cover the projected surface footprint rather than enlarging or spacing
      // out its characters during close-ups. The final grid never changes size.
      const footprint = Math.max(Math.min(cellX,cellY) * .55, scale * 23.5 / (small ? 24 : 148) * perspective * .8);
      for(let gy=Math.floor((py-footprint)/cellY);gy<=Math.floor((py+footprint)/cellY);gy++){
        for(let gx=Math.floor((px-footprint)/cellX);gx<=Math.floor((px+footprint)/cellX);gx++){
          const key=gx+':'+gy;
          if(pixels.has(key)&&pixels.get(key).z>=position[2])continue;
          pixels.set(key,{x:(gx+.5)*cellX,y:(gy+.5)*cellY,z:position[2],light});
        }
      }
    }
    return {pixels,opacity:ambient?.26:1-macro*.16};
    }
    const first=renderView(shot.primary),second=shot.secondary?renderView(shot.secondary):null;
    const keys=second?new Set([...first.pixels.keys(),...second.pixels.keys()]):first.pixels.keys();
    const chars='·:;=+×#';
    for(const key of keys){
      const a=first.pixels.get(key),b=second?.pixels.get(key),point=a||b;
      const blend=second?shotBlend(shot,point.x,point.y,scene):0;
      const light=(a?Math.min(1,.18+a.light)*first.opacity:0)*(1-blend)
        +(b?Math.min(1,.18+b.light)*second.opacity:0)*blend;
      if(light<.015)continue;
      glyph(chars[Math.min(chars.length-1,Math.floor(light*chars.length))],point.x,point.y,ink,light,small?2.6:7.3);
    }
  };
}
