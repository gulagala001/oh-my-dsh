import { createHash } from 'node:crypto';
import { access, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sealNativePresentations } from './seal.mjs';
import { nativePresentationsPackageRoot, NATIVE_PRESENTATIONS_FILE, NATIVE_PRESENTATIONS_MANIFEST } from './artifact.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const headersVersion = 'v24.21.0';

function run(command, args, label) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${label} terminated by ${result.signal}.`);
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? 1}.`);
}

async function nodeHeaders(explicit) {
  const installed = explicit ? resolve(explicit) : resolve(dirname(process.execPath), '../include/node');
  try { await access(join(installed, 'node_api.h')); return installed; }
  catch (error) { if (explicit || error.code !== 'ENOENT') throw error; }
  // Only stable Node-API headers are needed; no Electron or Chromium build.
  const cache = join(homedir(), '.cache', 'opencu', 'node-api');
  const destination = join(cache, headersVersion);
  const include = join(destination, `node-${headersVersion}`, 'include', 'node');
  try { await access(join(include, 'node_api.h')); return include; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await mkdir(cache, { recursive: true, mode: 0o700 });
  const temporary = await mkdtemp(join(cache, '.headers-'));
  try {
    const filename = `node-${headersVersion}-headers.tar.gz`;
    const base = `https://nodejs.org/dist/${headersVersion}/`;
    const download = async name => {
      const response = await fetch(new URL(name, base), { signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error(`Node-API header download failed (${response.status}): ${name}`);
      return Buffer.from(await response.arrayBuffer());
    };
    const [archive, sums] = await Promise.all([download(filename), download('SHASUMS256.txt')]);
    const expected = sums.toString('utf8').split(/\r?\n/).map(line => line.trim().split(/\s+/)).find(([, name]) => name === filename)?.[0];
    if (!expected || createHash('sha256').update(archive).digest('hex') !== expected) throw new Error('Node-API header checksum verification failed.');
    const archivePath = join(temporary, filename);
    await writeFile(archivePath, archive);
    run('/usr/bin/tar', ['-xzf', archivePath, '-C', temporary, `node-${headersVersion}/include/node`], 'Node-API header extraction');
    await access(join(temporary, `node-${headersVersion}`, 'include', 'node', 'node_api.h'));
    await rm(archivePath);
    await writeFile(join(temporary, 'source.json'), JSON.stringify({ version: headersVersion, url: new URL(filename, base).href, sha256: expected }) + '\n');
    try { await rename(temporary, destination); }
    catch (error) { if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error; }
    await access(join(include, 'node_api.h'));
    return include;
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

export async function buildNativePresentations({ nodeInclude, arch = process.arch,
  destination = nativePresentationsPackageRoot({ platform: 'darwin', arch }), signingIdentity = '-' } = {}) {
  if (process.platform !== 'darwin') throw new Error('Desktop presentations require a macOS build host.');
  if (!isAbsolute(destination)) throw new Error('Native presentations build destination must be absolute.');
  const compilerArch = { arm64: 'arm64', x64: 'x86_64' }[arch];
  if (!compilerArch) throw new Error(`Desktop presentations do not support ${arch}.`);
  if (typeof signingIdentity !== 'string' || !signingIdentity.trim()) throw new Error('A native addon signing identity must be provided.');
  await mkdir(destination, { recursive: true });
  const destinationStat = await lstat(destination);
  if (!destinationStat.isDirectory() || destinationStat.isSymbolicLink()) throw new Error('Native presentations build destination must be a real directory.');
  const temporary = await mkdtemp(join(destination, '.build-'));
  try {
    const include = await nodeHeaders(nodeInclude);
    const output = join(temporary, NATIVE_PRESENTATIONS_FILE);
    const transportObject = join(temporary, 'CUMachChannel.o');
    run('clang', [
      '-arch', compilerArch, '-fobjc-arc', '-fblocks', '-O2', '-Wall', '-Wextra', '-Werror', '-mmacosx-version-min=14.0',
      '-c', join(root, '../transport/CUMachChannel.m'), '-o', transportObject,
    ], 'Native transport compiler');
    run('clang++', [
      '-arch', compilerArch, '-std=c++17', '-fobjc-arc', '-fblocks', '-O2', '-Wall', '-Wextra', '-Werror',
      '-mmacosx-version-min=14.0', '-DNAPI_VERSION=8', '-I', include,
      '-bundle', '-undefined', 'dynamic_lookup', '-framework', 'Cocoa',
      '-framework', 'QuartzCore', '-framework', 'CoreVideo', '-framework', 'CoreImage',
      join(root, 'addon.mm'), join(root, 'dynamics.mm'), join(root, 'motion-driver.mm'),
      join(root, 'controls.mm'), join(root, 'completion.mm'), join(root, 'producer-channel.mm'),
      transportObject, '-lbsm', '-o', output,
    ], 'Native compiler');
    run('/usr/bin/codesign', ['--force', '--sign', signingIdentity, '--timestamp=none', output], 'Native artifact signing');
    await sealNativePresentations({ root: temporary, arch });
    await rename(output, join(destination, NATIVE_PRESENTATIONS_FILE));
    await rename(join(temporary, NATIVE_PRESENTATIONS_MANIFEST), join(destination, NATIVE_PRESENTATIONS_MANIFEST));
    return join(destination, NATIVE_PRESENTATIONS_FILE);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let nodeInclude, destination, arch, signingIdentity;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    const value = args[++index];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    if (flag === '--node-include' && nodeInclude === undefined) nodeInclude = value;
    else if (flag === '--destination' && destination === undefined) destination = value;
    else if (flag === '--arch' && arch === undefined && ['arm64', 'x64'].includes(value)) arch = value;
    else if (flag === '--sign' && signingIdentity === undefined) signingIdentity = value;
    else throw new Error('Usage: node build.mjs [--node-include PATH] [--destination ABSOLUTE_PATH] [--arch arm64|x64] [--sign IDENTITY]');
  }
  console.log(await buildNativePresentations({ nodeInclude, destination, arch, signingIdentity }));
}
