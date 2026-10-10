import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { faultPathHasParentTraversal } from '../scripts/simulator/fault-preload.mjs';

const execute = promisify(execFile);
const preload = new URL('../scripts/simulator/fault-preload.mjs', import.meta.url).href;
const dshPackage = new URL('../node_modules/@deepseek-ai/dsh/package.json', import.meta.url).href;

async function child(body, { simulation = '1', rootKind = 'directory', clock = false } = {}) {
  const fixture = fs.mkdtempSync(join(tmpdir(), 'omd-fault-test-'));
  const root = join(fixture, 'root');
  const outside = join(fixture, 'outside');
  fs.mkdirSync(outside);
  if (['directory', 'auditLink'].includes(rootKind)) fs.mkdirSync(root);
  if (rootKind === 'file') fs.writeFileSync(root, 'not a directory');
  if (rootKind === 'auditLink') {
    fs.writeFileSync(join(outside, 'audit-witness'), 'outside unchanged');
    fs.symlinkSync(join(outside, 'audit-witness'), join(root, 'faults.jsonl'));
  }
  try {
    const source = `
      import assert from 'node:assert/strict';
      import fs, { writeFile as callbackWrite, writeFileSync as syncWrite, readFileSync as syncRead,
        appendFile as callbackAppend, open as callbackOpen, openSync as syncOpen, link as callbackLink, linkSync as syncLink } from 'node:fs';
      import promises, { writeFile as promiseWrite, readFile as promiseRead, open as promiseOpen, link as promiseLink } from 'node:fs/promises';
      import { promisify } from 'node:util';
      import { createRequire } from 'node:module';
      import { join, dirname } from 'node:path';
      import { pathToFileURL, fileURLToPath } from 'node:url';
      const hostRequire = createRequire(fs.realpathSync(fileURLToPath(${JSON.stringify(dshPackage)})));
      const root = process.env.OMD_SIM_ROOT;
      const outside = process.env.OMD_SIM_TEST_OUTSIDE;
      const faults = globalThis[Symbol.for('omd.simulation.faults')];
      const result = await (async () => { ${body}\n return true; })();
      console.log(JSON.stringify(result));
    `;
    const clockPreload = new URL('../scripts/simulator/clock-preload.mjs', import.meta.url).href;
    const { stdout, stderr } = await execute(process.execPath, [...(clock ? ['--import', clockPreload] : []), '--import', preload, '--input-type=module', '--eval', source], {
      env: { ...process.env, NODE_OPTIONS: '', OMD_SIMULATION: simulation, OMD_SIM_ROOT: root, OMD_SIM_TEST_OUTSIDE: outside },
      timeout: 5000, maxBuffer: 1024 * 1024,
    });
    assert.equal(stderr, '');
    const auditFile = join(root, 'faults.jsonl');
    const audit = fs.existsSync(auditFile) ? fs.readFileSync(auditFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) : [];
    return { value: JSON.parse(stdout.trim()), audit };
  } finally {
    try {
      if (rootKind === 'auditLink') assert.equal(fs.readFileSync(join(outside, 'audit-witness'), 'utf8'), 'outside unchanged');
    } finally { fs.rmSync(fixture, { recursive: true, force: true }); }
  }
}

test('fault preload is opt-in, isolated from node:test, and requires an existing directory root', async () => {
  assert.equal(globalThis[Symbol.for('omd.simulation.faults')], undefined);
  const disabled = await child(`
    assert.equal(faults, undefined);
    assert.equal(callbackWrite, fs.writeFile);
    syncWrite(join(root, 'native'), 'unchanged API');
    assert.equal(syncRead(join(root, 'native'), 'utf8'), 'unchanged API');
  `, { simulation: '0' });
  assert.equal(disabled.value, true);
  assert.deepEqual(disabled.audit, []);
  await assert.rejects(child('', { rootKind: 'missing' }), /ENOENT/);
  await assert.rejects(child('', { rootKind: 'file' }), /existing directory/);
  await assert.rejects(child('', { rootKind: 'auditLink' }), /audit escaped/);
});

