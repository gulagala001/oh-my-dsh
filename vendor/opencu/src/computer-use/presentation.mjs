import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validComputerPresentationTarget } from './presentation-target.mjs';

const key = value => createHash('sha256').update(value).digest('hex');
const validMeta = meta => meta && Array.isArray(meta.computerUseFiles)
  && meta.computerUseFiles.every(file => file && typeof file.path === 'string'
    && typeof file.name === 'string' && Number.isSafeInteger(file.bytes) && file.bytes >= 0)
  && (meta.computerUseError === null || typeof meta.computerUseError === 'string')
  && (meta.computerUseTarget === undefined || validComputerPresentationTarget(meta.computerUseTarget));
async function waitForWrite(pending, signal) {
  if (!pending) return;
  if (!signal) return pending;
  signal.throwIfAborted();
  let abort;
  const canceled = new Promise((_, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
  });
  try { await Promise.race([pending, canceled]); }
  finally { signal.removeEventListener('abort', abort); }
}

// An optional UI cache, never an execution or model-history authority. Current
// hosts cannot append an ignorable external event through public Session.append.
export class ComputerPresentationStore {
  constructor(directory, report = () => {}) { this.directory = directory; this.report = report; this.pending = new Map(); }
  path(sessionId, callId) { return join(this.directory, key(sessionId), key(callId) + '.json'); }
  record(sessionId, record) {
    const file = this.path(sessionId, record.callId), bytes = JSON.stringify(record);
    const previous = this.pending.get(file) ?? Promise.resolve();
    const work = previous.then(async () => {
      const directory = join(this.directory, key(sessionId)), temporary = file + '.' + randomUUID() + '.tmp';
      await mkdir(directory, { recursive: true, mode: 0o700 });
      try { await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 }); await rename(temporary, file); }
      finally { await rm(temporary, { force: true }); }
    }).catch(error => this.report(error)).finally(() => { if (this.pending.get(file) === work) this.pending.delete(file); });
    this.pending.set(file, work);
  }
  async read(sessionId, callId, signal) {
    const file = this.path(sessionId, callId);
    signal?.throwIfAborted(); await waitForWrite(this.pending.get(file), signal); signal?.throwIfAborted();
    try {
      const value = JSON.parse(await readFile(file, { encoding: 'utf8', signal }));
      return value.callId === callId && validMeta(value.meta) ? value : null;
    } catch (error) { signal?.throwIfAborted(); if (error.code !== 'ENOENT') this.report(error); return null; }
  }
  async close() { await Promise.all([...this.pending.values()]); }
}

// The native PTC log carries content, but deliberately omits presentationMeta.
// Observe the final result without replacing Tools or changing its event schema
// or model content. The HTTP reader also requires a native settled sub-call.
export function registerComputerPresentation(ctx, store) {
  const owned = new Set();
  ctx.on('tools/result', (exec, result) => {
    if (!owned.delete(exec.token) || exec.name !== 'computer_use' || exec.parent === undefined || !exec.agent
      || exec.signal.aborted || result.isError || typeof result.value !== 'string') return;
    const value = JSON.parse(result.value);
    const files = value.files ?? [], error = value.error ?? null;
    if (!Array.isArray(files) || files.some(file => !file || typeof file.path !== 'string'
      || typeof file.name !== 'string' || !Number.isSafeInteger(file.bytes) || file.bytes < 0)
      || error !== null && typeof error !== 'string') return;
    const target = validComputerPresentationTarget(value.target) ? value.target : null;
    if (!files.length && !error && !target) return;
    store.record(exec.agent.session.id, {
      callId: exec.callId, rootCallId: exec.rootCallId,
      meta: { computerUseFiles: files, computerUseError: error, ...(target ? { computerUseTarget: target } : {}) },
    });
  });
  // Execution tokens are opaque symbols. Mark only entry into our registered
  // body; an agent-scoped plugin may legitimately shadow the same tool name.
  return token => owned.add(token);
}

export async function readComputerPresentation(query, store, sessionId, callId, signal) {
  if (!query?.observeSession || !callId || callId.length > 512 || /[\x00-\x1f]/.test(callId)) return null;
  const observation = await query.observeSession(sessionId, { projectionMode: 'none', signal });
  try {
    const settled = observation.events.findLast(event => event.type === 'tool/ptc-dispatch'
      && event.data.subCallId === callId && event.data.name === 'computer_use');
    if (!settled || settled.data.isError) return null;
    const record = await store?.read(sessionId, callId, signal);
    return record?.rootCallId === settled.data.rootCallId ? record.meta : null;
  } finally { observation[Symbol.dispose](); }
}
