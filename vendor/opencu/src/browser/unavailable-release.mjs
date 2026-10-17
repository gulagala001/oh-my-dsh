import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

// A retired provider has no live input channel. Its write-before-dispatch journal,
// not the presence of old selected targets, determines whether release is safe.
export async function releaseUnavailableBrowser(dataDir) {
  let saved;
  try { saved = JSON.parse(await readFile(join(dataDir, 'browser-inputs.json'), 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return {released: true, reason: 'no-input-journal'};
    throw error;
  }
  if (!Array.isArray(saved) || saved.some(item => !item || typeof item.id !== 'string' ||
      !item.identity || typeof item.identity !== 'object' || Array.isArray(item.identity) ||
      !Array.isArray(item.keys) || !Array.isArray(item.buttons) ||
      [...item.keys, ...item.buttons].some(value => typeof value !== 'string'))) {
    throw new Error('Invalid browser input state; release cannot be verified');
  }
  const pending = saved.filter(item => item.keys.length || item.buttons.length);
  return {released: pending.length === 0, failures: pending.map(item => ({targetId: item.id,
    code: 'BACKEND_UNAVAILABLE', message: 'The unavailable browser provider has persisted held input', identity: item.identity}))};
}