test('parent traversal is rejected before either Windows separator spelling can be collapsed', () => {
  for (const path of [String.raw`C:\fixture\escape\..\file`, 'C:/fixture/escape/../file',
    String.raw`C:\fixture/escape\../file`, String.raw`\\server\share\escape\..\file`]) {
    assert.equal(faultPathHasParentTraversal(path, 'win32'), true, path);
  }
  for (const path of [String.raw`C:\fixture\file`, 'C:/fixture/not..parent/file',
    String.raw`\\server\share\file`]) assert.equal(faultPathHasParentTraversal(path, 'win32'), false, path);
  assert.equal(faultPathHasParentTraversal('/fixture/escape/../file', 'darwin'), true);
  assert.equal(faultPathHasParentTraversal(String.raw`/fixture/escape\..\file`, 'darwin'), false);
});

test('one-shot sync EIO matches a complete path and recovery really writes the target', async () => {
  const { audit } = await child(`
    const target = join(root, 'item');
    const other = join(root, 'other', 'item');
    const external = join(outside, 'item');
    fs.mkdirSync(dirname(other));
    syncWrite(target, 'before');
    faults.arm({ operation: 'write', path: target });
    syncWrite(other, 'same basename inside');
    syncWrite(external, 'same basename outside fixture');
    assert.equal(faults.snapshot().remaining, 1);
    assert.throws(() => syncWrite(target, 'blocked'), error => {
      assert.equal(error.code, 'EIO');
      assert.ok(error.errno < 0);
      // The native API is also the host's filesystem identity source. The JS
      // realpath walker can retain different Windows drive/component casing.
      assert.equal(error.path, fs.realpathSync.native(target));
      assert.equal(error.syscall, 'writeFile');
      return true;
    });
    assert.equal(syncRead(target, 'utf8'), 'before');
    assert.equal(syncRead(external, 'utf8'), 'same basename outside fixture');
    assert.equal(faults.snapshot().remaining, 0);
    assert.deepEqual(faults.snapshot().matchedApis, { 'fs.writeFileSync': 1 });
    syncWrite(target, 'recovered');
    assert.equal(syncRead(target, 'utf8'), 'recovered');
  `);
  assert.deepEqual(audit.filter((event) => event.type === 'failure').map((event) => event.error.code), ['EIO']);
  assert.equal(audit.find((event) => event.type === 'arm').fault.remaining, 1);
});

test('callback and promises ESM imports consume exactly the configured ENOSPC count asynchronously', async () => {
  const { audit } = await child(`
    assert.equal(callbackWrite, fs.writeFile);
    assert.equal(callbackAppend, fs.appendFile);
    assert.equal(callbackOpen, fs.open);
    assert.equal(syncWrite, fs.writeFileSync);
    assert.equal(syncOpen, fs.openSync);
    assert.equal(promiseWrite, promises.writeFile);
    assert.equal(promiseRead, promises.readFile);
    assert.equal(promiseOpen, promises.open);
    const target = join(root, 'sample');
    syncWrite(target, 'seed');
    faults.arm({ operation: 'write', path: target, count: 2, code: 'ENOSPC' });
    let synchronous = true;
    const callbackResult = new Promise(resolve => callbackAppend(Buffer.from(target), 'blocked', error => {
      assert.equal(synchronous, false);
      resolve(error);
    }));
    synchronous = false;
    assert.equal((await callbackResult).code, 'ENOSPC');
    await assert.rejects(promiseWrite(pathToFileURL(target), 'blocked again'), { code: 'ENOSPC' });
    assert.equal(faults.snapshot().remaining, 0);
    assert.equal(syncRead(target, 'utf8'), 'seed');
    await promisify(callbackWrite)(target, 'recovered');
    assert.equal(await promiseRead(target, 'utf8'), 'recovered');
    assert.deepEqual(faults.snapshot().matchedApis, { 'fs.appendFile': 1, 'fs.promises.writeFile': 1 });
  `);
  assert.equal(audit.filter((event) => event.type === 'match').length, 2);
  assert.deepEqual(audit.filter((event) => event.type === 'failure').map((event) => event.error.code), ['ENOSPC', 'ENOSPC']);
});

