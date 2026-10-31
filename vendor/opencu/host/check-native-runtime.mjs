import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, copyFile, mkdtemp, realpath, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { prepareNativeRuntime } from './native-runtime.mjs';

const file = fileURLToPath(import.meta.url);
const run = promisify(execFile);

/** Exercise signed native binaries in subprocesses, never in the packaging process. */
export async function checkNativeRuntime(directory, { node = process.execPath } = {}) {
  const root = await realpath(directory);
  if (root.includes('.app/') || root.endsWith('.app')) throw Error('Check an extracted private runtime, not an installed app');
  await prepareNativeRuntime(root, { check: true });
  if (process.platform !== 'darwin') return { platform: process.platform, checked: false };
  const results = [];
  for (const variant of ['require', 'import', 'require-indirect', 'import-indirect']) {
    const { stdout } = await run(node, [file, root, '--worker', variant], {
      cwd: root, timeout: 20000, maxBuffer: 1024 * 1024,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '', NODE_PATH: '', DSH_NODE_PTY_SPAWN_HELPER: '' },
    });
    results.push(JSON.parse(stdout.trim()));
  }
  return { platform: process.platform, checked: true, results };
}

async function exercise(root, variant) {
  const require = createRequire(join(root, 'package.json'));
  const original = process.dlopen;
  const koffiRoot = dirname(require.resolve('koffi'));
  const indirect = variant.endsWith('-indirect');
  const loaded = variant.startsWith('import')
    ? await import(pathToFileURL(join(koffiRoot, indirect ? 'indirect.js' : 'index.js')))
    : require(indirect ? 'koffi/indirect' : 'koffi');
  assert.equal(process.dlopen, original, 'Koffi must restore the native loader');
  const koffi = loaded.default ?? loaded;
  assert.equal(koffi.load('/usr/lib/libSystem.B.dylib').func('int getpid()')(), process.pid);
  const pty = require('node-pty');
  const ptyRoot = dirname(dirname(require.resolve('node-pty')));
  const nativePath = join(ptyRoot, 'prebuilds', `darwin-${process.arch}`);
  const native = require(join(nativePath, 'pty.node'));
  assert.throws(() => native.fork(), /Usage:/);
  assert.throws(() => native.resize(-1, 80, 24));
  const temporary = await mkdtemp(join(root, '.native-smoke-'));
  try {
    const denied = join(temporary, 'spawn-helper');
    await copyFile(join(nativePath, 'spawn-helper'), denied);
    await chmod(denied, 0o600);
    for (const helper of [denied, join(temporary, 'missing-helper')]) {
      assert.throws(() => native.fork('/bin/sh', ['-c', 'exit 0'], ['PATH=/usr/bin:/bin'], root, 80, 24, -1, -1, true, helper, () => {}));
    }
    for (let attempt = 0; attempt < 3; attempt++) await new Promise((resolvePromise, reject) => {
      const terminal = pty.spawn('/bin/sh', ['-c', 'printf "terminal-ready\\n"; read answer; printf "answer:%s\\n" "$answer"'], {
        cwd: root, cols: 80, rows: 24, env: { PATH: '/usr/bin:/bin', TERM: 'xterm-256color' },
      });
      let output = '', sent = false;
      const timer = setTimeout(() => { terminal.kill(); reject(Error('Terminal round trip timed out')); }, 5000);
      terminal.onData(data => {
        output += data;
        if (!sent && output.includes('terminal-ready')) { sent = true; terminal.resize(100, 30); terminal.write('verified\n'); }
      });
      terminal.onExit(({ exitCode, signal }) => {
        clearTimeout(timer);
        try { assert.equal(exitCode, 0); assert.equal(signal, 0); assert(output.includes('answer:verified')); resolvePromise(); }
        catch (error) { reject(error); }
      });
    });
  } finally { await rm(temporary, { recursive: true, force: true }); }
  return { variant, node: process.versions.node, nativeErrors: 4, terminalRoundTrips: 3 };
}

if (process.argv[1] && resolve(process.argv[1]) === file) {
  if (!process.argv[2]) throw Error('Usage: node host/check-native-runtime.mjs /absolute/private/runtime');
  const root = await realpath(process.argv[2]);
  if (root.includes('.app/') || root.endsWith('.app')) throw Error('Check an extracted private runtime, not an installed app');
  console.log(JSON.stringify(process.argv[3] === '--worker'
    ? await exercise(root, process.argv[4]) : await checkNativeRuntime(root)));
}
