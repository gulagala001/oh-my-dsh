/** Paths are execution locations, never Session identities or permission roots. */
export const absolutePath = path => /^(?:\/|[A-Za-z]:[/\\]|\\\\)/.test(path);
export function resolveFilePath(cwd, path) {
  if (!path || absolutePath(path) || !cwd) return path;
  const separator = /^[A-Za-z]:\\|^\\\\/.test(cwd) ? '\\' : '/';
  return cwd.replace(/[/\\]+$/, '') + separator + path;
}

/** Full-log directory checkpoints also work when the visible transcript is paged. */
export function directoryAt(directories, seq = Infinity, initial) {
  let low = 0, high = directories?.length ?? 0;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (directories[middle].seq <= seq) low = middle + 1;
    else high = middle;
  }
  return low ? directories[low - 1].cwd : initial;
}

export function fileImageUrl(base, path) {
  // Keep the native authenticated file route and transport restrictions.
  if (!path || !absolutePath(path) || /^[/\\]{2}|[\u0000-\u001f\u007f]/u.test(path)
    || !/^https?:/u.test(base) && !base.startsWith('dsh-app://app/')) return undefined;
  return new URL('api/file?path=' + encodeURIComponent(path), base).href;
}