test('all path-based read/write/append/rename/unlink sync, callback and promise APIs inject and then recover', async () => {
  const { audit } = await child(`
    const operations = { readFile: 'read', writeFile: 'write', appendFile: 'write', rename: 'rename', unlink: 'unlink' };
    for (const [name, operation] of Object.entries(operations)) {
      for (const kind of ['sync', 'callback', 'promise']) {
        const target = join(root, name + '-' + kind);
        const moved = target + '-moved';
        syncWrite(target, 'seed');
        const args = name === 'writeFile' || name === 'appendFile' ? [target, 'replacement']
          : name === 'rename' ? [target, moved] : [target];
        faults.arm({ operation, path: target, code: 'EACCES' });
        if (kind === 'sync') assert.throws(() => fs[name + 'Sync'](...args), { code: 'EACCES' });
        else if (kind === 'callback') await assert.rejects(promisify(fs[name])(...args), { code: 'EACCES' });
        else await assert.rejects(promises[name](...args), { code: 'EACCES' });
        assert.equal(faults.snapshot().remaining, 0);
        assert.equal(syncRead(target, 'utf8'), 'seed');
        assert.equal(fs.existsSync(moved), false);
        if (kind === 'sync') fs[name + 'Sync'](...args);
        else if (kind === 'callback') await promisify(fs[name])(...args);
        else await promises[name](...args);
        if (name === 'unlink') assert.equal(fs.existsSync(target), false);
        else if (name === 'rename') {
          assert.equal(fs.existsSync(target), false);
          assert.equal(syncRead(moved, 'utf8'), 'seed');
        } else assert.equal(syncRead(target, 'utf8'), name === 'writeFile' ? 'replacement' : name === 'appendFile' ? 'seedreplacement' : 'seed');
      }
    }
    const source = join(root, 'rename-source');
    const destination = join(root, 'rename-destination');
    syncWrite(source, 'rename seed');
    faults.arm({ operation: 'rename', path: destination });
    await assert.rejects(promises.rename(source, destination), { code: 'EIO' });
    assert.equal(syncRead(source, 'utf8'), 'rename seed');
  `);
  assert.equal(audit.filter((event) => event.type === 'failure').length, 16);
  assert.equal(new Set(audit.filter((event) => event.type === 'match').map((event) => event.api)).size, 15);
});

test('open wrappers classify string/numeric flags and never consume a write fault for read-only opens', async () => {
  await child(`
    const target = join(root, 'open-target');
    syncWrite(target, 'open seed');
    for (const kind of ['sync', 'callback', 'promise']) {
      faults.arm({ operation: 'write', path: target });
      const syncFd = syncOpen(target, 'r');
      fs.closeSync(syncFd);
      const callbackFd = await promisify(callbackOpen)(target, fs.constants.O_RDONLY);
      fs.closeSync(callbackFd);
      const appendOnlyReadFd = syncOpen(target, fs.constants.O_RDONLY | fs.constants.O_APPEND);
      fs.closeSync(appendOnlyReadFd);
      const handle = await promiseOpen(target, 'rs');
      assert.equal(await handle.readFile('utf8'), 'open seed');
      await handle.close();
      assert.equal(faults.snapshot().remaining, 1);
      if (kind === 'sync') assert.throws(() => syncOpen(target, 'w'), { code: 'EIO' });
      else if (kind === 'callback') await assert.rejects(promisify(callbackOpen)(target, fs.constants.O_WRONLY | fs.constants.O_CREAT), { code: 'EIO' });
      else await assert.rejects(promiseOpen(target, 'r+'), { code: 'EIO' });
      assert.equal(faults.snapshot().remaining, 0);
      assert.equal(syncRead(target, 'utf8'), 'open seed');
    }
    faults.arm({ operation: 'read', path: target });
    const writer = syncOpen(target, fs.constants.O_WRONLY);
    fs.closeSync(writer);
    assert.equal(faults.snapshot().remaining, 1);
    assert.throws(() => syncOpen(target, 'invalid flags'), TypeError);
    assert.equal(faults.snapshot().remaining, 1);
    await assert.rejects(promiseOpen(target, fs.constants.O_RDWR), { code: 'EIO' });
    assert.equal(faults.snapshot().remaining, 0);
    faults.arm({ operation: 'write', path: target });
    assert.throws(() => callbackWrite(target, 'invalid callback shape'), TypeError);
    assert.equal(faults.snapshot().remaining, 1);
    faults.clear();
  `);
});

