const fail = message => { throw Object.assign(new Error(message), {code:'INVALID_ARGUMENT'}); };

/** Preserve caller waypoints while bounding native move dispatches and pacing. */
export function dragPath(path, durationMs = 160) {
  if (!Array.isArray(path) || path.length < 2 || path.length > 256) fail('Drag requires 2 to 256 path points');
  if (!Number.isInteger(durationMs) || durationMs < 0 || durationMs > 10000) fail('Drag durationMs must be an integer from 0 to 10000');
  const points = path.map(point => {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) fail('Drag path requires finite x/y coordinates');
    return {x:point.x,y:point.y};
  });
  const lengths = points.slice(1).map((point,index) => Math.min(Number.MAX_SAFE_INTEGER,Math.hypot(point.x-points[index].x,point.y-points[index].y)));
  const total = lengths.reduce((sum,length) => sum+length,0);
  const count = Math.min(256,Math.max(lengths.length,Math.ceil(durationMs/16),Math.ceil(total/48)));
  const extra = count-lengths.length, allocation = lengths.map(length => total ? Math.floor(extra*length/total) : 0);
  for (let remaining=extra-allocation.reduce((sum,value)=>sum+value,0),index=0;remaining>0;remaining--,index++) allocation[index%allocation.length]++;
  const samples = [points[0]];
  for (let index=1;index<points.length;index++) {
    const from=points[index-1],to=points[index],steps=1+allocation[index-1];
    for (let step=1;step<=steps;step++) {
      const ratio=step/steps;
      samples.push(step===steps ? to : {x:from.x*(1-ratio)+to.x*ratio,y:from.y*(1-ratio)+to.y*ratio});
    }
  }
  return {points:samples,waypoints:points,intervalMs:durationMs/(samples.length-1)};
}
