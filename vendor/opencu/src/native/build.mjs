import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {access, mkdir, readFile, writeFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {NativeBackendError} from './protocol.mjs';

const exec = promisify(execFile);
const sourceDirectory = fileURLToPath(new URL('../../native/macos/', import.meta.url));
const sources = ['Protocol.swift', 'Responsibility.swift', 'Targets.swift', 'ReadOperation.swift', 'Accessibility.swift', 'Capture.swift', 'Video.swift', 'Input.swift', 'Activity.swift', 'Cursor.swift', 'Presentation.swift', 'main.swift'];
const systemHeader = join(sourceDirectory, 'System.h');
const infoPlist = join(sourceDirectory, 'Info.plist');

export async function buildMacHelper(directory, {helperPath, compile = false} = {}) {
  const packaged = helperPath ? resolve(helperPath) : fileURLToPath(new URL(`../../native/bin/darwin-${process.arch}/OpenCU Helper.app/Contents/MacOS/opencu-native`, import.meta.url));
  if (!compile) {
    try { await access(packaged, constants.X_OK); return packaged; }
    catch { throw new NativeBackendError('NATIVE_HELPER_UNAVAILABLE', 'The packaged macOS helper is missing or not executable. Install the matching architecture build; Xcode is not required at runtime.', {path: packaged, arch: process.arch}); }
  }
  const paths = sources.map(name => join(sourceDirectory, name));
  const hash = createHash('sha256').update(process.arch);
  for (const path of [...paths, systemHeader, infoPlist]) hash.update(await readFile(path));
  const cache = resolve(directory, 'bin');
  await mkdir(cache, {recursive: true, mode: 0o700});
  const executable = join(cache, `opencu-native-${hash.digest('hex').slice(0, 20)}`);
  try { await access(executable, constants.X_OK); return executable; } catch {}
  const args = ['swiftc', '-O', '-j', '1', '-whole-module-optimization', '-import-objc-header', systemHeader];
  // Some CLT upgrades leave two declarations of SwiftBridging. Hide only that duplicate
  // in this compilation's VFS; never mutate the installed toolchain.
  const {stdout} = await exec('/usr/bin/xcrun', ['--find', 'swiftc']);
  const include = resolve(stdout.trim(), '../../include/swift');
  try {
    const moduleMap = await readFile(join(include, 'module.modulemap'), 'utf8');
    const bridgingMap = await readFile(join(include, 'bridging.modulemap'), 'utf8');
    if (/module SwiftBridging/.test(moduleMap) && /module SwiftBridging/.test(bridgingMap)) {
      const empty = join(cache, 'empty.modulemap'), overlay = join(cache, 'toolchain-overlay.json');
      await writeFile(empty, '// Compilation-only view of a duplicate module map.\n', {mode: 0o600});
      await writeFile(overlay, JSON.stringify({version: 0, roots: [{type: 'file', name: join(include, 'module.modulemap'), 'external-contents': empty}]}), {mode: 0o600});
      args.push('-vfsoverlay', overlay, '-Xcc', '-ivfsoverlay', '-Xcc', overlay);
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  try {
    await exec('/usr/bin/xcrun', [...args, '-framework', 'AppKit', '-framework', 'ApplicationServices', '-framework', 'Carbon', '-framework', 'WebKit', '-framework', 'ScreenCaptureKit', '-framework', 'CoreMedia', '-framework', 'CoreImage',
      ...paths, '-Xlinker', '-sectcreate', '-Xlinker', '__TEXT', '-Xlinker', '__info_plist', '-Xlinker', infoPlist,
      '-o', executable], {timeout: 180000, maxBuffer: 4 * 1024 * 1024});
  } catch (error) {
    throw new NativeBackendError('NATIVE_BUILD_FAILED', 'Could not compile the macOS native helper.', {
      command: '/usr/bin/xcrun swiftc', exitCode: error.code, stdout: error.stdout, stderr: error.stderr,
    });
  }
  return executable;
}
