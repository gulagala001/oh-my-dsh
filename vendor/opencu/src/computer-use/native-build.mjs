import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const NATIVE_VERSION = '0.1.1';
export const NATIVE_PROTOCOL = 1;
export const NATIVE_IDENTITY = Object.freeze({
  platform: 'darwin',
  bundleIdentifier: 'ai.trisoul.computer-use',
  executable: 'trisoul-computer-use',
  serverName: 'trisoul-computer-use',
  minimumSystemVersion: '14.0',
});
export const NATIVE_SOURCES = ['Service.m', 'Observation.m', 'WindowRegistry.m', 'WindowScreenshot.m', 'Input.m', 'InputFocus.m', 'Cursor.m', 'Paste.m', 'Preview.m', 'PreviewProducer.m', 'PreviewBridge.m', 'ScreenLock.m', 'ScreenLockAuthorization.m', 'ScreenLockIdentity.m', 'ScreenLockUnlock.m', 'ScreenLockGuardian.m', '../transport/CUMachChannel.m'];
export const NATIVE_SWIFT_SOURCES = ['ObservationText.swift'];

export async function nativeBuildInfo() {
  const files = [
    ...[...NATIVE_SOURCES, ...NATIVE_SWIFT_SOURCES, 'ComputerUse.h', 'Clipboard.h', 'WindowRegistry.h', 'WindowScreenshot.h', 'InputFocus.h', 'CursorMotion.h', 'PreviewProducer.h', 'PreviewBridge.h', 'ScreenLock.h', 'ScreenLockAuthorization.h', 'ScreenLockIdentity.h', 'ScreenLockUnlock.h', 'ScreenLockGuardian.h', '../transport/CUMachChannel.h'].map(name => '../../native/computer-use/' + name),
    '../../scripts/build-computer-use-native.mjs', '../../scripts/computer-use-signing.mjs',
    '../../native/computer-use/resources/SoftwareCursor.png',
    './native-lock.mjs', './native-build.mjs',
  ];
  const hash = createHash('sha256').update(process.arch);
  for (const path of files) hash.update(path).update('\0').update(await readFile(new URL(path, import.meta.url)));
  return { ...NATIVE_IDENTITY, arch: process.arch, version: NATIVE_VERSION, protocol: NATIVE_PROTOCOL, build: hash.digest('hex') };
}
