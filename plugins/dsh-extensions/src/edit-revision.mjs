import { stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fail } from './common.mjs';

export const fileStamp = info => info ? [info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs].join('/') : 'absent';
export async function fileRevision(path) {
  try { return fileStamp(await stat(path)); }
  catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return 'absent'; throw error; }
}
export function configRevision(value) {
  const canonical = (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key,item[key]])) : item;
  return createHash('sha256').update(JSON.stringify(value ?? null, canonical)).digest('hex');
}
export function requireRevision(expected) {
  if (typeof expected !== 'string') fail('edit-revision-required','Reload the item before changing it',{},428);
  return expected;
}
export function checkRevision(expected, actual) {
  requireRevision(expected);
  if (expected !== actual) fail('edit-conflict','The item changed elsewhere. Your draft is still open; reread it before applying changes.',{},409);
}
