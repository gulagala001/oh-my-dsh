import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import distribution from './distribution.json' with { type: 'json' };

export const extensionDownloadPath = '/api/opencu/extension.zip';
export const extensionDownloadName = `opencu-extension-${distribution.extensionVersion}.zip`;
const installedRoot = fileURLToPath(new URL('../../', import.meta.url));
const sha = data => createHash('sha256').update(data).digest('hex');
const fail = () => { throw new Error('The installed extension distribution is missing or does not match this build.'); };

// Flat, portable names only: no separators, drive letters, traversal, device
// names, trailing dots/spaces or case-fold collisions on Windows extraction.
export function validateExtensionNames(names) {
  const seen = new Set();
  for (const name of names) {
    if (!/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(name) || name.includes('..') || name.endsWith('.') ||
        /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name) || seen.has(name.toLowerCase())) fail();
    seen.add(name.toLowerCase());
  }
  if (names.length !== Object.keys(distribution.files).length || !seen.has('manifest.json')) fail();
}
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
// ZIP STORE, sorted members, DOS epoch, UTF-8 flag, fixed regular-file0644.
// No filesystem paths, dates, secrets or compression-library state enter bytes.
export async function buildExtensionZip(root = installedRoot, signal) {
  const names = Object.keys(distribution.files).sort(); validateExtensionNames(names);
  root = resolve(root);
  const directory = join(root, 'extension');
  if (await realpath(root) !== root || await realpath(directory) !== directory || !(await lstat(directory)).isDirectory()) fail();
  const entries = await readdir(directory);
  if (entries.includes('.gitignore') && !(await lstat(join(directory, '.gitignore'))).isFile()) fail();
  const found = entries.filter(name => name !== '.gitignore');
  if (found.length !== names.length || found.some(name => !names.includes(name))) fail();
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  if (pkg.name !== 'opencu' || pkg.version !== distribution.packageVersion) fail();
  const local = [], central = []; let offset = 0;
  for (const name of names) {
    signal?.throwIfAborted();
    const path = join(directory, name), info = await lstat(path);
    if (!info.isFile() || info.isSymbolicLink() || await realpath(path) !== path || info.size > 1024 * 1024) fail();
    const data = await readFile(path, { signal });
    if (sha(data) !== distribution.files[name]) fail();
    if (name === 'manifest.json') {
      const manifest = JSON.parse(data);
      if (manifest.manifest_version !== 3 || manifest.version !== distribution.extensionVersion || typeof manifest.key !== 'string' || sha(manifest.key) !== distribution.manifestKeySha256) fail();
    }
    const filename = Buffer.from(name), crc = crc32(data);
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt16LE(33, 12);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, data);
    const record = Buffer.alloc(46); record.writeUInt32LE(0x02014b50); record.writeUInt16LE(0x314, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(0x800, 8); record.writeUInt16LE(33, 14);
    record.writeUInt32LE(crc, 16); record.writeUInt32LE(data.length, 20); record.writeUInt32LE(data.length, 24); record.writeUInt16LE(filename.length, 28); record.writeUInt32LE((0o100644 * 65536) >>> 0, 38); record.writeUInt32LE(offset, 42);
    central.push(record, filename); offset += header.length + filename.length + data.length;
  }
  signal?.throwIfAborted();
  const index = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(names.length, 8); end.writeUInt16LE(names.length, 10); end.writeUInt32LE(index.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, index, end]);
}
export function registerExtensionDownload(ctx) {
  return ctx.connection.fetch.register({ path: extensionDownloadPath, methods: ['GET', 'HEAD'], requestBody: 'buffered', async fetch(request) {
    try {
      // No path/query arguments; never consult runtime config, dataDir or pairing.
      if (new URL(request.url).search) return new Response(null, { status: 400 });
      const expected = await buildExtensionZip(installedRoot, request.signal);
      const path = join(installedRoot, 'lib/extension.zip');
      if (!(await lstat(path)).isFile() || await realpath(path) !== path) fail();
      const bytes = await readFile(path, { signal: request.signal });
      if (!bytes.equals(expected)) fail();
      request.signal.throwIfAborted();
      return new Response(request.method === 'HEAD' ? null : bytes, { headers: {
        'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${extensionDownloadName}"`,
        'Content-Length': String(bytes.length), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ETag: `"${sha(bytes)}"`,
      } });
    } catch (error) {
      if (request.signal.aborted) throw error;
      return new Response(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
  } });
}