test('partial writeFile sync/promises persist the exact byte prefix before throwing the requested fault', async () => {
  const { audit } = await child(`
    const target = join(root, 'partial');
    syncWrite(target, 'old contents');
    faults.arm({ operation: 'write', path: target, code: 'EIO', partialBytes: 3 });
    assert.throws(() => syncWrite(target, '甲乙丙', 'utf8'), { code: 'EIO' });
    assert.deepEqual(syncRead(target), Buffer.from('甲'));
    assert.equal(faults.snapshot().matches.at(-1).partialBytesWritten, 3);
    faults.arm({ operation: 'write', path: target, code: 'ENOSPC', partialBytes: 4 });
    await assert.rejects(promiseWrite(target, Buffer.from('01234567')), { code: 'ENOSPC' });
    assert.deepEqual(syncRead(target), Buffer.from('0123'));
    faults.arm({ operation: 'write', path: target, partialBytes: 2 });
    await assert.rejects(promiseWrite(target, new Uint8Array([3, 5, 7, 9])), { code: 'EIO' });
    assert.deepEqual(syncRead(target), Buffer.from([3, 5]));
    faults.arm({ operation: 'write', path: target, partialBytes: 0 });
    assert.throws(() => syncWrite(target, 'none'), { code: 'EIO' });
    assert.equal(syncRead(target).length, 0);
    faults.arm({ operation: 'write', path: target, partialBytes: 99 });
    assert.throws(() => syncWrite(target, 'short'), { code: 'EIO' });
    assert.equal(syncRead(target, 'utf8'), 'short');
    assert.equal(faults.snapshot().matches.at(-1).partialBytesWritten, 5);
    await promiseWrite(target, 'fully recovered');
    assert.equal(syncRead(target, 'utf8'), 'fully recovered');
  `);
  assert.deepEqual(audit.filter((event) => event.type === 'failure').map((event) => event.partialBytesWritten), [3, 4, 2, 0, 5]);
});

test('unsupported partial APIs fail explicitly without consumption or a real write; native prefix failures are audited honestly', async () => {
  const { audit } = await child(`
    const target = join(root, 'unsupported');
    syncWrite(target, 'unchanged');
    faults.arm({ operation: 'write', path: target, partialBytes: 2 });
    await assert.rejects(promisify(callbackWrite)(target, 'callback'), { code: 'ERR_SIM_FAULT_PARTIAL_UNSUPPORTED' });
    assert.throws(() => fs.appendFileSync(target, 'append'), { code: 'ERR_SIM_FAULT_PARTIAL_UNSUPPORTED' });
    await assert.rejects(promiseOpen(target, 'w'), { code: 'ERR_SIM_FAULT_PARTIAL_UNSUPPORTED' });
    let iterated = false;
    async function* chunks() { iterated = true; yield 'chunk'; }
    await assert.rejects(promiseWrite(target, chunks()), { code: 'ERR_SIM_FAULT_PARTIAL_UNSUPPORTED' });
    assert.equal(iterated, false);
    assert.equal(faults.snapshot().remaining, 1);
    assert.equal(syncRead(target, 'utf8'), 'unchanged');
    faults.clear();
    const missingParent = join(root, 'missing-parent', 'file');
    faults.arm({ operation: 'write', path: missingParent, partialBytes: 2 });
    await assert.rejects(promiseWrite(missingParent, 'prefix'), { code: 'ENOENT' });
    const actual = faults.snapshot().matches.at(-1);
    assert.equal(actual.code, 'EIO');
    assert.equal(actual.error.code, 'ENOENT');
    assert.equal(actual.partialBytesWritten, null);
    assert.equal(faults.snapshot().remaining, 0);
  `);
  assert.equal(audit.filter((event) => event.type === 'unsupported').length, 4);
  assert.equal(audit.filter((event) => event.type === 'failure').at(-1).error.code, 'ENOENT');
});

