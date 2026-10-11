import { createHash } from 'node:crypto';
import * as nodeFs from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';

const require = createRequire(import.meta.url);
// Electron's ASAR-aware fs treats .asar files as virtual directories. Integrity
// checks must read the distribution's physical bytes in both parent and child.
const fileSystem = process.versions.electron ? require('original-fs') : nodeFs;
const { createReadStream, createWriteStream, constants } = fileSystem;
const { access, chmod, copyFile, lstat, mkdir, mkdtemp, open, readFile, readdir, readlink, realpath, rename, rm, symlink, writeFile } = fileSystem.promises;
const releases = JSON.parse(await readFile(new URL('./releases.json', import.meta.url), 'utf8'));
export const PLUGIN_RUNTIME_PROVIDER = 'official-electron';
export const PLUGIN_RUNTIME_VERSION = '44.7.0';
export const PLUGIN_RUNTIME_CHROMIUM_VERSION = '152.0.7977.130';
export const PLUGIN_RUNTIME_MANIFEST = 'installation.json';
const maximumArchiveBytes = 1536 * 1024 * 1024;
const maximumDecodedBytes = 4 * 1024 * 1024 * 1024;
const digestPattern = /^[a-f0-9]{64}$/;

if (releases.schemaVersion !== 1 || releases.provider !== PLUGIN_RUNTIME_PROVIDER
  || releases.electronVersion !== PLUGIN_RUNTIME_VERSION || releases.chromiumVersion !== PLUGIN_RUNTIME_CHROMIUM_VERSION
  || releases.releaseBaseUrl !== `https://github.com/electron/electron/releases/download/v${PLUGIN_RUNTIME_VERSION}/`) {
  throw new Error('OpenCU runtime: invalid official release configuration');
}

export function pluginRuntimeRoot() {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'OpenCU', 'runtime');
  if (process.platform === 'win32') return join(homedir(), 'AppData', 'Local', 'OpenCU', 'runtime');
  return join(homedir(), '.cache', 'opencu', 'runtime');
}

export function pluginRuntimeTarget({ platform = process.platform, arch = process.arch, root = pluginRuntimeRoot() } = {}) {
  if (!isAbsolute(root)) throw new TypeError('OpenCU runtime: installation root must be absolute');
  const archiveSha256 = releases.artifacts[`${platform}-${arch}`];
  if (!digestPattern.test(archiveSha256 ?? '')) return undefined;
  const filename = `electron-v${PLUGIN_RUNTIME_VERSION}-${platform}-${arch}.zip`;
  const directory = join(root, PLUGIN_RUNTIME_VERSION, `${platform}-${arch}`, archiveSha256);
  const distribution = join(directory, 'dist');
  const executable = join(distribution, platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : platform === 'win32' ? 'electron.exe' : 'electron');
  return { platform, arch, root: resolve(root), directory, distribution, executable, filename, archiveSha256,
    archive: join(directory, filename), manifest: join(directory, PLUGIN_RUNTIME_MANIFEST),
    sourceUrl: new URL(filename, releases.releaseBaseUrl).href };
}

function fail(reason, detail, target) {
  const error = new Error(`OpenCU runtime: ${detail}`);
  error.code = 'OPENCU_RUNTIME_UNAVAILABLE';
  error.state = { kind: 'unavailable', available: false, runtimeReady: false, provider: PLUGIN_RUNTIME_PROVIDER,
    electronVersion: PLUGIN_RUNTIME_VERSION, platform: target?.platform ?? process.platform, arch: target?.arch ?? process.arch,
    reason, detail };
  return error;
}

async function regularFile(path, limit = maximumArchiveBytes) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > limit) throw new Error('Expected a bounded regular runtime file');
  return info;
}

async function fileHash(path) {
  const digest = createHash('sha256');
  for await (const bytes of createReadStream(path)) digest.update(bytes);
  return digest.digest('hex');
}

async function realDirectories(root, destination) {
  const local = relative(root, destination);
  if (local === '..' || local.startsWith(`..${sep}`) || isAbsolute(local)) throw new Error('Runtime directory is outside its installation root');
  let current = root;
  for (const part of ['', ...local.split(sep).filter(Boolean)]) {
    if (part) current = join(current, part);
    const stat = await lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Runtime installation directory must not be linked');
    if (process.getuid && stat.uid !== process.getuid()) throw new Error('Runtime installation must be owned by the current user');
  }
}

