export function point(value) {
  const x = Array.isArray(value) ? value[0] : value?.x;
  const y = Array.isArray(value) ? value[1] : value?.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('A point must contain finite x and y coordinates: [x,y] or {x,y}.');
  return { x, y };
}
