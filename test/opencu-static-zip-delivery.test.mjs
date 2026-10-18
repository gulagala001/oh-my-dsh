import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import test from 'node:test';
import { buildExtensionZip } from '../vendor/opencu/src/extension/distribution.mjs';
import { deliveryBaseline, verifyDeliveryArchive } from '../scripts/check-opencu-delivery.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const base = 'e1a4ac251acdacf6ee23c400cf782c4809acbfe3';
const source = '53128743490aa10e4e36e9ab9de3c492ad0f973d';
const additions = ['lib/extension.zip', 'src/extension/distribution.json', 'src/extension/distribution.mjs'];
const zipSha256 = 'e4109c04b73b0231e7ff17a957e0c96983fb28f4e7eea8f71dce79466c65a8ac';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Fault injection in owned memory only; no extraction, server or browser.
function changedArchive(archive, member, change) {
  const tar = gunzipSync(archive), records = [];
  let matched = 0;
  const text = (start, size) => tar.subarray(start, start + size).toString().replace(/\0.*$/s, '');
  for (let offset = 0; offset + 512 <= tar.length;) {
    if (tar.subarray(offset, offset + 512).every(byte => byte === 0)) break;
    const name = [text(offset + 345, 155), text(offset, 100)].filter(Boolean).join('/');
    const size = Number.parseInt(text(offset + 124, 12).trim(), 8);
    const end = offset + 512 + Math.ceil(size / 512) * 512;
    const record = Buffer.from(tar.subarray(offset, end));
    if (name === member) {
      matched++;
      if (change === 'drop') { offset = end; continue; }
      if (change === 'bytes') record[512] ^= 1;
      else {
        record.write(change.toString(8).padStart(7, '0') + '\0', 100, 8, 'ascii');
        record.fill(32, 148, 156);
        const checksum = record.subarray(0, 512).reduce((sum, byte) => sum + byte, 0);
        record.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
      }
    }
    records.push(record); offset = end;
  }
  assert.equal(matched, 1, 'Fault targets exactly one actual package member');
  return gzipSync(Buffer.concat([...records, Buffer.alloc(1024)]));
}

test('final OMD tgz retains the complete established envelope plus all three static ZIP dependencies', async () => {
  assert(process.env.OMD_DELIVERY_ARCHIVE, 'Supply the actual final tgz after build, pack and nativePackageModes; no skip or synthetic package fallback');
  const archive = await readFile(await realpath(process.env.OMD_DELIVERY_ARCHIVE));
  const baseline = await deliveryBaseline(root), manifest = JSON.parse(baseline.manifest);
  const old = JSON.parse(execFileSync('git', ['show', base + ':vendor/opencu.json'], { cwd: root, maxBuffer: 1024 * 1024 }));
  assert.equal(manifest.source, 'https://github.com/gulagala001/opencu/tree/' + source);
  assert.equal(Object.keys(old.files).length, 611);
  assert.deepEqual(Object.keys(manifest.files).sort(), [...Object.keys(old.files), ...additions].sort());
  assert.equal(Object.keys(manifest.files).length, 614);
  assert(manifest.files['CHANGELOG.md']); assert(!manifest.files['native/README.md']);
  const pkg = JSON.parse(await readFile(join(root, 'vendor/opencu/package.json')));
  assert(!Object.hasOwn(pkg, 'scripts'));
  assert.equal(pkg.opencu.sourceCommit, '687f282e8625c6b8d11ff58211a90524be2e4317', 'DSH source identity is not the OpenCU source commit');
  assert.deepEqual(pkg.files, JSON.parse(execFileSync('git', ['show', base + ':vendor/opencu/package.json'], { cwd: root })).files);
  for (const name of additions) assert.equal(hash(await readFile(join(root, 'vendor/opencu', name))), manifest.files[name]);
  const zip = await readFile(join(root, 'vendor/opencu/lib/extension.zip'));
  assert.equal(zip.length, 156564); assert.equal(hash(zip), zipSha256);
  assert(zip.equals(await buildExtensionZip(join(root, 'vendor/opencu'))), 'Shipped ZIP equals the actual installed production builder over all 18 static members');
  const distribution = JSON.parse(await readFile(join(root, 'vendor/opencu/src/extension/distribution.json')));
  assert.equal(Object.keys(distribution.files).length, 18);
  for (const [name, digest] of Object.entries(distribution.files)) {
    assert.equal(digest, old.files['extension/' + name], 'Existing extension payload remains intact');
    assert.equal(digest, manifest.files['extension/' + name]);
  }
  const result = verifyDeliveryArchive(archive, baseline);
  assert.equal(result.vendorMembers, 613); assert.equal(result.helpers.length, 1); assert.equal(result.helpers[0].mode, '0755');
  for (const name of additions) {
    assert.throws(() => verifyDeliveryArchive(changedArchive(archive, 'package/vendor/opencu/' + name, 'drop'), baseline), /Missing packed OpenCU member/);
    assert.throws(() => verifyDeliveryArchive(changedArchive(archive, 'package/vendor/opencu/' + name, 'bytes'), baseline), /Packed OpenCU hash mismatch/);
  }
  assert.throws(() => verifyDeliveryArchive(changedArchive(archive, 'package/vendor/opencu/lib/extension.zip', 0o600), baseline), /must be 0644/);
  for (const mode of [0o644, 0o700]) assert.throws(() => verifyDeliveryArchive(changedArchive(archive,
    'package/vendor/opencu/native/bin/darwin-arm64/OpenCU Helper.app/Contents/MacOS/opencu-native', mode), baseline), /must be 0755/);
});
