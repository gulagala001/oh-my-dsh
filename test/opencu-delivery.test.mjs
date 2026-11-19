import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { gzipSync, gunzipSync } from 'node:zlib';
import { nativePackageModes } from '../scripts/native-package-modes.mjs';
import { deliveryBaseline, verifyDeliveryArchive } from '../scripts/check-opencu-delivery.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const entry = 'opencu-client-AAAAAAAA.js';
const runtime = Buffer.from('export const ready = true;');
const client = Buffer.from(`import("/api/opencu/rea-assets/${entry}")`);
const helper = 'native/bin/darwin-arm64/OpenCU Helper.app/Contents/MacOS/opencu-native';
const vendor = {
  ['lib/rea-assets/' + entry]: runtime,
  'lib/rea-assets/manifest.json': Buffer.from(JSON.stringify([{file:entry, sha256:hash(runtime), source:'opencu-client-build'}])),
  'lib/client.js': Buffer.from('synthetic classic client\n'),
  'src/dsh/shared.mjs': Buffer.from('export const synthetic = true;\n'),
  [helper]: Buffer.from('synthetic helper bytes; never executed\n'),
};
const manifest = Buffer.from(JSON.stringify({ files: Object.fromEntries(Object.entries(vendor).map(([name, bytes]) => [name, hash(bytes)])) }) + '\n');
const packageJson = Buffer.from(JSON.stringify({ main: 'src/index.mjs', exports: { './client': './lib/client.js' } }));
const baseline = { client, manifest, packageJson };
const entries = () => new Map([
  ['package/lib/client.js', client], ['package/vendor/opencu.json', manifest],
  ['package/package.json', packageJson], ['package/src/index.mjs', Buffer.from('export const synthetic = true;')], ['package/LICENSE', Buffer.from('Synthetic license fixture')],
  ...Object.entries(vendor).filter(([name]) => name !== 'lib/client.js').map(([name, bytes]) => ['package/vendor/opencu/' + name, bytes]),
]);