test('repeated partial writes bypass their own nested open calls and concurrent promise calls consume once each', async () => {
  const { audit } = await child(`
    const target = join(root, 'repeated-partial');
    syncWrite(target, 'old');
    faults.arm({ operation: 'write', path: target, partialBytes: 2, count: 2 });
    assert.throws(() => syncWrite(target, 'first'), { code: 'EIO' });
    assert.equal(syncRead(target, 'utf8'), 'fi');
    assert.equal(faults.snapshot().remaining, 1);
    assert.throws(() => syncWrite(target, 'second'), { code: 'EIO' });
    assert.equal(syncRead(target, 'utf8'), 'se');
    assert.equal(faults.snapshot().remaining, 0);
    faults.arm({ operation: 'write', path: target, partialBytes: 2, count: 2, code: 'ENOSPC' });
    const results = await Promise.allSettled([promiseWrite(target, 'alpha'), promiseWrite(target, 'beta')]);
    assert.ok(results.every(result => result.status === 'rejected' && result.reason.code === 'ENOSPC'));
    assert.equal(faults.snapshot().remaining, 0);
    assert.ok(['al', 'be'].includes(syncRead(target, 'utf8')));
    assert.deepEqual(faults.snapshot().matchedApis, { 'fs.writeFileSync': 2, 'fs.promises.writeFile': 2 });
  `);
  assert.equal(audit.filter(event => event.type === 'match').length, 4);
  assert.ok(audit.filter(event => event.type === 'failure').every(event => event.partialBytesWritten === 2));
});

test('fault callbacks and native prefix writes remain live when the virtual clock preload is also active', async () => {
  const { audit } = await child(`
    const clock = globalThis[Symbol.for('omd.simulation.clock')];
    await clock.enable(1800000000000);
    const target = join(root, 'clock-and-fault');
    faults.arm({ operation: 'write', path: target });
    await assert.rejects(promisify(callbackWrite)(target, 'blocked'), { code: 'EIO' });
    faults.arm({ operation: 'write', path: target, partialBytes: 2, code: 'ENOSPC' });
    await assert.rejects(promiseWrite(target, 'prefix'), { code: 'ENOSPC' });
    assert.equal(syncRead(target, 'utf8'), 'pr');
    await promiseWrite(target, 'recovered');
    assert.equal(syncRead(target, 'utf8'), 'recovered');
    assert.equal(Date.now(), 1800000000000);
  `, { clock: true });
  assert.ok(audit.filter(event => event.type === 'failure').every(event => event.at === 1800000000000));
});