function zipPath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') || value.startsWith('/')
    || /^[A-Za-z]:/.test(value)) throw new Error('Unsafe official runtime archive path');
  const name = value.endsWith('/') ? value.slice(0, -1) : value;
  if (!name || name.split('/').some(part => !part || part === '.' || part === '..') || posix.normalize(name) !== name) {
    throw new Error('Unsafe official runtime archive path');
  }
  return name;
}

function openZip(path) {
  const yauzl = require('yauzl');
  return new Promise((resolveZip, reject) => yauzl.open(path, { lazyEntries: true, autoClose: false, strictFileNames: true },
    (error, zip) => error ? reject(error) : resolveZip(zip)));
}

function entryStream(zip, entry) {
  return new Promise((resolveStream, reject) => zip.openReadStream(entry, (error, stream) => error ? reject(error) : resolveStream(stream)));
}

function entryKind(entry) {
  const type = (entry.externalFileAttributes >>> 16) & 0o170000;
  if (entry.fileName.endsWith('/')) return 'directory';
  if (type === 0o120000) return 'symlink';
  if (type && type !== 0o100000) throw new Error('Unsupported official runtime archive file type');
  return 'file';
}

// The retained ZIP is anchored to Electron's pinned npm checksum. Its entries are
// the authority for installed bytes, so editing a local manifest cannot bless a binary.
async function archiveEntries(archive, destination) {
  const zip = await openZip(archive), rows = [], seen = new Set(), links = [];
  let decoded = 0;
  try {
    await new Promise((resolveEntries, reject) => {
      zip.on('error', reject); zip.once('end', resolveEntries);
      zip.on('entry', entry => {
        void (async () => {
          const path = zipPath(entry.fileName), kind = entryKind(entry);
          if (seen.has(path) || seen.size >= 40000 || entry.generalPurposeBitFlag & 1) throw new Error('Invalid official runtime archive entry');
          seen.add(path); decoded += entry.uncompressedSize;
          if (!Number.isSafeInteger(decoded) || decoded > maximumDecodedBytes) throw new Error('Official runtime archive exceeds extraction limits');
          const mode = (entry.externalFileAttributes >>> 16) & 0o777;
          const output = destination && join(destination, ...path.split('/'));
          if (kind === 'directory') {
            if (output) await mkdir(output, { recursive: true, mode: mode || 0o755 });
            rows.push({ path, kind });
          } else {
            const stream = await entryStream(zip, entry), digest = createHash('sha256');
            let bytes = 0, target;
            if (kind === 'symlink') {
              if (entry.uncompressedSize > 4096) throw new Error('Official runtime link is too long');
              const parts = [];
              for await (const value of stream) { parts.push(value); bytes += value.length; }
              target = Buffer.concat(parts).toString('utf8');
              const resolved = posix.normalize(posix.join(posix.dirname(path), target));
              if (!target || target.includes('\\') || target.includes('\0') || posix.isAbsolute(target)
                || resolved === '..' || resolved.startsWith('../')) throw new Error('Official runtime link leaves its distribution');
              if (output) links.push({ output, target });
            } else if (output) {
              await mkdir(dirname(output), { recursive: true, mode: 0o755 });
              stream.on('data', value => { bytes += value.length; digest.update(value); });
              await pipeline(stream, createWriteStream(output, { flags: 'wx', mode: mode || 0o644 }));
              if (process.platform !== 'win32' && mode) await chmod(output, mode);
            } else {
              for await (const value of stream) { bytes += value.length; digest.update(value); }
            }
            if (bytes !== entry.uncompressedSize) throw new Error('Official runtime archive entry is truncated');
            rows.push({ path, kind, ...(kind === 'symlink' ? { target } : { bytes, sha256: digest.digest('hex'), executable: Boolean(mode & 0o111) }) });
          }
          zip.readEntry();
        })().catch(reject);
      });
      zip.readEntry();
    });
    if (destination) for (const link of links) {
      await mkdir(dirname(link.output), { recursive: true, mode: 0o755 });
      await symlink(link.target, link.output);
    }
    return rows.sort((a, b) => a.path.localeCompare(b.path));
  } finally { zip.close(); }
}