async function directory(t) {
  const path = await mkdtemp(join(tmpdir(), 'omd-delivery-test-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

// Write the requested ustar modes directly. NTFS chmod cannot model Unix modes.
function archive(files = entries(), helperMode = 0o755, ordinaryMode = 0o644) {
  const parts = [];
  for (const [name, bytes] of files) {
    const header = Buffer.alloc(512);
    const split = name.length > 100 ? name.lastIndexOf('/') : -1;
    header.write(name.slice(split + 1), 0, 100);
    if (split !== -1) header.write(name.slice(0, split), 345, 155);
    const mode = name === 'package/vendor/opencu/' + helper ? helperMode : ordinaryMode;
    header.write(mode.toString(8).padStart(7, '0') + '\0', 100);
    header.write('0000000\0'.repeat(2), 108);
    header.write(bytes.length.toString(8).padStart(11, '0') + '\0', 124);
    header.write('00000000000\0', 136);
    header.fill(32, 148, 156);
    header[156] = 48;
    header.write('ustar\0' + '00', 257);
    header.write(header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0') + '\0 ', 148);
    parts.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...parts, Buffer.alloc(1024)]));
}

test('rebuilt root runtime must equal HEAD even for a whitespace-only change', async t => {
  const path = await directory(t);
  for (const [name, bytes] of [['lib/client.js', client], ['vendor/opencu.json', manifest], ['package.json', packageJson]]) {
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

test('actual tgz matches every vendor hash with only the classic client excluded', () => {
  const result = verifyDeliveryArchive(archive(), baseline);
  assert.equal(result.vendorMembers, 4);
  assert.equal(result.rootClientSha256, hash(client));
  assert.deepEqual(result.helpers, [{ file: helper, mode: '0755' }]);
});

test('matching root and vendor baselines must still reference the same runtime', () => {
  const stale = Buffer.from('import("/api/opencu/rea-assets/opencu-client-BBBBBBBB.js")');
  const files = entries(); files.set('package/lib/client.js', stale);
  const packed = archive(files);
  assert.throws(() => verifyDeliveryArchive(packed, {...baseline, client:stale}), /differs from the served OpenCU runtime/);
});

test('actual runtime archive rejects website media and maintainer-only tools', () => {
  for (const name of ['docs/images/hero.png', 'scripts/simulator/README.md']) {
    const files = entries(); files.set('package/' + name, Buffer.from('not a runtime resource'));
    const packed = archive(files);
    assert.throws(() => verifyDeliveryArchive(packed, baseline), /Non-runtime files in OMD package/);
  }
});

test('actual archive cannot drop an entrypoint or rewrite its manifest to hide it', () => {
  const files = entries(); files.delete('package/src/index.mjs');
  const missing = archive(files);
  assert.throws(() => verifyDeliveryArchive(missing, baseline), /Missing package entrypoint: src\/index.mjs/);
  files.set('package/package.json', Buffer.from(JSON.stringify({ main: 'lib/client.js' })));
  const disguised = archive(files);
  assert.throws(() => verifyDeliveryArchive(disguised, baseline), /package.json differs/);
});

test('packaged documentation checks final inventory and ignores fenced examples', () => {
  const files = entries(); files.set('package/README.md', Buffer.from('[site](docs/index.html)'));
  const broken = archive(files);
  assert.throws(() => verifyDeliveryArchive(broken, baseline), /Missing packaged documentation targets/);
  files.set('package/README.md', Buffer.from('[site](https://example.invalid/)\n```md\n[example](not-shipped)\n```\n'));
  verifyDeliveryArchive(archive(files), baseline);
});

for (const mode of [0o644, 0o700]) test(`actual tgz helper mode ${mode.toString(8)} fails despite matching bytes`, () => {
  const packed = archive(entries(), mode);
  assert.throws(() => verifyDeliveryArchive(packed, baseline), /Packed macOS helper must be 0755/);
});

test('actual tgz cannot omit a required vendor member', () => {
  const files = entries(); files.delete('package/vendor/opencu/src/dsh/shared.mjs');
  const packed = archive(files);
  assert.throws(() => verifyDeliveryArchive(packed, baseline), /Missing packed OpenCU member: src\/dsh\/shared.mjs/);
});

test('actual tgz cannot add a vendor member', () => {
  const files = entries(); files.set('package/vendor/opencu/src/unexpected.mjs', Buffer.from('extra'));
  const packed = archive(files);
  assert.throws(() => verifyDeliveryArchive(packed, baseline), /Unexpected packed OpenCU member: src\/unexpected.mjs/);
});

test('actual tgz cannot replace a missing member with an extra member of the same count', () => {
  const files = entries(); files.delete('package/vendor/opencu/src/dsh/shared.mjs');
  files.set('package/vendor/opencu/src/stale.mjs', vendor['src/dsh/shared.mjs']);
  const packed = archive(files);
  assert.throws(() => verifyDeliveryArchive(packed, baseline), /Unexpected packed OpenCU member: src\/stale.mjs/);
});

test('actual tgz cannot change member bytes while retaining its name and length', () => {
  const files = entries(); files.set('package/vendor/opencu/src/dsh/shared.mjs', Buffer.from(vendor['src/dsh/shared.mjs'].toString().replace('true', 'null')));
  const packed = archive(files);
  assert.throws(() => verifyDeliveryArchive(packed, baseline), /Packed OpenCU hash mismatch: src\/dsh\/shared.mjs/);
});

test('classic client must stay excluded rather than silently increasing the allowance', () => {
  const files = entries(); files.set('package/vendor/opencu/lib/client.js', vendor['lib/client.js']);
  const packed = archive(files);
  assert.throws(() => verifyDeliveryArchive(packed, baseline), /Unexpected packed OpenCU member: lib\/client.js/);
});

test('actual tgz root client must equal the committed rebuild', () => {
  const files = entries(); files.set('package/lib/client.js', Buffer.from('stale bundle'));
  const packed = archive(files);
  assert.throws(() => verifyDeliveryArchive(packed, baseline), /Packed lib\/client.js differs/);
});

test('a changed package manifest cannot redefine the expected vendor hashes', () => {
  const files = entries(); files.set('package/vendor/opencu.json', Buffer.from('{"files":{}}'));
  const packed = archive(files);
  assert.throws(() => verifyDeliveryArchive(packed, baseline), /Packed vendor\/opencu.json differs from HEAD/);
});

// Exercise the production pack step with actual signed distribution bytes.
// On macOS nativePackageModes also runs the real codesign distribution check.
for (const mode of [0o644, 0o700]) test(`production pack normalizes ${mode.toString(8)} without changing payload`, async t => {
  const actualVendor = { ...vendor };
  for (const name of [helper, 'native/bin/darwin-arm64/OpenCU Helper.app/Contents/Info.plist',
    'native/bin/darwin-arm64/OpenCU Helper.app/Contents/_CodeSignature/CodeResources', 'native/macos/signing-identity.json']) {
    actualVendor[name] = await readFile(new URL('../vendor/opencu/' + name, import.meta.url));
  }
  const actualManifest = Buffer.from(JSON.stringify({ files: Object.fromEntries(Object.entries(actualVendor).map(([name, bytes]) => [name, hash(bytes)])) }) + '\n');
  const actualBaseline = { ...baseline, manifest: actualManifest };
  const files = new Map([
    ...entries(),
    ['package/lib/client.js', client], ['package/vendor/opencu.json', actualManifest],
    ...Object.entries(actualVendor).filter(([name]) => name !== 'lib/client.js').map(([name, bytes]) => ['package/vendor/opencu/' + name, bytes]),
  ]);
  const raw = archive(files, mode);
  assert.throws(() => verifyDeliveryArchive(raw, actualBaseline), /Packed macOS helper must be 0755/);
  const path = await directory(t), rawPath = join(path, 'raw.tgz'), finalPath = join(path, 'final.tgz');
  await writeFile(rawPath, raw); await writeFile(finalPath, raw);
  await nativePackageModes(finalPath);
  assert.deepEqual(await readFile(rawPath), raw, 'raw archive remains unchanged');
  const final = await readFile(finalPath);
  const result = verifyDeliveryArchive(final, actualBaseline);
  assert.deepEqual(result.helpers, [{ file: helper, mode: '0755' }]);
  const before = gunzipSync(raw), after = gunzipSync(final);
  let adjusted = 0;
  const text = (offset, size) => before.subarray(offset, offset + size).toString().replace(/\0.*$/s, '');
  for (let offset = 0; offset + 512 <= before.length;) {
    if (before.subarray(offset, offset + 512).every(byte => byte === 0)) break;
    const name = text(offset, 100), prefix = text(offset + 345, 155);
    if ((prefix ? prefix + '/' + name : name) === 'package/vendor/opencu/' + helper) {
      after.copy(before, offset + 100, offset + 100, offset + 108);
      after.copy(before, offset + 148, offset + 148, offset + 156);
      adjusted++;
    }
    const size = Number.parseInt(text(offset + 124, 12).trim(), 8);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  assert.equal(adjusted, 1);
  assert.deepEqual(before, after, 'only helper mode and its header checksum change; every payload byte remains identical');
});

test('actual tgz ordinary vendor files cannot retain temporary 0600 modes', () => {
  const packed = archive(entries(), 0o755, 0o600);
  assert.throws(() => verifyDeliveryArchive(packed, baseline), /Packed OpenCU file must be 0644/);
});
