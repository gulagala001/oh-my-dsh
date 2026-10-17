import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { siteToolsPolicyKey, validSiteToolsPolicy } from '../site-tools-policy.mjs';

const validators = {
  [siteToolsPolicyKey]: validSiteToolsPolicy,
  'browser-download-directory': value => value === null || typeof value === 'string' && isAbsolute(value),
  'browser-download-prompt-enabled': value => typeof value === 'boolean',
  'browser-show-full-url': value => typeof value === 'boolean',
  'browser-annotation-markers-visible': value => typeof value === 'boolean',
  'browser-extensions-toolbar-visible': value => typeof value === 'boolean',
  'browser-show-device-toolbar-in-new-tabs': value => typeof value === 'boolean',
  'browser-annotation-screenshots-mode': value => ['always', 'necessary'].includes(value),
  'open-link-in-target-preference': value => ['in-app-browser', 'external-browser'].includes(value),
  'open-local-url-in-target-preference': value => ['in-app-browser', 'external-browser'].includes(value),
};

export function createPreferences(getDirectory) {
  let tail = Promise.resolve();
  async function read() {
    let values;
    try { values = JSON.parse(await readFile(join(getDirectory(), 'preferences.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; values = {}; }
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Invalid persisted OpenCU preferences');
    return { values, configuredValues: { ...values } };
  }
  return {
    async read() { await tail; return read(); },
    write(key, value) {
      if (!Object.hasOwn(validators, key) || !validators[key](value)) throw new Error(`Unsupported OpenCU preference or value: ${key}`);
      const work = tail.then(async () => {
        const { values } = await read();
        const directory = getDirectory();
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const pending = join(directory, 'preferences.json.pending');
        await writeFile(pending, JSON.stringify({ ...values, [key]: value }, null, 2) + '\n', { mode: 0o600 });
        await rename(pending, join(directory, 'preferences.json'));
        return read();
      });
      tail = work.catch(() => undefined);
      return work;
    },
    async close() { await tail; },
  };
}