test('arm rejects invalid configurations, traversal, escaped symlinks and reserved audit paths', async () => {
  await child(`
    const target = join(root, 'valid');
    const escapedFile = join(outside, 'external');
    syncWrite(target, 'inside');
    syncWrite(escapedFile, 'outside fixture');
    fs.symlinkSync(outside, join(root, 'escape-dir'));
    fs.symlinkSync(escapedFile, join(root, 'escape-file'));
    fs.symlinkSync(join(outside, 'missing-parent', 'new-file'), join(root, 'dangling-escape'));
    fs.symlinkSync('loop', join(root, 'loop'));
    const invalidPaths = [escapedFile, join(root, '..', 'outside', 'new'), join(root, 'escape-file'),
      join(root, 'escape-dir', 'new-parent', 'new'), join(root, 'dangling-escape'), join(root, 'dangling-escape', 'child'),
      root + '/escape-dir/../outside-file', root + '/missing/../valid', join(root, 'loop'), root, join(root, 'faults.jsonl'), '', 'relative', target + '\\0'];
    for (const path of invalidPaths) assert.throws(() => faults.arm({ operation: 'write', path }), undefined, JSON.stringify(path));
    for (const count of [0, -1, 1.2, NaN, Infinity, '1']) assert.throws(() => faults.arm({ operation: 'write', path: target, count }), /count/);
    for (const config of [null, [], {}, { operation: 'unknown', path: target }, { operation: 'write', path: target, code: 'ENOENT' },
      { operation: 'read', path: target, partialBytes: 1 }, { operation: 'write', path: target, partialBytes: -1 },
      { operation: 'write', path: target, partialBytes: 1.5 }]) assert.throws(() => faults.arm(config));
    assert.equal(faults.snapshot().active, null);
    assert.equal(syncRead(escapedFile, 'utf8'), 'outside fixture');
    const alias = join(root, 'safe-alias');
    fs.symlinkSync(target, alias);
    faults.arm({ operation: 'write', path: alias });
    assert.equal(faults.snapshot().active.path, fs.realpathSync.native(target));
    assert.throws(() => syncWrite(target, 'blocked'), { code: 'EIO' });
    assert.equal(syncRead(target, 'utf8'), 'inside');
  `);
});

test('clear, unconsumed-arm protection, immutable snapshots and independent audit remain consistent', async () => {
  const { value, audit } = await child(`
    const target = join(root, 'ledger');
    syncWrite(target, 'ledger data');
    const armed = faults.arm({ operation: 'read', path: target, count: 3 });
    assert.equal(armed.remaining, 3);
    assert.throws(() => faults.arm({ operation: 'unlink', path: target }), /unconsumed/);
    armed.active.remaining = 99;
    armed.events[1].fault.remaining = 99;
    assert.equal(faults.snapshot().remaining, 3);
    assert.equal(faults.snapshot().events[1].fault.remaining, 3);
    assert.throws(() => syncRead(target), { code: 'EIO' });
    assert.equal(faults.snapshot().remaining, 2);
    assert.equal(faults.snapshot().events[1].fault.remaining, 3);
    const cleared = faults.clear();
    assert.equal(cleared.active, null);
    assert.equal(cleared.remaining, 0);
    assert.equal(syncRead(target, 'utf8'), 'ledger data');
    assert.ok(Object.isFrozen(faults));
    assert.equal(faults.snapshot().auditErrors.length, 0);
    return faults.snapshot();
  `);
  assert.deepEqual(audit, value.events);
  assert.equal(audit.at(-1).type, 'clear');
  assert.equal(audit.at(-1).remaining, 2);
  assert.deepEqual(audit.map((event) => event.sequence), audit.map((_, index) => index + 1));
});

test('already-open FileHandle and numeric descriptor operations are explicitly outside the wrapped boundary', async () => {
  await child(`
    const target = join(root, 'existing-handle');
    syncWrite(target, 'initial');
    const handle = await promiseOpen(target, 'r+');
    const fd = syncOpen(target, 'r+');
    faults.arm({ operation: 'write', path: target });
    await handle.writeFile('handle');
    syncWrite(fd, 'fd');
    assert.equal(faults.snapshot().remaining, 1);
    assert.equal(syncRead(target, 'utf8').slice(0, 2), 'fd');
    assert.ok(faults.snapshot().boundaries.includes('already-open fs.FileHandle methods'));
    assert.ok(faults.snapshot().boundaries.includes('numeric file descriptors'));
    faults.clear();
    await handle.close();
    fs.closeSync(fd);
  `);
});

