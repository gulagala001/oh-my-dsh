import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const nativeHelper = /^native\/bin\/darwin-(?:arm64|x64)\/OpenCU Helper\.app\/Contents\/MacOS\/opencu-native$/;

// Run after the standard build. Runtime bytes have no path/whitespace exemption.
export async function deliveryBaseline(directory = root) {
  const committed = file => execFileSync('git', ['show', `HEAD:${file}`], { cwd: directory, maxBuffer: 64 * 1024 * 1024 });
  const client = committed('lib/client.js');
  assert(client.equals(await readFile(join(directory, 'lib/client.js'))), 'Rebuilt lib/client.js differs from HEAD; rebuild and commit the actual runtime bytes');
  const manifest = committed('vendor/opencu.json');
  assert(manifest.equals(await readFile(join(directory, 'vendor/opencu.json'))), 'vendor/opencu.json differs from HEAD');
  return { client, manifest };
}

// npm pack emits regular-file USTAR entries. Read them once, without extracting
// or executing anything in the package (including the native helper).
function packageFiles(archive) {
  const tar = gunzipSync(archive), files = new Map();
  const text = (offset, size) => tar.subarray(offset, offset + size).toString('utf8').replace(/\0.*$/s, '');
  const octal = (offset, size) => {
    const value = text(offset, size).trim();
    assert(/^[0-7]+$/.test(value), 'Invalid tar numeric field');
    const number = Number.parseInt(value, 8);
    assert(Number.isSafeInteger(number), 'Invalid tar size');
    return number;
  };
  for (let offset = 0; offset < tar.length;) {
    assert(offset + 512 <= tar.length, 'Truncated tar header');
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) {
      assert(tar.subarray(offset).every(byte => byte === 0), 'Unexpected data after tar end');
      return files;
    }
    const checksum = header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
    assert.equal(octal(offset + 148, 8), checksum, 'Tar header checksum mismatch');
    const name = text(offset, 100), prefix = text(offset + 345, 155);
    const member = prefix ? `${prefix}/${name}` : name;
    assert(member.startsWith('package/') && !member.includes('\\') && member.split('/').every(part => part && part !== '.' && part !== '..'), `Invalid package member: ${member}`);
    assert([0, 48].includes(header[156]), `Expected a regular npm package file: ${member}`);
    assert(!files.has(member), `Duplicate package member: ${member}`);
    const size = octal(offset + 124, 12), end = offset + 512 + size;
    assert(end <= tar.length, `Truncated package member: ${member}`);
    files.set(member, { bytes: tar.subarray(offset + 512, end), mode: octal(offset + 100, 8) });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  assert.fail('Missing tar end');
}

export function verifyDeliveryArchive(archive, baseline) {
  const files = packageFiles(archive);
  assert(files.get('package/lib/client.js')?.bytes.equals(baseline.client), 'Packed lib/client.js differs from the rebuilt HEAD runtime');
  assert(files.get('package/vendor/opencu.json')?.bytes.equals(baseline.manifest), 'Packed vendor/opencu.json differs from HEAD');
  const manifest = JSON.parse(baseline.manifest), expected = new Map(Object.entries(manifest.files));
  assert(expected.has('lib/client.js'), 'OpenCU manifest must include the classic client');
  // This is the sole existing package.json files exclusion, not a count-based allowance.
  expected.delete('lib/client.js');
  assert([...expected.keys()].some(name => nativeHelper.test(name)), 'OpenCU manifest must include a macOS helper');
  const prefix = 'package/vendor/opencu/', found = new Set(), helpers = [];
  assert(!files.has('package/vendor/opencu'), 'Expected a vendor/opencu directory, not a packed file');
  for (const [member, { bytes, mode }] of files) {
    if (!member.startsWith(prefix)) continue;
    const name = member.slice(prefix.length);
    assert(expected.has(name), `Unexpected packed OpenCU member: ${name}`);
    assert.equal(sha256(bytes), expected.get(name), `Packed OpenCU hash mismatch: ${name}`);
    if (nativeHelper.test(name)) {
      assert.equal(mode, 0o755, `Packed macOS helper must be 0755, got ${mode.toString(8).padStart(4, '0')}: ${name}`);
      helpers.push({ file: name, mode: '0755' });
    } else {
      assert.equal(mode, 0o644, `Packed OpenCU file must be 0644, got ${mode.toString(8).padStart(4, '0')}: ${name}`);
    }
    found.add(name);
  }
  for (const name of expected.keys()) assert(found.has(name), `Missing packed OpenCU member: ${name}`);
  return { rootClientSha256: sha256(baseline.client), vendorMembers: found.size, helpers, archiveSha256: sha256(archive) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert(process.argv.length <= 3, 'Usage: node scripts/check-opencu-delivery.mjs [actual-package.tgz] (after the standard build)');
  const baseline = await deliveryBaseline();
  let temporary;
  try {
    let archive = process.argv[2];
    if (!archive) {
      temporary = await mkdtemp(join(tmpdir(), 'omd-delivery-'));
      const [packed] = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
      archive = join(temporary, packed.filename);
    }
    console.log(JSON.stringify(verifyDeliveryArchive(await readFile(resolve(archive)), baseline), null, 2));
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true });
  }
}
