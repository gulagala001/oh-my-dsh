import { whalePath } from './whale-path.mjs';
import {whaleShots,shotBlend} from './director.mjs';

// Inflate the actual logo contour into a rounded closed 3D surface. The two
// skins and their rim have depth and normals; rotation never squashes a sprite.
export function createWhalePainter() {
  const path = new Path2D(whalePath);
  const probe = document.createElement('canvas').getContext('2d');
  const meshes = new Map(), rasters = new Map();
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
    const columns = Array.from({ length: cols }, (_, x) => {
      const px = (x + .5) * step - 11.75, tail = Math.max(0, (px - 1) / 10.75);
      return { x: px, tailPower: tail ** 1.7 * .34, tailPhase: tail * 2.7 };
    });
    const straight = { fin: 0 }, strokes = [straight];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const d = at(x, y); if (!d) continue;
      const z = depth(x, y), dx = (depth(x + 1, y) - depth(x - 1, y)) / (2 * step);
      const dy = (depth(x, y + 1) - depth(x, y - 1)) / (2 * step), len = Math.hypot(dx, dy, 1);
      const px = (x + .5) * step - 11.75, py = (y + .5) * step - 8.55;
      const fin = Math.max(0, Math.min(1, (py - 2) / 5)) * Math.exp(-(((px - 1) / 5) ** 2));
      const stroke = fin ? { fin } : straight;
      if (fin) strokes.push(stroke);
      const column = columns[x];
      for (const side of [1, -1]) points.push({ x:px, y:py, z:z * side, nx:-dx / len, ny:-dy / len, nz:side / len, column, stroke });
      if (d <= step * 1.1) {
        const norm = Math.hypot(dx, dy) || 1;
        for (const f of [-.6, 0, .6]) points.push({ x:px, y:py, z:z * f, nx:-dx / norm, ny:-dy / norm, nz:0, column, stroke });
      }
    }
    const value = { points, columns, strokes, time: undefined };
    meshes.set(cols, value);
    return value;
  }
  function makeRaster(scene,cellX,cellY,slot) {
    const left=Math.floor(scene.left/cellX)-1,top=Math.floor(scene.top/cellY)-1;
    const cols=Math.ceil(scene.right/cellX)-left+1,rows=Math.ceil(scene.bottom/cellY)-top+1,size=cols*rows;
    let value=rasters.get(slot);
    if(!value||value.depth.length!==size){value={depth:new Float64Array(size),light:new Float64Array(size),used:new Uint32Array(size)};rasters.set(slot,value);}
    value.depth.fill(-Infinity);value.count=0;
    Object.assign(value,{left,top,cols,rows,cellX,cellY});return value;
  }
  return function paintWhale({ r, small, scene = r, ambient = false, raster }, time, glyph, ink, muted, pointer) {
    epoch ??= time;
    const t = time === 0 ? 0 : Math.max(0, time - epoch);
    const shot=small?{primary:[Math.sin(t*.6)*.3,.08,1,0,0]}
      :ambient?{primary:[Math.sin(t*.2)*.35,.1,1.05,0,0]}:whaleShots(t);
    const model = mesh(small ? 24 : 148);
    // The front, back and rim share each surface sample's deformation. Camera
    // transitions also reuse it; only the view projection changes between shots.
    if (model.time !== t) {
      for (const column of model.columns) {
        const bend = Math.sin(t * 2.1 - column.tailPhase) * column.tailPower;
        column.sb = Math.sin(bend); column.cb = Math.cos(bend);
        column.breath = Math.sin(t * 1.2 - column.x * .15) * .12;
      }
      const phase = Math.sin(t * 1.7 - .6);
      for (const stroke of model.strokes) {
        const angle = phase * stroke.fin * .23;
        stroke.ss = Math.sin(angle); stroke.cs = Math.cos(angle);
      }
      model.time = t;
    }
    function renderView([yaw,pitch,zoom,focusX,focusY],slot) {
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
    const cellX = small ? 1.25 : raster?.stepX || 6, cellY = small ? 1.45 : raster?.stepY || 8;
    const pixels=makeRaster(scene,cellX,cellY,(small?'small':'large')+slot);
    const {depth,light:lights,used,left,top,cols,rows}=pixels;
    for (const p of model.points) {
      // A travelling bend reaches the tail after the body. The lower fin has
      // its own stroke; breathing and buoyancy stay small and continuous.
      const { sb, cb, breath } = p.column;
      let x = 1 + (p.x - 1) * cb + p.z * sb, z = -(p.x - 1) * sb + p.z * cb;
      let nx = p.nx * cb + p.nz * sb, nz = -p.nx * sb + p.nz * cb;
      const { ss, cs } = p.stroke;
      const y = p.y * cs - z * ss + breath;
      z = p.y * ss + z * cs; const ny = p.ny * cs - nz * ss; nz = p.ny * ss + nz * cs;
      const rx=x*cy+z*sy,rz=-x*sy+z*cy,ry=y*cx-rz*sx,depthZ=y*sx+rz*cx;
      const normalX=nx*cy+nz*sy,normalZ0=-nx*sy+nz*cy,normalY=ny*cx-normalZ0*sx,normalZ=ny*sx+normalZ0*cx;
      if (normalZ < -.08) continue;
      const perspective = 58 / (58 - depthZ);
      const px = centerX + (rx - focus[0]) * scale * perspective;
      const py = centerY + (ry - focus[1]) * scale * perspective;
      if (px < scene.left - 4 || px > scene.right + 4 || py < scene.top - 4 || py > scene.bottom + 4) continue;
      const diffuse = Math.max(0, normalX * -.42 + normalY * -.5 + normalZ * .76);
      const rim = (1 - Math.abs(normalZ)) ** 3;
      const sheen = Math.max(0, normalX * -.24 + normalY * -.3 + normalZ * .92) ** 22;
      const light = Math.min(1, .12 + diffuse ** 1.2 * .78 + rim * .45 + sheen * .65);
      // Cover the projected surface footprint rather than enlarging or spacing
      // out its characters during close-ups. The final grid never changes size.
      const footprint = Math.max(Math.min(cellX,cellY) * .55, scale * 23.5 / (small ? 24 : 148) * perspective * .8);
      const y0=Math.max(top,Math.floor((py-footprint)/cellY)),y1=Math.min(top+rows-1,Math.floor((py+footprint)/cellY));
      const x0=Math.max(left,Math.floor((px-footprint)/cellX)),x1=Math.min(left+cols-1,Math.floor((px+footprint)/cellX));
      for(let gy=y0;gy<=y1;gy++){
        for(let gx=x0;gx<=x1;gx++){
          const key=(gy-top)*cols+gx-left;
          if(depth[key]>=depthZ)continue;
          if(depth[key]===-Infinity)used[pixels.count++]=key;
          depth[key]=depthZ;lights[key]=light;
        }
      }
    }
    pixels.opacity=ambient?.26:1-macro*.16;return pixels;
    }
    const first=renderView(shot.primary,0),second=shot.secondary?renderView(shot.secondary,1):null;
    const chars='·:;=+×#';
    const paint=key=>{
      const x=(key%first.cols+first.left+.5)*first.cellX,y=(Math.floor(key/first.cols)+first.top+.5)*first.cellY;
      const blend=second?shotBlend(shot,x,y,scene):0;
      const light=(first.depth[key]!==-Infinity?Math.min(1,.18+first.light[key])*first.opacity:0)*(1-blend)
        +(second&&second.depth[key]!==-Infinity?Math.min(1,.18+second.light[key])*second.opacity:0)*blend;
      if(light>=.015)glyph(chars[Math.min(chars.length-1,Math.floor(light*chars.length))],x,y,ink,light,small?2.6:7.3);
    };
    for(let i=0;i<first.count;i++)paint(first.used[i]);
    if(second)for(let i=0;i<second.count;i++)if(first.depth[second.used[i]]===-Infinity)paint(second.used[i]);
  };
}
