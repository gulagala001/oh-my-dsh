import { readFile } from 'node:fs/promises';
import { mkdirSync, openSync, readFileSync, writeFileSync, closeSync, renameSync, unlinkSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parse } from 'yaml';
import { symbols } from '@deepseek-ai/cordis';

// DSH may import settings.yaml before this bundle is installed. Recover only
// our schema's fields from the retained file; explicit profile edits win.
export async function legacySettings(ctx, namespace, schema, aliases = []) {
  const profile = ctx.get('profileContext');
  const empty = (available = () => true) => ({ value: {}, current: () => ({}), persist(done = () => {}) { if (available()) return done(); } });
  if (!profile) return empty();
  const owner = ctx.fiber, uid = owner.uid, generation = { owner, uid, state: owner.state };
  let epoch = generation, persistence, target, targetEpoch = 0, targetReloading = false;
  const retire = () => { epoch = null; };
  ctx.effect(() => retire);
  ctx.on('internal/status', (fiber, previous) => {
    if (fiber === owner && ![1, 2].includes(fiber.state)) retire();
    if (fiber !== target?.fiber) return;
    if (previous === 2 && ![1, 2].includes(fiber.state) && !targetReloading) ++targetEpoch;
    if (fiber.state !== previous) targetReloading = false;
  }, { global: true });
  ctx.on('internal/plugin', fiber => {
    if (fiber === owner && fiber.uid === null) retire();
    if (fiber === target?.fiber && fiber.uid === null) ++targetEpoch;
  }, { global: true });
  ctx.on('loader/partial-dispose', (entry, previous, reload) => {
    if (entry !== target?.entry) return;
    targetReloading = reload && entry.options.name === previous.name && !isDeepStrictEqual(entry.options.config, previous.config);
    if (!reload || entry.options.name !== previous.name) ++targetEpoch;
    queueMicrotask(() => { targetReloading = false; });
  }, { global: true });
  const active = () => epoch === generation && ctx.fiber === owner && owner.uid === uid && uid !== null && [1, 2].includes(owner.state);
  const cancelled = new Error('Legacy settings owner unloaded');
  const unchanged = new Error('Legacy settings already owned by the profile');
  const checkActive = () => { if (!active()) throw cancelled; };
  const original = service => service?.[symbols.original] ?? service;
  const capture = service => {
    const implementation = original(service), fiber = implementation?.ownerContext?.fiber ?? implementation?.ctx?.fiber;
    return { service, implementation, fiber, uid: fiber?.uid, store: fiber?.store };
  };
  const available = (snapshot, service) => original(service) === snapshot.implementation && snapshot.implementation !== undefined
    && snapshot.fiber?.uid === snapshot.uid && snapshot.uid !== null && snapshot.fiber?.state === 2 && snapshot.fiber?.store === snapshot.store;
  const logger = ctx.logger;
  const marker = join(profile.dir, `.${namespace}-settings-v4.json`);
  try { await readFile(marker); return empty(active); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  let legacy;
  for (const file of ['settings.yaml', 'settings.yaml.imported']) {
    try { legacy = parse(await readFile(join(profile.home, file), 'utf8')); break; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  checkActive();
  const entries = ctx.get('configEditor')?.configuration() ?? [];
  const entry = entries.find(row => row.entry.options.id === namespace)?.entry;
  if (entry) target = { entry, id: entry.options.id, name: entry.options.name, fiber: entry.fiber, uid: entry.fiber?.uid, epoch: targetEpoch };
  // A config-only native reload preserves this entry and uid; an independent
  // restart, removal or replacement does not preserve the import's epoch.
  const targetAvailable = rows => target && targetEpoch === target.epoch && rows.some(row => row.entry === target.entry)
    && target.entry.options.id === target.id && target.entry.options.name === target.name && !target.entry.disabled
    && target.entry.fiber === target.fiber && target.fiber?.uid === target.uid && target.uid !== null && target.fiber?.state === 2;
  const aliasActive = (rows, name) => rows.some(row => row.entry.options.id === name && !row.entry.disabled);
  const fields = {}, origins = {};
  for (const name of aliases) {
    if (aliasActive(entries, name)) continue;
    // Aliases share feature preferences, never the owning plugin's data root.
    for (const [key, field] of Object.entries({ ...legacy?.[name], ...entries.find(row => row.entry.options.id === name)?.override })) {
      if (key === 'dataDir') continue;
      fields[key] = field; origins[key] = name;
    }
  }
  for (const [key, field] of Object.entries(legacy?.[namespace] ?? {})) {
    fields[key] = field; origins[key] = namespace;
  }
  const ownership = rows => ({
    override: rows.find(row => row.entry.options.id === namespace)?.override ?? {},
    user: ctx.get('settings')?.describe().find(row => row.ns === namespace)?.user ?? {},
  });
  const unowned = (key, rows, latest) => !Object.hasOwn(latest.override, key) && !Object.hasOwn(latest.user, key)
    && (origins[key] === namespace || !aliasActive(rows, origins[key]));
  const latest = ownership(entries), value = {};
  for (const [key, field] of Object.entries(schema.dict)) {
    if (!Object.hasOwn(fields, key) || !unowned(key, entries, latest)) continue;
    const parsed = field(fields[key]);
    value[key] = parsed && typeof parsed.get === 'function' ? parsed.get() : parsed;
  }
  // describe() emits native ownership notifications synchronously; a listener
  // may unload this owner before the initial fallback is returned.
  checkActive();
  const patchFor = rows => {
    const latest = ownership(rows);
    return Object.fromEntries(Object.keys(schema.dict).filter(key => Object.hasOwn(value, key) && unowned(key, rows, latest)).map(key => [key, value[key]]));
  };
  return { value, current() {
    // A delayed import is a fallback, never an override of a saved live edit.
    if (!active()) return {};
    const rows = ctx.get('configEditor')?.configuration() ?? [];
    const initializing = owner.state === 1 && target?.fiber === owner && target.entry.fiber === owner && target.entry.options.name === target.name && !target.entry.disabled;
    if (!initializing && !targetAvailable(rows)) return {};
    const patch = patchFor(rows);
    return active() ? patch : {};
  }, persist(done = () => {}) {
    if (persistence) return persistence;
    const attempt = { owner, uid, epoch: generation, target, phase: 'waiting' };
    const bytes = path => {
      try { return readFileSync(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    };
    const receiptBytes = () => {
      try { return bytes(marker); } catch (error) { if (error.code === 'EISDIR') return undefined; throw error; }
    };
    const equalBytes = (left, right) => left === null ? right === null : Buffer.isBuffer(left) && Buffer.isBuffer(right) && left.equals(right);
    const dependenciesAvailable = () => available(attempt.loader, ctx.root.get('loader'))
      && available(attempt.editor, ctx.get('configEditor')) && available(attempt.settings, ctx.get('settings'))
      && (attempt.hmr.implementation === undefined || available(attempt.hmr, ctx.get('hmr')) && !attempt.hmr.implementation.closing);
    const checkAttempt = () => {
      checkActive();
      if (!dependenciesAvailable()) throw new Error('Legacy settings services are no longer available');
      if (!targetAvailable(attempt.editor.service.configuration())) throw new Error(`Configuration entry "${namespace}" changed before legacy import`);
      checkActive();
    };
    const retiredWithoutWrite = error => {
      // Retirement and unchanged bytes alone cannot identify a queue rejection:
      // readProfilePatches also wraps real IO errors without preserving code.
      // Accept only native lifecycle/exact-entry guards with matching snapshots;
      // candidates additionally need exact rollback bytes and raw config.
      // IO, remaining commits, receipt failures and done failures stay visible.
      if (active() || !['queued', 'candidate'].includes(attempt.phase) || error?.code !== undefined) return false;
      try {
        const loaderLive = available(attempt.loader, ctx.root.get('loader'));
        const loaderGuard = error instanceof TypeError && error.message === "Cannot read properties of undefined (reading 'entries')"
          && (!loaderLive || attempt.phase === 'queued' && !available(attempt.editor, ctx.get('configEditor')));
        if (attempt.phase === 'candidate' && (loaderLive || !loaderGuard)) return false;
        if (attempt.phase === 'queued') {
          const hmrGuard = error instanceof Error && error.message === 'HMR is disposed' && attempt.hmr.implementation?.closing
            && !available(attempt.hmr, ctx.get('hmr'));
          const entryGuard = error instanceof Error && ['Configuration entry is no longer available', 'Configuration entry changed during reload'].includes(error.message)
            && loaderLive && (!attempt.target.entry.fiber || !attempt.editor.service.entries().includes(attempt.target.entry));
          if (!loaderGuard && !hmrGuard && !entryGuard) return false;
        }
        if (dependenciesAvailable()) {
          const lostTarget = targetEpoch !== attempt.target.epoch || attempt.target.entry.fiber !== attempt.target.fiber
            || attempt.target.fiber.uid !== attempt.target.uid || attempt.target.fiber.state !== 2
            || ![...attempt.loader.service.entries()].includes(attempt.target.entry);
          if (!lostTarget) return false;
        }
        if (attempt.phase === 'candidate' && !isDeepStrictEqual(attempt.rawConfig, attempt.target.entry.options.config ?? {})) {
          const entry = attempt.target.entry;
          if (entry.parent.tree.store[entry.options.id] === entry || entry.fiber?.uid !== null && entry.fiber?.state === 2) return false;
        }
        return equalBytes(attempt.patchBytes, bytes(profile.patchPath)) && equalBytes(attempt.markerBytes, bytes(marker));
      } catch { return false; }
    };
    // No dependency cycle: official Loader/service lifecycles settle after apply.
    // Settings saves and this edit retain their position in ConfigEditor's own
    // HMR/file-lock queue; do not wrap edit in a nested exclusive transaction.
    persistence = (async () => {
      checkActive();
      attempt.loader = capture(ctx.root.get('loader'));
      attempt.editor = capture(ctx.get('configEditor'));
      attempt.settings = capture(ctx.get('settings'));
      attempt.hmr = capture(ctx.get('hmr'));
      await attempt.loader.service.await();
      checkActive();
      if (owner.state === 1) await owner.await();
      checkActive();
      await attempt.editor.fiber?.await();
      checkActive();
      await attempt.settings.fiber?.await();
      checkAttempt();
      attempt.patchBytes = bytes(profile.patchPath);
      attempt.markerBytes = receiptBytes();
      // Another generation may have finished since the retained file was read.
      if (Buffer.isBuffer(attempt.markerBytes)) {
        attempt.phase = 'receipt'; await done(); return true;
      }
      let patch;
      try {
        attempt.phase = 'queued';
        await attempt.editor.service.edit(attempt.target.entry, current => {
          attempt.phase = 'change';
          checkAttempt();
          patch = patchFor(attempt.editor.service.configuration());
          checkActive();
          if (!Object.keys(patch).length) throw unchanged;
          // The lock is now held: saves ahead of us are the rollback baseline,
          // never the earlier queue snapshot used for a pre-change rejection.
          attempt.patchBytes = bytes(profile.patchPath);
          attempt.markerBytes = receiptBytes();
          attempt.rawConfig = structuredClone(attempt.target.entry.options.config ?? {});
          attempt.phase = 'candidate';
          return { ...current, ...patch };
        });
        attempt.phase = 'committed';
      } catch (error) {
        if (error !== unchanged) throw error;
        attempt.phase = 'unchanged';
      }
      // A completed edit can retire its own owner (ordinary-field restart), or
      // shutdown can begin during reconciliation. No late receipt or callback;
      // this is an explicit successful-edit branch, never a catch error filter.
      if (!active()) return false;
      if (Buffer.isBuffer(receiptBytes())) {
        attempt.phase = 'receipt'; await done(); return true;
      }
      mkdirSync(profile.dir, { recursive: true });
      const temp = marker + '.' + randomUUID() + '.tmp';
      let created = false;
      try {
        const file = openSync(temp, 'wx', 0o600);
        created = true;
        try { writeFileSync(file, JSON.stringify({ imported: Object.keys(patch) }) + '\n'); } finally { closeSync(file); }
        renameSync(temp, marker);
      } catch (error) {
        if (created) try { unlinkSync(temp); } catch (cleanup) { if (cleanup.code !== 'ENOENT') logger.error(cleanup); }
        throw error;
      }
      attempt.phase = 'receipt';
      await done();
      return true;
    })().catch(error => {
      if (error !== cancelled && !retiredWithoutWrite(error)) {
        logger.error('Legacy settings import failed: %s', error.message);
        logger.error(error);
      }
      return false;
    });
    return persistence;
  } };
}
