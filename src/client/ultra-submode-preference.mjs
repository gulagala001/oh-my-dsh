const KEY = 'omd.ultra-submode.v1';
const valid = value => ['workflow', 'team', 'free'].includes(value);

export function readUltraSubmode(storage) {
  try {
    const value = (storage ?? globalThis.localStorage)?.getItem(KEY);
    return valid(value) ? value : undefined;
  } catch { return undefined; }
}

export function rememberUltraSubmode(value, storage) {
  if (!valid(value)) return;
  try { (storage ?? globalThis.localStorage)?.setItem(KEY, value); } catch {}
}

export function preferredUltraSubmode(available, fallback, storage) {
  const remembered = readUltraSubmode(storage);
  // An unavailable Team preference stays remembered, but never enables tools.
  return available.some(item => item.id === remembered) ? remembered : fallback;
}
