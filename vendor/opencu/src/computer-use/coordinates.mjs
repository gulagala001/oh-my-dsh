export function point(value) {
  const x = Array.isArray(value) ? value[0] : value?.x;
  const y = Array.isArray(value) ? value[1] : value?.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('A point must contain finite x and y coordinates: [x,y] or {x,y}.');
  return { x, y };
}

export function positivePixels(value) {
  if (!Number.isFinite(value) || value <= 0) throw new Error('Pixels must be a positive finite number.');
  return value;
}
