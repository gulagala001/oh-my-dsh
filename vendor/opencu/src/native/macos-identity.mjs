import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {access, readFile, readdir} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join} from 'node:path';
import {NativeBackendError} from './protocol.mjs';

const exec = promisify(execFile);
export const macHelperIdentity = new URL('../../native/macos/signing-identity.json', import.meta.url);

export async function checkMacHelperDistribution(root) {
  const identity = JSON.parse(await readFile(join(root, 'native/macos/signing-identity.json'), 'utf8'));
  const expected = JSON.parse(await readFile(macHelperIdentity, 'utf8'));
  if (identity.requirement !== expected.requirement) throw new NativeBackendError('NATIVE_SIGNING_IDENTITY_CHANGED', 'The distribution changed the persistent OpenCU signing identity.');
  const directory = join(root, 'native/bin');
  const architectures = (await readdir(directory)).filter(name => /^darwin-(arm64|x64)$/.test(name));
  if (!architectures.length) throw new NativeBackendError('NATIVE_HELPER_UNAVAILABLE', 'The distribution contains no signed macOS helper.');
  for (const architecture of architectures) {
    const bundle = join(directory, architecture, 'OpenCU Helper.app');
    await checkMacHelperIdentity(bundle, identity);
    const command = join(bundle, 'Contents/MacOS/opencu-native');
    try { await access(command, constants.X_OK); }
    catch (error) {
      throw new NativeBackendError('NATIVE_HELPER_UNAVAILABLE', 'The distribution contains a missing or non-executable macOS helper.', {path: command, arch: architecture.slice(7), cause: error.code});
    }
  }
  return identity;
}

export async function checkMacHelperIdentity(bundle, identity) {
  identity ??= JSON.parse(await readFile(macHelperIdentity, 'utf8'));
  if (identity.version !== 1 || identity.bundleIdentifier !== 'ai.opencu.native-helper' || typeof identity.requirement !== 'string'
      || /cdhash\b/.test(identity.requirement) || !/certificate|anchor/.test(identity.requirement)) {
    throw new NativeBackendError('NATIVE_SIGNING_IDENTITY_INVALID', 'OpenCU requires its persistent macOS signing identity.');
  }
  try {
    await exec('/usr/bin/codesign', ['--verify', '--strict', '-R', `=${identity.requirement}`, bundle], {timeout: 10000});
    const {stdout, stderr} = await exec('/usr/bin/codesign', ['-d', '-r', '-', '--verbose=4', bundle], {timeout: 10000});
    const details = stdout + stderr;
    const requirement = details.split('\n').find(line => line.startsWith('designated => '))?.slice('designated => '.length);
    if (requirement !== identity.requirement || !details.includes(`Identifier=${identity.bundleIdentifier}\n`) || /Signature=adhoc/.test(details)) {
      throw new Error('The embedded helper signing requirement differs from the persistent identity');
    }
    return identity;
  } catch (error) {
    throw new NativeBackendError('NATIVE_SIGNING_IDENTITY_CHANGED', 'OpenCU Helper has an invalid or changed signing identity. Reinstall a build signed with the original OpenCU certificate; do not reset macOS privacy permissions.', {path: bundle, cause: error.stderr || error.message});
  }
}
