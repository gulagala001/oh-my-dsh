import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {checkMacHelperDistribution} from './check-opencu-native.mjs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

/** Restore only the signed macOS helper's executable mode after package normalization. */
export async function nativePackageModes(path) {
  const tar = gunzipSync(await readFile(path));
  let helpers = 0;
  const members = [];
  const text = (offset, size) => tar.subarray(offset, offset + size).toString().replace(/\0.*$/s, '');
  for (let offset = 0; offset + 512 <= tar.length; ) {
    if (tar.subarray(offset, offset + 512).every(byte => byte === 0)) break;
    const name = text(offset, 100), prefix = text(offset + 345, 155), member = prefix ? prefix + '/' + name : name;
    if (!member.startsWith('package/') || member.includes('\\') || member.split('/').includes('..') || ![0, 48, 53].includes(tar[offset + 156])) throw new Error('Invalid package member: ' + member);
    members.push(member);
    const size = Number.parseInt(text(offset + 124, 12).trim(), 8);
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > tar.length) throw new Error('Invalid package tar member: ' + member);
    if (/^package\/(?:vendor\/opencu\/)?native\/bin\/darwin-(?:arm64|x64)\/OpenCU Helper\.app\/Contents\/MacOS\/opencu-native$/.test(member)) {
      if (![0, 48].includes(tar[offset + 156])) throw new Error('Native helper must be a regular file');
      tar.write('0000755\0', offset + 100, 8, 'ascii');
      tar.fill(32, offset + 148, offset + 156);
      const checksum = tar.subarray(offset, offset + 512).reduce((sum, byte) => sum + byte, 0);
      tar.write(checksum.toString(8).padStart(6, '0') + '\0 ', offset + 148, 8, 'ascii');
      helpers++;
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (helpers === 0) throw new Error('Package contains no signed macOS helper');
  if (process.platform === 'darwin') {
    const temporary = await mkdtemp(join(tmpdir(), 'opencu-package-'));
    try {
      const archive = join(temporary, 'verified.tgz');
      await writeFile(archive, gzipSync(tar));
      const prefix = members.includes('package/native/macos/signing-identity.json') ? 'package/' : 'package/vendor/opencu/';
      const native = members.filter(name => name.startsWith(prefix + 'native/bin/darwin-') || name === prefix + 'native/macos/signing-identity.json');
      execFileSync('/usr/bin/tar', ['-xzf', archive, '-C', temporary, ...native], {maxBuffer: 1024 * 1024});
      await checkMacHelperDistribution(join(temporary, prefix));
    } finally { await rm(temporary, {recursive: true, force: true}); }
  }
  await writeFile(path, gzipSync(tar));
  console.log(`Preserved executable mode for ${helpers} signed macOS helper(s): ${path}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await nativePackageModes(resolve(process.argv[2]));
