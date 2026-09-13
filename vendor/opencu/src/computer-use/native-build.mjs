import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const NATIVE_VERSION = '0.1.1';
export const NATIVE_PROTOCOL = 1;
export const NATIVE_SOURCES = ['Service.m', 'Observation.m', 'Input.m', 'Cursor.m', 'Paste.m', 'Preview.m'];

export async function nativeBuildInfo() {
  const files = [
    ...[...NATIVE_SOURCES, 'ComputerUse.h'].map(name => '../../native/computer-use/' + name),
    '../../scripts/build-computer-use-native.mjs', './native-build.mjs',
  ];
  const hash = createHash('sha256').update(process.arch);
  for (const path of files) hash.update(path).update('\0').update(await readFile(new URL(path, import.meta.url)));
  return { version: NATIVE_VERSION, protocol: NATIVE_PROTOCOL, build: hash.digest('hex') };
}
