import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { deliveryBaseline, verifyDeliveryArchive } from '../scripts/check-opencu-delivery.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const client = Buffer.from('window.__ModuleLoader__.load({ id: "synthetic" });\n');
const helper = 'native/bin/darwin-arm64/OpenCU Helper.app/Contents/MacOS/opencu-native';
const vendor = {
  'lib/client.js': Buffer.from('synthetic classic client\n'),
  'lib/client.factory.mjs': Buffer.from('export function createOpenCU() {}\n'),
  'src/dsh/shared.mjs': Buffer.from('export const synthetic = true;\n'),
  [helper]: Buffer.from('synthetic helper bytes; never executed\n'),
};
const manifest = Buffer.from(JSON.stringify({ files: Object.fromEntries(Object.entries(vendor).map(([name, bytes]) => [name, hash(bytes)])) }) + '\n');
const baseline = { client, manifest };
const entries = () => new Map([
  ['package/lib/client.js', client], ['package/vendor/opencu.json', manifest],
  ...Object.entries(vendor).filter(([name]) => name !== 'lib/client.js').map(([name, bytes]) => ['package/vendor/opencu/' + name, bytes]),
]);

async function directory(t) {
  const path = await mkdtemp(join(tmpdir(), 'omd-delivery-test-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

async function archive(t, files = entries(), helperMode = 0o755) {
  const path = await directory(t);
  for (const [name, bytes] of files) {
    await mkdir(dirname(join(path, name)), { recursive: true });
    await writeFile(join(path, name), bytes);
    if (name === 'package/vendor/opencu/' + helper) await chmod(join(path, name), helperMode);
  }
  const output = join(path, 'actual.tgz');
  execFileSync('tar', ['--format=ustar', '-czf', output, '-C', path, ...files.keys()]);
  return readFile(output);
}

test('rebuilt root runtime must equal HEAD even for a whitespace-only change', async t => {
  const path = await directory(t);
  for (const [name, bytes] of [['lib/client.js', client], ['vendor/opencu.json', manifest]]) {
    await mkdir(dirname(join(path, name)), { recursive: true });
    await writeFile(join(path, name), bytes);
  }
  const git = args => execFileSync('git', args, { cwd: path, stdio: 'pipe' });
  git(['init', '-q']);
  git(['add', '.']);
  git(['-c', 'user.name=Synthetic test', '-c', 'user.email=synthetic@example.invalid', 'commit', '-qm', 'Synthetic delivery baseline']);
  assert.deepEqual(await deliveryBaseline(path), baseline);
  await writeFile(join(path, 'lib/client.js'), Buffer.concat([client, Buffer.from('\n')]));
  await assert.rejects(deliveryBaseline(path), /Rebuilt lib\/client.js differs from HEAD/);
});

test('actual tgz matches every vendor hash with only the classic client excluded', async t => {
  const result = verifyDeliveryArchive(await archive(t), baseline);
  assert.equal(result.vendorMembers, 3);
  assert.equal(result.rootClientSha256, hash(client));
  assert.deepEqual(result.helpers, [{ file: helper, mode: '0755' }]);
});

for (const mode of [0o644, 0o700]) test(`actual tgz helper mode ${mode.toString(8)} fails despite matching bytes`, async t => {
  const packed = await archive(t, entries(), mode);
  assert.throws(() => verifyDeliveryArchive(packed, baseline), /Packed macOS helper must be 0755/);
});

test('actual tgz cannot omit a required vendor member', async t => {
  const files = entries(); files.delete('package/vendor/opencu/src/dsh/shared.mjs');
  const packed = await archive(t, files);
  assert.throws(() => verifyDeliveryArchive(packed, baseline), /Missing packed OpenCU member: src\/dsh\/shared.mjs/);
});

test('actual tgz cannot add a vendor member', async t => {
  const files = entries(); files.set('package/vendor/opencu/src/unexpected.mjs', Buffer.from('extra'));
  const packed = await archive(t, files);
  assert.throws(() => verifyDeliveryArchive(packed, baseline), /Unexpected packed OpenCU member: src\/unexpected.mjs/);
});

test('actual tgz cannot replace a missing member with an extra member of the same count', async t => {
  const files = entries(); files.delete('package/vendor/opencu/src/dsh/shared.mjs');
  files.set('package/vendor/opencu/src/stale.mjs', vendor['src/dsh/shared.mjs']);
  const packed = await archive(t, files);
  assert.throws(() => verifyDeliveryArchive(packed, baseline), /Unexpected packed OpenCU member: src\/stale.mjs/);
});

test('actual tgz cannot change member bytes while retaining its name and length', async t => {
  const files = entries(); files.set('package/vendor/opencu/src/dsh/shared.mjs', Buffer.from(vendor['src/dsh/shared.mjs'].toString().replace('true', 'null')));
  const packed = await archive(t, files);
  assert.throws(() => verifyDeliveryArchive(packed, baseline), /Packed OpenCU hash mismatch: src\/dsh\/shared.mjs/);
});

test('classic client must stay excluded rather than silently increasing the allowance', async t => {
  const files = entries(); files.set('package/vendor/opencu/lib/client.js', vendor['lib/client.js']);
  const packed = await archive(t, files);
  assert.throws(() => verifyDeliveryArchive(packed, baseline), /Unexpected packed OpenCU member: lib\/client.js/);
});

test('actual tgz root client must equal the committed rebuild', async t => {
  const files = entries(); files.set('package/lib/client.js', Buffer.from('stale bundle'));
  const packed = await archive(t, files);
  assert.throws(() => verifyDeliveryArchive(packed, baseline), /Packed lib\/client.js differs/);
});

test('a changed package manifest cannot redefine the expected vendor hashes', async t => {
  const files = entries(); files.set('package/vendor/opencu.json', Buffer.from('{"files":{}}'));
  const packed = await archive(t, files);
  assert.throws(() => verifyDeliveryArchive(packed, baseline), /Packed vendor\/opencu.json differs from HEAD/);
});
