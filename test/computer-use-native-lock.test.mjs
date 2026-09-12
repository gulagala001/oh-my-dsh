import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const run = promisify(execFile);
for (const newline of ['\n', '\r\n']) test('native installation lock accepts a fragmented ' + JSON.stringify(newline) + ' acknowledgement and releases on EOF', { timeout: 10000 }, async t => {
  const root = await mkdtemp(join(tmpdir(), 'oh-my-dsh-native-lock-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  // node install-lock <path> exercises the actual production launcher/parser
  // with a real child process, without depending on a platform-native binary.
  await writeFile(join(root, 'install-lock'), `
process.stdin.resume();
process.stdin.on('end', () => process.exit(0));
process.stdout.write('loc');
setTimeout(() => {
  process.stdout.write('ked' + ${JSON.stringify(newline.slice(0, -1))});
  setTimeout(() => process.stdout.write('\\n'), 20);
}, 20);
`);
  const source = `import { nativeLock } from ${JSON.stringify(new URL('../src/computer-use/native-lock.mjs', import.meta.url).href)};
const release = await nativeLock(process.execPath, 'fixture');
process.stdout.write('acquired\\n');
await release();
process.stdout.write('released\\n');`;
  const result = await run(process.execPath, ['--input-type=module', '-e', source], { cwd: root, timeout: 4000 });
  assert.equal(result.stdout, 'acquired\nreleased\n');
  assert.equal(result.stderr, '');
});
