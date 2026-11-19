import { join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { buildMacHelper } from '../native/build.mjs';
import { checkMacHelperIdentity } from '../native/macos-identity.mjs';
import { createHelperTransport } from '../native/transport.mjs';
import { desktopResourcePath } from '../desktop-resource.mjs';

export function projectMonitorCursor(args, frames) {
  if (args.visible !== true) return null;
  const targetId = args.target?.id ?? args.targetId;
  const frame = frames.find(frame => frame.presentationID === targetId);
  const bounds = args.bounds ?? args.target?.bounds;
  if (!frame || !bounds || ![args.x, args.y, bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    || bounds.width <= 0 || bounds.height <= 0) return null;
  const x = (args.x - bounds.x) / bounds.width, y = (args.y - bounds.y) / bounds.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { targetId, x, y, visibilityKey: frame.visibilityKey };
}

/** One native window process per connected stock desktop renderer. */
export function createNativePresentation(dataDir) {
  const records = new Map();
  const supported = process.versions.electron && ['darwin', 'win32'].includes(process.platform);
  const close = async id => {
    const record = records.get(id);
    if (!record) return;
    try { await record.helper.close(); }
    finally { if (records.get(id) === record && record.helper.ended) records.delete(id); }
  };
  async function start(id) {
    const events = [];
    const options = { timeout: 10000, onEvent: event => {
      if (events.length < 64 && ['hidden', 'focus', 'rendered', 'error'].includes(event.type)) events.push(event);
    } };
    let helper;
    if (process.platform === 'darwin') {
      const directory = join(dataDir, 'native');
      const command = await buildMacHelper(directory);
      await checkMacHelperIdentity(resolve(command, '../../..'));
      const page = desktopResourcePath(new URL('../../lib/presentation.html', import.meta.url));
      helper = createHelperTransport(command, ['--presentation', page], options);
    } else {
      const powershell = join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
      const script = desktopResourcePath(new URL('../../native/windows/presentation.ps1', import.meta.url));
      const source = await readFile(script, 'utf8');
      helper = createHelperTransport(powershell, ['-NoProfile', '-NonInteractive', '-STA', '-Command', `& { ${source} }`], options);
    }
    const record = { helper, events, frames: [], cursor: null };
    records.set(id, record);
    try {
      if (!(await helper.request('hello')).presentation) throw new Error('The native monitor did not initialize');
      return record;
    } catch (error) { await close(id).catch(() => {}); throw error; }
  }
  let writes = Promise.resolve();
  const serialize = callback => {
    const work = writes.then(callback);
    writes = work.catch(() => {});
    return work;
  };
  return {
    async operate(id, operation, args) {
      if (!supported) throw new Error('Native monitoring is unavailable on this host');
      if (operation === 'events') return { events: records.get(id)?.events.splice(0) ?? [] };
      return serialize(async () => {
        if (operation === 'close' || operation === 'hide') { await close(id); return { visible: false }; }
        if (operation === 'cursor') {
          const record = records.get(id);
          if (!record || record.helper.ended) return { visible: false };
          const cursor = projectMonitorCursor(args, record.frames);
          if (!cursor && args.targetId && args.targetId !== record.cursor?.targetId) return { visible: false };
          if (!cursor && !record.cursor) return { visible: false };
          const result = process.platform === 'win32' ? await record.helper.request('cursor', { cursor })
            : await record.helper.request('update', { frames: record.frames, cursor });
          record.cursor = cursor;
          return { visible: cursor !== null && result.visible === true };
        }
        if (operation !== 'update' || !Array.isArray(args.frames) || args.frames.length > 10) throw new Error('Invalid monitor operation');
        const frames = args.frames;
        if (frames.some(frame => !frame || typeof frame.threadID !== 'string' || typeof frame.presentationID !== 'string'
          || frame.imageDataURL && (typeof frame.imageDataURL !== 'string' || frame.imageDataURL.length > 12e6
            || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/u.test(frame.imageDataURL)))) throw new Error('Invalid monitor frame');
        if (!frames.length) { await close(id); return { visible: false }; }
        if (records.get(id)?.helper.ended) await close(id);
        const record = records.get(id) ?? await start(id);
        const cursor = frames.some(frame => frame.presentationID === record.cursor?.targetId
          && frame.visibilityKey === record.cursor.visibilityKey) ? record.cursor : null;
        const result = await record.helper.request('update', { frames, cursor, locale: args.locale, theme: args.theme });
        record.frames = frames; record.cursor = cursor;
        return result;
      });
    },
    close: id => serialize(() => close(id)),
    dispose: () => serialize(async () => { await Promise.all([...records.keys()].map(close)); }),
  };
}