async function verifyDistribution(target, rows) {
  const physicalDistribution = await realpath(target.distribution);
  const expected = new Map(rows.map(row => [row.path, row]));
  // ZIPs can omit directory entries; derive only the necessary real directories.
  for (const row of rows) {
    let parent = posix.dirname(row.path);
    while (parent !== '.') {
      if (!expected.has(parent)) expected.set(parent, { path: parent, kind: 'directory' });
      parent = posix.dirname(parent);
    }
  }
  let actualCount = 0;
  const visit = async (directory, prefix = '') => {
    for (const name of await readdir(directory)) {
      const path = prefix ? `${prefix}/${name}` : name, full = join(directory, name), row = expected.get(path);
      if (!row) throw new Error(`Unexpected runtime distribution entry: ${path}`);
      actualCount++;
      const info = await lstat(full);
      if (row.kind === 'directory') {
        if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Invalid runtime directory: ${path}`);
        await visit(full, path);
      } else if (row.kind === 'symlink') {
        if (!info.isSymbolicLink() || await readlink(full) !== row.target) throw new Error(`Runtime link differs: ${path}`);
        const destination = relative(physicalDistribution, await realpath(full));
        if (destination === '..' || destination.startsWith(`..${sep}`) || isAbsolute(destination)) throw new Error(`Runtime link leaves its distribution: ${path}`);
      } else {
        if (!info.isFile() || info.isSymbolicLink() || info.size !== row.bytes || await fileHash(full) !== row.sha256
          || target.platform !== 'win32' && row.executable && !(info.mode & 0o111)) throw new Error(`Runtime file integrity differs: ${path}`);
      }
    }
  };
  await visit(target.distribution);
  if (actualCount !== expected.size) throw new Error('Official runtime distribution is incomplete');
  const version = (await readFile(join(target.distribution, 'version'), 'utf8')).trim().replace(/^v/, '');
  if (version !== PLUGIN_RUNTIME_VERSION) throw new Error('Official runtime version differs from its pinned release');
  await regularFile(target.executable);
  await access(target.executable, target.platform === 'win32' ? constants.R_OK : constants.R_OK | constants.X_OK);
  await verifyExecutableArchitecture(target);
}

async function verifyExecutableArchitecture(target) {
  const handle = await open(target.executable, 'r');
  try {
    const bytes = Buffer.alloc(4096), read = await handle.read(bytes, 0, bytes.length, 0);
    if (read.bytesRead < 64) throw new Error('Official runtime executable is truncated');
    if (target.platform === 'darwin') {
      if (bytes.readUInt32LE(0) !== 0xfeedfacf || bytes.readUInt32LE(4) !== { arm64: 0x0100000c, x64: 0x01000007 }[target.arch]) throw new Error('Official runtime Mach-O architecture differs');
    } else if (target.platform === 'win32') {
      const offset = bytes.readUInt32LE(0x3c), header = Buffer.alloc(6);
      const result = await handle.read(header, 0, header.length, offset);
      if (bytes.toString('ascii', 0, 2) !== 'MZ' || result.bytesRead !== 6 || header.readUInt32LE(0) !== 0x00004550
        || header.readUInt16LE(4) !== { arm64: 0xaa64, x64: 0x8664 }[target.arch]) throw new Error('Official runtime PE architecture differs');
    } else if (bytes.readUInt32BE(0) !== 0x7f454c46 || bytes[4] !== 2 || bytes[5] !== 1
      || bytes.readUInt16LE(18) !== { arm64: 183, x64: 62 }[target.arch]) throw new Error('Official runtime ELF architecture differs');
  } finally { await handle.close(); }
}

export async function getPluginRuntimeState(options = {}) {
  const target = pluginRuntimeTarget(options);
  if (!target) return fail('unsupported-target', 'No pinned official Electron distribution exists for this platform and architecture', options).state;
  let published = false;
  try {
    await realDirectories(target.root, target.directory);
    published = true;
    await realDirectories(target.directory, target.distribution);
    await regularFile(target.archive);
    if (await fileHash(target.archive) !== target.archiveSha256) throw new Error('Retained official Electron archive checksum differs');
    await regularFile(target.manifest, 1024 * 1024);
    const manifest = JSON.parse(await readFile(target.manifest, 'utf8'));
    if (manifest.schemaVersion !== 1 || manifest.provider !== PLUGIN_RUNTIME_PROVIDER || manifest.electronVersion !== PLUGIN_RUNTIME_VERSION
      || manifest.platform !== target.platform || manifest.arch !== target.arch || manifest.archiveSha256 !== target.archiveSha256
      || manifest.sourceUrl !== target.sourceUrl) throw new Error('Official runtime installation metadata differs');
    const rows = await archiveEntries(target.archive);
    await verifyDistribution(target, rows);
    return { kind: 'artifact-verified', available: true, runtimeReady: true, provider: PLUGIN_RUNTIME_PROVIDER,
      electronVersion: PLUGIN_RUNTIME_VERSION, version: PLUGIN_RUNTIME_VERSION, platform: target.platform, arch: target.arch,
      executable: target.executable, directory: target.directory, distribution: target.distribution,
      archiveSha256: target.archiveSha256, sourceUrl: target.sourceUrl,
      integrity: { archive: 'sha256', distribution: 'official-archive-entries', architecture: true, version: true } };
  } catch (error) {
    return fail(error.code === 'ENOENT' && !published ? 'artifact-missing' : 'artifact-invalid', error.message, target).state;
  }
}

export async function getPluginRuntimeExecutable(options) {
  const state = await getPluginRuntimeState(options);
  if (!state.available) throw fail(state.reason, `${state.detail}. Run npm run prepare:runtime to install the pinned official distribution`, state);
  return state.executable;
}

async function officialArchive(target) {
  const packageFile = require.resolve('electron/package.json');
  const metadata = JSON.parse(await readFile(packageFile, 'utf8'));
  if (metadata.name !== 'electron' || metadata.version !== PLUGIN_RUNTIME_VERSION) throw new Error('OpenCU runtime requires electron@44.7.0');
  const electronRequire = createRequire(packageFile);
  const checksums = JSON.parse(await readFile(join(dirname(packageFile), 'checksums.json'), 'utf8'));
  if (checksums[target.filename] !== target.archiveSha256) throw new Error('Electron npm checksum differs from the plugin release pin');
  const { downloadArtifact } = electronRequire('@electron/get');
  return downloadArtifact({ version: PLUGIN_RUNTIME_VERSION, artifactName: 'electron', platform: target.platform,
    arch: target.arch, checksums, downloadOptions: { signal: AbortSignal.timeout(300000) } });
}

export async function installPluginRuntime({ archive, ...options } = {}) {
  const target = pluginRuntimeTarget(options);
  if (!target) throw fail('unsupported-target', 'No pinned official Electron distribution exists for this platform and architecture', options);
  const installed = await getPluginRuntimeState(options);
  if (installed.available) return installed;
  if (installed.reason !== 'artifact-missing') throw fail(installed.reason,
    `${installed.detail}. Retire processes using this installation and remove its damaged directory before reinstalling: ${target.directory}`, target);
  if (archive !== undefined && !isAbsolute(archive)) throw new TypeError('OpenCU runtime: an offline archive must be an absolute path');
  await mkdir(target.root, { recursive: true, mode: 0o700 });
  await realDirectories(target.root, target.root);
  const parent = dirname(target.directory);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  await realDirectories(target.root, parent);
  const temporary = await mkdtemp(join(parent, '.install-'));
  try {
    const source = archive ?? await officialArchive(target);
    await regularFile(source);
    if (await fileHash(source) !== target.archiveSha256) throw fail('archive-checksum', 'Archive is not the pinned official Electron distribution', target);
    const stagedArchive = join(temporary, target.filename), distribution = join(temporary, 'dist');
    await copyFile(source, stagedArchive); await mkdir(distribution, { mode: 0o700 });
    if (await fileHash(stagedArchive) !== target.archiveSha256) throw new Error('Copied official runtime archive checksum differs');
    const rows = await archiveEntries(stagedArchive, distribution);
    await verifyDistribution({ ...target, distribution, executable: join(distribution, relative(target.distribution, target.executable)) }, rows);
    await writeFile(join(temporary, PLUGIN_RUNTIME_MANIFEST), JSON.stringify({ schemaVersion: 1,
      provider: PLUGIN_RUNTIME_PROVIDER, electronVersion: PLUGIN_RUNTIME_VERSION, platform: target.platform, arch: target.arch,
      archiveSha256: target.archiveSha256, sourceUrl: target.sourceUrl }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    try { await rename(temporary, target.directory); }
    catch (error) { if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error; }
    const state = await getPluginRuntimeState(options);
    if (!state.available) throw fail(state.reason, state.detail, target);
    return state;
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

export async function getPluginRuntimeProcessState(target = process, options) {
  const state = await getPluginRuntimeState(options);
  if (!state.available) return state;
  if (target.type !== 'browser' || target.platform !== state.platform || target.arch !== state.arch
    || resolve(target.execPath) !== state.executable || target.versions?.electron !== PLUGIN_RUNTIME_VERSION
    || target.versions?.chrome !== PLUGIN_RUNTIME_CHROMIUM_VERSION || Number(target.versions?.napi ?? 0) < 8) {
    return fail('process-mismatch', 'The process does not match the installed official Electron runtime', state).state;
  }
  return { ...state, processReady: true, versions: { electron: target.versions.electron, chromium: target.versions.chrome,
    node: target.versions.node, v8: target.versions.v8, nodeApi: target.versions.napi } };
}