test('the explicit native publication bridge matches only an armed exact destination inside the isolated root', async () => {
  const { audit } = await child(`
    const target = join(root, 'target'), staging = join(root, 'staging'), other = join(root, 'other');
    syncWrite(target, 'old'); syncWrite(staging, 'new'); syncWrite(other, 'unrelated');
    faults.beforeNativePublication(target, staging);
    assert.deepEqual(faults.snapshot().matches, []);
    faults.arm({ operation: 'write', path: target, code: 'ENOSPC' });
    faults.beforeNativePublication(other, staging);
    faults.beforeNativePublication(target, join(outside, 'staging'));
    assert.equal(faults.snapshot().remaining, 1);
    assert.throws(() => faults.beforeNativePublication(target, staging), error => {
      assert.equal(error.code, 'ENOSPC'); assert.equal(error.syscall, 'nativePublication');
      assert.equal(error.path, fs.realpathSync.native(target)); return true;
    });
    assert.equal(faults.snapshot().remaining, 0);
    faults.beforeNativePublication(target, staging);
    assert.equal(syncRead(target, 'utf8'), 'old'); assert.equal(syncRead(staging, 'utf8'), 'new');
    assert.equal(faults.snapshot().matches.length, 1);
    faults.arm({ operation: 'rename', path: target });
    faults.beforeNativePublication(target, staging);
    assert.equal(faults.snapshot().remaining, 1); faults.clear();
    faults.arm({ operation: 'write', path: target, partialBytes: 1 });
    assert.throws(() => faults.beforeNativePublication(target, staging), { code: 'ERR_SIM_FAULT_PARTIAL_UNSUPPORTED' });
    assert.equal(faults.snapshot().remaining, 1); faults.clear();
  `);
  assert.deepEqual(audit.filter(event => event.type === 'failure').map(event => [event.api, event.error.code]),
    [['host.inspectTemp.afterSyncBeforePublication', 'ENOSPC']]);
});

test('the actual installed DSH atomic writer rejects after-sync before-publication faults, cleans staging and recovers', async () => {
  const { audit } = await child(`
    const localModule = hostRequire.resolve('@deepseek-ai/dsh-fs-local');
    const localRequire = createRequire(localModule);
    const { Context } = await import(pathToFileURL(localRequire.resolve('@deepseek-ai/cordis')).href);
    const { LocalFileSystem } = await import(pathToFileURL(localModule).href);
    const workspace = join(root, 'workspace');
    await promises.mkdir(workspace);
    const ctx = new Context();
    const fiber = await ctx.plugin(LocalFileSystem, { cwd: workspace });
    await globalThis[Symbol.for('omd.simulation.clock')].enable(1800000000000);
    try {
      const target = await ctx.fs.resolve('fault.txt');
      faults.arm({ operation: 'write', path: target.targetKey });
      await assert.rejects(ctx.fs.writeText(target, 'first attempt', { kind: 'createIfAbsent' }),
        error => error.code === 'FS_IO_ERROR' && error.message.includes('EIO') && error.cause?.code === 'EIO');
      assert.equal(fs.existsSync(target.targetKey), false);
      assert.deepEqual(await promises.readdir(workspace), []);
      assert.equal(faults.snapshot().remaining, 0);
      assert.equal(faults.snapshot().matches.at(-1).api, 'fs.promises.link');
      const created = await ctx.fs.writeText(target, 'recovered create', { kind: 'createIfAbsent' });
      assert.equal(created.operation, 'create');
      assert.equal(await ctx.fs.readText(target), 'recovered create');
      const version = (await ctx.fs.stat(target)).version;
      // Windows replacements use private ReplaceFileW, bypassing Node rename.
      // Bridge only this fixture's known write through the host's existing
      // after-sync inspectTemp seam; keep its actual DACL/native publication.
      const internals = ctx.fs.internals;
      const descriptor = Object.getOwnPropertyDescriptor(internals, 'inspectTemp');
      const originalInspect = internals.inspectTemp;
      if (process.platform === 'win32') internals.inspectTemp = async info => {
        await originalInspect?.call(internals, info);
        faults.beforeNativePublication(target.targetKey, info.tempPath);
      };
      try {
        faults.arm({ operation: 'write', path: target.targetKey, code: 'ENOSPC' });
        await assert.rejects(ctx.fs.writeText(target, 'blocked update', { kind: 'replaceIfVersion', version }), { code: 'ENOSPC' });
        assert.equal(await ctx.fs.readText(target), 'recovered create');
        assert.equal((await ctx.fs.stat(target)).version, version);
        assert.deepEqual(await promises.readdir(workspace), ['fault.txt']);
        assert.equal(faults.snapshot().remaining, 0);
        assert.equal(faults.snapshot().matches.at(-1).api, process.platform === 'win32'
          ? 'host.inspectTemp.afterSyncBeforePublication' : 'fs.promises.rename');
        // The consumed arm is transparent: on Windows this still really runs
        // the host's default ReplaceFileW implementation and DACL handling.
        const updated = await ctx.fs.writeText(target, 'recovered update', { kind: 'replaceIfVersion', version });
        assert.equal(updated.operation, 'update');
        assert.equal(await ctx.fs.readText(target), 'recovered update');
        assert.deepEqual(await promises.readdir(workspace), ['fault.txt']);
      } finally {
        if (descriptor) Object.defineProperty(internals, 'inspectTemp', descriptor);
        else delete internals.inspectTemp;
      }
      assert.deepEqual(Object.getOwnPropertyDescriptor(internals, 'inspectTemp'), descriptor);
      assert.equal(internals.inspectTemp, originalInspect);
    } finally { await fiber.dispose(); }
  `, { clock: true });
  assert.deepEqual(audit.filter(event => event.type === 'failure').map(event => [event.api, event.error.code]),
    [['fs.promises.link', 'EIO'], [process.platform === 'win32' ? 'host.inspectTemp.afterSyncBeforePublication' : 'fs.promises.rename', 'ENOSPC']]);
});

