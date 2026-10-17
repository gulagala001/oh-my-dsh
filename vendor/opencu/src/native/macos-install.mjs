import {cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join, resolve} from 'node:path';
import {checkMacHelperIdentity} from './macos-identity.mjs';
import {NativeBackendError} from './protocol.mjs';

async function ownedDirectory(path) {
  const entry = await lstat(path);
  if (!entry.isDirectory() || await realpath(path) !== path) throw new NativeBackendError('NATIVE_HELPER_PATH_INVALID', 'The OpenCU helper installation must be an owned directory.', {path});
}
async function digest(path) {
  const hash = createHash('sha256');
  async function walk(directory, prefix = '') {
    for (const name of (await readdir(directory)).sort()) {
      const file = join(directory, name), entry = await lstat(file);
      if (entry.isSymbolicLink()) throw new NativeBackendError('NATIVE_HELPER_PATH_INVALID', 'Helper bundle cannot contain symbolic links.');
      hash.update(prefix + name + '\0' + entry.mode + '\0');
      if (entry.isDirectory()) await walk(file, prefix + name + '/');
      else if (entry.isFile()) hash.update(await readFile(file));
      else throw new NativeBackendError('NATIVE_HELPER_PATH_INVALID', 'Helper bundle must contain only regular files and directories.');
    }
  }
  await walk(path);
  return hash.digest('hex');
}

// The permission holder never lives under a versioned DSH/plugin installation.
export async function installMacHelper(command, directory) {
  const source = resolve(command, '../../..');
  if (!source.endsWith('/OpenCU Helper.app') || resolve(command) !== join(source, 'Contents/MacOS/opencu-native')) {
    throw new NativeBackendError('NATIVE_HELPER_PATH_INVALID', 'A signed OpenCU Helper.app bundle is required.', {path: command});
  }
  await checkMacHelperIdentity(source);
  const root = resolve(directory, 'helper');
  await mkdir(root, {recursive: true, mode: 0o700});
  await ownedDirectory(root);
  const bundle = join(root, 'OpenCU Helper.app'), binary = join(bundle, 'Contents/MacOS/opencu-native');
  let exists = false;
  try {
    await ownedDirectory(bundle); exists = true;
    await checkMacHelperIdentity(bundle);
    if (await digest(bundle) === await digest(source)) return binary;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const staging = await mkdtemp(join(root, 'update-'));
  const next = join(staging, 'OpenCU Helper.app'), previous = join(staging, 'previous.app');
  let moved = false, committed = false;
  try {
    await cp(source, next, {recursive: true, preserveTimestamps: true});
    await checkMacHelperIdentity(next);
    if (exists) { await rename(bundle, previous); moved = true; }
    try {
      await rename(next, bundle);
      await checkMacHelperIdentity(bundle);
      committed = true;
    } catch (error) {
      if (moved) {
        try { await rename(bundle, join(staging, 'failed.app')); } catch (moveError) { if (moveError.code !== 'ENOENT') throw moveError; }
        await rename(previous, bundle); moved = false;
      }
      throw error;
    }
    return binary;
  } finally {
    // On a failed rollback keep the previous signed helper for recovery.
    if (committed || !moved) await rm(staging, {recursive: true, force: true});
  }
}
