import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';

// The hash-pinned release contains USTAR/00 regular files and one local PAX
// path header. Support exactly that extension, not GNU/global/link/size records.
export function publishedTar(bytes) {
  const tar = gunzipSync(bytes, { maxOutputLength: 512 * 1024 * 1024 });
  const entries = new Map(), paxHeaders = [], utf8 = new TextDecoder('utf-8', { fatal: true });
  let pendingPath;
  assert.equal(tar.length % 512, 0, 'Truncated published tar blocks');
  const safe = name => name.startsWith('package/') && !/[\\\0\r\n]/.test(name)
    && name.split('/').every(part => part && part !== '.' && part !== '..');
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) {
      assert(!pendingPath, 'Dangling PAX path without a regular member');
      assert(tar.length - offset >= 1024 && tar.subarray(offset).every(byte => byte === 0), 'Invalid published tar end');
      return { entries, paxHeaders };
    }
    const raw = (start, length) => {
      const field = header.subarray(start, start + length), nul = field.indexOf(0);
      return nul < 0 ? field : field.subarray(0, nul);
    };
    const diagnostic = { offset, rawName: raw(0, 100).toString(), prefix: raw(345, 155).toString(),
      typeflag: String.fromCharCode(header[156]), typeflagByte: header[156],
      magic: header.subarray(257, 263).toString(), version: header.subarray(263, 265).toString(),
      magicHex: header.subarray(257, 263).toString('hex'), versionHex: header.subarray(263, 265).toString('hex') };
    const require = (condition, message) => assert(condition, message + '; tarHeader=' + JSON.stringify(diagnostic));
    const octal = (start, length) => {
      const text = raw(start, length).toString().trim(); require(/^[0-7]+$/.test(text), 'Invalid tar numeric field');
      const value = Number.parseInt(text, 8); require(Number.isSafeInteger(value), 'Unsafe tar numeric value'); return value;
    };
    require(octal(148, 8) === header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0), 'Published tar checksum mismatch');
    require(diagnostic.magicHex === '757374617200' && diagnostic.versionHex === '3030', 'Unsupported published tar format');
    let rawName, prefix;
    try { rawName = utf8.decode(raw(0, 100)); prefix = utf8.decode(raw(345, 155)); }
    catch { require(false, 'Invalid UTF-8 published name'); }
    const name = prefix ? prefix + '/' + rawName : rawName;
    const size = octal(124, 12), start = offset + 512, next = start + Math.ceil(size / 512) * 512;
    require(next <= tar.length, 'Truncated published member');
    const body = tar.subarray(start, start + size);
    if (header[156] === 120) {
      require(!pendingPath && rawName === '././@PaxHeader' && prefix === '', 'Unsupported local PAX envelope');
      require(size > 0 && size <= 4096, 'Unsupported PAX size');
      const space = body.indexOf(32), lengthText = body.subarray(0, space).toString();
      require(space > 0 && /^[1-9][0-9]*$/.test(lengthText), 'Invalid PAX record length');
      require(Number(lengthText) === body.length && body.at(-1) === 10, 'Truncated or multiple PAX records');
      let record;
      try { record = utf8.decode(body.subarray(space + 1, -1)); }
      catch { require(false, 'Invalid UTF-8 PAX record'); }
      require(record.startsWith('path='), 'Unsupported PAX key (only path is verified)');
      pendingPath = record.slice(5); require(safe(pendingPath), 'Invalid PAX path');
      paxHeaders.push({ ...diagnostic, path: pendingPath });
    } else {
      require([0, 48].includes(header[156]), 'Published members must be regular files');
      require(safe(name), 'Invalid published member');
      const effective = pendingPath ?? name;
      require(safe(effective), 'Invalid effective published member');
      require(!entries.has(effective), 'Duplicate published member: ' + effective);
      entries.set(effective, { bytes: body, mode: octal(100, 8) });
      pendingPath = undefined;
    }
    offset = next;
  }
  assert.fail('Missing published tar end');
}