test('atomic publication write faults match only exact destinations across sync/callback/promises link and rename', async () => {
  const { audit } = await child(`
    assert.equal(callbackLink, fs.link);
    assert.equal(syncLink, fs.linkSync);
    assert.equal(promiseLink, promises.link);
    for (const name of ['link', 'rename']) {
      for (const kind of ['sync', 'callback', 'promise']) {
        const source = join(root, 'arbitrary-source-' + name + '-' + kind);
        const destination = join(root, 'destination-' + name + '-' + kind);
        syncWrite(source, 'staged data');
        faults.arm({ operation: 'write', path: destination });
        if (kind === 'sync') assert.throws(() => fs[name + 'Sync'](source, destination), { code: 'EIO' });
        else if (kind === 'callback') await assert.rejects(promisify(fs[name])(source, destination), { code: 'EIO' });
        else await assert.rejects(promises[name](source, destination), { code: 'EIO' });
        assert.equal(syncRead(source, 'utf8'), 'staged data');
        assert.equal(fs.existsSync(destination), false);
        assert.equal(faults.snapshot().remaining, 0);
        assert.equal(faults.snapshot().matches.at(-1).path, faults.snapshot().active.path);
        if (kind === 'sync') fs[name + 'Sync'](source, destination);
        else if (kind === 'callback') await promisify(fs[name])(source, destination);
        else await promises[name](source, destination);
        assert.equal(syncRead(destination, 'utf8'), 'staged data');
      }
    }
    const source = join(root, 'source-match-must-not-be-a-write-target');
    syncWrite(source, 'other source');
    faults.arm({ operation: 'write', path: source });
    fs.linkSync(source, source + '-linked');
    fs.renameSync(source, source + '-moved');
    assert.equal(faults.snapshot().remaining, 1);
    faults.clear();
  `);
  assert.equal(audit.filter(event => event.type === 'match').length, 6);
  assert.equal(new Set(audit.filter(event => event.type === 'match').map(event => event.api)).size, 6);
});
